/** Build a single HTML without installing dependencies. Pinned libraries stay on a CDN. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function modulesIn(directory,prefix='') {
  const output={};
  for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
    if(entry.isDirectory())Object.assign(output,await modulesIn(path.join(directory,entry.name),`${prefix}${entry.name}/`));
    else if(entry.name.endsWith('.js'))output[`#lab/${prefix}${entry.name}`]=await fs.readFile(path.join(directory,entry.name),'utf8');
  }
  return output;
}
let html=await fs.readFile(path.join(root,'index.html'),'utf8');
const css=await fs.readFile(path.join(root,'src/ui/styles.css'),'utf8');
html=html.replace('<link rel="stylesheet" href="/src/ui/styles.css">',`<style>${css}</style>`);
const modules=JSON.stringify(await modulesIn(path.join(root,'src'))).replaceAll('<','\\u003c');
const bootstrap=`<script type="application/json" id="module-sources">${modules}</script>
<script>
// Every application module is embedded; pinned Three.js and SunCalc use the network.
const sources=JSON.parse(document.getElementById('module-sources').textContent);
const imports={
  'three':'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.webgpu.js',
  'three/webgpu':'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.webgpu.js',
  'three/tsl':'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.tsl.js',
  'three/addons/':'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/',
  'suncalc':'https://cdn.jsdelivr.net/npm/suncalc@1.9.0/+esm'
};
for(const [name,source] of Object.entries(sources))imports[name]=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.append(map);
import('#lab/main.js').catch(error=>{
  console.error(error);const banner=document.getElementById('fatal');banner.hidden=false;
  document.getElementById('fatal-message').textContent='Unable to load the demo: '+error.message+'\\nThis single-HTML edition needs internet access to its pinned dependencies on jsDelivr. Serve it on localhost or HTTPS for WebGPU calculations. The Vite build bundles the libraries for offline use.';
  document.getElementById('status').textContent='The demo could not initialize.';
});
</script>`;
html=html.replace('<script type="module" src="/src/main.js"></script>',()=>bootstrap);
const output=path.join(root,'webgpu-shadow-lab.html');
await fs.writeFile(output,html);
console.log(`Created ${output} (${(Buffer.byteLength(html)/1024).toFixed(0)} KB; pinned CDN dependencies).`);
