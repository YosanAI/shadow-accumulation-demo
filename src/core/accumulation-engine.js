import { makeLightFrame, nextFrame, throwIfAborted } from '#lab/core/math.js';
import { shadowShader, accumulationShader, reductionShader, colorShader } from '#lab/core/shaders.js';

/**
 * Standalone raw-WebGPU solar accumulator. No Three.js, DOM, dates, or demo code.
 * Inputs: a GPUDevice, world-space triangle soup, a surface atlas, and sun samples.
 * Output: GPUTexture + numerical totals. See docs/ARCHITECTURE.md for the contract.
 */
export class AccumulationEngine {
  constructor(device) {
    this.device = device;
    this.resources = [];
    this.ready = false;
    this.display = { metric: 'energy', normalization: 'access', absoluteMax: 8 };
    this.completedSamples = 0;
  }

  async initialize({ atlas, shadowVertices, bounds, shadowSize = 1024, batchSize = 16, biasMeters = 0.02 }) {
    const device = this.device;
    if (!shadowVertices.length || shadowVertices.length % 9) throw new Error('Shadow geometry must contain complete triangles.');
    if (atlas.size > device.limits.maxTextureDimension2D || shadowSize > device.limits.maxTextureDimension2D) throw new Error('The requested texture size exceeds the GPU limit.');
    for (const data of [atlas.positions, atlas.normals]) {
      if (data.byteLength > device.limits.maxStorageBufferBindingSize) throw new Error('Atlas storage exceeds this GPU’s storage-buffer limit.');
    }
    this.atlas = atlas;
    this.bounds = bounds;
    this.shadowSize = shadowSize;
    this.batchSize = Math.max(1, Math.min(64, Math.floor(batchSize)));
    this.biasMeters = Math.max(0, biasMeters);
    this.activeCount = atlas.activeIndices.length;
    this.workgroups = Math.ceil(this.activeCount / 128);
    this.vertexCount = shadowVertices.length / 3;
    this.sampleStride = Math.ceil(128 / device.limits.minUniformBufferOffsetAlignment) * device.limits.minUniformBufferOffsetAlignment;

    const U = GPUBufferUsage;
    this.positionBuffer = this.buffer('Receiver world positions', atlas.positions, U.STORAGE);
    this.normalBuffer = this.buffer('Geometric normals and area weights', atlas.normals, U.STORAGE);
    this.indexBuffer = this.buffer('Active atlas texels', atlas.activeIndices, U.STORAGE);
    this.valueBuffer = this.buffer('f32 energy / potential / hours / possible hours', atlas.size * atlas.size * 16, U.STORAGE | U.COPY_SRC | U.COPY_DST);
    this.vertexBuffer = this.buffer('Merged opaque caster triangles', shadowVertices, U.VERTEX);
    this.sampleBuffer = this.buffer('Immutable aligned samples for one batch', this.sampleStride * this.batchSize, U.UNIFORM | U.COPY_DST);
    this.displayBuffer = this.buffer('Heatmap display options', 16, U.UNIFORM | U.COPY_DST);
    this.blockBuffer = this.buffer('Intermediate area-weighted reductions', this.workgroups * 48, U.STORAGE);
    this.summaryBuffer = this.buffer('Final summary', 48, U.STORAGE | U.COPY_SRC);
    this.readbackBuffer = this.buffer('Small summary readback', 48, U.MAP_READ | U.COPY_DST);
    this.depthTexture = this.texture('Reusable directional depth map', shadowSize, 'depth32float', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
    this.depthView = this.depthTexture.createView();
    this.outputTexture = this.texture('GPU heatmap atlas', atlas.size, 'rgba8unorm', GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC);
    this.outputView = this.outputTexture.createView();

    const sampleLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 128 } }] });
    const storageEntry = (binding, type = 'read-only-storage') => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type } });
    const accumulationLayout = device.createBindGroupLayout({ entries: [storageEntry(0), storageEntry(1), storageEntry(2), storageEntry(3, 'storage'), { binding: 4, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'depth' } }] });
    const reductionLayout = device.createBindGroupLayout({ entries: [storageEntry(0), storageEntry(1), storageEntry(2), storageEntry(3, 'storage'), storageEntry(4, 'storage')] });
    const colorLayout = device.createBindGroupLayout({ entries: [storageEntry(0), storageEntry(1), storageEntry(2), { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }, { binding: 4, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm' } }] });
    const [depthModule, accumulationModule, reductionModule, colorModule] = await Promise.all([
      this.shader('Shadow depth', shadowShader), this.shader('Accumulation', accumulationShader), this.shader('Reduction', reductionShader), this.shader('Colorization', colorShader)
    ]);
    this.shadowPipeline = await device.createRenderPipelineAsync({
      label: 'One merged depth draw per sun sample', layout: device.createPipelineLayout({ bindGroupLayouts: [sampleLayout] }),
      vertex: { module: depthModule, entryPoint: 'vertexMain', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' }
    });
    this.accumulationPipeline = await device.createComputePipelineAsync({ label: 'Accumulate direct exposure', layout: device.createPipelineLayout({ bindGroupLayouts: [sampleLayout, accumulationLayout] }), compute: { module: accumulationModule, entryPoint: 'accumulate' } });
    const reductionPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [reductionLayout] });
    [this.reduceAtlasPipeline, this.reduceFinalPipeline, this.colorPipeline] = await Promise.all([
      device.createComputePipelineAsync({ layout: reductionPipelineLayout, compute: { module: reductionModule, entryPoint: 'reduceAtlas' } }),
      device.createComputePipelineAsync({ layout: reductionPipelineLayout, compute: { module: reductionModule, entryPoint: 'reduceFinal' } }),
      device.createComputePipelineAsync({ layout: device.createPipelineLayout({ bindGroupLayouts: [colorLayout] }), compute: { module: colorModule, entryPoint: 'colorize' } })
    ]);
    const entry = (binding, buffer) => ({ binding, resource: { buffer } });
    this.sampleGroup = device.createBindGroup({ layout: sampleLayout, entries: [{ binding: 0, resource: { buffer: this.sampleBuffer, size: 128 } }] });
    this.accumulationGroup = device.createBindGroup({ layout: accumulationLayout, entries: [entry(0, this.positionBuffer), entry(1, this.normalBuffer), entry(2, this.indexBuffer), entry(3, this.valueBuffer), { binding: 4, resource: this.depthView }] });
    this.reductionGroup = device.createBindGroup({ layout: reductionLayout, entries: [entry(0, this.valueBuffer), entry(1, this.normalBuffer), entry(2, this.indexBuffer), entry(3, this.blockBuffer), entry(4, this.summaryBuffer)] });
    this.colorGroup = device.createBindGroup({ layout: colorLayout, entries: [entry(0, this.valueBuffer), entry(1, this.indexBuffer), entry(2, this.summaryBuffer), entry(3, this.displayBuffer), { binding: 4, resource: this.outputView }] });

    if (device.features.has('timestamp-query')) {
      this.querySet = device.createQuerySet({ type: 'timestamp', count: 2 });
      this.resources.push(this.querySet);
      this.queryResolve = this.buffer('GPU timestamp resolve', 16, U.QUERY_RESOLVE | U.COPY_SRC);
      this.queryReadback = this.buffer('GPU timestamp readback', 16, U.COPY_DST | U.MAP_READ);
    }
    this.ready = true;
    this.updateDisplay(this.display);
  }

  buffer(label, dataOrSize, usage) {
    const isData = ArrayBuffer.isView(dataOrSize);
    const buffer = this.device.createBuffer({ label, size: Math.max(4, isData ? dataOrSize.byteLength : dataOrSize), usage, mappedAtCreation: isData });
    if (isData) {
      new Uint8Array(buffer.getMappedRange()).set(new Uint8Array(dataOrSize.buffer, dataOrSize.byteOffset, dataOrSize.byteLength));
      buffer.unmap();
    }
    this.resources.push(buffer);
    return buffer;
  }
  texture(label, size, format, usage) {
    const texture = this.device.createTexture({ label, size: [size, size], format, usage });
    this.resources.push(texture);
    return texture;
  }
  async shader(label, code) {
    const module = this.device.createShaderModule({ label, code });
    const information = await module.getCompilationInfo();
    const errors = information.messages.filter(message => message.type === 'error');
    if (errors.length) throw new Error(`${label} shader: ${errors.map(error => `${error.lineNum}:${error.linePos} ${error.message}`).join('\n')}`);
    return module;
  }

  async run(samples, { signal, onProgress = () => {}, onPreview = () => {} } = {}) {
    if (!this.ready) throw new Error('Initialize the engine first.');
    if (this.running) throw new Error('An accumulation is already running.');
    this.running = true;
    this.completedSamples = 0;
    const device = this.device;
    const clear = device.createCommandEncoder();
    clear.clearBuffer(this.valueBuffer);
    device.queue.submit([clear.finish()]);
    const started = performance.now();
    let lastPreview = -Infinity;
    try {
      for (let start = 0; start < samples.count; start += this.batchSize) {
        throwIfAborted(signal);
        const count = Math.min(this.batchSize, samples.count - start);
        const data = new Float32Array(this.sampleStride / 4 * count);
        for (let i = 0; i < count; i++) {
          const index = start + i;
          const sun = samples.directionAndEnergy.subarray(index * 4, index * 4 + 3);
          const frame = makeLightFrame(this.bounds, sun, Math.max(this.biasMeters * 4, 0.1));
          const offset = i * this.sampleStride / 4;
          data.set(frame.matrix, offset);
          data.set(samples.directionAndEnergy.subarray(index * 4, index * 4 + 4), offset + 16);
          data.set([...frame.right, frame.width], offset + 20);
          data.set([...frame.up, frame.height], offset + 24);
          data.set([samples.durations[index], this.biasMeters, Math.max(2e-7, this.biasMeters * 0.15 / frame.depth), 1 / frame.depth], offset + 28);
        }
        // One upload with a DISTINCT aligned region for each pass. Repeated
        // writeBuffer calls to the same address before submit would be a bug.
        device.queue.writeBuffer(this.sampleBuffer, 0, data);
        const encoder = device.createCommandEncoder({ label: `Sun samples ${start}–${start + count}` });
        for (let i = 0; i < count; i++) {
          const renderDescriptor = { colorAttachments: [], depthStencilAttachment: { view: this.depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } };
          if (this.querySet && i === 0) renderDescriptor.timestampWrites = { querySet: this.querySet, beginningOfPassWriteIndex: 0 };
          const shadowPass = encoder.beginRenderPass(renderDescriptor);
          shadowPass.setPipeline(this.shadowPipeline);
          shadowPass.setBindGroup(0, this.sampleGroup, [i * this.sampleStride]);
          shadowPass.setVertexBuffer(0, this.vertexBuffer);
          shadowPass.draw(this.vertexCount);
          shadowPass.end();
          const computeDescriptor = this.querySet && i === count - 1 ? { timestampWrites: { querySet: this.querySet, endOfPassWriteIndex: 1 } } : {};
          const computePass = encoder.beginComputePass(computeDescriptor);
          computePass.setPipeline(this.accumulationPipeline);
          computePass.setBindGroup(0, this.sampleGroup, [i * this.sampleStride]);
          computePass.setBindGroup(1, this.accumulationGroup);
          computePass.dispatchWorkgroups(this.workgroups);
          computePass.end();
        }
        if (this.querySet) encoder.resolveQuerySet(this.querySet, 0, 2, this.queryResolve, 0);
        device.queue.submit([encoder.finish()]);
        // Bound queue depth; safe uniform reuse; cancellation never leaves a
        // year's worth of commands queued on the driver.
        await device.queue.onSubmittedWorkDone();
        this.completedSamples = start + count;
        const now = performance.now();
        onProgress({ done: this.completedSamples, total: samples.count, elapsedSeconds: (now - started) / 1000, timestamp: samples.timestamps[this.completedSamples - 1] });
        if (now - lastPreview > 350 || this.completedSamples === samples.count) {
          this.updateDisplay(this.display);
          const stats = await this.readSummary();
          await onPreview(stats);
          lastPreview = now;
        }
        await nextFrame();
      }
      if (samples.count === 0) { this.updateDisplay(this.display); await onPreview(await this.readSummary()); }
      return { completed: true, samples: this.completedSamples, elapsedSeconds: (performance.now() - started) / 1000 };
    } finally { this.running = false; }
  }

  updateDisplay(options) {
    this.display = { ...this.display, ...options };
    if (!this.ready) return;
    const { metric, normalization, absoluteMax } = this.display;
    this.device.queue.writeBuffer(this.displayBuffer, 0, new Float32Array([metric === 'hours' ? 1 : 0, ({ access: 0, range: 1, absolute: 2 })[normalization] ?? 0, Math.max(absoluteMax, 1e-8), this.atlas.size]));
    const encoder = this.device.createCommandEncoder({ label: 'Reduce statistics and recolor without rebaking' });
    // Separate passes make write→read transitions explicit between reductions.
    for (const [pipeline, count] of [[this.reduceAtlasPipeline, this.workgroups], [this.reduceFinalPipeline, 1]]) {
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, this.reductionGroup); pass.dispatchWorkgroups(count); pass.end();
    }
    const colorPass = encoder.beginComputePass();
    colorPass.setPipeline(this.colorPipeline); colorPass.setBindGroup(0, this.colorGroup); colorPass.dispatchWorkgroups(this.workgroups); colorPass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  async readSummary() {
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.summaryBuffer, 0, this.readbackBuffer, 0, 48);
    const readTiming = this.querySet && this.completedSamples > 0;
    if (readTiming) encoder.copyBufferToBuffer(this.queryResolve, 0, this.queryReadback, 0, 16);
    this.device.queue.submit([encoder.finish()]);
    await this.readbackBuffer.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(this.readbackBuffer.getMappedRange()).slice();
    this.readbackBuffer.unmap();
    let batchGpuMs = null;
    if (readTiming) {
      await this.queryReadback.mapAsync(GPUMapMode.READ);
      const times = new BigUint64Array(this.queryReadback.getMappedRange());
      batchGpuMs = Number(times[1] - times[0]) / 1e6;
      this.queryReadback.unmap();
    }
    const area = data[8];
    return { minEnergy: data[0], maxEnergy: data[1], minHours: data[2], maxHours: data[3], meanEnergy: area ? data[4] / area : 0, meanPossibleEnergy: area ? data[5] / area : 0, meanHours: area ? data[6] / area : 0, meanPossibleHours: area ? data[7] / area : 0, area, batchGpuMs };
  }

  /** Explicit diagnostic/export path. Never called inside a temporal sample. */
  async readValues() {
    const size = this.atlas.size * this.atlas.size * 16;
    const staging = this.device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.valueBuffer, 0, staging, 0, size);
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const copy = new Float32Array(staging.getMappedRange()).slice();
    staging.unmap(); staging.destroy();
    return copy;
  }

  /** Caller MUST cancel and await run() before disposal. */
  dispose() {
    if (this.running) throw new Error('Cancel and await the running bake before disposing the engine.');
    for (const resource of this.resources) resource.destroy();
    this.resources.length = 0;
    this.ready = false;
  }
}
