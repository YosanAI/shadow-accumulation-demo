import * as THREE from 'three/webgpu';
import { ground, box, mesh, material, seededRandom } from '#lab/demos/common.js';
export const NYC_CENTER = { latitude: 40.751, longitude: -73.986 };
const DATA_ENDPOINT = 'https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/BUILDING_view/FeatureServer/0/query';
const DATA_CREDIT = 'NYC Office of Technology and Innovation — Building Footprints';
/** Synthetic fallback, explicitly NOT a real Manhattan building model. */
export function createManhattanFallback() {
    const root = new THREE.Group();
    ground(root, 720, true, 0xa6acb0);
    const blocks = new THREE.Group();
    blocks.rotation.y = -29 * Math.PI / 180;
    root.add(blocks);
    const random = seededRandom(90210);
    for (let row = -2; row <= 2; row++)
        for (let column = -2; column <= 2; column++) {
            const blockX = column * 103, blockZ = row * 92;
            for (let part = 0; part < 4; part++) {
                const x = blockX + (part % 2 ? 22 : -22), z = blockZ + (part < 2 ? -18 : 18);
                const height = 20 + Math.pow(random(), 2.1) * 175 + (row === 0 && column === 0 ? 65 : 0);
                const width = 27 + random() * 11, depth = 23 + random() * 7;
                const color = new THREE.Color().setHSL(0.58, 0.03 + random() * 0.07, 0.49 + random() * 0.27);
                box(blocks, [width, height, depth], [x, height / 2, z], color, { receiver: true, name: `Synthetic city building ${row + 3}-${column + 3}-${part + 1}` });
                if (height > 70)
                    box(blocks, [width * 0.58, 8, depth * 0.6], [x, height + 4, z], color, { receiver: true, name: 'Synthetic rooftop mechanical enclosure' });
            }
        }
    return { id: 'manhattan', root, extent: 720, camera: [650, 480, 720], target: [0, 50, 0], draggables: [], source: { kind: 'procedural', description: 'Manhattan-inspired fallback • synthetic footprints and heights • not surveyed data' }, description: 'Heatmap on roofs, façades and ground. Load NYC footprints for a real Midtown subset.' };
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
