// 見物の仲間ロボット（仕様 9.3.1）。ソータと同じ型で、ひと回り小さく、差し色だけゴミ箱の 4 色。
// 段階が進むにつれて、ベルトから離れた両脇の奥に集まってくる。あくまで演出で、遊びには関わらない。
// 全員を部品ごとにまとめて描く（InstancedMesh）。描画の命令は全員で 7 回。

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { ROBOT_POS } from './layout.js';
import { part, merge, shadowTexture } from './geo.js';

const SCALE = 0.7;
const SIDE_X = 2.8; // ベルトの中心からの距離（ベルトの端から 1.9 ほど離れる）
/** 組ごとの奥行き。0 組目がカウント、1〜3 組目が各切り替えの小節で登場する。 */
const ROW_Z = [-3.2, -4.5, -5.8, -7.1];
// 組ごとの差し色（左、右）。同じ組の 2 体は違う色にする
const ROW_COLORS = [['burn', 'can'], ['plastic', 'pet'], ['can', 'burn'], ['pet', 'plastic']];
const ARRIVE_SEC = 0.9;

const WHITE = '#F4F6F8';
const GRAY = '#5A6B82';
const S = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const Cyl = (rt, rb, h, n = 12) => new THREE.CylinderGeometry(rt, rb, h, n);
const Cap = (r, l) => new THREE.CapsuleGeometry(r, l, 3, 8);

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const bump = (k, len) => (k >= 0 && k < len ? Math.sin((k / len) * Math.PI) : 0);

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Texture} faceTexture ソータの顔の絵（同じ表情を出す）
 */
export function createCrowd(scene, faceTexture) {
  const N = ROW_Z.length * 2;

  // ---- 形（体の座標で作る。ソータと同じ配置） ----
  const whiteGeo = merge([
    part(S(0.36), WHITE, { pos: [0, 0.3, 0], scale: [1, 0.92, 0.9] }),
    part(Cyl(0.08, 0.1, 0.1), GRAY, { pos: [0, 0.66, 0] }),
    part(S(0.34), WHITE, { pos: [0, 0.93, 0], scale: [1.15, 0.92, 1] }),
    part(Cyl(0.012, 0.012, 0.18, 6), GRAY, { pos: [0, 1.28, 0] }),
  ]);
  // 差し色の部品（色は 1 体ずつ instanceColor で付ける）
  const accentGeo = merge([
    part(Cyl(0.3, 0.2, 0.08, 16), '#ffffff', { pos: [0, 0.04, 0] }),
    part(new THREE.BoxGeometry(0.3, 0.26, 0.1), '#ffffff', { pos: [0, 0.34, 0.3] }),
    part(Cyl(0.08, 0.08, 0.06), '#ffffff', { pos: [-0.39, 0.93, 0], rot: [0, 0, Math.PI / 2] }),
    part(Cyl(0.08, 0.08, 0.06), '#ffffff', { pos: [0.39, 0.93, 0], rot: [0, 0, Math.PI / 2] }),
    part(S(0.07, 10, 8), '#ffffff', { pos: [0, 1.4, 0] }),
  ]);
  const screenGeo = new THREE.SphereGeometry(0.345, 16, 10, Math.PI * 0.7, Math.PI * 0.6, Math.PI * 0.3, Math.PI * 0.4)
    .scale(1.16, 0.93, 1.01)
    .rotateY(Math.PI / 2)
    .translate(0, 0.93, 0);
  // 腕（肩が原点）と手
  const armGeo = merge([part(S(0.085, 10, 8), '#ffffff'), part(Cap(0.06, 0.24), '#ffffff', { pos: [0, -0.18, 0] })]);
  const handGeo = merge([
    part(S(0.08, 10, 8), WHITE, { pos: [0, -0.38, 0] }),
    ...[-1, 0, 1].map((f) => part(Cap(0.022, 0.07), WHITE, { pos: [f * 0.045, -0.47, -0.02], rot: [0.3, 0, f * 0.35] })),
  ]);
  const wheelGeo = merge([
    part(new THREE.TorusGeometry(0.13, 0.06, 6, 16), GRAY, { rot: [0, Math.PI / 2, 0] }),
    part(Cyl(0.05, 0.05, 0.22, 8), GRAY, { pos: [0, 0.14, 0] }),
  ]);

  const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const inst = (geo, mat, count) => {
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
    return m;
  };
  const whites = inst(whiteGeo, vcMat, N);
  const accents = inst(accentGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), N);
  const screens = inst(screenGeo, new THREE.MeshBasicMaterial({ map: faceTexture }), N);
  const arms = inst(armGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), N * 2);
  const hands = inst(handGeo, vcMat, N * 2);
  const wheels = inst(wheelGeo, vcMat, N);
  const shadows = inst(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    N,
  );
  shadows.renderOrder = 1;

  // 1 体ずつの骨組み（シーンには加えず、行列の計算だけに使う）
  const bots = [];
  for (let row = 0; row < ROW_Z.length; row++) {
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      const i = bots.length;
      const root = new THREE.Object3D();
      const wheel = new THREE.Object3D();
      wheel.position.y = 0.19;
      const body = new THREE.Object3D();
      const pivots = [-1, 1].map((ps) => {
        const p = new THREE.Object3D();
        p.position.set(ps * 0.4, 0.42, 0);
        body.add(p);
        return p;
      });
      root.add(wheel, body);
      const x = side * SIDE_X;
      const z = ROW_Z[row];
      // ソータ（主役）のほうを向いて見物する
      const yaw = Math.atan2(-(ROBOT_POS.x - x), -(ROBOT_POS.z - z));
      const color = new THREE.Color(CONFIG.types[ROW_COLORS[row][s]].color);
      accents.setColorAt(i, color);
      arms.setColorAt(i * 2, color);
      arms.setColorAt(i * 2 + 1, color);
      bots.push({ row, side, x, z, yaw, root, wheel, body, pivots, seed: i * 0.37, arriveAt: Infinity });
    }
  }
  accents.instanceColor.needsUpdate = true;
  arms.instanceColor.needsUpdate = true;

  /** @type {'hidden'|'play'|'happy'|'sad'} */
  let mode = 'hidden';
  /** @type {{ kind: string, at: number }} */
  let react = { kind: '', at: -Infinity };
  const hideM = new THREE.Matrix4().makeScale(0, 0, 0);
  const shadowM = new THREE.Matrix4();

  function hide(i) {
    for (const m of [whites, accents, screens, wheels, shadows]) m.setMatrixAt(i, hideM);
    for (const m of [arms, hands]) {
      m.setMatrixAt(i * 2, hideM);
      m.setMatrixAt(i * 2 + 1, hideM);
    }
  }

  return {
    /**
     * 組ごとの登場の時刻（曲の時刻）。-Infinity なら最初からいる、Infinity なら来ない。
     * @param {number[]} times 長さは組の数（4）
     */
    setArrivals(times) {
      for (const b of bots) b.arriveAt = times[b.row] ?? Infinity;
    },
    /** @param {'hidden'|'play'|'happy'|'sad'} m */
    setMode(m) {
      mode = m;
    },
    /** ソータの結果に反応する。 */
    react(kind, now) {
      react = { kind, at: now };
    },
    reset() {
      react = { kind: '', at: -Infinity };
    },

    /**
     * @param {number} now 動きの時刻
     * @param {{ worldTime: number, beat: number, pulse: number, fever: boolean, ending: boolean, reduceMotion: boolean }} s
     *   worldTime は登場を決める曲の時刻（ゲームオーバーのあとは止まる）
     */
    update(now, s) {
      bots.forEach((b, i) => {
        const a = s.worldTime - b.arriveAt;
        if (mode === 'hidden' || !(a >= 0)) {
          hide(i);
          return;
        }
        // 画面の外から車輪で滑りこんでくる
        const arrive = smooth(Math.min(1, a / ARRIVE_SEC));
        const x = b.x + b.side * (1 - arrive) * 4.5;
        b.root.position.set(x, 0, b.z);
        b.root.rotation.set(0, arrive < 1 ? b.yaw + b.side * (1 - arrive) * 0.8 : b.yaw, 0);
        b.root.scale.setScalar(SCALE);

        const k = now - react.at - b.seed * 0.08; // 1 体ずつ少しずらして反応する
        const calm = s.reduceMotion;
        // 拍に合わせてゆれる（1 体ずつ少しずらす）
        const f = s.beat - b.seed * 0.15;
        const pulse = s.beat > 0 ? Math.pow(1 - (f - Math.floor(f)), 3) : 0;
        let lift = pulse * pulse * (s.fever && !calm ? 0.14 : 0.05);
        let yaw = 0;
        let roll = 0;
        let pitch = 0;
        const L = [0.1, -0.12];
        const R = [0.1, 0.12];

        if (mode === 'happy') {
          lift = calm ? 0.03 : Math.abs(Math.sin(now * 5 + b.seed * 3)) * 0.25;
          L[1] = -2.6 + Math.sin(now * 10 + b.seed) * 0.2;
          R[1] = 2.6 - Math.sin(now * 10 + b.seed) * 0.2;
        } else if (mode === 'sad') {
          pitch = -0.25;
          roll = Math.sin(now * 1.5 + b.seed) * 0.05;
          L[0] = R[0] = -0.1;
        } else if (s.ending) {
          // しめくくり：みんなで万歳
          L[0] = R[0] = 2.9;
          lift += calm ? 0 : Math.abs(Math.sin(now * 6 + b.seed * 2)) * 0.12;
        } else {
          if (react.kind === 'perfect' && !calm) {
            lift += bump(k, 0.3) * 0.14;
          } else if (react.kind === 'miss' && k >= 0 && k < 0.6) {
            // 頭を抱える
            const e = Math.min(1, k / 0.1) * (1 - Math.max(0, (k - 0.45) / 0.15));
            L[0] = R[0] = 0.1 + 2.5 * e;
            L[1] = -0.12 + 0.5 * e;
            R[1] = 0.12 - 0.5 * e;
            roll = calm ? 0 : Math.sin(k * 40) * 0.06 * e;
          } else if (react.kind === 'safe') {
            // 手を振る
            const e = bump(k, 0.6);
            const arm = b.side < 0 ? R : L; // ベルト側の手
            arm[1] += b.side * -(2.2 * e + Math.sin(k * 30) * 0.3 * e);
          }
          // フィーバー中は、ときどき回る（1 体ずつずらして）
          if (s.fever && !calm) {
            const ph = (((s.beat + b.row * 2 + (b.side > 0 ? 1 : 0)) % 8) + 8) % 8;
            if (ph < 1) yaw = Math.PI * 2 * smooth(ph);
            L[0] = Math.max(L[0], 0.1 + pulse * 1.2);
            R[0] = Math.max(R[0], 0.1 + (1 - pulse) * 1.2);
          }
        }

        b.body.position.y = 0.3 + lift;
        b.body.rotation.set(pitch, yaw, roll);
        b.pivots[0].rotation.set(L[0], 0, L[1]);
        b.pivots[1].rotation.set(R[0], 0, R[1]);
        b.wheel.rotation.x = arrive < 1 ? a * 12 : lift * 2;
        b.root.updateMatrixWorld(true);

        whites.setMatrixAt(i, b.body.matrixWorld);
        accents.setMatrixAt(i, b.body.matrixWorld);
        screens.setMatrixAt(i, b.body.matrixWorld);
        wheels.setMatrixAt(i, b.wheel.matrixWorld);
        for (let p = 0; p < 2; p++) {
          arms.setMatrixAt(i * 2 + p, b.pivots[p].matrixWorld);
          hands.setMatrixAt(i * 2 + p, b.pivots[p].matrixWorld);
        }
        const r = 0.5 * SCALE * 2;
        shadowM.makeScale(r / (1 + lift * 2), 1, r / (1 + lift * 2)).setPosition(x, 0.012, b.z);
        shadows.setMatrixAt(i, shadowM);
      });
      for (const m of [whites, accents, screens, arms, hands, wheels, shadows]) m.instanceMatrix.needsUpdate = true;
    },
  };
}
