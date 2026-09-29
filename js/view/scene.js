// カメラ、明かり、背景、ベルト、画面の大きさへの対応。

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SPAWN_Z, GATE_Z, BELT_END_Z, BELT_WIDTH, BIN_POS, ITEM_Y } from './layout.js';
import { part, merge } from './geo.js';

/** WebGL2 が使えるか。 */
export function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

// カメラは斜め上から見下ろす。この向きのまま、画面に収まる距離を探す。
const VIEW_DIR = new THREE.Vector3(0, 1.05, 0.95).normalize();
const LOOK_AT = new THREE.Vector3(0, 0.5, -1.6);
// 画面に必ず入れる点（ゴミ箱とラベル、ベルトの奥、上の投入口）
const FIT_POINTS = [
  [-3.2, 0, 0.15], [3.2, 0, 0.15], [-3.1, 1.15, 0.8], [3.1, 1.15, 0.8], [-3.1, 1.1, -0.5], [3.1, 1.1, -0.5],
  [0, 0, 3.8], [-0.75, 0, 3.8], [0.75, 0, 3.8], [0, 1.1, 3.75], [-0.6, -0.1, 3.95], [0.6, -0.1, 3.95],
  [0, 0, SPAWN_Z - 0.4], [0, BIN_POS.pet.y + 0.45, BIN_POS.pet.z], [2.0, BIN_POS.pet.y + 0.65, BIN_POS.pet.z],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));

const BG_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}`;
// 背景：#2B3A55 から #1B2438 へのぼかし。フィーバー中はゆっくり虹色に変わる。
const BG_FRAG = /* glsl */ `
uniform float uFever;
uniform float uTime;
uniform float uPulse;
varying vec2 vUv;
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
void main() {
  float y = clamp(vUv.y, 0.0, 1.0);
  vec3 top = vec3(43.0, 58.0, 85.0) / 255.0;
  vec3 bottom = vec3(27.0, 36.0, 56.0) / 255.0;
  vec3 col = mix(bottom, top, y);
  col += vec3(0.025, 0.03, 0.04) * clamp(uPulse, 0.0, 1.0);
  vec3 rainbow = hsv2rgb(vec3(fract(uTime * 0.06 + y * 0.35), 0.5, 0.36));
  col = mix(col, rainbow, clamp(uFever, 0.0, 1.0) * 0.65);
  gl_FragColor = vec4(col, 1.0);
}`;

/** 工場の背景（横に広い画面で左右の余白に見える）。まとめて 1 つの形にする。 */
function buildFactory() {
  const wall = '#222D44';
  const pipe = '#34435F';
  const machine = '#2E3B57';
  const parts = [part(new THREE.BoxGeometry(60, 12, 0.5), wall, { pos: [0, 6, -14] })];
  // 配管
  for (const x of [-6.5, -9, -13, -17, 6.5, 9, 13, 17]) parts.push(part(new THREE.CylinderGeometry(0.22, 0.22, 12, 10), pipe, { pos: [x, 6, -13.2] }));
  for (const y of [6.5, 8]) parts.push(part(new THREE.CylinderGeometry(0.18, 0.18, 60, 10), pipe, { pos: [0, y, -13.3], rot: [0, 0, Math.PI / 2] }));
  // 機械とほかのロボット（左右）
  for (const s of [-1, 1]) {
    for (const [x, z, w, h] of [[6, -6, 2.2, 1.6], [8.5, -1, 1.6, 1.2], [11, -7, 2.6, 2.2], [14, -2, 2, 1.5]]) {
      parts.push(part(new THREE.BoxGeometry(w, h, 1.6), machine, { pos: [s * x, h / 2, z] }));
      parts.push(part(new THREE.BoxGeometry(w * 0.6, 0.12, 0.05), '#3E5A7A', { pos: [s * x, h * 0.7, z + 0.81] }));
    }
    for (const [x, z] of [[7.2, 1.5], [10.5, -3.5], [15.5, 1]]) {
      parts.push(
        part(new THREE.CapsuleGeometry(0.35, 0.4, 4, 10), '#3C4B68', { pos: [s * x, 0.7, z] }),
        part(new THREE.SphereGeometry(0.3, 12, 8), '#43537A', { pos: [s * x, 1.35, z] }),
        part(new THREE.SphereGeometry(0.06, 6, 4), '#3F8FB5', { pos: [s * x, 1.75, z] }),
      );
    }
  }
  return merge(parts);
}

/** 壁の窓（拍に合わせて明るくなる）。 */
function buildWindows() {
  const parts = [];
  for (let i = -8; i <= 8; i++) {
    if (Math.abs(i) < 2) continue; // 真ん中はベルトの奥なので空ける
    parts.push(part(new THREE.PlaneGeometry(1.6, 1.1), '#5E86B8', { pos: [i * 2.2, 3.4, -13.7] }));
  }
  return merge(parts);
}

/** ベルトの流れを示す線の絵。 */
function beltTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.fillStyle = '#3D4A5C';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#5A6B82';
  g.fillRect(0, 26, 64, 10);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** @param {HTMLCanvasElement} canvas */
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x1b2438, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

  scene.add(new THREE.HemisphereLight(0xe6eeff, 0x2b3a55, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(2, 6, 4);
  scene.add(sun);

  // 背景のぼかし（画面いっぱいの板を、いちばん奥に描く）
  const bgUniforms = { uFever: { value: 0 }, uTime: { value: 0 }, uPulse: { value: 0 } };
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader: BG_VERT, fragmentShader: BG_FRAG, uniforms: bgUniforms, depthTest: false, depthWrite: false }),
  );
  bg.frustumCulled = false;
  bg.renderOrder = -10;
  scene.add(bg);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#27324A' }));
  floor.position.set(0, -0.001, -4);
  scene.add(floor);
  scene.add(new THREE.Mesh(buildFactory(), new THREE.MeshLambertMaterial({ vertexColors: true })));
  const windowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 });
  scene.add(new THREE.Mesh(buildWindows(), windowMat));

  // ベルト
  const beltLen = BELT_END_Z - SPAWN_Z + 1;
  const beltCenterZ = (BELT_END_Z + SPAWN_Z - 1) / 2;
  const frame = new THREE.Mesh(
    merge([
      part(new THREE.BoxGeometry(BELT_WIDTH, 0.12, beltLen), '#3D4A5C', { pos: [0, 0, beltCenterZ] }),
      part(new THREE.BoxGeometry(0.1, 0.22, beltLen), '#5A6B82', { pos: [-(BELT_WIDTH / 2 + 0.05), 0.05, beltCenterZ] }),
      part(new THREE.BoxGeometry(0.1, 0.22, beltLen), '#5A6B82', { pos: [BELT_WIDTH / 2 + 0.05, 0.05, beltCenterZ] }),
      part(new THREE.CylinderGeometry(0.1, 0.1, BELT_WIDTH + 0.1, 12), '#6E7F98', { pos: [0, -0.02, BELT_END_Z], rot: [0, 0, Math.PI / 2] }),
    ]),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  scene.add(frame);
  const beltTex = beltTexture();
  const STRIPE = 0.9; // 線の間隔
  beltTex.repeat.set(1, beltLen / STRIPE);
  const beltTop = new THREE.Mesh(new THREE.PlaneGeometry(BELT_WIDTH, beltLen).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: beltTex }));
  beltTop.position.set(0, ITEM_Y + 0.001, beltCenterZ);
  scene.add(beltTop);

  // 判定位置（拍で明るくなる）
  const judgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
  const judgeLine = new THREE.Mesh(new THREE.BoxGeometry(BELT_WIDTH + 0.3, 0.02, 0.12), judgeMat);
  judgeLine.position.set(0, ITEM_Y + 0.02, 0);
  scene.add(judgeLine);

  // スキャンの門。ゴミが通ると、光の線が上から下へなぞる
  const gate = new THREE.Group();
  gate.position.z = GATE_Z;
  gate.add(
    new THREE.Mesh(
      merge([
        part(new THREE.BoxGeometry(0.14, 1.35, 0.14), '#9FB3CC', { pos: [-(BELT_WIDTH / 2 + 0.2), 0.68, 0] }),
        part(new THREE.BoxGeometry(0.14, 1.35, 0.14), '#9FB3CC', { pos: [BELT_WIDTH / 2 + 0.2, 0.68, 0] }),
        part(new THREE.BoxGeometry(BELT_WIDTH + 0.54, 0.16, 0.18), '#9FB3CC', { pos: [0, 1.36, 0] }),
        part(new THREE.BoxGeometry(0.5, 0.1, 0.02), '#4FC3F7', { pos: [0, 1.36, 0.1] }),
      ]),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    ),
  );
  const scanMat = new THREE.MeshBasicMaterial({ color: '#7FE3FF', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const scanBar = new THREE.Mesh(new THREE.BoxGeometry(BELT_WIDTH + 0.3, 0.03, 0.05), scanMat);
  scanBar.renderOrder = 4;
  gate.add(scanBar);
  scene.add(gate);

  const size = { w: 1, h: 1 };
  const ndc = new THREE.Vector3();
  const camBase = new THREE.Vector3();
  let shakeAt = -Infinity;

  /** 画面の縦横比に合わせて、カメラの距離を決める。 */
  function fitCamera() {
    const topLimit = size.h > size.w ? 0.72 : 0.8; // 上部の表示のぶん、上を空ける
    const fits = (d) => {
      camera.position.copy(VIEW_DIR).multiplyScalar(d).add(LOOK_AT);
      camera.lookAt(LOOK_AT);
      camera.updateMatrixWorld();
      for (const p of FIT_POINTS) {
        ndc.copy(p).project(camera);
        if (Math.abs(ndc.x) > 0.95 || ndc.y > topLimit || ndc.y < -0.95) return false;
      }
      return true;
    };
    let lo = 3;
    let hi = 60;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    fits(hi);
    camBase.copy(camera.position);
  }

  let pixelRatio = Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio);

  function resize(w, h) {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 50 : 40;
    camera.updateProjectionMatrix();
    fitCamera();
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  return {
    renderer,
    scene,
    camera,
    resize,
    setPixelRatio(pr) {
      pixelRatio = pr;
      resize(size.w, size.h);
    },
    get pixelRatio() {
      return pixelRatio;
    },

    /** 3D の点を、画面の CSS ピクセルへ。 */
    project(x, y, z) {
      ndc.set(x, y, z).project(camera);
      return { x: ((ndc.x + 1) / 2) * size.w, y: ((1 - ndc.y) / 2) * size.h };
    },

    /**
     * 画面の点の下にある物を調べる。
     * @param {THREE.Object3D[]} objects
     */
    pick(clientX, clientY, objects) {
      pointer.set((clientX / size.w) * 2 - 1, -(clientY / size.h) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(objects, false);
    },

    /** MISS のとき、画面を少し揺らす。 */
    shake(now) {
      shakeAt = now;
    },

    /**
     * @param {{ now: number, pulse: number, fever: number, beltOffset: number, scan: number, reduceMotion: boolean }} s
     *   fever は 0〜1（切り替えをなめらかにする）、beltOffset はベルトが進んだ長さ、scan は門を通るゴミの進み具合（0〜1、なければ −1）
     */
    update(s) {
      judgeMat.opacity = 0.35 + s.pulse * 0.65;
      judgeLine.scale.set(1, 1, 1 + s.pulse * 1.5);
      bgUniforms.uPulse.value = s.reduceMotion ? 0 : s.pulse;
      bgUniforms.uFever.value = s.reduceMotion ? 0 : s.fever;
      bgUniforms.uTime.value = s.now;
      windowMat.opacity = 0.45 + s.pulse * 0.35;
      beltTex.offset.y = s.beltOffset / STRIPE;
      if (s.scan >= 0 && s.scan <= 1) {
        scanBar.position.y = 1.25 - s.scan * 1.15;
        scanMat.opacity = Math.sin(s.scan * Math.PI);
      } else scanMat.opacity = 0;
      const k = s.now - shakeAt;
      camera.position.copy(camBase);
      if (!s.reduceMotion && k >= 0 && k < 0.25) {
        const a = (1 - k / 0.25) * 0.06;
        camera.position.x += Math.sin(k * 90) * a;
        camera.position.y += Math.cos(k * 70) * a * 0.6;
      }
    },

    render() {
      renderer.render(scene, camera);
    },
  };
}
