// Shared by the 3D scene and scripts/check-logo.mjs so both build identical geometry.

/** Sculpture width in world units and extrusion depth. */
export const LOGO_WIDTH = 6.4;
export const LOGO_DEPTH = 0.9;

/**
 * Builds one extruded geometry per traced shape (the G-mark and the floating dot).
 * Material groups: 0 = front face (original artwork), 1 = side walls, 2 = back face.
 * The back face gets its own group so it never shows mirrored artwork.
 *
 * @param {typeof import('three')} THREE
 * @param {{width:number,height:number,shapes:{outline:number[][],holes:number[][][]}[]}} data
 */
export function buildLogoGeometries(THREE, data) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const item of data.shapes) for (const [x, y] of item.outline) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const scale = LOGO_WIDTH / (maxX - minX);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const height = (maxY - minY) * scale;
  const toWorld = ([x, y]) => new THREE.Vector2((x - cx) * scale, (cy - y) * scale);

  const parts = data.shapes.map(item => {
    const shape = new THREE.Shape(item.outline.map(toWorld));
    for (const hole of item.holes) shape.holes.push(new THREE.Path(hole.map(toWorld)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: LOGO_DEPTH, bevelEnabled: false, steps: 1, curveSegments: 1 });
    geometry.translate(0, 0, -LOGO_DEPTH / 2);

    // UVs in source-image space, so the original artwork lands exactly where it was drawn.
    const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
    for (let i = 0; i < position.count; i++) {
      const px = position.getX(i) / scale + cx;
      const py = cy - position.getY(i) / scale;
      uv.setXY(i, px / data.width, 1 - py / data.height);
    }
    uv.needsUpdate = true;

    // ExtrudeGeometry (no bevel) writes the back lid, then the front lid, then the walls.
    const [lids, walls] = geometry.groups;
    const half = lids.count / 2;
    geometry.clearGroups();
    geometry.addGroup(0, half, 2);
    geometry.addGroup(half, half, 0);
    geometry.addGroup(walls.start, walls.count, 1);
    geometry.computeBoundingBox();
    return geometry;
  });

  return { parts, height, scale };
}
