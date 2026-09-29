// 流れてくるものの形。基本の形を組み合わせ、種類ごとに 1 つの形にまとめる。
// どれも手前（+z）がカメラ側。輪郭だけで見分けられるよう、外形を変えてある。

import * as THREE from 'three';
import { part, merge, lathe, lumpySphere } from './geo.js';

const S = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
const Cyl = (rt, rb, h, n = 14) => new THREE.CylinderGeometry(rt, rb, h, n);
const Box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const Cone = (r, h, n = 10) => new THREE.ConeGeometry(r, h, n);
const Torus = (r, t, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 6, 16, arc);

// ---- 燃えるゴミ ----
function banana() {
  const yellow = '#F4D03F';
  const tip = '#6B4A1E';
  const parts = [
    part(Cyl(0.07, 0.09, 0.22, 10), yellow, { pos: [0, 0.3, 0] }),
    part(Cyl(0.03, 0.04, 0.1, 8), tip, { pos: [0, 0.46, 0] }),
  ];
  // 下へたれた 4 枚の皮
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    parts.push(
      // 上は真ん中に集まり、下は外へ広がるように傾ける
      part(S(1, 10, 6), yellow, { pos: [dx * 0.17, 0.15, dz * 0.17], rot: [-dz * 0.9, 0, dx * 0.9], scale: [0.07, 0.2, 0.04] }),
      part(S(0.035, 6, 4), tip, { pos: [dx * 0.31, 0.04, dz * 0.31] }),
    );
  }
  return merge(parts, { center: true });
}

function appleCore() {
  const red = '#D63A2F';
  const flesh = '#F3E3B5';
  const body = lathe([[0, 0], [0.19, 0.02], [0.23, 0.08], [0.19, 0.14], [0.1, 0.2], [0.085, 0.3], [0.1, 0.4], [0.19, 0.46], [0.23, 0.52], [0.18, 0.58], [0, 0.6]], 16);
  return merge(
    [
      part(body, (p) => (p.y < 0.15 || p.y > 0.45 ? red : flesh)),
      part(Cyl(0.015, 0.02, 0.12, 6), '#6B4A1E', { pos: [0.01, 0.65, 0], rot: [0, 0, 0.2] }),
      part(S(1, 8, 6), '#5DAE3C', { pos: [0.07, 0.66, 0], rot: [0, 0, -0.6], scale: [0.07, 0.025, 0.04] }),
    ],
    { center: true },
  );
}

function fishBone() {
  const bone = '#EDEDE4';
  const head = '#C9CBC3';
  const parts = [
    part(Box(0.62, 0.04, 0.04), bone, { pos: [0, 0.08, 0] }),
    part(Cone(0.14, 0.24, 8), head, { pos: [-0.42, 0.08, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.55] }),
    part(S(0.025, 6, 4), '#333333', { pos: [-0.4, 0.13, 0.05] }),
    part(Cone(0.13, 0.16, 3), bone, { pos: [0.4, 0.08, 0], rot: [0, 0, -Math.PI / 2], scale: [1, 1, 0.3] }),
  ];
  for (let k = 0; k < 5; k++) {
    const x = -0.24 + k * 0.12;
    for (const s of [-1, 1]) parts.push(part(Box(0.025, 0.025, 0.2), bone, { pos: [x + 0.03, 0.08, s * 0.1], rot: [0, s * 0.35, 0] }));
  }
  return merge(parts, { center: true });
}

function paperBall() {
  return merge([part(lumpySphere(0.25, 1, 0.16, 3), '#F2F0E6', { pos: [0, 0.25, 0] })], { center: true });
}

// ---- プラスチック ----
function bentoBox() {
  return merge(
    [
      part(Box(0.64, 0.14, 0.44), '#2C2C30', { pos: [0, 0.07, 0] }),
      part(Box(0.6, 0.02, 0.4), '#C62828', { pos: [0, 0.145, 0] }),
      part(Box(0.28, 0.04, 0.36), '#F7F7F2', { pos: [-0.14, 0.16, 0] }), // ごはんの残り
      part(S(0.045, 8, 6), '#B71C1C', { pos: [-0.14, 0.19, 0] }),
      part(Cone(0.08, 0.02, 3), '#43A047', { pos: [0.12, 0.17, 0.05], rot: [0, 0.5, 0] }), // 仕切りの葉っぱ
    ],
    { center: true },
  );
}

function shoppingBag() {
  const white = '#F7F7F7';
  return merge(
    [
      part(Cyl(0.2, 0.24, 0.36, 4), white, { pos: [0, 0.18, 0], rot: [0, Math.PI / 4, 0], scale: [1.15, 1, 0.5] }),
      part(Box(0.3, 0.06, 0.005), '#4FA3E0', { pos: [0, 0.2, 0.1] }),
      part(Torus(0.08, 0.02, Math.PI), white, { pos: [-0.11, 0.36, 0] }),
      part(Torus(0.08, 0.02, Math.PI), white, { pos: [0.11, 0.36, 0] }),
    ],
    { center: true },
  );
}

function eggPack() {
  const clear = '#CFE4EA';
  const parts = [part(Box(0.62, 0.07, 0.36), clear, { pos: [0, 0.035, 0] })];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      const dome = new THREE.SphereGeometry(0.085, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      parts.push(part(dome, '#E4F1F4', { pos: [-0.2 + i * 0.2, 0.07, -0.085 + j * 0.17] }));
    }
  }
  return merge(parts, { center: true });
}

function snackBag() {
  // 斜めに寝かせた、ふくらんだ袋。上下の閉じ口はギザギザ
  const orange = '#F08A24';
  const edge = '#C45F10';
  const parts = [
    part(S(1, 12, 8), orange, { pos: [0, 0, 0], scale: [0.24, 0.2, 0.07] }),
    part(Cyl(0.07, 0.07, 0.01, 12), '#FFE14D', { pos: [0, 0.01, 0.065], rot: [Math.PI / 2, 0, 0] }),
  ];
  for (const y of [-0.22, 0.22]) {
    parts.push(part(Box(0.46, 0.05, 0.05), edge, { pos: [0, y, 0] }));
    for (let k = 0; k < 6; k++) parts.push(part(Cone(0.035, 0.05, 3), edge, { pos: [-0.2 + k * 0.08, y + Math.sign(y) * 0.045, 0], rot: [0, 0, y > 0 ? 0 : Math.PI] }));
  }
  // 斜めに倒して置く
  return merge(parts.map((g) => g.rotateZ(0.5).rotateX(-0.9)), { center: true });
}

// ---- 缶・びん ----
function juiceCan() {
  const silver = '#C9CED6';
  return merge(
    [
      part(Cyl(0.14, 0.14, 0.34, 16), '#E53935', { pos: [0, 0.2, 0] }),
      part(Cyl(0.12, 0.14, 0.04, 16), silver, { pos: [0, 0.39, 0] }),
      part(Cyl(0.14, 0.12, 0.03, 16), silver, { pos: [0, 0.015, 0] }),
      part(Cyl(0.141, 0.141, 0.08, 16), '#FFFFFF', { pos: [0, 0.22, 0] }),
    ],
    { center: true },
  );
}

function tinCan() {
  const silver = '#C9CED6';
  return merge(
    [
      part(Cyl(0.2, 0.2, 0.28, 18), silver, { pos: [0, 0.14, 0] }),
      part(Cyl(0.202, 0.202, 0.15, 18), '#6FB35E', { pos: [0, 0.14, 0] }),
      part(Torus(0.2, 0.012), silver, { pos: [0, 0.275, 0], rot: [Math.PI / 2, 0, 0] }),
      part(Torus(0.2, 0.012), silver, { pos: [0, 0.005, 0], rot: [Math.PI / 2, 0, 0] }),
      // 開いたふた
      part(Cyl(0.19, 0.19, 0.01, 18), '#DDE1E6', { pos: [0, 0.34, -0.16], rot: [-1.1, 0, 0] }),
    ],
    { center: true },
  );
}

function glassBottle() {
  const body = lathe([[0, 0], [0.12, 0], [0.125, 0.02], [0.125, 0.36], [0.09, 0.44], [0.045, 0.5], [0.045, 0.66], [0.055, 0.68], [0.04, 0.7], [0, 0.7]], 14);
  return merge([part(body, '#7B4A26'), part(Cyl(0.126, 0.126, 0.12, 14), '#E9D8A6', { pos: [0, 0.2, 0] })], { center: true });
}

function jamJar() {
  const glass = lathe([[0, 0], [0.16, 0], [0.17, 0.02], [0.17, 0.24], [0.14, 0.27], [0, 0.27]], 16);
  return merge(
    [
      part(glass, (p) => (p.y < 0.2 ? '#6A2C70' : '#D9E7EC')),
      part(Cyl(0.155, 0.155, 0.07, 16), '#E53935', { pos: [0, 0.3, 0] }),
      part(Cyl(0.156, 0.156, 0.025, 16), '#FFFFFF', { pos: [0, 0.3, 0] }),
    ],
    { center: true },
  );
}

// ---- ペットボトル（ふたとラベルを外した姿） ----
const PET = '#BFE3F2';
const PET_RIB = '#9FD2EA';

function petProfile(r, h) {
  const neck = r * 0.36;
  return [
    [0, 0], [r * 0.8, 0], [r, h * 0.05], [r, h * 0.62], [r * 0.7, h * 0.78], [neck, h * 0.88],
    [neck, h * 0.96], [neck * 1.35, h * 0.965], [neck * 1.35, h * 0.975], [neck, h * 0.98], [neck, h], [0, h],
  ];
}

function petRibs(r, h, n) {
  const parts = [];
  for (let k = 0; k < n; k++) parts.push(part(Torus(r * 1.01, 0.006), PET_RIB, { pos: [0, h * (0.2 + k * 0.12), 0], rot: [Math.PI / 2, 0, 0] }));
  return parts;
}

function petSmall() {
  return merge([part(lathe(petProfile(0.11, 0.46), 14), PET), ...petRibs(0.11, 0.46, 3)], { center: true });
}

function petLarge() {
  return merge([part(lathe(petProfile(0.15, 0.74), 16), PET), ...petRibs(0.15, 0.74, 4)], { center: true });
}

function petSquare() {
  return merge(
    [
      part(Box(0.24, 0.34, 0.24), PET, { pos: [0, 0.17, 0] }),
      part(Cyl(0.05, 0.16, 0.1, 4), PET, { pos: [0, 0.39, 0], rot: [0, Math.PI / 4, 0] }),
      part(Cyl(0.045, 0.045, 0.08, 10), PET, { pos: [0, 0.48, 0] }),
      part(Torus(0.06, 0.01), PET_RIB, { pos: [0, 0.47, 0], rot: [Math.PI / 2, 0, 0] }),
      part(Box(0.245, 0.02, 0.245), PET_RIB, { pos: [0, 0.12, 0] }),
      part(Box(0.245, 0.02, 0.245), PET_RIB, { pos: [0, 0.24, 0] }),
    ],
    { center: true },
  );
}

function petCrushed() {
  // 横に倒れて、つぶれたボトル
  return merge(
    [
      part(lathe(petProfile(0.14, 0.6), 12), PET, { rot: [0, 0, Math.PI / 2], scale: [1.3, 1, 0.45], pos: [0.28, 0.07, 0] }),
      part(Box(0.14, 0.02, 0.2), PET_RIB, { pos: [-0.05, 0.13, 0], rot: [0, 0.4, 0.2] }),
    ],
    { center: true },
  );
}

// ---- 捨てないもの ----
function chick() {
  const yellow = '#FFD93B';
  const orange = '#FF8F1F';
  return merge(
    [
      part(S(0.2, 14, 10), yellow, { pos: [0, 0.2, 0], scale: [1, 0.95, 1] }),
      part(S(0.14, 14, 10), yellow, { pos: [0, 0.42, 0.04] }),
      part(Cone(0.045, 0.1, 8), orange, { pos: [0, 0.41, 0.2], rot: [Math.PI / 2, 0, 0] }),
      part(S(0.022, 6, 4), '#222222', { pos: [-0.06, 0.46, 0.15] }),
      part(S(0.022, 6, 4), '#222222', { pos: [0.06, 0.46, 0.15] }),
      part(S(1, 8, 6), '#F5C518', { pos: [-0.19, 0.22, 0], rot: [0, 0, 0.5], scale: [0.05, 0.11, 0.09] }),
      part(S(1, 8, 6), '#F5C518', { pos: [0.19, 0.22, 0], rot: [0, 0, -0.5], scale: [0.05, 0.11, 0.09] }),
      part(Box(0.05, 0.02, 0.08), orange, { pos: [-0.07, 0.01, 0.06] }),
      part(Box(0.05, 0.02, 0.08), orange, { pos: [0.07, 0.01, 0.06] }),
      part(Cone(0.03, 0.08, 6), yellow, { pos: [0, 0.57, 0.02] }), // 頭の毛
    ],
    { center: true },
  );
}

function cat() {
  const fur = '#F2A65A';
  const dark = '#C97A35';
  return merge(
    [
      part(S(1, 14, 10), fur, { pos: [0, 0.2, -0.02], scale: [0.19, 0.22, 0.17] }),
      part(S(0.15, 14, 10), fur, { pos: [0, 0.48, 0.03] }),
      part(Cone(0.06, 0.12, 4), dark, { pos: [-0.09, 0.62, 0.02], rot: [0, 0, 0.25] }),
      part(Cone(0.06, 0.12, 4), dark, { pos: [0.09, 0.62, 0.02], rot: [0, 0, -0.25] }),
      part(S(0.022, 6, 4), '#222222', { pos: [-0.055, 0.5, 0.16] }),
      part(S(0.022, 6, 4), '#222222', { pos: [0.055, 0.5, 0.16] }),
      part(S(0.018, 6, 4), '#E57373', { pos: [0, 0.46, 0.175] }),
      part(Torus(0.12, 0.03, Math.PI * 1.2), dark, { pos: [0.16, 0.12, -0.08], rot: [Math.PI / 2, 0, 0.3] }), // しっぽ
      part(S(1, 8, 6), '#FFE0B8', { pos: [0, 0.22, 0.12], scale: [0.1, 0.13, 0.05] }), // おなか
    ],
    { center: true },
  );
}

/** 縦持ちの小さい画面でも形がわかるよう、少し大きめにする。 */
const ITEM_SCALE = 1.2;

const BUILDERS = {
  banana, appleCore, fishBone, paperBall,
  bentoBox, shoppingBag, eggPack, snackBag,
  juiceCan, tinCan, glassBottle, jamJar,
  petSmall, petLarge, petSquare, petCrushed,
  chick, cat,
};

/**
 * すべての形を最初に作る。プレイ中には作らない。
 * @returns {Record<string, { geometry: THREE.BufferGeometry, halfHeight: number, radius: number }>}
 */
export function buildModels() {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [kind, fn] of Object.entries(BUILDERS)) {
    const geometry = fn().scale(ITEM_SCALE, ITEM_SCALE, ITEM_SCALE);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const bb = geometry.boundingBox;
    out[kind] = {
      geometry,
      halfHeight: (bb.max.y - bb.min.y) / 2,
      radius: Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2,
    };
  }
  return out;
}
