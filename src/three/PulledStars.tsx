import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "../state/store";

// Small, prominent, twinkling light spots where the user has pulled a poem out of the void —
// "捕捉到一小片虚空" rather than a giant white ball. Lifecycle (animated in useFrame):
//   • fade IN over FADE_IN;  • twinkle gently while alive;
//   • when more than ALIVE_CAP are alive, the OLDEST flickers out (twinkle → vanish) over FADE_OUT;
//   • a spot too far from the camera is culled (perf). Gold = 格律-valid, pale blue = noise.
const ALIVE_CAP = 20;
const FADE_IN = 0.5; // s
const FADE_OUT = 1.0; // s — fast flicker then gone
const CULL_DIST = 1700; // world units from camera → retire
const MAXBUF = 40; // GPU buffer capacity

interface Marker {
  id: number;
  pos: [number, number, number];
  valid: boolean;
  birth: number;
  death: number | null;
}

export function PulledStars() {
  const pulls = useStore((s) => s.pulls);
  const { camera } = useThree();
  const clock = useRef(0);
  const markers = useRef<Marker[]>([]);
  const seen = useRef<Set<number>>(new Set());

  const obj = useMemo(() => {
    const pos = new Float32Array(MAXBUF * 3);
    const col = new Float32Array(MAXBUF * 3);
    const pha = new Float32Array(MAXBUF);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aPhase", new THREE.BufferAttribute(pha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aPhase;
        uniform float uTime; varying vec3 vColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float tw = 0.78 + 0.22 * sin(uTime * 3.0 + aPhase * 6.2831853);
          gl_PointSize = clamp(240.0 / -mv.z, 2.5, 14.0) * tw;
          gl_Position = projectionMatrix * mv;
          vColor = aColor;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
          float core = exp(-d * d * 7.0);            // tight bright core
          float ring = smoothstep(0.95, 0.45, d) * 0.22; // faint halo
          float a = core + ring;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor * a, a);
        }`,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    return { pts, g, pos, col, pha, m };
  }, []);

  useFrame((_, dt) => {
    clock.current += Math.min(dt, 0.05);
    const t = clock.current;
    obj.m.uniforms.uTime.value = t;

    // ingest new pulls (by stable id)
    const storeIds = new Set<number>();
    for (const p of pulls) {
      storeIds.add(p.id);
      if (!seen.current.has(p.id)) {
        seen.current.add(p.id);
        markers.current.push({ id: p.id, pos: p.pos, valid: p.valid, birth: t, death: null });
      }
    }
    seen.current = new Set([...seen.current].filter((id) => storeIds.has(id))); // keep bounded

    // FIFO cap: retire the oldest alive beyond ALIVE_CAP
    const alive = markers.current.filter((m) => m.death === null);
    if (alive.length > ALIVE_CAP) {
      alive.sort((a, b) => a.birth - b.birth);
      for (let i = 0; i < alive.length - ALIVE_CAP; i++) alive[i].death = t;
    }
    // distance cull
    const cam = camera.position;
    for (const m of markers.current) {
      if (m.death === null) {
        const dx = m.pos[0] - cam.x, dy = m.pos[1] - cam.y, dz = m.pos[2] - cam.z;
        if (dx * dx + dy * dy + dz * dz > CULL_DIST * CULL_DIST) m.death = t;
      }
    }
    // drop finished
    markers.current = markers.current.filter((m) => m.death === null || t - m.death < FADE_OUT);

    // rebuild GPU buffers
    let n = 0;
    for (const m of markers.current) {
      if (n >= MAXBUF) break;
      let alpha: number;
      if (m.death !== null) {
        const k = (t - m.death) / FADE_OUT; // 0→1
        const flick = 0.5 + 0.5 * Math.sin(k * 26); // fast star-flicker
        alpha = (1 - k) * (0.35 + 0.65 * flick);
      } else {
        alpha = Math.min(1, (t - m.birth) / FADE_IN);
      }
      const c = m.valid ? [1.0, 0.84, 0.4] : [0.78, 0.86, 1.0];
      const b = alpha * 1.7;
      obj.pos[n * 3] = m.pos[0];
      obj.pos[n * 3 + 1] = m.pos[1];
      obj.pos[n * 3 + 2] = m.pos[2];
      obj.col[n * 3] = c[0] * b;
      obj.col[n * 3 + 1] = c[1] * b;
      obj.col[n * 3 + 2] = c[2] * b;
      obj.pha[n] = (m.id % 100) / 100;
      n++;
    }
    obj.g.setDrawRange(0, n);
    obj.g.attributes.position.needsUpdate = true;
    obj.g.attributes.aColor.needsUpdate = true;
    (obj.g.attributes.aPhase as THREE.BufferAttribute).needsUpdate = true;
  });

  return <primitive object={obj.pts} />;
}
