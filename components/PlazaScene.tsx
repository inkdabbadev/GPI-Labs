'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildLogoGeometries } from '../lib/logoGeometry.mjs';

type Props = { phase: number; playing: boolean; onReady: () => void; onFail: () => void };
type ShapeData = { width: number; height: number; shapes: { outline: number[][]; holes: number[][][] }[] };

// One look per phase: Art (blue hour), Light (night), Technology (holographic night).
const LOOKS = [
  { skyTop: '#0b1430', skyMid: '#2a3558', skyHorizon: '#a8603f', fog: '#262b45', fogDensity: .0075, glow: .4,
    sun: 2.2, sunColor: '#ffb98a', fill: .8, hemi: .95, hemiSky: '#8fa3cc', hemiGround: '#3a2c26', env: .75,
    up: .2, upColor: '#ffb27a', windows: .45, strips: .25, stripColor: '#ffab66', face: .08, holo: 0, stars: .3,
    beams: 0, beamColor: '#ffb27a', dust: .15, rim: .5, rimColor: '#ffd2b0', bloom: .12, exposure: .92,
    sweep: 0, chase: 0, chaseSpeed: .1, camDist: 1.03, camAz: .14, camElev: 0 },
  { skyTop: '#020409', skyMid: '#07101f', skyHorizon: '#18223a', fog: '#0f1522', fogDensity: .011, glow: 0,
    sun: .3, sunColor: '#9db4ff', fill: .25, hemi: .32, hemiSky: '#4a5f8f', hemiGround: '#2a1d16', env: .4,
    up: 1.5, upColor: '#ffa45c', windows: 1.25, strips: 1.05, stripColor: '#ff9a4d', face: .34, holo: 0, stars: 1,
    beams: .95, beamColor: '#ffb46e', dust: .85, rim: 1.5, rimColor: '#8fb0ff', bloom: .36, exposure: 1.1,
    sweep: 1, chase: .7, chaseSpeed: .12, camDist: .97, camAz: .02, camElev: -.025 },
  { skyTop: '#01030a', skyMid: '#050d1f', skyHorizon: '#0c1c3a', fog: '#08101f', fogDensity: .011, glow: 0,
    sun: .2, sunColor: '#8fb0ff', fill: .2, hemi: .24, hemiSky: '#3a5cff', hemiGround: '#101a2a', env: .4,
    up: .2, upColor: '#6fa8ff', windows: .45, strips: .25, stripColor: '#5fa0ff', face: .12, holo: 1, stars: 1,
    beams: 0, beamColor: '#5f9dff', dust: 0, rim: .9, rimColor: '#62c6ff', bloom: .25, exposure: .9,
    sweep: 0, chase: 1, chaseSpeed: .35, camDist: .93, camAz: .26, camElev: .03 }
] as const;
type LookDef = (typeof LOOKS)[number];
type Look = { [K in keyof LookDef]: LookDef[K] extends string ? THREE.Color : number };
const toLook = (def: LookDef): Look => Object.fromEntries(Object.entries(def).map(([k, v]) => [k, typeof v === 'string' ? new THREE.Color(v) : v])) as Look;

const PEDESTAL_TOP = .78;
const BRAND = ['#ff6a2b', '#e6332a', '#45a84b', '#2c5aa0'];

function rng(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function windowTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d')!; g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
  const r = rng(7);
  for (let y = 4; y < 256; y += 10) for (let x = 3; x < 128; x += 8) {
    const v = r(); if (v < .55) continue;
    const warm = r() < .8; const l = 35 + v * 55;
    g.fillStyle = warm ? `hsl(${30 + r() * 12},80%,${l}%)` : `hsl(210,60%,${l}%)`;
    g.fillRect(x, y, 5, 6);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function paverTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d')!; const r = rng(3);
  for (let y = 0; y < 512; y += 64) for (let x = 0; x < 512; x += 128) {
    const off = (y / 64) % 2 ? 64 : 0; const l = 15 + r() * 8;
    g.fillStyle = `hsl(220,8%,${l}%)`; g.fillRect((x + off) % 512, y, 128, 64);
    if (off) { g.fillRect(x + off - 512, y, 128, 64); }
  }
  g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = 3;
  for (let y = 0; y <= 512; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  for (let y = 0; y < 512; y += 64) for (let x = 0; x <= 512; x += 128) {
    const xx = x + ((y / 64) % 2 ? 64 : 0); g.beginPath(); g.moveTo(xx % 513, y); g.lineTo(xx % 513, y + 64); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(36, 36);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Reflection environment for the metal: dark sky dome, warm city glow at the horizon, a soft key panel.
function nightEnvironment() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vP; void main(){ float h = vP.y;
      vec3 c = mix(vec3(.16,.09,.05), vec3(.05,.07,.13), smoothstep(0.0,.5,h)); c = mix(c, vec3(.015), smoothstep(0.0,-.3,h));
      c += vec3(1.0,.5,.22) * exp(-(h * 14.0) * (h * 14.0)) * .9; gl_FragColor = vec4(c, 1.0); }`
  })));
  const panel = (w: number, h: number, color: string, k: number, pos: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
  };
  panel(30, 6, '#fff1e2', 3, [-20, 22, 30]);
  panel(40, 3, '#9db8ff', 1.4, [0, 40, -20]);
  panel(8, 30, '#ffb37a', 1.6, [36, 4, -12]);
  return env;
}

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;

export default function PlazaScene({ phase, playing, onReady, onFail }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({ phase, playing, dirty: 120 });
  const callbacks = useRef({ onReady, onFail });
  useEffect(() => { callbacks.current = { onReady, onFail }; }, [onReady, onFail]);
  useEffect(() => { live.current.phase = phase; live.current.playing = playing; live.current.dirty = 150; }, [phase, playing]);

  useEffect(() => {
    const container = host.current!;
    let disposed = false, frame = 0, visible = true;
    const cleanups: (() => void)[] = [];
    const abort = new AbortController();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    async function init() {
      const width0 = container.clientWidth || innerWidth;
      const low = width0 < 760 || (navigator.hardwareConcurrency || 8) <= 4;
      const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
      cleanups.push(() => { renderer.dispose(); renderer.domElement.remove(); });
      renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.5 : 1.75));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0;
      renderer.shadowMap.enabled = !low;
      renderer.localClippingEnabled = true;
      // The glass casing refracts a copy of the scene: full resolution keeps the artwork crisp; reduced on small devices.
      renderer.transmissionResolutionScale = low ? .8 : 1;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = nightEnvironment();
      scene.environment = pmrem.fromScene(envScene, .02).texture;
      envScene.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose(); });
      pmrem.dispose();
      const look = toLook(LOOKS[live.current.phase]);
      scene.fog = new THREE.FogExp2(look.fog.getHex(), look.fogDensity);

      const camera = new THREE.PerspectiveCamera(30, 1, .1, 600);

      const [data, faceTexture] = await Promise.all([
        fetch('/logo-shape.json', { signal: abort.signal }).then(r => { if (!r.ok) throw Error('shape'); return r.json() as Promise<ShapeData>; }),
        new THREE.TextureLoader().loadAsync('/textures/logo-face.png')
      ]);
      if (disposed) { faceTexture.dispose(); return; }
      faceTexture.colorSpace = THREE.SRGBColorSpace;
      faceTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

      // ---------- Sky & stars ----------
      const skyUniforms = {
        uTop: { value: look.skyTop.clone() }, uMid: { value: look.skyMid.clone() }, uHorizon: { value: look.skyHorizon.clone() },
        uGlow: { value: look.glow }, uSunDir: { value: new THREE.Vector3(-.55, .06, -1).normalize() }
      };
      const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uTop,uMid,uHorizon,uSunDir; uniform float uGlow; varying vec3 vDir;
          void main(){ float h = vDir.y;
            vec3 c = mix(uHorizon, uMid, smoothstep(-.02,.2,h)); c = mix(c, uTop, smoothstep(.18,.7,h));
            float s = max(dot(normalize(vDir), uSunDir), 0.0);
            c += uGlow * (pow(s, 6.0) * vec3(1.0,.45,.2) * .9 + pow(s, 60.0) * vec3(1.0,.7,.45));
            if (h < 0.0) c = mix(uHorizon, uHorizon * .25, smoothstep(0.0, -.15, h));
            gl_FragColor = vec4(c, 1.0); }`
      }));
      scene.add(sky);

      const starPositions = new Float32Array(1400 * 3); { const r = rng(11);
        for (let i = 0; i < 1400; i++) { const th = r() * Math.PI * 2, y = .08 + r() * .92, rr = Math.sqrt(1 - y * y);
          starPositions.set([Math.cos(th) * rr * 380, y * 380, Math.sin(th) * rr * 380], i * 3); } }
      const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
      const starMat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: look.stars, depthWrite: false });
      scene.add(new THREE.Points(starGeo, starMat));

      // ---------- Ground: wet stone with live reflections ----------
      const reflectQuality = low ? .32 : .5;
      const reflector = new Reflector(new THREE.PlaneGeometry(260, 260), { textureWidth: 512, textureHeight: 512, color: 0x474b54, clipBias: .003 });
      reflector.rotation.x = -Math.PI / 2; scene.add(reflector);
      const paver = paverTexture();
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({
        map: paver, color: 0x9aa0aa, roughness: .5, metalness: .1, transparent: true, opacity: .7
      }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = .005; ground.receiveShadow = true; scene.add(ground);
      // The paving sits just above the mirror plane; hide it while the mirror renders.
      const mirrorRender = reflector.onBeforeRender;
      reflector.onBeforeRender = (...args) => { ground.visible = false; mirrorRender.apply(reflector, args); ground.visible = true; };

      // ---------- Materials ----------
      const stone = new THREE.MeshStandardMaterial({ color: 0x1d2027, roughness: .55, metalness: .25 });
      const concrete = new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: .92, metalness: 0 });

      // ---------- Light fixtures that ignite in sequence ----------
      // Each fixture blends from its previous state to the new act's state behind a travelling front,
      // so lights switch on, and change colour, as a visible sweep rather than all at once.
      type Fixture = { mat: THREE.ShaderMaterial; kind: 'strip' | 'ring'; delay: number; dur: number; mix: number; from: THREE.Color; to: THREE.Color };
      const fixtures: Fixture[] = [];
      const chase = { value: 0 }, chaseAmt = { value: 0 };
      const fixture = (kind: Fixture['kind'], delay: number, dur: number) => {
        const mat = new THREE.ShaderMaterial({
          uniforms: { uFrom: { value: new THREE.Color() }, uTo: { value: new THREE.Color() }, uMix: { value: 0 }, uMode: { value: kind === 'ring' ? 1 : 0 }, uChase: chase, uChaseAmt: chaseAmt, uOff: { value: fixtures.length * .37 } },
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: `uniform vec3 uFrom, uTo; uniform float uMix, uMode, uChase, uChaseAmt, uOff; varying vec2 vUv;
            void main(){
              float d = uMode < .5 ? abs(vUv.x - .5) * 2.0 : abs(fract(vUv.x - .25 + .5) - .5) * 2.0;
              float front = uMix * 1.2;
              float lit = smoothstep(front, front - .2, d);
              float hd = (d - front + .1) * 12.0; float head = exp(-hd * hd) * (1.0 - smoothstep(.9, 1.0, uMix)) * step(.001, uMix);
              float x = fract(vUv.x * (uMode < .5 ? 1.5 : 3.0) - uChase + uOff); float cd = (x - .5) * 10.0;
              float pulse = exp(-cd * cd) * uChaseAmt;
              vec3 c = mix(uFrom, uTo, lit) * (1.0 + pulse * .9) + uTo * head * .8;
              gl_FragColor = vec4(max(c, vec3(.012)), 1.0); }`
        });
        fixtures.push({ mat, kind, delay, dur, mix: 0, from: new THREE.Color(0, 0, 0), to: new THREE.Color() });
        return mat;
      };

      // ---------- Pedestal ----------
      const pedestal = new THREE.Group(); scene.add(pedestal);
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3.55, 3.7, PEDESTAL_TOP - .16, 120), stone);
      plinth.position.y = .16 + (PEDESTAL_TOP - .16) / 2; plinth.castShadow = plinth.receiveShadow = true; pedestal.add(plinth);
      const step = new THREE.Mesh(new THREE.CylinderGeometry(4.35, 4.45, .16, 120), stone);
      step.position.y = .08; step.receiveShadow = true; pedestal.add(step);
      for (const [r, y, delay] of [[3.57, PEDESTAL_TOP - .02, 0], [4.37, .15, .25]] as const) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, .022, 8, 200), fixture('ring', delay, 1.5));
        ring.rotation.x = Math.PI / 2; ring.position.y = y; pedestal.add(ring);
      }

      // ---------- The sculpture (the GILab logo, original artwork on the face) ----------
      const { parts, glassParts, height } = buildLogoGeometries(THREE, data);
      const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture, emissiveMap: faceTexture, emissive: 0xffffff, emissiveIntensity: look.face, roughness: .5, metalness: 0, envMapIntensity: .25 });
      const wallMat = new THREE.MeshStandardMaterial({ color: 0xc4c8d0, metalness: 1, roughness: .24 });
      const backMat = new THREE.MeshStandardMaterial({ color: 0x8d939d, metalness: 1, roughness: .4 });
      const materials = [faceMat, wallMat, backMat];
      // The dot keeps its true brand black, finished as polished lacquer so it reads against the night.
      const dotMat = new THREE.MeshPhysicalMaterial({ color: 0x141414, roughness: .4, metalness: 0, clearcoat: .6, clearcoatRoughness: .25, envMapIntensity: .6 });
      // A world-space plane that cuts the solid sculpture: it dissolves top-down and rebuilds bottom-up in the Technology act.
      const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 999);
      [faceMat, wallMat, backMat, dotMat].forEach(m => { m.clippingPlanes = [clipPlane]; });
      const sculpture = new THREE.Group(); sculpture.position.y = PEDESTAL_TOP + height / 2; scene.add(sculpture);
      const sizes = parts.map(g => { const b = g.boundingBox!; return (b.max.x - b.min.x) * (b.max.y - b.min.y); });
      const dotIndex = sizes.indexOf(Math.min(...sizes));
      const dotGroup = new THREE.Group(); sculpture.add(dotGroup);
      parts.forEach((g, i) => {
        const mesh = new THREE.Mesh(g, i === dotIndex ? [dotMat, wallMat, backMat] : materials); mesh.castShadow = mesh.receiveShadow = true;
        (i === dotIndex ? dotGroup : sculpture).add(mesh);
      });
      // Liquid-glass casing: the logo's own outline, bevelled outward, with real refraction, a faint
      // iridescent sheen and a slow ripple running through it. It never writes depth, so the
      // hologram and particles of the Technology act still show through it.
      const glassTime = { value: 0 };
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0, roughness: .015, transmission: 1, thickness: .35, ior: 1.4,
        attenuationColor: new THREE.Color('#e6eeff'), attenuationDistance: 4,
        clearcoat: 1, clearcoatRoughness: .04, specularIntensity: 1, envMapIntensity: 1.3,
        iridescence: .45, iridescenceIOR: 1.3, iridescenceThicknessRange: [140, 460],
        depthWrite: false, clippingPlanes: [clipPlane]
      });
      glassMat.onBeforeCompile = shader => {
        shader.uniforms.uTime = glassTime;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            // Position-only ripple: every coincident vertex moves together, so the surface never tears.
            transformed.z += sin(transformed.x * 1.6 + uTime * 1.2) * sin(transformed.y * 1.3 - uTime * .8) * .035;
            transformed.x += sin(transformed.y * 2.0 + uTime * 1.0) * .01;`);
      };
      glassParts.forEach((g, i) => {
        const glass = new THREE.Mesh(g, glassMat); glass.renderOrder = 1;
        (i === dotIndex ? dotGroup : sculpture).add(glass);
      });

      // The dot floats, held by a column of light rather than a support rod.
      const dotBox = parts[dotIndex].boundingBox!;
      const dotX = (dotBox.min.x + dotBox.max.x) / 2, dotR = (dotBox.max.x - dotBox.min.x) / 2;
      let stemTop = -Infinity; { const mark = parts.find((_, i) => i !== dotIndex)!.getAttribute('position');
        for (let i = 0; i < mark.count; i++) { const x = mark.getX(i), y = mark.getY(i); if (Math.abs(x - dotX) < dotR * .9 && y < dotBox.min.y - .05) stemTop = Math.max(stemTop, y); } }
      if (!Number.isFinite(stemTop)) stemTop = dotBox.min.y - .5;
      const gap = dotBox.min.y - stemTop;
      const levitate = new THREE.Mesh(new THREE.CylinderGeometry(dotR * .55, dotR * .55, gap, 48, 1, true), new THREE.ShaderMaterial({
        ...additive, side: THREE.DoubleSide, uniforms: { uColor: { value: new THREE.Color('#ffb27a') }, uI: { value: 0 }, uTime: { value: 0 } },
        vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uI, uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){ float edge = pow(clamp(1.0 - abs(dot(vN, vV)), 0.0, 1.0), 1.5); float pulse = .65 + .35 * sin(uTime * 2.4 - vUv.y * 9.0);
            float a = (1.0 - edge) * pulse * uI * smoothstep(0.0,.25,vUv.y) * smoothstep(1.0,.75,vUv.y);
            gl_FragColor = vec4(uColor * a, a); }`
      }));
      levitate.position.set(dotX, stemTop + gap / 2, 0); dotGroup.add(levitate);
      const dotRest = dotGroup.position.y;

      // ---------- Architecture around the plaza ----------
      const architecture = new THREE.Group(); scene.add(architecture);
      const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, shadow = true) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = shadow; architecture.add(m); return m;
      };
      // Terraced steps behind the sculpture.
      for (let i = 0; i < 4; i++) {
        const z = -13 - i * 2.2, y = .35 + i * .7;
        box(40, .7, 2.2, 2, y, z, stone);
      }
      // Planters on the right.
      for (const [x, z] of [[12, -4], [16.5, 1.5]] as const) {
        box(7, 1, 2.6, x, .5, z, concrete);
      }

      // ---------- City skyline (merged into one draw call) ----------
      const windowTex = windowTexture();
      const towerMat = new THREE.MeshStandardMaterial({ color: 0x06080d, roughness: 1, metalness: 0, emissive: 0xffd2a0, emissiveMap: windowTex, emissiveIntensity: 0 });
      { const r = rng(21); const towers: THREE.BufferGeometry[] = [];
        const tower = (w: number, h: number, d: number, x: number, y: number, z: number) => {
          const g = new THREE.BoxGeometry(w, h, d); const uv = g.getAttribute('uv');
          for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / 2.2, uv.getY(k) * h / 4.4);
          g.translate(x, y + h / 2, z); towers.push(g);
        };
        for (let i = 0; i < 150; i++) {
          const z = -120 - r() * 140, x = (r() - .5) * (220 + -z * 1.4);
          const w = 3.5 + r() * 6, d = 3.5 + r() * 6, h = 6 + Math.pow(r(), 2.6) * 34 + (-z - 120) * .05;
          tower(w, h, d, x, 0, z);
          // Stepped crowns on the taller towers break up the box silhouettes.
          if (h > 18 && r() < .7) { const s = .55 + r() * .25; tower(w * s, 2 + r() * 6, d * s, x, h, z); }
        }
        const city = new THREE.Mesh(mergeGeometries(towers), towerMat); towers.forEach(g => g.dispose()); scene.add(city); }

      // ---------- Light beams (Light phase) ----------
      const beamUniforms = { uColor: { value: look.beamColor.clone() }, uI: { value: 0 } };
      const beamMat = new THREE.ShaderMaterial({
        ...additive, side: THREE.DoubleSide, uniforms: beamUniforms, fog: false,
        vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uI; varying float vY; varying vec3 vN; varying vec3 vV;
          void main(){ float d = abs(dot(vN, vV)); float core = d * d; float a = pow(clamp(1.0 - vY, 0.0, 1.0), 2.2) * core * uI * .22; gl_FragColor = vec4(uColor * a, a); }`
      });
      const beamGeo = new THREE.CylinderGeometry(1.4, .12, 16, 32, 1, true); beamGeo.translate(0, 8, 0);
      const beams: { mesh: THREE.Mesh; tilt: number }[] = [];
      for (const [x, z, tilt] of [[-4.8, -1, .14], [4.8, -1, -.14], [-2.2, -3.4, .06], [2.2, -3.4, -.06]] as const) {
        const b = new THREE.Mesh(beamGeo, beamMat); b.position.set(x, .02, z); b.rotation.z = tilt; b.rotation.x = -.05; scene.add(b); beams.push({ mesh: b, tilt });
      }

      // ---------- Holographic layer (Technology phase) ----------
      const holo = new THREE.Group(); holo.position.y = sculpture.position.y; scene.add(holo);
      const holoShells: THREE.Mesh[] = [];
      const holoUniforms = { uTime: { value: 0 }, uI: { value: 0 }, uReveal: { value: 0 }, uFloor: { value: PEDESTAL_TOP } };
      const holoColor = new THREE.Color('#5cc8ff');

      // A holographic twin of the sculpture: fresnel edges, travelling scanlines, a bright scan band,
      // a gentle flicker and brief slice glitches. It builds up from the plinth when the act begins.
      const shellUniforms = { uTime: holoUniforms.uTime, uI: holoUniforms.uI, uReveal: { value: -10 }, uScan: { value: 0 }, uColor: { value: holoColor } };
      const shellMat = new THREE.ShaderMaterial({
        ...additive, uniforms: shellUniforms,
        vertexShader: `uniform float uTime, uI; varying vec3 vN; varying vec3 vV; varying float vY;
          float hash(float n){ return fract(sin(n) * 43758.5453); }
          void main(){ vec3 p = position; vec4 world = modelMatrix * vec4(p, 1.0);
            float slice = floor(world.y * 5.0); float tick = floor(uTime * 6.0);
            float g = step(.94, hash(slice * 12.99 + tick * 78.23)) * step(.55, hash(tick * 3.7));
            world.x += g * .14 * (hash(slice + tick) - .5) * uI;
            vY = world.y; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - world.xyz);
            gl_Position = projectionMatrix * viewMatrix * world; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uTime, uI, uReveal, uScan; varying vec3 vN; varying vec3 vV; varying float vY;
          void main(){ float f = clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0); float fres = f * f * f;
            float lines = .5 + .5 * sin(vY * 90.0 - uTime * 7.0);
            float sd = (vY - uScan) * 6.0; float band = exp(-sd * sd);
            float flick = .88 + .12 * sin(uTime * 31.0) * sin(uTime * 9.7);
            float rev = smoothstep(uReveal + .02, uReveal - .35, vY);
            float ed = (vY - uReveal) * 14.0; float edge = exp(-ed * ed);
            float a = (fres * 1.2 + lines * .12 + band * .45) * flick * uI * rev + edge * uI * .55;
            gl_FragColor = vec4(mix(uColor, vec3(.9,.98,1.0), band * .6 + edge * .5) * a, a); }`
      });
      parts.forEach((g, i) => {
        const shell = new THREE.Mesh(g, shellMat); shell.scale.setScalar(1.012); shell.renderOrder = 2;
        (i === dotIndex ? dotGroup : sculpture).add(shell); holoShells.push(shell);
      });

      // Assembly: points sampled on the logo's surface fly in from a swirling cloud and settle into the mark,
      // each carrying the artwork's own colour at its spot, bottom first.
      const cloudUniforms = { uBuild: { value: 0 }, uTime: holoUniforms.uTime, uI: holoUniforms.uI, uSize: { value: 9 * renderer.getPixelRatio() }, uMap: { value: faceTexture }, uMinY: { value: -height / 2 }, uMaxY: { value: height / 2 } };
      const cloudMat = new THREE.ShaderMaterial({
        ...additive, uniforms: cloudUniforms,
        vertexShader: `attribute vec3 aStart; attribute vec2 aUv; attribute float aSeed;
          uniform float uBuild, uTime, uI, uSize, uMinY, uMaxY; uniform sampler2D uMap; varying vec3 vC; varying float vA;
          void main(){
            float h = clamp((position.y - uMinY) / (uMaxY - uMinY), 0.0, 1.0);
            float t = clamp((uBuild * 1.8 - (h * .55 + aSeed * .25)) / .9, 0.0, 1.0);
            float k = t * t * (3.0 - 2.0 * t);
            float ang = (1.0 - k) * (2.5 + aSeed * 2.0); float c = cos(ang), sn = sin(ang);
            vec3 st = vec3(c * aStart.x - sn * aStart.z, aStart.y, sn * aStart.x + c * aStart.z);
            vec3 p = mix(st, position, k); p.z += sin(uTime * 3.0 + aSeed * 40.0) * .02 * k;
            vec3 tex = texture2D(uMap, aUv).rgb;
            vC = mix(vec3(.45, .85, 1.0), tex * 1.3 + .12, k * .75);
            float travel = k * (1.0 - k) * 4.0;
            vA = uI * step(.001, uBuild) * (.24 + travel * 1.2 + (1.0 - k) * .45) * (.65 + .35 * sin(uTime * 5.0 + aSeed * 60.0));
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = uSize * (.6 + aSeed * .8) * (10.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0.0, d) * vA; gl_FragColor = vec4(vC * a, a); }`
      });
      const holoExtras: THREE.Object3D[] = [];
      { const r = rng(91); const total = low ? 2600 : 5200;
        const areaOf = (g: THREE.BufferGeometry) => { const pos = g.getAttribute('position'); const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); const tris: { i: number; area: number }[] = [];
          for (const grp of g.groups) { if (grp.materialIndex === 2) continue; for (let i = grp.start; i < grp.start + grp.count; i += 3) {
            a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
            tris.push({ i, area: b.clone().sub(a).cross(c.clone().sub(a)).length() / 2 }); } }
          return tris; };
        const all = parts.map(areaOf); const sum = all.map(t => t.reduce((x, y) => x + y.area, 0)); const grand = sum.reduce((x, y) => x + y, 0);
        parts.forEach((g, pi) => {
          const n = Math.round(total * sum[pi] / grand), tris = all[pi]; const cum: number[] = []; let acc = 0; for (const t of tris) { acc += t.area; cum.push(acc); }
          const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
          const P = new Float32Array(n * 3), S = new Float32Array(n * 3), U = new Float32Array(n * 2), D = new Float32Array(n);
          const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
          for (let k = 0; k < n; k++) {
            const pick = r() * acc; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < pick) lo = m + 1; else hi = m; }
            const i = tris[lo].i; let u = r(), v = r(); if (u + v > 1) { u = 1 - u; v = 1 - v; } const w = 1 - u - v;
            a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
            P.set([a.x * w + b.x * u + c.x * v, a.y * w + b.y * u + c.y * v, a.z * w + b.z * u + c.z * v], k * 3);
            U.set([uv.getX(i) * w + uv.getX(i + 1) * u + uv.getX(i + 2) * v, uv.getY(i) * w + uv.getY(i + 1) * u + uv.getY(i + 2) * v], k * 2);
            const th = r() * Math.PI * 2, rad = 6 + r() * 4; S.set([Math.cos(th) * rad, (r() - .5) * 8, Math.sin(th) * rad], k * 3); D[k] = r();
          }
          const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(P, 3)); cg.setAttribute('aStart', new THREE.BufferAttribute(S, 3));
          cg.setAttribute('aUv', new THREE.BufferAttribute(U, 2)); cg.setAttribute('aSeed', new THREE.BufferAttribute(D, 1));
          const cloud = new THREE.Points(cg, cloudMat); cloud.frustumCulled = false; cloud.renderOrder = 3;
          (pi === dotIndex ? dotGroup : sculpture).add(cloud); holoExtras.push(cloud);
        }); }

      // Outline trace: the logo's edges draw on from the plinth upward, then a light pulse keeps travelling them.
      const edgeUniforms = { uI: holoUniforms.uI, uTime: holoUniforms.uTime, uTrace: { value: -10 }, uColor: { value: holoColor } };
      const edgeMat = new THREE.ShaderMaterial({
        ...additive, uniforms: edgeUniforms,
        vertexShader: `varying float vY; void main(){ vY = (modelMatrix * vec4(position, 1.0)).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 uColor; uniform float uI, uTime, uTrace; varying float vY;
          void main(){ if (vY > uTrace) discard; float hd = (vY - uTrace) * 8.0; float head = exp(-hd * hd);
            float pd = fract(vY * .35 - uTime * .4) - .5; float pulse = exp(-pd * pd * 300.0);
            float a = (.3 + head * 1.4 + pulse * .6) * uI; gl_FragColor = vec4(mix(uColor, vec3(1.0), head * .6) * a, a); }`
      });
      parts.forEach((g, i) => {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), edgeMat); edges.scale.setScalar(1.006); edges.renderOrder = 3;
        (i === dotIndex ? dotGroup : sculpture).add(edges); holoExtras.push(edges);
      });

      // Light volume rising from the projector ring on the plinth.
      const coneH = height + 1.4;
      const coneMat = new THREE.ShaderMaterial({
        ...additive, side: THREE.DoubleSide, uniforms: { uTime: holoUniforms.uTime, uI: holoUniforms.uI, uColor: { value: holoColor } },
        vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uTime, uI; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){ float streak = pow(.5 + .5 * sin(vUv.x * 6.2831 * 48.0 + sin(vUv.x * 91.0) * 3.0), 6.0);
            float flow = smoothstep(.0, .3, fract(vUv.y * 2.5 - uTime * .35 + vUv.x * 7.0)) * .6 + .4;
            float soft = pow(clamp(abs(dot(vN, vV)), 0.0, 1.0), 1.5);
            float a = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6) * (.25 + .75 * streak * flow) * soft * uI * .18;
            gl_FragColor = vec4(uColor * a, a); }`
      });
      const coneGeo = new THREE.CylinderGeometry(3.9, 3.45, coneH, 96, 1, true); coneGeo.translate(0, coneH / 2, 0);
      const cone = new THREE.Mesh(coneGeo, coneMat); cone.position.y = -height / 2; holo.add(cone);

      // Interface rings around the work: dashed, ticked, counter-rotating.
      [[4.25, .05, -height / 2 + .06, 64, .07], [4.75, .03, -height / 2 + .6, 120, -.05], [4.45, .025, height / 2 + .35, 90, .09]].forEach(([r, w, y, n, spin]) => {
        const mat = new THREE.ShaderMaterial({
          ...additive, side: THREE.DoubleSide, uniforms: { uTime: holoUniforms.uTime, uI: holoUniforms.uI, uColor: { value: holoColor }, uN: { value: n }, uSpin: { value: spin } },
          vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: `uniform vec3 uColor; uniform float uTime, uI, uN, uSpin; varying vec2 vP;
            void main(){ float ang = atan(vP.y, vP.x) / 6.2831 + .5; float u = fract(ang * uN + uTime * uSpin * uN * .05);
              float dash = step(.3, u); float arc = smoothstep(.0, .08, fract(ang + uTime * uSpin)) * smoothstep(.75, .55, fract(ang + uTime * uSpin));
              float a = dash * (.25 + .75 * arc) * uI * .4; gl_FragColor = vec4(uColor * a, a); }`
        });
        const ring = new THREE.Mesh(new THREE.RingGeometry(r as number, (r as number) + (w as number), 256, 1), mat);
        ring.rotation.x = -Math.PI / 2; ring.position.y = y as number; holo.add(ring);
      });

      // Comet orbits in the brand colours.
      const orbits: { mesh: THREE.Mesh; speed: number }[] = []; const orbitTilt: number[] = [];
      [[5.6, BRAND[0], 1.15, .3, .1], [6.1, BRAND[2], -.95, -.35, .08]].forEach(([r, color, tx, tz, speed]) => {
        const mat = new THREE.ShaderMaterial({
          ...additive, side: THREE.DoubleSide, uniforms: { uColor: { value: new THREE.Color(color as string) }, uI: holoUniforms.uI, uOffset: { value: 0 } },
          vertexShader: `varying float vU; void main(){ vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: `uniform vec3 uColor; uniform float uI, uOffset; varying float vU; void main(){ float t = fract(vU + uOffset); float a = (pow(t, 5.0) * .55 + .025) * uI; gl_FragColor = vec4(mix(uColor, vec3(1.0), pow(t, 30.0)) * a, a); }`
        });
        const mesh = new THREE.Mesh(new THREE.TorusGeometry(r as number, .01, 6, 320), mat);
        mesh.rotation.set(Math.PI / 2 + (tx as number), 0, tz as number); holo.add(mesh); orbits.push({ mesh, speed: speed as number }); orbitTilt.push(tz as number);
      });

      // Scanner sweeping the sculpture.
      const scanMat = new THREE.ShaderMaterial({
        ...additive, side: THREE.DoubleSide, uniforms: { uI: { value: 0 } },
        vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uI; varying vec2 vP; void main(){ float r = length(vP) / 4.4; float e = (r - .97) * 40.0; float a = (exp(-e * e) * .4 + smoothstep(1.0, .2, r) * .02) * uI; gl_FragColor = vec4(vec3(.45,.8,1.0) * a, a); }`
      });
      const scanner = new THREE.Mesh(new THREE.CircleGeometry(4.4, 96), scanMat); scanner.rotation.x = -Math.PI / 2; holo.add(scanner);

      // AR grid projected onto the plaza floor.
      const gridMat = new THREE.ShaderMaterial({
        ...additive, uniforms: { uTime: holoUniforms.uTime, uI: holoUniforms.uI, uPulse: { value: 99 } },
        vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime, uI, uPulse; varying vec2 vP;
          void main(){ float r = length(vP); float ang = atan(vP.y, vP.x);
            float rings = smoothstep(.035, 0.0, (.5 - abs(fract(r / .7) - .5)) * .7);
            float spokes = smoothstep(.02, 0.0, abs(fract(ang / 6.2831 * 48.0) - .5) / 48.0 * 6.2831 * r - .0) * step(5.6, r) * .5;
            float wd = (r - mod(uTime * 2.6, 14.0) - 4.4) * 1.4; float wave = exp(-wd * wd);
            float fade = smoothstep(14.0, 6.0, r) * smoothstep(4.4, 5.0, r);
            float pd = (r - 4.4 - uPulse * 9.0) * 1.2; float pulse = exp(-pd * pd) * smoothstep(14.0, 9.0, r) * (1.0 - smoothstep(.6, 1.2, uPulse));
            float a = (rings * .22 + spokes * .2 + wave * .35) * fade * uI + pulse * .7; gl_FragColor = vec4(vec3(.3,.65,1.0) * a, a); }`
      });
      const grid = new THREE.Mesh(new THREE.RingGeometry(4.4, 14, 160, 1), gridMat); grid.rotation.x = -Math.PI / 2; grid.position.y = .02; scene.add(grid);

      // ---------- Particles: rising data (Technology) and warm motes (Light) ----------
      const makeParticles = (count: number, seed: number, radius: [number, number], top: number, speed: number, palette: string[]) => {
        const r = rng(seed); const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), rnd = new Float32Array(count);
        const c = new THREE.Color();
        for (let i = 0; i < count; i++) { const a = r() * Math.PI * 2, rr = radius[0] + r() * (radius[1] - radius[0]);
          pos.set([Math.cos(a) * rr, r() * top, Math.sin(a) * rr], i * 3); c.set(palette[i % palette.length]); col.set([c.r, c.g, c.b], i * 3); rnd[i] = r(); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
        const m = new THREE.ShaderMaterial({
          ...additive, uniforms: { uTime: { value: 0 }, uI: { value: 0 }, uSize: { value: 5 * renderer.getPixelRatio() } },
          vertexShader: `attribute vec3 color; attribute float rnd; uniform float uTime, uSize; varying vec3 vC; varying float vA;
            void main(){ vec3 p = position; float t = uTime * ${speed.toFixed(3)} * (.5 + rnd);
              p.y = mod(p.y + t, ${top.toFixed(1)}); p.x += sin(t * .7 + rnd * 20.0) * .35; p.z += cos(t * .6 + rnd * 13.0) * .35;
              vA = smoothstep(0.0, 1.0, p.y) * smoothstep(${top.toFixed(1)}, ${(top * .6).toFixed(1)}, p.y); vC = color;
              vec4 mv = modelViewMatrix * vec4(p,1.0); gl_PointSize = uSize * (.4 + rnd) * (10.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
          fragmentShader: `uniform float uI; varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .0, d) * vA * uI; gl_FragColor = vec4(vC * a, a); }`
        });
        const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts); return m;
      };
      const dataMat = makeParticles(low ? 380 : 800, 31, [1.2, 6.5], 10, .55, ['#5fb0ff', '#7ce0ff', BRAND[0], BRAND[2]]);
      // Data streams: light trails fly in from the city and converge on the sculpture.
      const streamMat = (() => {
        const n = low ? 160 : 320, trail = 5, r = rng(57);
        const start = new Float32Array(n * trail * 3), seed = new Float32Array(n * trail), lag = new Float32Array(n * trail), col = new Float32Array(n * trail * 3);
        const c = new THREE.Color(); const pal = ['#5cc8ff', '#7ce0ff', '#45a84b', '#4f9dff', '#ff7a2e'];
        for (let i = 0; i < n; i++) {
          const a = Math.PI * (.08 + r() * .84), R = 28 + r() * 40, y = 1 + r() * 16, sd = r(); c.set(pal[i % pal.length]);
          for (let k = 0; k < trail; k++) { const j = i * trail + k; start.set([Math.cos(a) * R, y, -Math.sin(a) * R], j * 3); seed[j] = sd; lag[j] = k; col.set([c.r, c.g, c.b], j * 3); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(start, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
        g.setAttribute('aLag', new THREE.BufferAttribute(lag, 1)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const m = new THREE.ShaderMaterial({
          ...additive, uniforms: { uTime: { value: 0 }, uI: { value: 0 }, uSize: { value: 6.5 * renderer.getPixelRatio() }, uCY: { value: PEDESTAL_TOP + height / 2 } },
          vertexShader: `attribute vec3 color; attribute float aSeed, aLag; uniform float uTime, uSize, uCY; varying float vA; varying vec3 vC;
            void main(){ float life = fract(uTime * (.09 + aSeed * .08) + aSeed * 13.7) - aLag * .012;
              float ok = step(0.0, life); life = max(life, 0.0); float t = life * life;
              vec3 end = vec3(0.0, uCY + (aSeed - .5) * 2.5, 0.0);
              vec3 p = mix(position, end, t); p.y += sin(life * 3.1416) * (1.5 + aSeed * 3.0);
              vA = ok * smoothstep(0.0, .15, life) * smoothstep(1.0, .9, life) * (1.0 - aLag / 5.0); vC = color;
              vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = uSize * (1.0 - aLag * .15) * (12.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
          fragmentShader: `uniform float uI; varying float vA; varying vec3 vC; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0.0, d) * vA * uI; gl_FragColor = vec4(vC * a, a); }`
        });
        const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts); return m;
      })();
      const dustMat = makeParticles(low ? 220 : 450, 41, [2, 16], 9, .12, ['#ffcf9a', '#ffb070', '#fff0d8']);

      // ---------- Lights ----------
      const hemi = new THREE.HemisphereLight(look.hemiSky, look.hemiGround, look.hemi); scene.add(hemi);
      const sun = new THREE.DirectionalLight(look.sunColor, look.sun); sun.position.set(-26, 14, -22);
      sun.castShadow = !low; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
      Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 80 }); scene.add(sun);
      const fill = new THREE.DirectionalLight(0xffe6d0, look.fill); fill.position.set(-6, 7, 16); scene.add(fill);
      const ups = [-1.9, 1.9].map(x => {
        const s = new THREE.SpotLight(look.upColor, 0, 14, .62, .75, 1.6); s.position.set(x, PEDESTAL_TOP + .05, 3.4);
        s.target.position.set(x * .5, 4.4, 0); scene.add(s, s.target); return s;
      });
      const rim = new THREE.SpotLight(look.rimColor, 0, 30, .5, .8, 1.4); rim.position.set(2, 12, -9); rim.target.position.set(0, 3, 0); scene.add(rim, rim.target);
      const plazaGlow = new THREE.PointLight(look.stripColor, 0, 22, 1.8); plazaGlow.position.set(-14, 3.2, 1); scene.add(plazaGlow);
      const sweep = new THREE.SpotLight(0xffd2a8, 0, 26, .2, .6, 1.2); sweep.position.set(0, 1.2, 10); sweep.target.position.set(0, 3.5, 0); scene.add(sweep, sweep.target);
      const holoLight = new THREE.PointLight(0x4f9dff, 0, 16, 1.6); holoLight.position.set(0, 3.6, 3.5); scene.add(holoLight);

      // ---------- Post-processing ----------
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      // Keep HDR values finite and bounded so a single specular spike can never flood the bloom.
      composer.addPass(new ShaderPass({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
          void main(){ vec4 c = texture2D(tDiffuse, vUv); bvec3 bad = bvec3(isnan(c.r) || isinf(c.r), isnan(c.g) || isinf(c.g), isnan(c.b) || isinf(c.b));
            if (any(bad)) c.rgb = vec3(0.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 24.0), c.a); }`
      }));
      const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), look.bloom, .3, .95); composer.addPass(bloom);
      composer.addPass(new OutputPass());

      // ---------- Interaction ----------
      // Drag turns the sculpture with momentum; on release it glides, then a soft spring settles it home.
      let dragYaw = 0, dragVel = 0, dragging = false, lastX = 0, lastT = 0;
      let pointerX = 0, pointerY = 0, parX = 0, parY = 0;
      const canvas = renderer.domElement;
      const down = (e: PointerEvent) => { if (e.button !== 0) return; dragging = true; dragVel = 0; lastX = e.clientX; lastT = e.timeStamp; canvas.setPointerCapture(e.pointerId); container.classList.add('is-dragging'); };
      const moveDrag = (e: PointerEvent) => {
        if (!dragging) return;
        const delta = (e.clientX - lastX) * .006, dtp = Math.max(e.timeStamp - lastT, 8) / 1000;
        // Rubber-band resistance near the limits so the mark never turns edge-on.
        const resist = Math.sign(delta) === Math.sign(dragYaw) ? 1 - Math.min(Math.abs(dragYaw) / .8, 1) * .85 : 1;
        dragYaw += delta * resist; dragVel = THREE.MathUtils.lerp(dragVel, delta * resist / dtp, .5);
        lastX = e.clientX; lastT = e.timeStamp; live.current.dirty = 90;
      };
      const up = () => { if (!dragging) return; dragging = false; container.classList.remove('is-dragging'); dragVel = THREE.MathUtils.clamp(dragVel, -2.5, 2.5); live.current.dirty = 240; };
      const hover = (e: PointerEvent) => { if (e.pointerType !== 'mouse') return; pointerX = e.clientX / innerWidth - .5; pointerY = e.clientY / innerHeight - .5; live.current.dirty = Math.max(live.current.dirty, 90); };
      canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', moveDrag);
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
      window.addEventListener('pointermove', hover, { passive: true });
      cleanups.push(() => {
        canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', moveDrag);
        canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up);
        window.removeEventListener('pointermove', hover);
      });
      const lost = (e: Event) => { e.preventDefault(); disposed = true; cancelAnimationFrame(frame); callbacks.current.onFail(); };
      canvas.addEventListener('webglcontextlost', lost); cleanups.push(() => canvas.removeEventListener('webglcontextlost', lost));

      // ---------- Framing ----------
      const frameView = { dist: 22.5, elev: -.03, target: new THREE.Vector3(0, 3.1, 0), portrait: false };
      const resize = () => {
        const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return;
        renderer.setSize(w, h, false); composer.setSize(w, h);
        const pr = renderer.getPixelRatio();
        reflector.getRenderTarget().setSize(Math.round(w * pr * reflectQuality), Math.round(h * pr * reflectQuality));
        const aspect = w / h; camera.aspect = aspect; frameView.portrait = aspect < 1.05;
        if (aspect >= 1.05) {
          // Landscape: sculpture to the right of the copy.
          camera.fov = 30; frameView.dist = 22.5 + Math.max(0, 1.6 - aspect) * 11;
          camera.setViewOffset(w, h, -w * (aspect > 1.3 ? .2 : .15), h * .015, w, h);
        } else {
          // Portrait: sculpture in the upper part, copy below.
          camera.fov = 40; frameView.dist = 21 + (1 - aspect) * 13;
          camera.setViewOffset(w, h, 0, h * .2, w, h);
        }
        camera.updateProjectionMatrix(); live.current.dirty = 60;
      };
      const observer = new ResizeObserver(resize); observer.observe(container); cleanups.push(() => observer.disconnect());
      resize();
      const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }); io.observe(container); cleanups.push(() => io.disconnect());

      // ---------- Loop ----------
      const target = LOOKS.map(toLook);
      let time = 0, speed = live.current.playing ? 1 : 0, last = performance.now(), intro = reduced ? 1 : 0, introStart = -1, readySent = false, reveal = 0, build = 0, clipY = 999, scanY = 0;
      const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
      const easeInOut = (x: number) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      const damp = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt));
      // Phase changes are eased tweens from wherever the look currently is, so interrupted changes stay smooth.
      const from = toLook(LOOKS[live.current.phase]);
      let tweenPhase = live.current.phase, tween = 1, tweenStart = 0;
      const TWEEN_SECONDS = 2.6;
      // Each act plays a short sequence on its own clock, which runs even while the scene is paused.
      // Wall clock, so the sequence keeps its timing on slow devices.
      let actPhase = live.current.phase, actStart = performance.now() + 1600, actTime = reduced ? 99 : -1.6, chasePos = 0;
      const fixtureColor = (f: Fixture, L: Look, out: THREE.Color) => out.copy(L.stripColor).multiplyScalar(f.kind === 'strip' ? .25 + L.strips * .85 : (.2 + L.strips * .8) * .8);
      fixtures.forEach(f => fixtureColor(f, target[actPhase], f.to));
      const tmp = new THREE.Color();

      function update(dt: number) {
        const state = live.current; const goal = target[state.phase];
        if (state.phase !== tweenPhase) {
          for (const key of Object.keys(look) as (keyof Look)[]) { const c = look[key]; if (c instanceof THREE.Color) (from[key] as THREE.Color).copy(c); else (from as Record<string, unknown>)[key] = c; }
          tweenPhase = state.phase; tween = reduced ? 1 : 0; tweenStart = performance.now();
        }
        if (state.phase !== actPhase) {
          fixtures.forEach(f => { f.from.lerp(f.to, f.mix); fixtureColor(f, goal, f.to); });
          actPhase = state.phase; actStart = performance.now();
        }
        actTime = reduced ? 99 : (performance.now() - actStart) / 1000;
        fixtures.forEach(f => {
          f.mix = reduced ? 1 : smoother(THREE.MathUtils.clamp((actTime - f.delay) / f.dur, 0, 1));
          const u = f.mat.uniforms; u.uFrom.value.copy(f.from); u.uTo.value.copy(f.to); u.uMix.value = f.mix;
        });
        // Wall clock, so act changes take the same time on slow devices.
        if (tween < 1) tween = Math.min(1, (performance.now() - tweenStart) / 1000 / TWEEN_SECONDS);
        const k = easeInOut(tween);
        for (const key of Object.keys(goal) as (keyof Look)[]) {
          const g = goal[key], f = from[key];
          if (g instanceof THREE.Color) (look[key] as THREE.Color).copy(f as THREE.Color).lerp(g, k); else (look as Record<string, unknown>)[key] = (f as number) + ((g as number) - (f as number)) * k;
        }
        // Play and pause ease the world's clock instead of freezing it mid-motion.
        speed = reduced ? (state.playing ? 1 : 0) : damp(speed, state.playing ? 1 : 0, 2.2, dt);
        time += dt * speed;
        // The arrival runs on the wall clock, so it lasts 6.5s even on slow devices.
        if (introStart < 0) introStart = performance.now();
        if (!reduced) intro = Math.min(1, (performance.now() - introStart) / 6500);
        const e = smoother(intro);
        const light = smoother(Math.min(1, intro * 2.2));

        // Environment
        skyUniforms.uTop.value.copy(look.skyTop); skyUniforms.uMid.value.copy(look.skyMid); skyUniforms.uHorizon.value.copy(look.skyHorizon); skyUniforms.uGlow.value = look.glow;
        (scene.fog as THREE.FogExp2).color.copy(look.fog); (scene.fog as THREE.FogExp2).density = look.fogDensity;
        starMat.opacity = look.stars;
        scene.environmentIntensity = look.env;
        hemi.color.copy(look.hemiSky); hemi.groundColor.copy(look.hemiGround); hemi.intensity = look.hemi;
        sun.color.copy(look.sunColor); sun.intensity = look.sun; fill.intensity = look.fill;
        ups.forEach(s => { s.color.copy(look.upColor); s.intensity = look.up * 40 * e; });
        rim.color.copy(look.rimColor); rim.intensity = look.rim * 90;
        plazaGlow.color.copy(look.stripColor); plazaGlow.intensity = look.strips * 12;
        holoLight.intensity = look.holo * 9;
        towerMat.emissiveIntensity = look.windows * 1.1;
        chasePos += dt * speed * look.chaseSpeed; chase.value = chasePos; chaseAmt.value = look.chase;
        sweep.intensity = look.sweep * 115 * e;
        sweep.target.position.set(Math.sin(time * .5) * 3.2, 3.4 + Math.sin(time * .31) * 1.1, 0);
        beams.forEach((b, i) => { b.mesh.rotation.z = b.tilt + Math.sin(time * .32 + i * 1.7) * .1; b.mesh.rotation.x = -.05 + Math.sin(time * .27 + i) * .05; });
        faceMat.emissiveIntensity = look.face * (.25 + .75 * e);
        beamUniforms.uColor.value.copy(look.beamColor); beamUniforms.uI.value = look.beams * e;
        (levitate.material as THREE.ShaderMaterial).uniforms.uColor.value.copy(tmp.copy(look.upColor).lerp(new THREE.Color('#7cc4ff'), look.holo));
        (levitate.material as THREE.ShaderMaterial).uniforms.uI.value = (.15 + look.beams * .4 + look.holo * .4) * e;
        (levitate.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
        bloom.strength = look.bloom; renderer.toneMappingExposure = look.exposure * (reduced ? 1 : .05 + .95 * light);

        // Holographic layer
        const holoOn = look.holo > .01;
        holo.visible = grid.visible = holoOn; holoShells.forEach(m => { m.visible = holoOn; }); holoExtras.forEach(m => { m.visible = holoOn; });
        // Technology sequence: floor scan (0s), assembly (0.3s), outline trace (1.4s), hologram (2.4s).
        const inTech = state.phase === 2, ramp = (t0: number, len: number) => smoother(THREE.MathUtils.clamp((actTime - t0) / len, 0, 1));
        reveal = inTech ? Math.max(reveal, ramp(2.4, 2.6)) : Math.max(0, reveal - dt / 1.4);
        build = inTech ? Math.max(build, ramp(.3, 3.4)) : Math.max(0, build - dt / 1.5);
        cloudUniforms.uBuild.value = reduced ? (inTech ? 1 : 0) : build;
        // The solid follows the points: it is cut away first, then grows back as each band of points lands.
        const solidBase = sculpture.position.y - height / 2 - .05, solidTop = solidBase + height + .4;
        if (reduced) clipY = 999;
        else if (inTech) {
          const landed = THREE.MathUtils.clamp((build * 1.8 - 1.15) / .55, 0, 1);
          clipY = actTime < .6 ? THREE.MathUtils.lerp(solidTop, solidBase, ramp(0, .6)) : solidBase + landed * (solidTop - solidBase);
          if (landed >= 1) clipY = 999;
        } else clipY = Math.min(999, Math.max(clipY, solidBase) + dt * 6);
        clipPlane.constant = clipY;
        levitate.visible = clipY > sculpture.position.y + stemTop + gap;
        edgeUniforms.uTrace.value = reduced || !inTech || clipY > 900 ? 99 : clipY + .5;
        gridMat.uniforms.uPulse.value = state.phase === 2 ? actTime : 99;
        streamMat.uniforms.uTime.value = time; streamMat.uniforms.uI.value = look.holo * smoother(THREE.MathUtils.clamp((actTime - .6) / 1.6, 0, 1));
        holoUniforms.uTime.value = time; holoUniforms.uI.value = look.holo; glassTime.value = time;
        const base = PEDESTAL_TOP, top = PEDESTAL_TOP + height + .25;
        shellUniforms.uReveal.value = reduced ? top + 1 : base - .3 + smoother(reveal) * (top - base + .6);
        orbits.forEach((o, i) => { (o.mesh.material as THREE.ShaderMaterial).uniforms.uOffset.value = -time * o.speed * 2; o.mesh.rotation.z = orbitTilt[i] + time * .03 * (i % 2 ? -1 : 1); });
        scanY = (Math.sin(time * .55 - 1.57) * .5 + .5) * (height + .3) - height / 2 - .1; scanner.position.y = scanY; scanMat.uniforms.uI.value = look.holo * smoother(reveal);
        shellUniforms.uScan.value = sculpture.position.y + scanY;
        dataMat.uniforms.uTime.value = time; dataMat.uniforms.uI.value = look.holo * .6;
        dustMat.uniforms.uTime.value = time; dustMat.uniforms.uI.value = look.dust * .8;

        // Sculpture motion: a slow turn that always keeps the artwork readable.
        if (!dragging) {
          // Momentum first, then a damped spring back to the idle pose.
          dragVel += -2.2 * dragYaw * dt; dragVel *= Math.exp(-dt * 2.6);
          dragYaw = THREE.MathUtils.clamp(dragYaw + dragVel * dt, -.85, .85);
        }
        // Two slow, unrelated waves read as organic drift rather than a mechanical swing.
        const idle = Math.sin(time * .13) * .2 + Math.sin(time * .071 + 1.3) * .08;
        sculpture.rotation.y = idle + dragYaw - (1 - e) * .5;
        dotGroup.position.y = dotRest + Math.sin(time * .9) * .045 + Math.sin(time * 2.1) * .008;

        // Camera: cinematic arrival, then a breathing drift with softened mouse parallax.
        parX = damp(parX, pointerX, 2.5, dt); parY = damp(parY, pointerY, 2.5, dt);
        // Each act has its own shot; the look tween carries the camera between them.
        // Portrait screens have little headroom, so the act shots move less there.
        const shot = frameView.portrait ? .25 : 1;
        const dist = frameView.dist * (1 + (look.camDist - 1) * shot) * (1 + (1 - e) * .5) + Math.sin(time * .11) * .25;
        const elev = frameView.elev + look.camElev * shot + (1 - e) * .12 + parY * .025 + Math.sin(time * .083) * .006;
        const az = look.camAz + Math.sin(time * .045) * .09 + parX * .05 - (1 - e) * .32;
        camera.position.set(Math.sin(az) * Math.cos(elev) * dist, frameView.target.y + Math.sin(elev) * dist, Math.cos(az) * Math.cos(elev) * dist);
        camera.lookAt(frameView.target);
      }

      function tick(now: number) {
        if (disposed) return;
        frame = requestAnimationFrame(tick);
        const dt = Math.min((now - last) / 1000, .1); last = now;
        if (!visible || document.hidden) return;
        const state = live.current;
        const settling = speed > .001 || tween < 1 || actTime < 5 || Math.abs(dragYaw) > .0005 || Math.abs(dragVel) > .0005 || Math.abs(parX - pointerX) + Math.abs(parY - pointerY) > .001;
        const animating = state.playing || intro < 1 || dragging || settling;
        if (!animating && state.dirty <= 0) return;
        state.dirty--;
        update(dt);
        composer.render(dt);
        if (!readySent) { readySent = true; callbacks.current.onReady(); }
      }
      cleanups.push(() => {
        composer.dispose(); reflector.dispose();
        scene.traverse(o => {
          const m = o as THREE.Mesh; m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
          mats.forEach(mat => mat.dispose());
        });
        faceTexture.dispose(); paver.dispose(); windowTex.dispose(); scene.environment?.dispose();
      });
      frame = requestAnimationFrame(tick);
    }

    init().catch(() => { if (!disposed) callbacks.current.onFail(); });
    return () => { disposed = true; abort.abort(); cancelAnimationFrame(frame); cleanups.reverse().forEach(f => f()); };
  }, []);

  return <div ref={host} className="plaza" />;
}
