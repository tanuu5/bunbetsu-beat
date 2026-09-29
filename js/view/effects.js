// 粒、紙ふぶき、煙、輪。どれも最初に作った数を使い回し、種類ごとに 1 回の描画でまとめて描く。

import * as THREE from 'three';
import { BELT_WIDTH } from './layout.js';

const CONFETTI_COLORS = ['#E8553D', '#F2B630', '#2F80ED', '#27AE60', '#FF9EC4', '#4FC3F7', '#FFFFFF'];

/**
 * 同じ形の粒をまとめて扱う。
 * @param {THREE.Scene} scene
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Material} material
 * @param {number} count
 */
function createSwarm(scene, geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const white = new THREE.Color('#ffffff');
  for (let i = 0; i < count; i++) mesh.setColorAt(i, white);
  scene.add(mesh);
  const ps = Array.from({ length: count }, () => ({
    alive: false, life: 0, age: 0, size: 1,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(),
  }));
  let next = 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, zero);
  return {
    mesh,
    /** 空いている粒を 1 つ返す（なければいちばん古いものを使う）。 */
    spawn(color) {
      const i = next;
      next = (next + 1) % count;
      const p = ps[i];
      p.alive = true;
      p.age = 0;
      mesh.setColorAt(i, color);
      mesh.instanceColor.needsUpdate = true;
      return p;
    },
    clear() {
      for (let i = 0; i < count; i++) {
        ps[i].alive = false;
        mesh.setMatrixAt(i, zero);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    /** @param {(p: any, dt: number) => number} step 粒を動かし、大きさを返す（0 以下で消える） */
    update(dt, step) {
      let any = false;
      for (let i = 0; i < count; i++) {
        const p = ps[i];
        if (!p.alive) continue;
        p.age += dt;
        const s = p.age >= p.life ? 0 : step(p, dt);
        if (s <= 0) {
          p.alive = false;
          mesh.setMatrixAt(i, zero);
        } else {
          q.setFromEuler(p.rot);
          m.compose(p.pos, q, sc.setScalar(s));
          mesh.setMatrixAt(i, m);
        }
        any = true;
      }
      if (any) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/** @param {THREE.Scene} scene */
export function createEffects(scene) {
  const color = new THREE.Color();

  // ゴミ箱に入ったときの、種類の色の粒
  const sparks = createSwarm(scene, new THREE.TetrahedronGeometry(0.07), new THREE.MeshBasicMaterial(), 120);
  // フィーバーの紙ふぶき
  const confetti = createSwarm(
    scene,
    new THREE.PlaneGeometry(0.14, 0.08),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    90,
  );
  // 未分別の箱から出る、ため息のような煙
  const smoke = createSwarm(scene, new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshLambertMaterial({ color: '#AEB6C4' }), 30);

  // コンボ 10 ごとに、判定位置から広がる輪
  const rings = [0, 1].map(() => {
    const mat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 48).rotateX(-Math.PI / 2), mat);
    ring.position.set(0, 0.1, 0);
    ring.visible = false;
    ring.renderOrder = 3;
    scene.add(ring);
    return { ring, mat, at: -Infinity };
  });
  let ringNext = 0;

  let last = NaN;
  let confettiCarry = 0;

  return {
    /** @param {THREE.Vector3} pos @param {string} hex */
    burst(pos, hex, n = 14) {
      color.set(hex);
      for (let k = 0; k < n; k++) {
        const p = sparks.spawn(color);
        p.life = 0.5 + Math.random() * 0.2;
        p.pos.copy(pos);
        const a = Math.random() * Math.PI * 2;
        const sp = 1.5 + Math.random() * 1.5;
        p.vel.set(Math.cos(a) * sp, 2.5 + Math.random() * 2, Math.sin(a) * sp);
        p.rot.set(Math.random() * 6, Math.random() * 6, 0);
        p.spin.set(Math.random() * 10, Math.random() * 10, 0);
      }
    },
    /** @param {THREE.Vector3} pos */
    sigh(pos) {
      color.set('#ffffff');
      for (let k = 0; k < 5; k++) {
        const p = smoke.spawn(color);
        p.life = 0.9 + k * 0.08;
        p.pos.set(pos.x + (Math.random() - 0.5) * 0.15, 0.4, pos.z);
        p.vel.set((k - 2) * 0.12 + 0.2, 0.5 + k * 0.08, 0);
        p.size = 0.8 + k * 0.15;
        p.rot.set(0, 0, 0);
        p.spin.set(0, 0, 0);
      }
    },
    ring(now) {
      const r = rings[ringNext];
      ringNext = (ringNext + 1) % rings.length;
      r.at = now;
    },
    clear() {
      sparks.clear();
      confetti.clear();
      smoke.clear();
      for (const r of rings) r.at = -Infinity;
      last = NaN;
    },
    /**
     * @param {number} now 曲の時刻（止まっていれば粒も止まる）
     * @param {{ fever: boolean, reduceMotion: boolean }} s
     */
    update(now, s) {
      let dt = Number.isFinite(last) ? now - last : 0;
      last = now;
      if (dt < 0) {
        // 曲の時刻が戻った（やりなおし）
        this.clear();
        last = now;
        dt = 0;
      }
      dt = Math.min(dt, 0.1);

      if (s.fever && !s.reduceMotion) {
        confettiCarry += dt * 40;
        while (confettiCarry >= 1) {
          confettiCarry--;
          color.set(CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]);
          const p = confetti.spawn(color);
          p.life = 4;
          p.pos.set((Math.random() - 0.5) * 9, 4.5 + Math.random(), -7 + Math.random() * 10);
          p.vel.set((Math.random() - 0.5) * 0.4, -1.1 - Math.random() * 0.6, 0);
          p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
          p.spin.set(2 + Math.random() * 4, 1 + Math.random() * 3, 0);
          p.size = 1;
        }
      }

      sparks.update(dt, (p, d) => {
        p.vel.y -= 9 * d;
        p.pos.addScaledVector(p.vel, d);
        p.rot.x += p.spin.x * d;
        p.rot.y += p.spin.y * d;
        return 1 - p.age / p.life;
      });
      confetti.update(dt, (p, d) => {
        p.pos.addScaledVector(p.vel, d);
        p.pos.x += Math.sin(p.age * 3 + p.spin.x) * 0.4 * d;
        p.rot.x += p.spin.x * d;
        p.rot.y += p.spin.y * d;
        return p.pos.y > 0 ? 1 : 0;
      });
      smoke.update(dt, (p, d) => {
        p.pos.addScaledVector(p.vel, d);
        p.vel.multiplyScalar(1 - d * 1.5);
        const u = p.age / p.life;
        return p.size * Math.sin(Math.min(1, u * 1.3) * Math.PI) * 1.4;
      });

      for (const r of rings) {
        const k = now - r.at;
        const on = k >= 0 && k < 0.6;
        r.ring.visible = on;
        if (!on) continue;
        const u = k / 0.6;
        const sc = (BELT_WIDTH / 2) * (1 + u * 2.2);
        r.ring.scale.set(sc, 1, sc);
        r.mat.opacity = (1 - u) * 0.9;
      }
    },
  };
}
