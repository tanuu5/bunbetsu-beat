// ゴミ箱。どれにも「色・記号・文字」の 3 つを付ける（色の見分けが苦手な人への配慮）。
// ラベルはいつもカメラのほうを向く板。文字を 3D の中に描くのは、このラベルだけ。

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { t } from '../i18n.js';
import { BIN_POS, UNSORTED_POS } from './layout.js';
import { part, merge, shadowMesh } from './geo.js';

const TYPES = /** @type {const} */ (['burn', 'plastic', 'can', 'pet']);
const FONT = '"Hiragino Maru Gothic ProN", "BIZ UDPGothic", "Noto Sans JP", system-ui, sans-serif';

/** 記号を描く。(0,0) を中心に、半径 r ほどの大きさ。 */
function drawSymbol(g, type, r) {
  g.fillStyle = '#FFFFFF';
  g.strokeStyle = '#FFFFFF';
  g.lineWidth = r * 0.14;
  g.lineJoin = 'round';
  if (type === 'burn') {
    // 炎
    g.beginPath();
    g.moveTo(0, -r);
    g.bezierCurveTo(r * 0.5, -r * 0.4, r * 0.8, 0, r * 0.7, r * 0.4);
    g.bezierCurveTo(r * 0.6, r * 0.9, -r * 0.6, r * 0.9, -r * 0.7, r * 0.4);
    g.bezierCurveTo(-r * 0.8, 0, -r * 0.3, -r * 0.2, 0, -r);
    g.fill();
    g.fillStyle = CONFIG.types.burn.color;
    g.beginPath();
    g.moveTo(0, -r * 0.1);
    g.bezierCurveTo(r * 0.35, r * 0.2, r * 0.35, r * 0.7, 0, r * 0.7);
    g.bezierCurveTo(-r * 0.35, r * 0.7, -r * 0.35, r * 0.2, 0, -r * 0.1);
    g.fill();
  } else if (type === 'plastic') {
    // 「プラ」の文字を四角で囲む
    g.strokeRect(-r * 0.95, -r * 0.75, r * 1.9, r * 1.5);
    g.font = `800 ${r * 0.95}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('プラ', 0, r * 0.05);
  } else if (type === 'can') {
    // 缶の形
    g.beginPath();
    g.ellipse(0, -r * 0.7, r * 0.5, r * 0.16, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-r * 0.5, -r * 0.7, r, r * 1.4);
    g.beginPath();
    g.ellipse(0, r * 0.7, r * 0.5, r * 0.16, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = CONFIG.types.can.color;
    g.fillRect(-r * 0.5, -r * 0.2, r, r * 0.3);
  } else {
    // ボトルの形
    g.beginPath();
    g.moveTo(-r * 0.12, -r);
    g.lineTo(r * 0.12, -r);
    g.lineTo(r * 0.12, -r * 0.6);
    g.quadraticCurveTo(r * 0.45, -r * 0.45, r * 0.45, -r * 0.1);
    g.lineTo(r * 0.45, r * 0.85);
    g.quadraticCurveTo(r * 0.45, r, r * 0.3, r);
    g.lineTo(-r * 0.3, r);
    g.quadraticCurveTo(-r * 0.45, r, -r * 0.45, r * 0.85);
    g.lineTo(-r * 0.45, -r * 0.1);
    g.quadraticCurveTo(-r * 0.45, -r * 0.45, -r * 0.12, -r * 0.6);
    g.closePath();
    g.fill();
  }
}

/** ラベルの絵：種類の色の地に、記号・名前・方向の矢印。 */
function makeLabel(type) {
  const W = 256;
  const H = 208;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const color = CONFIG.types[type].color;
  g.fillStyle = '#1B2438';
  g.beginPath();
  g.roundRect(4, 4, W - 8, H - 8, 28);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(12, 12, W - 24, H - 24, 22);
  g.fill();
  g.save();
  g.translate(W / 2, 74);
  drawSymbol(g, type, 46);
  g.restore();
  const name = t(`types.${type}`);
  g.font = `800 ${name.length > 5 ? 30 : 36}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = '#1B2438';
  g.strokeText(name, W / 2, 158);
  g.fillStyle = '#FFFFFF';
  g.fillText(name, W / 2, 158);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function binBody(type) {
  const color = new THREE.Color(CONFIG.types[type].color);
  const dark = color.clone().multiplyScalar(0.7);
  const light = color.clone().lerp(new THREE.Color('#ffffff'), 0.35);
  if (type === 'pet') {
    // ベルトの上に吊られた投入口（じょうご）と、天井からの支え
    return merge([
      part(new THREE.CylinderGeometry(0.62, 0.3, 0.6, 20, 1, true), (p) => (p.y > 0.1 ? color : dark)),
      part(new THREE.TorusGeometry(0.62, 0.05, 6, 24), light, { pos: [0, 0.3, 0], rot: [Math.PI / 2, 0, 0] }),
      part(new THREE.CylinderGeometry(0.3, 0.3, 0.15, 16, 1, true), '#2B3A55', { pos: [0, -0.37, 0] }),
      part(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8), '#5A6B82', { pos: [0.7, 1.2, 0] }),
      part(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8), '#5A6B82', { pos: [-0.7, 1.2, 0] }),
      part(new THREE.BoxGeometry(1.5, 0.05, 0.05), '#5A6B82', { pos: [0, 0.3, 0] }),
    ]);
  }
  const box = new THREE.CylinderGeometry(0.8, 0.66, 0.9, 4, 1);
  // 上から見ても種類の色が見えるよう、ふちを太くして、口は小さめにする
  return merge([
    part(box, (p) => (p.y > 0.2 ? color : dark), { pos: [0, 0.45, 0], rot: [0, Math.PI / 4, 0] }),
    part(new THREE.CylinderGeometry(0.86, 0.86, 0.1, 4, 1), color, { pos: [0, 0.92, 0], rot: [0, Math.PI / 4, 0] }),
    part(new THREE.CylinderGeometry(0.87, 0.87, 0.02, 4, 1), light, { pos: [0, 0.975, 0], rot: [0, Math.PI / 4, 0] }),
    part(new THREE.CylinderGeometry(0.5, 0.5, 0.02, 4, 1), dark.clone().multiplyScalar(0.5), { pos: [0, 0.99, 0], rot: [0, Math.PI / 4, 0] }),
  ]);
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera ラベルをカメラへ向けるため
 */
export function createBins(scene, camera) {
  /** @type {Record<string, { group: THREE.Group, body: THREE.Mesh, label: THREE.Mesh, mat: THREE.MeshLambertMaterial, bumpAt: number, flashAt: number, appearAt: number }>} */
  const bins = {};
  const hitMeshes = [];

  for (const type of TYPES) {
    const p = BIN_POS[type];
    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);
    const color = new THREE.Color(CONFIG.types[type].color);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: color, emissiveIntensity: 0 });
    if (type === 'pet') mat.side = THREE.DoubleSide;
    const body = new THREE.Mesh(binBody(type), mat);
    body.position.y = type === 'pet' ? p.y : 0;
    group.add(body);
    if (type !== 'pet') {
      const sh = shadowMesh(0.95);
      sh.position.y = 0.01;
      group.add(sh);
    }

    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.975),
      new THREE.MeshBasicMaterial({ map: makeLabel(type), transparent: true, depthTest: false }),
    );
    // じょうごは横に、箱は手前の面に看板として置く。箱の縁に埋もれないよう、最後に重ねて描く
    // （じょうごの上に置くと画面の縦の幅を使い、横持ちで全体が小さくなるため横に置く）
    if (type === 'pet') label.position.set(1.4, p.y + 0.15, 0);
    else label.position.set(0, 0.42, 0.75);
    label.renderOrder = 5;
    group.add(label);

    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, type === 'pet' ? p.y + 0.3 : 0.7, 0);
    hit.userData.dir = CONFIG.types[type].dir;
    hit.userData.type = type;
    group.add(hit);
    hitMeshes.push(hit);
    scene.add(group);
    bins[type] = { group, body, label, mat, bumpAt: -Infinity, flashAt: -Infinity, appearAt: -Infinity };
  }

  // 見逃したゴミが落ちる「未分別」の箱
  const unsorted = new THREE.Mesh(
    merge([
      part(new THREE.BoxGeometry(0.62, 0.36, 0.62), '#8A94A6', { pos: [0, 0.18, 0] }),
      part(new THREE.BoxGeometry(0.5, 0.02, 0.5), '#2B3A55', { pos: [0, 0.365, 0] }),
      part(new THREE.BoxGeometry(0.4, 0.08, 0.01), '#E8553D', { pos: [0, 0.2, 0.315] }),
    ]),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  unsorted.position.set(UNSORTED_POS.x, 0, UNSORTED_POS.z);
  scene.add(unsorted);

  return {
    hitMeshes,
    /** 曲の時刻 t に、上から降りてくる。-Infinity なら最初から置いておく。 */
    setAppearTime(type, time) {
      bins[type].appearAt = time;
    },
    isVisible(type) {
      return bins[type].group.visible;
    },
    /** 新しいゲームの前に、前の動きを消す。 */
    reset() {
      for (const type of TYPES) {
        bins[type].bumpAt = -Infinity;
        bins[type].flashAt = -Infinity;
      }
    },
    /** 入ったとき、少しつぶれて戻る。 */
    bump(type, now) {
      bins[type].bumpAt = now;
    },
    /** 正解を教えるために光らせる。 */
    flash(type, now) {
      bins[type].flashAt = now;
    },
    /** @param {number} now 曲の時刻 @param {number} beatPulse 拍の頭で 1、次の拍へ向けて 0 へ */
    update(now, beatPulse) {
      for (const type of TYPES) {
        const b = bins[type];
        const a = now - b.appearAt;
        b.group.visible = a >= 0;
        // 降りてきて、少し弾んで止まる
        const DROP = 0.6;
        b.group.position.y = a >= DROP ? 0 : 5 * Math.pow(1 - a / DROP, 2) - Math.sin((a / DROP) * Math.PI) * 0.15;
        const k = now - b.bumpAt;
        const squash = k >= 0 && k < 0.25 ? Math.sin((k / 0.25) * Math.PI) * 0.18 : 0;
        const beat = beatPulse * 0.04;
        b.body.scale.set(1 + squash * 0.6 + beat, 1 - squash + beat, 1 + squash * 0.6 + beat);
        const f = now - b.flashAt;
        const flash = f >= 0 && f < 0.5 ? 0.5 + 0.5 * Math.sin(f * 40) : 0;
        b.mat.emissiveIntensity = flash * 0.9;
        b.label.quaternion.copy(camera.quaternion);
        const ls = 1 + flash * 0.12 + beat * 0.5;
        b.label.scale.set(ls, ls, 1);
      }
    },
  };
}
