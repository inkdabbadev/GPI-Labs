import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { buildLogoGeometries, LOGO_DEPTH, LOGO_WIDTH } from '../lib/logoGeometry.mjs';

const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(hash('logo_transparent.png'), hash('public/logo_transparent.png'), 'The original logo must stay unchanged');

// Face texture must keep the source aspect so UVs map 1:1.
const png = fs.readFileSync('public/textures/logo-face.png');
const [tw, th] = [png.readUInt32BE(16), png.readUInt32BE(20)];
const data = JSON.parse(fs.readFileSync('public/logo-shape.json', 'utf8'));
assert.ok(Math.abs(tw / th - data.width / data.height) < .002, 'Face texture keeps the source aspect');
assert.ok(tw <= 4096 && th <= 4096, 'Face texture fits mobile GPU limits');

assert.equal(data.shapes.length, 2, 'The mark and its dot should remain distinct');
const { parts, height } = buildLogoGeometries(THREE, data);
let triangles = 0, width = 0, minX = Infinity, maxX = -Infinity;
for (const geometry of parts) {
  const p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  assert.ok(p.count > 0);
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1, 'Artwork mapping stays inside the PNG');
  }
  const [back, front, walls] = geometry.groups;
  assert.deepEqual([back.materialIndex, front.materialIndex, walls.materialIndex], [2, 0, 1]);
  for (let i = back.start; i < back.start + back.count; i++) assert.ok(Math.abs(p.getZ(i) + LOGO_DEPTH / 2) < 1e-4, 'Back group holds only the rear face');
  for (let i = front.start; i < front.start + front.count; i++) assert.ok(Math.abs(p.getZ(i) - LOGO_DEPTH / 2) < 1e-4, 'Front group holds only the artwork face');
  const box = geometry.boundingBox;
  minX = Math.min(minX, box.min.x); maxX = Math.max(maxX, box.max.x);
  triangles += p.count / 3; geometry.dispose();
}
width = maxX - minX;
assert.ok(Math.abs(width - LOGO_WIDTH) < 1e-3, 'Sculpture width is as designed');
console.log(`Logo checks passed: unchanged source, ${tw}x${th} face texture, ${parts.length} shapes, ${triangles} triangles, ${width.toFixed(2)} x ${height.toFixed(2)} units, front/back faces separated.`);
