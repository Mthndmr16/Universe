// Evren — Güneş Sistemi görüntüleyici. Konumlar float64 hesaplanır, her karede kameraya göre float32'ye indirilir.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { loadWorld } from './world.js';
import { position as keplerPosition, AU_KM, OBLIQUITY_J2000_DEG } from './kepler.js';
import * as SH from './view/shaders.js';

const $ = s => document.querySelector(s);
const D2R = Math.PI / 180;
const DAY_MS = 86400000;
// UTC → TDB: TT − UTC = 32,184 sn + 37 artık saniye (2017'den beri); TDB − TT < 2 ms.
const TDB_MINUS_UTC_DAYS = 69.184 / 86400;
const jdFromDate = d => d.getTime() / DAY_MS + 2440587.5 + TDB_MINUS_UTC_DAYS;
const dateFromJd = jd => new Date((jd - TDB_MINUS_UTC_DAYS - 2440587.5) * DAY_MS);

// Görselleştirme tercihleri (veri değil): pozlama hedefi, gece ışıkları, yıldız ve kuşak görünürlüğü.
const VIS = { exposureK: 1.7, nightGain: 0.45, skyGain: 0.9, beltGain: 0.6, bloom: 0.55, sunCap: 40,
  oceanRoughness: 0.14, cloudAlbedo: 0.8 };

// ---------- yükleme ----------
const progress = $('#loadMsg');
const world = await loadWorld(f => { progress.textContent = `Veri yükleniyor: ${f}`; });
const B = world.byId;

// ---------- oluşturucu ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('#view').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1e-3, 1e14);
camera.up.set(0, 0, 1);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), VIS.bloom, 0.6, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

// ---------- dokular ----------
const texLoader = new THREE.TextureLoader();
const loadTex = (id, srgb = true) => new Promise(res => {
  const t = world.D.textures.textures[id];
  texLoader.load(t.file, tex => { tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); res(tex); }, undefined, () => res(null));
});

// Boylam/enlem küresi: köşe = cisme bağlı birim vektör, uv = haritadaki yeri (lon0: haritanın sol kenarı).
function lonLatSphere(segLon, segLat, lon0 = -180){
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= segLat; j++){
    const lat = (-90 + 180 * j / segLat) * D2R;
    for (let i = 0; i <= segLon; i++){
      const lon = (lon0 + 360 * i / segLon) * D2R;
      pos.push(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
      uv.push(i / segLon, j / segLat);
    }
  }
  const w = segLon + 1;
  for (let j = 0; j < segLat; j++) for (let i = 0; i < segLon; i++){
    const a = j * w + i, b = a + 1, c = a + w + 1, d = a + w;
    idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const srgbToLinear = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const occUniform = () => Array.from({ length: 6 }, () => new THREE.Vector4());

// ---------- cisimler ----------
const sunRadiance = (AU_KM / B.sun.radius) ** 2;   // birim: 1 au'daki beyaz Lambert yüzeyi = 1
const views = {};
for (const b of world.bodies){
  const v = views[b.id] = { b };
  if (b.id === 'sun'){
    const m = new THREE.Mesh(lonLatSphere(96, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(sunRadiance) }));
    m.matrixAutoUpdate = false; m.frustumCulled = false; scene.add(m); v.mesh = m;
    continue;
  }
  const big = b.kind === 'planet' || b.radius > 1000;
  const geo = lonLatSphere(big ? 192 : 96, big ? 96 : 48, b.texture?.lon_left_edge_deg ?? -180);
  const colorLin = b.colorRatio ? b.colorRatio.map(x => x * (b.albedo ?? 0.5))
    : [1, 1, 1].map(() => b.albedo ?? 0.3);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SH.PLANET_VERT, fragmentShader: SH.PLANET_FRAG,
    uniforms: {
      uMap: { value: null }, uHasMap: { value: 0 }, uColor: { value: new THREE.Vector3(...colorLin) },
      uNight: { value: null }, uHasNight: { value: 0 }, uNightGain: { value: VIS.nightGain },
      uWater: { value: null }, uHasWater: { value: 0 }, uRough: { value: VIS.oceanRoughness },
      uClouds: { value: null }, uHasClouds: { value: 0 },
      uNormalMap: { value: null }, uHasNormal: { value: 0 }, uLon0: { value: b.texture?.lon_left_edge_deg ?? -180 }, uRotF: { value: new THREE.Matrix3() },
      uSunPos: { value: new THREE.Vector3() }, uSunR: { value: B.sun.radius }, uIrr: { value: 1 }, uRegolith: { value: b.regolith ? 1 : 0 },
      uOcc: { value: occUniform() }, uOccN: { value: 0 },
      uHasRing: { value: 0 }, uRingC: { value: new THREE.Vector3() }, uRingN: { value: new THREE.Vector3() },
      uRingIn: { value: 0 }, uRingOut: { value: 1 }, uRingTex: { value: null },
      uRot: { value: new THREE.Matrix3() }, uRadii: { value: new THREE.Vector3(...b.radii) },
    },
  });
  const m = new THREE.Mesh(geo, mat);
  m.matrixAutoUpdate = false; m.frustumCulled = false; scene.add(m); v.mesh = m;
  if (b.texture) loadTex(b.tex).then(t => { if (t){ mat.uniforms.uMap.value = t; mat.uniforms.uHasMap.value = 1; } });
  if (b.night) loadTex(b.night).then(t => { if (t){ mat.uniforms.uNight.value = t; mat.uniforms.uHasNight.value = 1; } });
  if (b.water) loadTex(b.water, false).then(t => { if (t){ mat.uniforms.uWater.value = t; mat.uniforms.uHasWater.value = 1; } });
  if (b.normal) loadTex(b.normal, false).then(t => { if (t){ mat.uniforms.uNormalMap.value = t; mat.uniforms.uHasNormal.value = 1; } });
}

// Dünya bulut kabuğu: yüzeyin 8 km üstünde (görsel tercih), Dünya ile aynı yönelimde.
const CLOUD_ALT = 8;
const cloudMat = new THREE.ShaderMaterial({
  vertexShader: SH.PLANET_VERT, fragmentShader: SH.CLOUD_FRAG, transparent: true, depthWrite: false,
  uniforms: { uClouds: { value: null }, uSunPos: { value: new THREE.Vector3() }, uIrr: { value: 1 }, uAlb: { value: VIS.cloudAlbedo },
    uRot: { value: new THREE.Matrix3() }, uRadii: { value: new THREE.Vector3(...B.earth.radii.map(r => r + CLOUD_ALT)) } },
});
const cloudMesh = new THREE.Mesh(lonLatSphere(256, 128, -180), cloudMat);
cloudMesh.matrixAutoUpdate = false; cloudMesh.frustumCulled = false; cloudMesh.renderOrder = 1; cloudMesh.visible = false;
scene.add(cloudMesh);
loadTex(B.earth.clouds, false).then(t => { if (!t) return; cloudMat.uniforms.uClouds.value = t; cloudMesh.visible = true;
  const u = views.earth.mesh.material.uniforms; u.uClouds.value = t; u.uHasClouds.value = 1; });

// Satürn halkaları. Optik derinlik: Cassini RSS radyal profili (data/saturn_ring_profile.json, 8192 adım).
// Albedo: NSSDCA bölge aralıklarının orta değeri (temsilî). Renk oranı: Cassini doğal renk görüntüsü PIA06485.
const ringRows = Object.fromEntries(world.D.saturn_rings.rows.map(r => [r.name, r]));
const prof = world.D.saturn_ring_profile;
const mid = x => x ? (x.min + x.max) / 2 : 0;
const RING = { in: prof.radius_min_km, out: prof.radius_max_km };
const R_ = n => ringRows[n].radius_km;
const ringAlbedo = r =>
  r < R_('C outer edge') ? mid(ringRows['C inner edge'].albedo) :
  r < R_('B outer edge') ? mid(ringRows['B inner edge'].albedo) :
  r < R_('A inner edge') ? mid(ringRows['Cassini division'].albedo) :
  r < R_('A outer edge') ? mid(ringRows['A inner edge'].albedo) : mid(ringRows['F ring'].albedo);
const ringColor = world.D.body_colors.colors.SaturnRings.linear_rgb_ratio;
const RN = prof.bins, ringData = new Float32Array(RN * 4);
for (let i = 0; i < RN; i++){
  const r = RING.in + (RING.out - RING.in) * (i + 0.5) / RN, a = ringAlbedo(r);
  ringData.set([prof.tau[i], a * ringColor[0], a * ringColor[1], a * ringColor[2]], i * 4);
}
const ringTex = new THREE.DataTexture(ringData, RN, 1, THREE.RGBAFormat, THREE.FloatType);
// Kaba çözünürlük düzeyleri (mipmap) elle üretilir: τ için geçirgenlik ortalaması, τ = −ln(ort. e^−τ).
// Uzaktan bakıldığında ince yapı karıncalanmadan, doğru ortalama saydamlıkla görünür.
{
  const mips = [{ data: ringData, width: RN, height: 1 }];
  let prev = ringData, w = RN;
  while (w > 1){
    const nw = w >> 1, d = new Float32Array(nw * 4);
    for (let i = 0; i < nw; i++){
      const a = i * 8, b = a + 4;
      d[i * 4] = -Math.log((Math.exp(-prev[a]) + Math.exp(-prev[b])) / 2);
      for (let k = 1; k < 4; k++) d[i * 4 + k] = (prev[a + k] + prev[b + k]) / 2;
    }
    mips.push({ data: d, width: nw, height: 1 }); prev = d; w = nw;
  }
  ringTex.mipmaps = mips;
}
ringTex.magFilter = THREE.LinearFilter; ringTex.minFilter = THREE.LinearMipmapLinearFilter;
ringTex.generateMipmaps = false; ringTex.needsUpdate = true;
const ringMat = new THREE.ShaderMaterial({
  vertexShader: SH.RING_VERT, fragmentShader: SH.RING_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uRingTex: { value: ringTex }, uRingIn: { value: RING.in }, uRingOut: { value: RING.out }, uN: { value: new THREE.Vector3() },
    uSunPos: { value: new THREE.Vector3() }, uIrr: { value: 1 }, uPC: { value: new THREE.Vector3() }, uPRot: { value: new THREE.Matrix3() },
    uPRadii: { value: new THREE.Vector3(...B.saturn.radii) } },
});
const ringMesh = new THREE.Mesh(new THREE.RingGeometry(RING.in, RING.out, 512, 1), ringMat);
ringMesh.matrixAutoUpdate = false; ringMesh.frustumCulled = false; scene.add(ringMesh);
const satMat = views.saturn.mesh.material.uniforms;
satMat.uHasRing.value = 1; satMat.uRingTex.value = ringTex; satMat.uRingIn.value = RING.in; satMat.uRingOut.value = RING.out;

// Dünya atmosferi: tepe = ekvator yarıçapı + 100 km; ölçek yüksekliği 8,5 km (NASA Dünya bilgi kartı).
const EARTH_H = 8.5, ATMO_TOP = 100;
const atmoMat = new THREE.ShaderMaterial({
  vertexShader: SH.ATMO_VERT, fragmentShader: SH.ATMO_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uC: { value: new THREE.Vector3() }, uRp: { value: B.earth.radii[0] }, uRt: { value: B.earth.radii[0] + ATMO_TOP },
    uH: { value: EARTH_H }, uSunPos: { value: new THREE.Vector3() }, uIrr: { value: 1 } },
});
const atmoMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), atmoMat);
atmoMesh.frustumCulled = false; scene.add(atmoMesh);

// Gökyüzü
const skyMat = new THREE.ShaderMaterial({ vertexShader: SH.SKY_VERT, fragmentShader: SH.SKY_FRAG, side: THREE.BackSide, depthWrite: false,
  uniforms: { uSky: { value: null }, uGain: { value: 0 }, uEps: { value: OBLIQUITY_J2000_DEG * D2R } } });
const sky = new THREE.Mesh(new THREE.SphereGeometry(1e13, 64, 32), skyMat);
sky.frustumCulled = false; sky.renderOrder = -1; scene.add(sky);
new EXRLoader().load(world.D.textures.textures.starmap.file, t => { t.colorSpace = THREE.LinearSRGBColorSpace; t.minFilter = THREE.LinearFilter; skyMat.uniforms.uSky.value = t; });

// ---------- asteroit kuşağı ----------
const belt = (() => {
  const { fields, rows } = world.mba, c = Object.fromEntries(fields.map((f, i) => [f, i]));
  const REF = 2461200.5;                              // SBDB elemanlarının ortak epoch'u
  const n = rows.length, orb = new Float32Array(n * 4), orb2 = new Float32Array(n * 4), info = new Float32Array(n * 2);
  const large = world.large.bodies, largeIdx = [];
  const set = (i, el, epoch, halfWindow) => {
    orb.set([el.a * AU_KM, el.e, el.i * D2R, el.om * D2R], i * 4);
    orb2.set([el.w * D2R, el.ma * D2R, el.n * D2R, epoch - REF], i * 4);
    info[i * 2] = halfWindow;
  };
  rows.forEach((r, i) => {
    const el = { a: r[c.a], e: r[c.e], i: r[c.i], om: r[c.om], w: r[c.w], ma: r[c.ma], n: r[c.n] };
    set(i, el, r[c.epoch], 365.25);
    info[i * 2 + 1] = Math.min(1, 0.25 + Math.log10(1 + r[c.diameter]) / 3);   // nokta ağırlığı (temsilî)
    if (large[r[c.spkid]]) largeIdx.push([i, large[r[c.spkid]].rows]);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  const aOrb = new THREE.BufferAttribute(orb, 4), aOrb2 = new THREE.BufferAttribute(orb2, 4);
  g.setAttribute('aOrb', aOrb); g.setAttribute('aOrb2', aOrb2); g.setAttribute('aInfo', new THREE.BufferAttribute(info, 2));
  const mat = new THREE.ShaderMaterial({ vertexShader: SH.BELT_VERT, fragmentShader: SH.BELT_FRAG, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uSun: { value: new THREE.Vector3() }, uScale: { value: 2 * renderer.getPixelRatio() }, uGain: { value: 1 } } });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  let lastYear = null;
  return {
    mat, pts,
    // Büyük asteroitler: en yakın yıllık Horizons elemanı; 2025–2035 dışında gizli.
    update(jd){
      const yi = Math.round((jd - 2460676.5) / 365.25);
      if (yi === lastYear) return; lastYear = yi;
      for (const [i, yr] of largeIdx){
        const row = yr.reduce((best, x) => Math.abs(x[0] - jd) < Math.abs(best[0] - jd) ? x : best);
        const inside = jd >= yr[0][0] && jd <= yr[yr.length - 1][0];
        set(i, { a: row[1], e: row[2], i: row[3], om: row[4], w: row[5], ma: row[6], n: row[7] }, row[0], inside ? 200 : -1);
      }
      aOrb.needsUpdate = aOrb2.needsUpdate = true; g.attributes.aInfo.needsUpdate = true;
    },
    REF,
  };
})();

// ---------- yörünge çizgileri ----------
const orbitGroup = new THREE.Group(); scene.add(orbitGroup);
const orbits = [];
function makeOrbitLine(points, color){
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false });
  const l = new THREE.LineLoop(g, m); l.frustumCulled = false; orbitGroup.add(l); return l;
}
function buildPlanetOrbits(jd){
  for (const o of orbits) orbitGroup.remove(o.line);
  orbits.length = 0;
  for (const b of world.bodies){
    if (!b.kepler) continue;
    const P = (b.physRow?.['Sidereal Orbital Period']?.value ?? 1) * 365.25;
    const pts = [];
    for (let k = 0; k < 360; k++){ const p = keplerPosition(world.D.planets_kepler_elements, b.kepler, jd + P * k / 360); pts.push(p[0] * AU_KM, p[1] * AU_KM, p[2] * AU_KM); }
    orbits.push({ line: makeOrbitLine(pts, 0x7fa8ff), center: 'sun', body: b.id });
  }
}
const moonOrbits = {};
function buildMoonOrbit(b, jd, S){
  if (!b.period || !S[b.id]?.pos || !S[b.parent]?.pos) return;
  const pts = [];
  for (let k = 0; k < 180; k++){
    const t = jd + b.period * (k / 180 - 0.5);
    const s = world.state(t);
    if (!s[b.id].pos) return;
    pts.push(...s[b.id].pos.map((x, i) => x - s[b.parent].pos[i]));
  }
  if (moonOrbits[b.id]) orbitGroup.remove(moonOrbits[b.id].line);
  moonOrbits[b.id] = { line: makeOrbitLine(pts, 0x9fc4ff), center: b.parent, body: b.id, built: jd };
}

// ---------- etiketler ----------
const labelLayer = $('#labels');
for (const b of world.bodies){
  const el = document.createElement('button');
  el.className = 'lbl ' + b.kind; el.innerHTML = `<i></i><span>${b.name}</span>`;
  el.addEventListener('click', () => focusOn(b.id));
  labelLayer.appendChild(el); views[b.id].label = el;
}

// ---------- kamera ve zaman ----------
const ui = { orbits: true, labels: true, belt: true, stars: true };
let jd = jdFromDate(new Date()), rate = 0, paused = false;     // rate: saniyede gün
const cam = { focus: 'earth', dist: B.earth.radius * 3.2, az: -0.9, el: 0.35, from: null };
const fly = { t: 1, dur: 2.4, fromPos: null, fromDist: 0 };
let lastState = world.state(jd), lastCamPos = [0, 0, 0];
buildPlanetOrbits(jd);

function defaultDist(b){ return b.id === 'sun' ? b.radius * 6 : b.rings ? b.radius * 5.5 : b.radius * 3.2; }
async function focusOn(id){
  const b = B[id];
  fly.fromPos = [...lastCamPos].map((x, i) => x); fly.fromFocus = lastState[cam.focus]?.pos ?? [0, 0, 0];
  fly.fromDist = cam.dist; fly.t = 0;
  cam.focus = id; cam.dist = defaultDist(b);
  const sys = b.parent ?? (world.bodies.some(x => x.parent === id) ? id : null);
  if (sys){ await world.loadMoonsOf(sys); for (const m of world.bodies.filter(x => x.parent === sys)) buildMoonOrbit(m, jd, world.state(jd)); }
  renderInfo(); renderList();
}

let drag = null;
renderer.domElement.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', e => {
  if (!drag) return;
  cam.az -= (e.clientX - drag.x) * 0.005; cam.el = Math.max(-1.5, Math.min(1.5, cam.el + (e.clientY - drag.y) * 0.005));
  drag = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('wheel', e => {
  e.preventDefault();
  const b = B[cam.focus];
  cam.dist = Math.max(b.radius * 1.15, Math.min(2e10, cam.dist * Math.exp(e.deltaY * 0.0012)));
}, { passive: false });

// ---------- kare döngüsü ----------
const v3 = new THREE.Vector3(), m4 = new THREE.Matrix4(), m3 = new THREE.Matrix3();
let exposure = 1, lastT = performance.now(), lastOrbitRebuild = jd;
const occluderIds = {};
for (const b of world.bodies){
  if (b.kind === 'star') continue;
  const sys = b.parent ?? b.id;
  occluderIds[b.id] = [sys, ...world.bodies.filter(x => x.parent === sys).map(x => x.id)]
    .filter(id => id !== b.id).sort((a, c) => B[c].radius - B[a].radius).slice(0, 6);
}
const smooth = t => t * t * (3 - 2 * t);

function frame(now){
  const dtReal = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (!paused) jd += rate * dtReal;
  const S = world.state(jd); lastState = S;

  // kamera konumu (float64)
  const fp = S[cam.focus].pos ?? [0, 0, 0];
  let focusPos = fp, dist = cam.dist;
  if (fly.t < 1){
    fly.t = Math.min(1, fly.t + dtReal / fly.dur); const k = smooth(fly.t);
    focusPos = fp.map((x, i) => fly.fromFocus[i] + (x - fly.fromFocus[i]) * k);
    dist = Math.exp(Math.log(fly.fromDist) + (Math.log(cam.dist) - Math.log(fly.fromDist)) * k);
  }
  const ce = Math.cos(cam.el);
  const C = [focusPos[0] + dist * ce * Math.cos(cam.az), focusPos[1] + dist * ce * Math.sin(cam.az), focusPos[2] + dist * Math.sin(cam.el)];
  lastCamPos = C;
  camera.position.set(0, 0, 0);
  camera.lookAt(focusPos[0] - C[0], focusPos[1] - C[1], focusPos[2] - C[2]);
  camera.updateMatrixWorld();
  const rel = p => [p[0] - C[0], p[1] - C[1], p[2] - C[2]];
  const sunRel = rel([0, 0, 0]);

  // otomatik pozlama: odaktaki cismin aldığı Güneş ışığına göre
  const fd = cam.focus === 'sun' ? Math.hypot(...C) : Math.hypot(...fp);
  const irrFocus = (AU_KM / Math.max(fd, 1e5)) ** 2;
  const target = VIS.exposureK / irrFocus;
  exposure = Math.exp(Math.log(exposure) + (Math.log(target) - Math.log(exposure)) * Math.min(1, dtReal * 3));
  renderer.toneMappingExposure = exposure;
  bloom.threshold = 3 / exposure;
  // Güneş diskinin ekrandaki parlaklığı sınırlandırılır (görsel tercih); gezegenleri aydınlatan değer değişmez.
  views.sun.mesh.material.color.setScalar(Math.min(sunRadiance, VIS.sunCap / exposure));

  for (const b of world.bodies){
    const v = views[b.id], s = S[b.id];
    if (!s.pos){ v.mesh.visible = false; v.label.style.display = 'none'; continue; }
    v.mesh.visible = true;
    const r = rel(s.pos), ax = s.axes;
    if (ax) m4.set(ax.x[0] * b.radii[0], ax.y[0] * b.radii[1], ax.z[0] * b.radii[2], r[0],
                   ax.x[1] * b.radii[0], ax.y[1] * b.radii[1], ax.z[1] * b.radii[2], r[1],
                   ax.x[2] * b.radii[0], ax.y[2] * b.radii[1], ax.z[2] * b.radii[2], r[2], 0, 0, 0, 1);
    else m4.set(b.radii[0], 0, 0, r[0], 0, b.radii[1], 0, r[1], 0, 0, b.radii[2], r[2], 0, 0, 0, 1);
    v.mesh.matrix.copy(m4); v.mesh.matrixWorldNeedsUpdate = true;
    if (b.id !== 'sun'){
      const u = v.mesh.material.uniforms;
      const d = Math.hypot(...s.pos);
      u.uSunPos.value.set(...sunRel); u.uIrr.value = (AU_KM / d) ** 2;
      if (ax){ u.uRot.value.set(ax.x[0], ax.y[0], ax.z[0], ax.x[1], ax.y[1], ax.z[1], ax.x[2], ax.y[2], ax.z[2]); u.uRotF.value.copy(u.uRot.value); }
      let n = 0;
      for (const id of occluderIds[b.id] ?? []){ const o = S[id]?.pos; if (!o) continue; u.uOcc.value[n++].set(...rel(o), B[id].radius); }
      u.uOccN.value = n;
      if (b.id === 'saturn'){
        u.uRingC.value.set(...r); u.uRingN.value.set(...ax.z);
        m4.set(ax.x[0], ax.y[0], ax.z[0], r[0], ax.x[1], ax.y[1], ax.z[1], r[1], ax.x[2], ax.y[2], ax.z[2], r[2], 0, 0, 0, 1);
        ringMesh.matrix.copy(m4); ringMesh.matrixWorldNeedsUpdate = true;
        ringMat.uniforms.uN.value.set(...ax.z); ringMat.uniforms.uSunPos.value.set(...sunRel); ringMat.uniforms.uIrr.value = u.uIrr.value;
        ringMat.uniforms.uPC.value.set(...r); ringMat.uniforms.uPRot.value.copy(u.uRot.value);
      }
      if (b.id === 'earth'){
        const k = (B.earth.radii[0] + CLOUD_ALT) / B.earth.radii[0];
        cloudMesh.matrix.copy(v.mesh.matrix); cloudMesh.matrix.scale(new THREE.Vector3(k, k, k));
        cloudMesh.matrix.setPosition(...r); cloudMesh.matrixWorldNeedsUpdate = true;
        cloudMat.uniforms.uRot.value.copy(u.uRot.value); cloudMat.uniforms.uSunPos.value.set(...sunRel); cloudMat.uniforms.uIrr.value = u.uIrr.value;
        atmoMat.uniforms.uC.value.set(...r); atmoMat.uniforms.uSunPos.value.set(...sunRel); atmoMat.uniforms.uIrr.value = u.uIrr.value;
        atmoMesh.position.set(...r); atmoMesh.scale.setScalar(B.earth.radii[0] + ATMO_TOP);
        const inside = Math.hypot(...r) < B.earth.radii[0] + ATMO_TOP;
        atmoMat.side = inside ? THREE.BackSide : THREE.FrontSide;
      }
    }
    // etiket
    const el = v.label;
    v3.set(...r).project(camera);
    const px = (v3.x * 0.5 + 0.5) * innerWidth, py = (-v3.y * 0.5 + 0.5) * innerHeight;
    const distCam = Math.hypot(...r);
    const pxRadius = b.radius / distCam / Math.tan(camera.fov * D2R / 2) * innerHeight / 2;
    let show = ui.labels && v3.z < 1 && px > -50 && px < innerWidth + 50 && py > -50 && py < innerHeight + 50 && pxRadius < 18;
    if (show && b.parent){
      const par = S[b.parent].pos, orbitR = Math.hypot(...s.pos.map((x, i) => x - par[i]));
      show = orbitR / distCam / Math.tan(camera.fov * D2R / 2) * innerHeight / 2 > 24;
    }
    if (b.kind === 'dwarf' && b.id !== 'pluto' && b.id !== 'ceres') show = show && cam.focus === b.id;
    // odaktaki cismin arkasında kalan cisimlerin etiketi gizlenir
    const fpos = S[cam.focus].pos;
    if (show && b.id !== cam.focus && fpos){
      const f = rel(fpos), df = Math.hypot(...f);
      const cosSep = (f[0] * r[0] + f[1] * r[1] + f[2] * r[2]) / (df * distCam);
      if (distCam > df && cosSep > Math.cos(Math.asin(Math.min(1, B[cam.focus].radius / df)))) show = false;
    }
    el.style.display = show ? '' : 'none';
    if (show) el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    el.classList.toggle('active', b.id === cam.focus);
  }
  atmoMesh.visible = !!S.earth.pos; atmoMesh.renderOrder = 2;
  if (!S.earth.pos) cloudMesh.visible = false;
  else if (cloudMat.uniforms.uClouds.value) cloudMesh.visible = true;

  // yörüngeler
  orbitGroup.visible = ui.orbits;
  if (Math.abs(jd - lastOrbitRebuild) > 365){ buildPlanetOrbits(jd); lastOrbitRebuild = jd; }
  for (const o of [...orbits, ...Object.values(moonOrbits)]){
    const c = S[o.center].pos; if (!c){ o.line.visible = false; continue; }
    o.line.visible = true; o.line.position.set(...rel(c));
    o.line.material.color.setHex(o.center === 'sun' ? 0x7fa8ff : 0x9fc4ff).multiplyScalar(0.5 / exposure);
  }
  for (const o of Object.values(moonOrbits)) if (Math.abs(jd - o.built) > B[o.body].period * 0.5) buildMoonOrbit(B[o.body], jd, S);

  // gökyüzü ve kuşak (görünürlükleri görsel tercih)
  skyMat.uniforms.uGain.value = ui.stars ? VIS.skyGain / exposure : 0;
  belt.update(jd);
  belt.pts.visible = ui.belt;
  belt.mat.uniforms.uT.value = jd - belt.REF; belt.mat.uniforms.uSun.value.set(...sunRel);
  belt.mat.uniforms.uGain.value = VIS.beltGain / exposure;

  composer.render();
  updateHud();
  requestAnimationFrame(frame);
}

// ---------- arayüz ----------
const fmt = (x, d = 0) => x.toLocaleString('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: d });
const RATES = [[-365.25, '−1 yıl/sn'], [-30, '−1 ay/sn'], [-1, '−1 gün/sn'], [-1 / 24, '−1 saat/sn'], [0, 'Durdu'], [1 / 86400, 'Gerçek zaman'], [1 / 24, '1 saat/sn'], [1, '1 gün/sn'], [30, '1 ay/sn'], [365.25, '1 yıl/sn']];
let rateIdx = 5; rate = RATES[rateIdx][0];
const setRate = i => { rateIdx = Math.max(0, Math.min(RATES.length - 1, i)); rate = RATES[rateIdx][0]; $('#rate').textContent = RATES[rateIdx][1]; };
$('#slower').onclick = () => setRate(rateIdx - 1);
$('#faster').onclick = () => setRate(rateIdx + 1);
$('#now').onclick = () => { jd = jdFromDate(new Date()); setRate(5); };
$('#pause').onclick = () => { paused = !paused; $('#pause').textContent = paused ? '▶' : '❚❚'; };
$('#dateInput').addEventListener('change', e => { const d = new Date(e.target.value); if (!isNaN(d)) jd = jdFromDate(d); });
setRate(5);
for (const k of Object.keys(ui)){
  const el = document.querySelector(`[data-toggle="${k}"]`);
  el.classList.toggle('on', ui[k]); el.onclick = () => { ui[k] = !ui[k]; el.classList.toggle('on', ui[k]); };
}

function updateHud(){
  const d = dateFromJd(jd);
  $('#date').textContent = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  $('#time').textContent = d.toLocaleTimeString('tr-TR', { timeZone: 'UTC' }) + ' UTC';
  const s = lastState[cam.focus];
  $('#infoDist').textContent = s?.pos ? `${fmt(Math.hypot(...s.pos) / AU_KM, 4)} au` : '—';
  $('#infoState').textContent = s?.pos ? '' : (s?.why ?? '');
}

const KIND = { star: 'Yıldız', planet: 'Gezegen', moon: 'Uydu', dwarf: 'Cüce gezegen', asteroid: 'Asteroit' };
function renderInfo(){
  const b = B[cam.focus];
  const rows = [];
  rows.push(['Ortalama yarıçap', `${fmt(b.radius, b.radius < 100 ? 1 : 0)} km`]);
  if (b.radii[0] !== b.radii[2]) rows.push(['Yarıçaplar (a, b, c)', b.radii.map(x => fmt(x, 1)).join(' · ') + ' km']);
  const p = b.physRow;
  if (p?.Mass) rows.push(['Kütle', `${fmt(p.Mass.value, 4)} × 10${b.kind === 'dwarf' ? '¹⁸' : '²⁴'} kg`]);
  if (p?.['Sidereal Rotation Period']) rows.push(['Dönme süresi', `${fmt(p['Sidereal Rotation Period'].value, 4)} gün`]);
  if (p?.['Sidereal Orbital Period']) rows.push(['Yörünge süresi', `${fmt(p['Sidereal Orbital Period'].value, 3)} yıl`]);
  if (b.period) rows.push(['Yörünge süresi', `${fmt(b.period, 3)} gün`]);
  if (b.albedo != null) rows.push(['Geometrik albedo', fmt(b.albedo, 3)]);
  $('#infoName').textContent = b.name;
  $('#infoKind').textContent = KIND[b.kind] + (b.parent ? ` · ${B[b.parent].name}` : '');
  $('#infoRows').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  const tex = b.texture;
  const src = [];
  if (tex) src.push(`Doku: <a href="${tex.page}" target="_blank" rel="noopener">${tex.credit}</a>`);
  if (b.colorRatio) src.push(`Renk: ${world.D.body_colors.colors[b.color].description} — ortalama renk oranı`);
  if (b.normal){ const n = world.D.textures.textures[b.normal]; if (n) src.push(`Kabartma: <a href="${n.page}" target="_blank" rel="noopener">${n.credit}</a>; gerçek ölçek, abartma yok`); }
  if (b.albedoSource) src.push(`Albedo: ${b.albedoSource}`);
  if (b.id === 'saturn') src.push('Halkalar: optik derinlik Cassini RSS radyal profili (NASA PDS Rings, 8192 adım); renk Cassini doğal renk görüntüsü PIA06485; albedo NSSDCA bölge aralıklarının orta değeri (temsilî)');
  if (b.id === 'earth'){
    src.push('Atmosfer: ölçek yüksekliği NASA bilgi kartından (8,5 km); saçılma katsayıları fizikteki standart değerler (temsilî). Gece ışıkları görünür kılındı (temsilî parlaklık)');
    const cl = world.D.textures.textures.earth_clouds, wm = world.D.textures.textures.earth_water;
    if (wm) src.push(`Okyanus maskesi: ${wm.credit}. Güneş yansımasının dalga pürüzlülüğü görsel tercih.`);
    if (cl) src.push(`Bulutlar: ${cl.credit}. ${cl.note}`);
  }
  $('#infoSrc').innerHTML = src.map(x => `<p>${x}</p>`).join('') + b.notes.map(n => `<p class="warn">${n}</p>`).join('');
}

function renderList(){
  const groups = [['Yıldız', ['sun']], ['Gezegenler', world.bodies.filter(b => b.kind === 'planet').map(b => b.id)],
    ['Cüce gezegenler', world.bodies.filter(b => b.kind === 'dwarf').map(b => b.id)], ['Asteroitler', ['vesta']]];
  const sys = B[cam.focus].parent ?? cam.focus;
  $('#list').innerHTML = groups.map(([g, ids]) => `<h3>${g}</h3>` + ids.map(id => {
    const moons = world.bodies.filter(x => x.parent === id);
    const open = id === sys && moons.length;
    return `<button data-id="${id}" class="${id === cam.focus ? 'active' : ''}">${B[id].name}${moons.length ? `<small>${moons.length}</small>` : ''}</button>` +
      (open ? `<div class="moons">${moons.map(m => `<button data-id="${m.id}" class="${m.id === cam.focus ? 'active' : ''}">${m.name}</button>`).join('')}</div>` : '');
  }).join('')).join('');
  for (const el of document.querySelectorAll('#list button')) el.onclick = () => focusOn(el.dataset.id);
}

$('#sourcesBtn').onclick = () => {
  const t = Object.values(world.D.textures.textures);
  const d = world.D;
  const items = [
    ['Gezegen konumları', d.planets_kepler_elements._source],
    ['Gezegen fiziksel değerleri', d.planets_physical._source],
    ['Yönelim (kutup, dönme)', d.orientation._source],
    ['Güneş', d.sun._source],
    ['Satürn halkaları (bölgeler, albedo)', d.saturn_rings._source],
    ['Satürn halkaları (optik derinlik profili)', d.saturn_ring_profile._source],
    ['Uydu albedoları', { url: 'https://nssdc.gsfc.nasa.gov/planetary/planetfact.html', title: d.moon_albedo._source.title }],
    ['Uydu yörünge şekilleri', d.satellites_mean_elements._source],
  ];
  $('#sourcesBody').innerHTML =
    '<h3>Veri</h3>' + items.map(([k, s]) => `<p><b>${k}:</b> <a href="${s.url}" target="_blank" rel="noopener">${s.title}</a></p>`).join('') +
    '<p><b>Uydu ve cüce gezegen konumları:</b> JPL Horizons (DE441 ve uydu efemeris dosyaları), <code>data/ephem/index.json</code></p>' +
    '<p><b>Asteroitler:</b> JPL Small-Body Database; büyük asteroitler için JPL Horizons yıllık elemanları</p>' +
    '<h3>Görseller</h3>' + t.map(x => `<p><b>${x.body}:</b> <a href="${x.page}" target="_blank" rel="noopener">${x.credit}</a></p>`).join('') +
    '<h3>Görselleştirme tercihleri (veri değil)</h3><p>Otomatik pozlama, parlama (bloom), AgX ton eşleme; yıldızların, gece ışıklarının ve asteroit noktalarının görünürlüğü; atmosferin saçılma katsayıları; halka bölgelerinde aralık orta değerleri.</p>' +
    '<p class="warn">Bu proje NASA\'nın açık verilerini kullanır; NASA tarafından onaylanmış ya da desteklenmiş değildir.</p>';
  $('#sources').showModal();
};

// geliştirme ve test için tarayıcı konsolundan erişim
window.EVREN = { world, cam, ui, VIS, focusOn, camera, scene, renderer, atmoMesh, views, get jd(){ return jd; }, set jd(v){ jd = v; }, get exposure(){ return exposure; },
  get camPos(){ return lastCamPos; }, get state(){ return lastState; }, setRate };

renderInfo(); renderList();
await world.loadMoonsOf('earth');
buildMoonOrbit(B.moon, jd, world.state(jd));
$('#loading').classList.add('done');
requestAnimationFrame(frame);
