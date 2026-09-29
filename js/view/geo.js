// 基本の形を組み合わせて、色つきの 1 つの形にまとめる道具。
// 組み合わせた形は 1 回の描画で描けるので、描画の命令の回数を減らせる。

import * as THREE from 'three';

const tmpColor = new THREE.Color();
const tmpMat = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

/**
 * 形 1 つに、位置・回転・大きさと色を付けて、まとめられる形にする。
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.ColorRepresentation | ((pos: THREE.Vector3) => THREE.ColorRepresentation)} color
 *   関数なら、頂点ごとに（変換後の位置で）色を決める
 * @param {{ pos?: number[], rot?: number[], scale?: number[] | number }} [t]
 */
export function part(geometry, color, t = {}) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  const [px, py, pz] = t.pos ?? [0, 0, 0];
  const [rx, ry, rz] = t.rot ?? [0, 0, 0];
  const s = t.scale ?? 1;
  const [sx, sy, sz] = Array.isArray(s) ? s : [s, s, s];
  tmpQuat.setFromEuler(tmpEuler.set(rx, ry, rz));
  tmpMat.compose(new THREE.Vector3(px, py, pz), tmpQuat, new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(tmpMat);
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    tmpColor.set(typeof color === 'function' ? color(v.fromBufferAttribute(pos, i)) : color);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * part() で作った形を 1 つにまとめる。
 * @param {THREE.BufferGeometry[]} parts
 * @param {{ center?: boolean }} [opts] center = true なら、全体の中心を原点に移す
 */
export function merge(parts, opts = {}) {
  let count = 0;
  for (const p of parts) count += p.attributes.position.count;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  let o = 0;
  for (const p of parts) {
    position.set(p.attributes.position.array, o * 3);
    normal.set(p.attributes.normal.array, o * 3);
    color.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.computeBoundingBox();
  if (opts.center) {
    const c = new THREE.Vector3();
    g.boundingBox.getCenter(c);
    g.translate(-c.x, -c.y, -c.z);
    g.computeBoundingBox();
  }
  g.computeBoundingSphere();
  return g;
}

/**
 * 回転体（びんなど）。points は [半径, 高さ] の並び。
 * @param {number[][]} points
 */
export function lathe(points, segments = 16) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)), segments);
}

/** 決まった値でゆがませた球（丸めた紙くずなど）。同じ頂点は同じだけ動かして、すき間を作らない。 */
export function lumpySphere(radius, detail, amount, seed = 1) {
  const base = new THREE.IcosahedronGeometry(radius, detail);
  const g = base.index ? base.toNonIndexed() : base;
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // 位置から決まる、なめらかでない揺らぎ
    const h = Math.sin(v.x * 12.9898 * seed + v.y * 78.233 + v.z * 37.719) * 43758.5453;
    const n = (h - Math.floor(h)) * 2 - 1;
    v.multiplyScalar(1 + n * amount);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

let shadowTex = null;
/** 足元に置く、丸くぼけた影の絵（1 枚を使い回す）。 */
export function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(0.6, 'rgba(0,0,0,0.3)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

/** 影の板を 1 枚作る。 */
export function shadowMesh(radius) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}
