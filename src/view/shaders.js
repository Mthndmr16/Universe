// GLSL gölgelendiricileri. Birimler: km. Kamera her zaman orijinde (kamera merkezli çizim);
// "world" konumları kameraya göredir. Işık birimi: 1 au'da Güneş'e dik duran beyaz (albedo 1) Lambert yüzeyinin
// parlaklığı = 1. Güneş yüzeyinin parlaklığı bu birimde (au / R☉)² olur (Güneş için ~46 000).

// Uzatılmış Güneş diskine karşı küresel bir cismin yumuşak gölgesi: görünen Güneş diskinin açık kalan oranı.
const SHADOW_GLSL = /* glsl */`
float sunVisibility(vec3 P, vec3 S, float Rs, vec3 C, float Rc){
  vec3 toS = S - P, toC = C - P;
  float dS = length(toS), dC = length(toC);
  if (dC > dS || dot(toS, toC) <= 0.0) return 1.0;
  float as = asin(clamp(Rs / dS, 0.0, 1.0));
  float ao = asin(clamp(Rc / dC, 0.0, 1.0));
  float sep = acos(clamp(dot(toS / dS, toC / dC), -1.0, 1.0));
  if (sep >= as + ao) return 1.0;
  float full = ao >= as ? 0.0 : 1.0 - (ao * ao) / (as * as);   // tam örtme ya da halkalı tutulma
  if (sep <= abs(as - ao)) return full;
  return mix(full, 1.0, smoothstep(abs(as - ao), as + ao, sep));
}`;

export const PLANET_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
uniform mat3 uRot;
uniform vec3 uRadii;
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(uRot * (position / uRadii));   // elipsoit normali
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

export const PLANET_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uMap; uniform float uHasMap; uniform vec3 uColor;
uniform sampler2D uNight; uniform float uHasNight; uniform float uNightGain;
uniform sampler2D uWater; uniform float uHasWater; uniform float uRough;
uniform sampler2D uClouds; uniform float uHasClouds;
uniform sampler2D uNormalMap; uniform float uHasNormal; uniform float uLon0; uniform mat3 uRotF;
uniform vec3 uSunPos; uniform float uSunR; uniform float uIrr; uniform float uRegolith;
uniform vec4 uOcc[6]; uniform int uOccN;
uniform float uHasRing; uniform vec3 uRingC; uniform vec3 uRingN; uniform float uRingIn; uniform float uRingOut; uniform sampler2D uRingTex;
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv;
${SHADOW_GLSL}
void main(){
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN);
  // Geometrik terminatör: normal haritası öz-gölgelemeyi bilmez; Güneş ufkun birkaç derece altına inince
  // çevredeki arazi ışığı keser. Kabartma yalnızca geometrik gündüz tarafında ve hemen ötesinde etkili.
  float geomLit = smoothstep(-0.035, 0.03, dot(N, normalize(uSunPos - vWorld)));
  if (uHasNormal > 0.5){   // kabartma: yerel doğu/kuzey/yukarı eksenlerinde normal haritası (yükseklik verisinden)
    float lon = radians(uLon0 + vUv.x * 360.0), lat = radians(-90.0 + vUv.y * 180.0);
    vec3 east = uRotF * vec3(-sin(lon), cos(lon), 0.0);
    vec3 north = uRotF * vec3(-sin(lat) * cos(lon), -sin(lat) * sin(lon), cos(lat));
    vec3 t = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
    N = normalize(t.x * east + t.y * north + t.z * N);
  }
  vec3 L = normalize(uSunPos - vWorld);
  vec3 V = normalize(-vWorld);
  float mu0 = dot(N, L), mu = max(dot(N, V), 0.0);
  vec3 alb = uHasMap > 0.5 ? texture2D(uMap, vUv).rgb : uColor;
  float refl;
  if (uRegolith > 0.5) refl = mu0 > 0.0 ? 2.0 * mu0 / (mu0 + mu + 1e-4) : 0.0;   // Lommel–Seeliger
  else refl = max(mu0, 0.0);                                                      // Lambert
  if (uHasNormal > 0.5) refl *= geomLit;
  float vis = 1.0;
  for (int i = 0; i < 6; i++){ if (i >= uOccN) break; vis *= sunVisibility(vWorld, uSunPos, uSunR, uOcc[i].xyz, uOcc[i].w); }
  if (uHasRing > 0.5){   // halkanın gezegene düşen gölgesi
    float dn = dot(L, uRingN);
    if (abs(dn) > 1e-4){
      float t = dot(uRingC - vWorld, uRingN) / dn;
      if (t > 0.0){
        float r = length(vWorld + L * t - uRingC);
        if (r > uRingIn && r < uRingOut){
          float tau = texture2D(uRingTex, vec2((r - uRingIn) / (uRingOut - uRingIn), 0.5)).r;
          vis *= exp(-tau / max(abs(dn), 0.02));
        }
      }
    }
  }
  vec3 col = alb * refl * uIrr * vis;
  // Okyanusta Güneş yansıması: GGX dağılımı, su için Fresnel F0 = 0,02. Pürüzlülük görsel tercih.
  if (uHasWater > 0.5 && mu0 > 0.0){
    float w = texture2D(uWater, vUv).r;
    vec3 H = normalize(L + V);
    float nh = max(dot(N, H), 0.0), a2 = uRough * uRough;
    float dd = nh * nh * (a2 - 1.0) + 1.0;
    float D = a2 / (PI * dd * dd);
    float F = 0.02 + 0.98 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
    col += vec3(w * F * D * PI * uIrr * vis / (4.0 * max(mu, 0.05)));
  }
  // Bulutların yüzeye düşen gölgesi (doğrudan altına; yaklaşık)
  if (uHasClouds > 0.5) col *= 1.0 - 0.6 * texture2D(uClouds, vUv).r;
  if (uHasNight > 0.5) col += texture2D(uNight, vUv).rgb * uNightGain * smoothstep(0.08, -0.12, mu0);
  gl_FragColor = vec4(col, 1.0);
}`;

// Dünya bulut kabuğu: örtü dokusu (türetilmiş, NASA VIIRS + Blue Marble). Bulut albedosu görsel tercih.
export const CLOUD_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uClouds; uniform vec3 uSunPos; uniform float uIrr; uniform float uAlb;
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv;
void main(){
  #include <logdepthbuf_fragment>
  float a = texture2D(uClouds, vUv).r;
  if (a < 0.01) discard;
  vec3 N = normalize(vN), L = normalize(uSunPos - vWorld);
  float mu0 = dot(N, L);
  float lit = smoothstep(-0.08, 0.25, mu0) * max(mu0 * 0.85 + 0.15, 0.0);   // alacakaranlıkta yumuşak geçiş
  gl_FragColor = vec4(vec3(uAlb * lit * uIrr), a);
}`;

// Satürn halkaları: radyal optik derinlik τ ve albedo bir veri dokusundan (NSSDCA halka bilgi kartı).
export const RING_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld; varying vec2 vLocal;
void main(){
  vLocal = position.xy;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

export const RING_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uRingTex; uniform float uRingIn; uniform float uRingOut;
uniform vec3 uN; uniform vec3 uSunPos; uniform float uIrr;
uniform vec3 uPC; uniform mat3 uPRot; uniform vec3 uPRadii;   // gezegen (gölgesi için)
varying vec3 vWorld; varying vec2 vLocal;
void main(){
  #include <logdepthbuf_fragment>
  float r = length(vLocal);
  if (r < uRingIn || r > uRingOut) discard;
  vec4 d = texture2D(uRingTex, vec2((r - uRingIn) / (uRingOut - uRingIn), 0.5));
  float tau = d.r; vec3 alb = d.gba;
  if (tau <= 0.0) discard;
  vec3 V = normalize(-vWorld), L = normalize(uSunPos - vWorld);
  float muV = max(abs(dot(V, uN)), 0.02), mu0 = max(abs(dot(L, uN)), 0.02);
  float alpha = 1.0 - exp(-tau / muV);
  bool litSide = sign(dot(L, uN)) == sign(dot(V, uN));
  float I = litSide ? 2.0 * mu0 / (mu0 + muV) * (1.0 - exp(-tau * (1.0 / mu0 + 1.0 / muV))) / max(alpha, 1e-3)
                    : 0.5 * exp(-tau / mu0);            // arka yüz: ince bölgelerden süzülen ışık (temsilî)
  // gezegenin halkaya düşen gölgesi: halka noktasından Güneş'e giden ışın gezegen elipsoidine çarpıyor mu?
  vec3 o = transpose(uPRot) * (vWorld - uPC) / uPRadii, dir = transpose(uPRot) * L / uPRadii;
  float b = dot(o, dir), c = dot(o, o) - 1.0, h = b * b - dot(dir, dir) * c;
  float shadow = (h > 0.0 && -b - sqrt(h) > 0.0) ? 0.0 : 1.0;
  gl_FragColor = vec4(alb * I * uIrr * shadow, alpha);
}`;

// Dünya atmosferi: tek saçılmalı Rayleigh + Mie, ışın yürütme.
// Ölçek yüksekliği NASA Dünya bilgi kartından (8,5 km). Rayleigh ve Mie katsayıları fizikteki standart değerlerdir
// (NASA kaynağı değil); bu yüzden atmosferin rengi ve yoğunluğu "temsilî" olarak etiketlenir.
export const ATMO_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

export const ATMO_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uC; uniform float uRp; uniform float uRt; uniform float uH; uniform vec3 uSunPos; uniform float uIrr;
varying vec3 vWorld;
const vec3 BR = vec3(5.8e-3, 13.5e-3, 33.1e-3);   // Rayleigh, deniz seviyesi, 1/km
const float BM = 2.1e-3, HM = 1.2, G = 0.76;       // Mie
vec2 hitSphere(vec3 ro, vec3 rd, vec3 c, float r){
  vec3 oc = ro - c; float b = dot(oc, rd), q = dot(oc, oc) - r * r, h = b * b - q;
  if (h < 0.0) return vec2(1e30, -1e30); h = sqrt(h); return vec2(-b - h, -b + h);
}
void main(){
  #include <logdepthbuf_fragment>
  vec3 rd = normalize(vWorld);
  vec2 ta = hitSphere(vec3(0.0), rd, uC, uRt);
  if (ta.y < 0.0) discard;
  float t0 = max(ta.x, 0.0), t1 = ta.y;
  vec2 tp = hitSphere(vec3(0.0), rd, uC, uRp);
  if (tp.x > 0.0) t1 = min(t1, tp.x);
  const int N = 16, M = 6;
  float ds = (t1 - t0) / float(N);
  vec3 L = normalize(uSunPos - uC);
  float cosT = dot(rd, L);
  float pr = 3.0 / (16.0 * PI) * (1.0 + cosT * cosT);
  float pm = 3.0 / (8.0 * PI) * ((1.0 - G * G) * (1.0 + cosT * cosT)) / ((2.0 + G * G) * pow(1.0 + G * G - 2.0 * G * cosT, 1.5));
  vec3 sumR = vec3(0.0), sumM = vec3(0.0); float odR = 0.0, odM = 0.0;
  for (int i = 0; i < N; i++){
    vec3 P = rd * (t0 + (float(i) + 0.5) * ds);
    float h = length(P - uC) - uRp;
    float dr = exp(-h / uH) * ds, dm = exp(-h / HM) * ds;
    odR += dr; odM += dm;
    vec3 Ls = normalize(uSunPos - P);
    vec2 hs = hitSphere(P, Ls, uC, uRp);
    if (hs.x > 0.0 && hs.x < 1e29) continue;           // Güneş gezegenin arkasında (1e30: kesişme yok)
    float tl = hitSphere(P, Ls, uC, uRt).y, dl = tl / float(M), lr = 0.0, lm = 0.0;
    for (int j = 0; j < M; j++){
      float hl = length(P + Ls * (float(j) + 0.5) * dl - uC) - uRp;
      lr += exp(-hl / uH) * dl; lm += exp(-hl / HM) * dl;
    }
    vec3 att = exp(-(BR * (odR + lr) + BM * 1.1 * (odM + lm)));
    sumR += dr * att; sumM += dm * att;
  }
  vec3 col = (sumR * BR * pr + sumM * BM * pm) * uIrr * PI;
  gl_FragColor = vec4(col, 1.0);
}`;

// Gökyüzü: SVS Deep Star Maps (ekvatoral koordinatlar). Yön → sağ açıklık/dik açıklık → doku.
export const SKY_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

export const SKY_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uSky; uniform float uGain; uniform float uEps;
varying vec3 vDir;
void main(){
  #include <logdepthbuf_fragment>
  vec3 e = normalize(vDir);
  float c = cos(uEps), s = sin(uEps);
  vec3 q = vec3(e.x, c * e.y - s * e.z, s * e.y + c * e.z);    // ekliptik → ekvatoral
  float ra = atan(q.y, q.x), dec = asin(clamp(q.z, -1.0, 1.0));
  vec2 uv = vec2(fract(0.5 - ra / (2.0 * PI)), 0.5 - dec / PI);
  gl_FragColor = vec4(texture2D(uSky, uv).rgb * uGain, 1.0);
}`;

// Asteroit kuşağı: Kepler çözümü GPU'da. Elemanlar öznitelik olarak gelir (radyan, km, radyan/gün).
export const BELT_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 aOrb;     // a (km), e, i, Ω
attribute vec4 aOrb2;    // ω, M0, n, epoch − ref (gün)
attribute vec2 aInfo;    // görünürlük penceresi yarı genişliği (gün), boyut ağırlığı
uniform float uT;        // jd − ref (gün)
uniform vec3 uSun;       // Güneş'in kameraya göre konumu (km)
uniform float uScale;
varying float vW;
void main(){
  float a = aOrb.x, e = aOrb.y, inc = aOrb.z, Om = aOrb.w, w = aOrb2.x;
  float dt = uT - aOrb2.w;
  vW = abs(dt) <= aInfo.x ? aInfo.y : 0.0;
  float M = mod(aOrb2.y + aOrb2.z * dt, 2.0 * PI);
  float E = M + e * sin(M);
  for (int k = 0; k < 6; k++) E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
  float xp = a * (cos(E) - e), yp = a * sqrt(1.0 - e * e) * sin(E);
  float co = cos(w), so = sin(w), cO = cos(Om), sO = sin(Om), cI = cos(inc), sI = sin(inc);
  vec3 p = vec3((co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
                (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
                (so * sI) * xp + (co * sI) * yp);
  vec4 wp = vec4(uSun + p, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_PointSize = vW > 0.0 ? uScale : 0.0;
  #include <logdepthbuf_vertex>
}`;

export const BELT_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uGain;
varying float vW;
void main(){
  #include <logdepthbuf_fragment>
  if (vW <= 0.0) discard;
  vec2 c = gl_PointCoord - 0.5;
  float f = exp(-dot(c, c) * 18.0);
  gl_FragColor = vec4(vec3(uGain * vW * f), 1.0);   // renk verisi yok: nötr
}`;
