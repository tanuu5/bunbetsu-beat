// ソータ。基本の形を組み合わせて作る。動きは、骨の動きを再生せず、時刻から式で求める。
// ベルト（−z）のほうを向いて立ち、プレイヤーは後ろ上から見る。顔は頭の前の画面に出す。

import * as THREE from 'three';
import { ROBOT_POS } from './layout.js';
import { part, merge, shadowMesh } from './geo.js';
import { drawFace } from './face.js';

const WHITE = '#F4F6F8';
const ACCENT = '#4FC3F7';
const GRAY = '#5A6B82';

const S = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
const Cyl = (rt, rb, h, n = 16) => new THREE.CylinderGeometry(rt, rb, h, n);
const Cap = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10);

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** 0 → 1 → 0 と山なりに動く。k が 0 より前や len より後は 0。 */
const bump = (k, len) => (k >= 0 && k < len ? Math.sin((k / len) * Math.PI) : 0);

function buildArm(side) {
  // 肩を原点に、下へのびる腕と 3 本指の手
  const parts = [
    part(S(0.085, 12, 8), ACCENT),
    part(Cap(0.06, 0.24), ACCENT, { pos: [0, -0.18, 0] }),
    part(S(0.08, 12, 8), WHITE, { pos: [0, -0.38, 0] }),
  ];
  for (let f = -1; f <= 1; f++) {
    parts.push(part(Cap(0.022, 0.07), WHITE, { pos: [f * 0.045, -0.47, -0.02], rot: [0.3, 0, f * 0.35] }));
  }
  const g = merge(parts);
  if (side > 0) g.scale(-1, 1, 1); // 右手は左右反転
  return g;
}

/** @param {THREE.Scene} scene */
export function createRobot(scene) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

  const root = new THREE.Group();
  root.position.set(ROBOT_POS.x, ROBOT_POS.y, ROBOT_POS.z);
  scene.add(root);
  const shadow = shadowMesh(0.5);
  shadow.position.y = 0.01;
  root.add(shadow);

  // 車輪（1 輪）
  const wheel = new THREE.Mesh(
    merge([
      part(new THREE.TorusGeometry(0.13, 0.06, 8, 20), GRAY, { rot: [0, Math.PI / 2, 0] }),
      part(Cyl(0.08, 0.08, 0.1, 12), ACCENT, { rot: [0, 0, Math.PI / 2] }),
      part(Cyl(0.05, 0.05, 0.22, 10), GRAY, { pos: [0, 0.14, 0] }),
    ]),
    mat,
  );
  wheel.position.y = 0.19;
  root.add(wheel);

  // 体（腰を回転の中心にする）
  const body = new THREE.Group();
  body.position.y = 0.3;
  root.add(body);
  const shell = new THREE.Mesh(
    merge([
      part(S(0.36), WHITE, { pos: [0, 0.3, 0], scale: [1, 0.92, 0.9] }),
      part(Cyl(0.3, 0.2, 0.08, 20), ACCENT, { pos: [0, 0.04, 0] }),
      // 背中の四角いパック（後ろ姿でもソータとわかる目印）
      part(new THREE.BoxGeometry(0.3, 0.26, 0.1), ACCENT, { pos: [0, 0.34, 0.3] }),
      part(S(0.04, 8, 6), '#FFFFFF', { pos: [-0.07, 0.4, 0.36] }),
      part(S(0.04, 8, 6), '#FFFFFF', { pos: [0.07, 0.4, 0.36] }),
      part(Cyl(0.08, 0.1, 0.1, 12), GRAY, { pos: [0, 0.66, 0] }),
      // 頭
      part(S(0.34), WHITE, { pos: [0, 0.93, 0], scale: [1.15, 0.92, 1] }),
      part(Cyl(0.08, 0.08, 0.06, 14), ACCENT, { pos: [-0.39, 0.93, 0], rot: [0, 0, Math.PI / 2] }),
      part(Cyl(0.08, 0.08, 0.06, 14), ACCENT, { pos: [0.39, 0.93, 0], rot: [0, 0, Math.PI / 2] }),
      part(Cyl(0.012, 0.012, 0.18, 6), GRAY, { pos: [0, 1.28, 0] }),
    ]),
    mat,
  );
  body.add(shell);

  // 顔の画面（頭の前 = −z 側）
  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = faceCanvas.height = 128;
  const faceCtx = /** @type {CanvasRenderingContext2D} */ (faceCanvas.getContext('2d'));
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(
    new THREE.SphereGeometry(0.345, 20, 12, Math.PI * 0.7, Math.PI * 0.6, Math.PI * 0.3, Math.PI * 0.4),
    new THREE.MeshBasicMaterial({ map: faceTex }),
  );
  screen.position.y = 0.93;
  screen.scale.set(1.16, 0.93, 1.01);
  screen.rotation.y = Math.PI / 2; // 絵の中心（+x）を −z へ向ける
  body.add(screen);

  // アンテナの先（拍に合わせて光る）
  const antenna = new THREE.Group();
  antenna.position.y = 1.2;
  body.add(antenna);
  const ballMat = new THREE.MeshLambertMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 0.3 });
  const ball = new THREE.Mesh(S(0.07, 12, 8), ballMat);
  ball.position.y = 0.2;
  antenna.add(ball);

  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.4, 0.42, 0);
    pivot.add(new THREE.Mesh(buildArm(side), mat));
    body.add(pivot);
    return pivot;
  });

  /** @type {{ kind: string, dir: string|null, at: number }} */
  let act = { kind: 'idle', dir: null, at: -Infinity };
  let turnAt = -Infinity;
  /** @type {'title'|'play'|'happy'|'sad'} */
  let mode = 'title';
  let faceExpr = '';
  let faceDrawnAt = -Infinity;

  return {
    root,
    /** 顔の絵（見物の仲間にも同じ表情を出すため）。 */
    faceTexture: faceTex,
    throwTo(dir, now) {
      act = { kind: 'throw', dir, at: now };
    },
    whiff(now) {
      act = { kind: 'whiff', dir: null, at: now };
    },
    miss(now) {
      act = { kind: 'miss', dir: null, at: now };
    },
    /** 捨てないものに手を振る。 */
    wave(now) {
      act = { kind: 'wave', dir: null, at: now };
    },
    /** 捨てないものをつかみかけて、あわてて手を離す。 */
    letGo(now) {
      act = { kind: 'letGo', dir: null, at: now };
    },
    /** カメラへふり向いて親指を立てる。 */
    turn(now) {
      turnAt = now;
    },
    /** @param {'title'|'play'|'happy'|'sad'} m */
    setMode(m) {
      mode = m;
    },
    /** 新しいゲームの前に、前の動きを消す（曲の時刻が 0 に戻るため）。 */
    reset() {
      act = { kind: 'idle', dir: null, at: -Infinity };
      turnAt = -Infinity;
      faceDrawnAt = -Infinity;
    },

    /**
     * @param {number} now 動きの時刻（秒）
     * @param {{ beat: number, pulse: number, fever: boolean, expr: import('./face.js').Expression, reduceMotion: boolean }} s
     */
    update(now, s) {
      // 顔：変わったとき、動く表情なら 1 秒に 20 回まで描き直す
      const animated = s.expr !== 'nod' && s.expr !== 'smile';
      if (s.expr !== faceExpr || (animated && Math.abs(now - faceDrawnAt) > 0.05)) {
        drawFace(faceCtx, 128, s.expr, now);
        faceTex.needsUpdate = true;
        faceExpr = s.expr;
        faceDrawnAt = now;
      }

      const k = now - act.at;
      const p = s.pulse;
      let yaw = 0;
      let pitch = 0;
      let roll = 0;
      let lift = p * p * (s.fever ? 0.12 : 0.05);
      let stretch = 1 + p * 0.03;
      // 腕：[前へ上げる角度, 横へ開く角度]。左右それぞれ
      const L = [0.1, -0.12];
      const R = [0.1, 0.12];
      antenna.rotation.z = Math.sin(now * 5) * 0.08 + (s.reduceMotion ? 0 : p * 0.15);
      ballMat.emissiveIntensity = 0.3 + p * 1.4;

      if (mode !== 'play') {
        yaw = Math.PI; // カメラのほうを向く
        if (mode === 'title') {
          R[0] = 0.4;
          R[1] = 2.3 + Math.sin(now * 7) * 0.35; // 手を振る
          lift = Math.abs(Math.sin(now * 2.5)) * 0.04;
        } else if (mode === 'happy') {
          lift = Math.abs(Math.sin(now * 5)) * 0.25;
          L[1] = -2.6 + Math.sin(now * 10) * 0.2;
          R[1] = 2.6 - Math.sin(now * 10) * 0.2;
        } else {
          pitch = -0.25; // うつむく
          roll = Math.sin(now * 1.5) * 0.05;
          L[0] = R[0] = -0.1;
          stretch = 0.97;
        }
      } else {
        if (act.kind === 'throw') {
          const e = bump(k, 0.2);
          if (act.dir === 'left') {
            yaw = 0.8 * e;
            L[0] = 0.1 + 1.2 * e;
            L[1] = -0.12 - 0.7 * e;
          } else if (act.dir === 'right') {
            yaw = -0.8 * e;
            R[0] = 0.1 + 1.2 * e;
            R[1] = 0.12 + 0.7 * e;
          } else if (act.dir === 'up') {
            L[0] = R[0] = 0.1 + 2.8 * e;
            stretch += 0.08 * e;
            lift += 0.08 * e;
          } else {
            pitch = 0.25 * e; // 後ろへそって、下へ投げる
            L[0] = R[0] = 0.1 - 1.3 * e;
          }
        } else if (act.kind === 'whiff') {
          const e = bump(k, 0.2);
          L[0] = R[0] = 0.1 + 0.9 * e;
          roll = 0.12 * e;
        } else if (act.kind === 'miss' && k >= 0 && k < 0.3) {
          roll = Math.sin(k * 60) * 0.12 * (1 - k / 0.3);
        } else if (act.kind === 'wave') {
          const e = bump(k, 0.4);
          R[1] = 0.12 + 2.2 * e + Math.sin(k * 30) * 0.3 * e;
        } else if (act.kind === 'letGo' && k >= 0 && k < 0.4) {
          const reach = k < 0.12 ? k / 0.12 : Math.max(0, 1 - (k - 0.12) / 0.06);
          L[0] = R[0] = 0.1 + 1.2 * reach - (k > 0.12 ? 0.5 * bump(k - 0.12, 0.28) : 0);
          roll = k > 0.12 ? Math.sin(k * 50) * 0.08 * (1 - k / 0.4) : 0;
        }
        // フィーバー中は 2 小節ごとに 1 回まわる
        if (s.fever && !s.reduceMotion) {
          const phase = ((s.beat % 8) + 8) % 8;
          if (phase < 1) yaw += Math.PI * 2 * smooth(phase);
        }
        // ふり向き（0.5 秒）。顔をカメラに向けて親指を立てる
        const tk = now - turnAt;
        if (tk >= 0 && tk < 0.5) {
          const e = bump(tk, 0.5);
          yaw += Math.PI * smooth(e * 1.6);
          R[0] = 0.1 + 1.4 * e;
          R[1] = 0.12 + 0.4 * e;
        }
      }

      body.position.y = 0.3 + lift;
      body.rotation.set(pitch, yaw, roll);
      body.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
      wheel.rotation.x = lift * 2;
      arms[0].rotation.set(L[0], 0, L[1]);
      arms[1].rotation.set(R[0], 0, R[1]);
    },
  };
}
