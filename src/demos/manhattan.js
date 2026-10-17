import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ground, mesh, material } from '#lab/demos/common.js';
import { createManhattanModel } from '#lab/demos/manhattan-model.js';
import { MANHATTAN_DISTRICT, MANHATTAN_SURVEY } from '#lab/demos/manhattan-data.js';
export const NYC_CENTER = { latitude: 40.751, longitude: -73.986 };
const DATA_ENDPOINT = 'https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/BUILDING_view/FeatureServer/0/query';
const DATA_CREDIT = 'NYC Office of Technology and Innovation — Building Footprints';
/** Match the supplied viewer's material batching without changing its geometry. */
function batchModel(model) {
    const groups = new Map();
    model.updateMatrixWorld(true);
    model.traverseVisible(object => {
        if (!object.isMesh) return;
        // Buried bottom faces stay in the model, outside the receiving surfaces.
        const receiver = object.userData.surfaceType !== 'base';
        const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}:${receiver}`;
        if (!groups.has(key)) groups.set(key, { material: object.material, caster: object.castShadow, receiveShadow: object.receiveShadow, receiver, pieces: [], vertexCount: 0 });
        const group = groups.get(key);
        const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
        geometry.applyMatrix4(object.matrixWorld);
        group.pieces.push(geometry);
        group.vertexCount += geometry.getAttribute('position').count;
    });
    const batches = new THREE.Group();
    batches.name = 'Midtown material batches';
    for (const group of groups.values()) {
        const positions = new Float32Array(group.vertexCount * 3);
        const normals = new Float32Array(group.vertexCount * 3);
        let offset = 0;
        for (const piece of group.pieces) {
            positions.set(piece.getAttribute('position').array, offset);
            normals.set(piece.getAttribute('normal').array, offset);
            offset += piece.getAttribute('position').array.length;
            piece.dispose();
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const batch = mesh(geometry, group.material, { receiver: group.receiver, caster: group.caster, name: group.material.name });
        batch.receiveShadow = group.receiveShadow;
        batches.add(batch);
    }
    return batches;
}
function technicalEdges(model) {
    const pieces = [];
    model.traverseVisible(object => {
        if (!object.isMesh || ['base', 'road_marking', 'vegetation'].includes(object.userData.surfaceType)) return;
        const geometry = new THREE.EdgesGeometry(object.geometry, 28);
        if (geometry.getAttribute('position').count) {
            geometry.applyMatrix4(object.matrixWorld);
            pieces.push(geometry);
        } else geometry.dispose();
    });
    const geometry = mergeGeometries(pieces);
    for (const piece of pieces) piece.dispose();
    const edges = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 3423295, transparent: true, opacity: 0.29, depthWrite: false }));
    edges.name = 'Architectural edges';
    edges.renderOrder = 2;
    return edges;
}
export function createManhattan() {
    const model = createManhattanModel(MANHATTAN_DISTRICT, MANHATTAN_SURVEY);
    const root = new THREE.Group();
    root.name = model.name;
    root.userData = model.userData;
    root.add(batchModel(model), technicalEdges(model));
    // Batches own their geometry and reuse the source materials.
    model.traverse(object => object.geometry?.dispose());
    const bounds = new THREE.Box3().setFromObject(root);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const extent = Math.max(size.x, size.z);
    const target = [center.x, size.y * 0.24, center.z];
    return {
        id: 'manhattan', root, extent, minAtlasSize: 2048,
        camera: [center.x - extent * 0.8, target[1] + extent * 1.2, center.z + extent * 1.6],
        target, draggables: [],
        source: {
            kind: 'bundled-nyc', description: 'Supplied Midtown model • 573 buildings • 527 historical survey meshes • 35 tax blocks',
            file: 'manhattan-block-viewer.html', origin: root.userData.origin,
            sources: root.userData.sources, retrievedAt: root.userData.retrievedAt,
            survey: root.userData.survey, limitations: root.userData.limitations,
            statistics: root.userData.statistics
        },
        description: 'Midtown from the Empire State Building to Times Square, including Bryant Park. Heatmap on roofs, façades, streets and sidewalks. Historical survey details and published-height extrusions share flat ground.'
    };
}
/** Fetch a bounded subset; no imagery or map tiles. Live endpoint may change. */
export async function fetchNYCBuildings({ signal } = {}) {
    const query = new URLSearchParams({
        where: '1=1', geometry: '-73.990,40.748,-73.982,40.754', geometryType: 'esriGeometryEnvelope',
        inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: '*', outSR: '4326',
        f: 'geojson', resultRecordCount: '180', orderByFields: 'DOITT_ID'
    });
    const response = await fetch(`${DATA_ENDPOINT}?${query}`, { signal });
    if (!response.ok)
        throw new Error(`NYC data service returned HTTP ${response.status}.`);
    const collection = await response.json();
    if (collection.error || !Array.isArray(collection.features) || !collection.features.length)
        throw new Error('NYC service did not return a non-empty GeoJSON FeatureCollection.');
    collection.sourceURL = `${DATA_ENDPOINT}?${query}`;
    return collection;
}
export function createManhattanFromGeoJSON(collection) {
    if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features))
        throw new Error('Import a WGS84 GeoJSON FeatureCollection.');
    const root = new THREE.Group();
    const maxFeatures = 500;
    let loaded = 0, missingHeights = 0;
    const origin = NYC_CENTER;
    const metresPerDegree = 111320;
    function point(coordinate) {
        const [longitude, latitude] = coordinate;
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude - origin.longitude) > 0.2 || Math.abs(latitude - origin.latitude) > 0.2)
            throw new Error('Expected WGS84 longitude/latitude coordinates in Manhattan, near the Midtown study area.');
        return new THREE.Vector2((longitude - origin.longitude) * metresPerDegree * Math.cos(origin.latitude * Math.PI / 180), (latitude - origin.latitude) * metresPerDegree);
    }
    for (const feature of collection.features.slice(0, maxFeatures)) {
        const properties = Object.fromEntries(Object.entries(feature.properties ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
        const polygons = feature.geometry?.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
        if (!polygons.length)
            continue;
        const recordedFeet = Number(properties.height_roof ?? properties.heightroof);
        // Official NYC HEIGHT_ROOF / HEIGHTROOF is treated as feet. A generic
        // GeoJSON "height" field is accepted in metres for imported test assets.
        let height = recordedFeet > 0 ? recordedFeet * 0.3048 : Number(properties.height);
        if (!(height > 0)) {
            height = 15;
            missingHeights++;
        }
        if (height > 1000)
            throw new Error('A building height exceeds 1000 m; check the source height units.');
        for (const polygon of polygons) {
            if (!polygon[0] || polygon[0].length < 4)
                continue;
            const shape = new THREE.Shape(polygon[0].map(point));
            for (const hole of polygon.slice(1))
                if (hole.length >= 4)
                    shape.holes.push(new THREE.Path(hole.map(point)));
            const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, steps: 1, bevelEnabled: false, curveSegments: 1 });
            geometry.rotateX(-Math.PI / 2); // north-positive shape Y becomes world -Z
            const building = mesh(geometry, material(0xb8c0c4), { receiver: true, name: String(properties.name || properties.doitt_id || properties.bin || 'NYC building') });
            root.add(building);
        }
        loaded++;
    }
    if (!loaded)
        throw new Error('No polygon buildings were found in this GeoJSON.');
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const center = bounds.getCenter(new THREE.Vector3());
    const width = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) + 100;
    const terrain = ground(root, width, true, 0xa4abb0);
    terrain.position.set(center.x, -0.02, center.z);
    return {
        id: 'manhattan', root, extent: width, camera: [center.x + width * 0.85, Math.max(width * 0.65, bounds.max.y * 1.1), center.z + width], target: [center.x, bounds.max.y * 0.17, center.z], draggables: [],
        source: { kind: 'nyc', description: `${DATA_CREDIT} • ${loaded} footprint features • ${missingHeights} missing heights replaced by 15 m`, loaded, missingHeights, featureLimit: maxFeatures, url: collection.sourceURL ?? 'User-imported GeoJSON', retrievedAt: new Date().toISOString() },
        description: 'Real footprint outlines extruded to roof height; flat roofs and flat ground. Outside-subset shadows and detailed roof shapes are not included.'
    };
}
