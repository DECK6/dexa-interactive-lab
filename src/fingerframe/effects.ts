// Fragment shader for the finger-framed viewport. One program: `uEffect`
// selects the look. Everything inside the hand quad is addressed in quad-local
// space (q), so an effect only has to perturb q and call tap().
//
// The set is deliberately still: the quad reads either as a MATERIAL you look
// through (glass, ice) or as a SCREEN the feed is displayed on (CRT, LED,
// print). Surfaces are static — only film grain and CRT flicker use uTime.

export interface Effect {
  name: string
}

/** Cycle order — matches DESIGN.md §5. HUD shows `01 / FROSTED GLASS`. */
export const EFFECTS: Effect[] = [
  { name: 'FROSTED GLASS' },
  { name: 'REEDED GLASS' },
  { name: 'RIPPLE GLASS' },
  { name: 'STAINED GLASS' },
  { name: 'PRISM GLASS' },
  { name: 'CRACKED ICE' },
  { name: 'GLASS BLOCK' },
  { name: 'CRT PHOSPHOR' },
  { name: 'LED WALL' },
  { name: 'HALFTONE PRINT' },
  { name: 'NEWSPRINT' },
  { name: 'FILM GRAIN' },
]

export const FRAG_SRC = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uTex;
uniform vec2 uResolution;   // canvas size in device px
uniform vec2 uCover;        // display uv -> mirrored video uv (cover crop)
uniform vec2 uCorners[4];   // TL, TR, BR, BL in display uv, y down
uniform float uTime;        // seconds
uniform float uHasFrame;    // 0..1 fade of the whole viewport
uniform int uEffect;

out vec4 fragColor;

const vec3 INK = vec3(0.051, 0.055, 0.063);
const vec3 CYAN = vec3(0.369, 0.906, 0.953);
const vec3 ORANGE = vec3(1.0, 0.353, 0.122);
const vec3 PAPER = vec3(0.945, 0.925, 0.878);
const vec3 NEWS = vec3(0.862, 0.847, 0.792);
const float BAND = 0.012;   // border width, in quad-height units

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec2 hash22(vec2 p) {
  vec2 k = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(k) * 43758.5453123);
}

// Display uv -> webcam texel. x is flipped so the feed reads as a mirror.
vec3 feed(vec2 uv) {
  vec2 m = (uv - 0.5) * uCover + 0.5;
  return texture(uTex, vec2(1.0 - m.x, m.y)).rgb;
}

// Quad-local (0..1, TL origin) -> display uv. Exact inverse of invBilinear.
vec2 quadToUv(vec2 q) {
  return mix(mix(uCorners[0], uCorners[1], q.x), mix(uCorners[3], uCorners[2], q.x), q.y);
}
vec3 tap(vec2 q) { return feed(quadToUv(q)); }

// Width / height of the quad on screen — keeps cells and offsets square.
float quadAspect() {
  vec2 px = vec2(uResolution.x / uResolution.y, 1.0);
  float w = 0.5 * (length((uCorners[1] - uCorners[0]) * px) + length((uCorners[2] - uCorners[3]) * px));
  float h = 0.5 * (length((uCorners[3] - uCorners[0]) * px) + length((uCorners[2] - uCorners[1]) * px));
  return clamp(w / max(h, 1e-4), 0.25, 4.0);
}

// Square space: quad-local q centred and stretched by the aspect, so an offset
// of 0.01 is the same distance on screen whichever axis it points along.
vec2 sq(vec2 q, float a) { return (q - 0.5) * vec2(a, 1.0); }
vec3 tapS(vec2 p, float a) { return tap(p / vec2(a, 1.0) + 0.5); }

// Nearest / second-nearest cell over a 3x3 neighbourhood. f2 - f1 is the
// distance to the cell border, which is what draws lead lines and fractures.
void cells(vec2 p, float n, out vec2 centre, out vec2 id, out float f1, out float f2) {
  vec2 x = p * n;
  vec2 base = floor(x);
  vec2 f = x - base;
  centre = vec2(0.0);
  id = base;
  f1 = 1e9;
  f2 = 1e9;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(base + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = base + g;
        centre = (base + g + o) / n;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  f1 = sqrt(f1);
  f2 = sqrt(f2);
}

float cross2(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }

// u from p = a + e*u + f*v + g*u*v, on whichever axis is better conditioned.
bool solveU(vec2 h, vec2 f, vec2 e, vec2 g, float v, out float u) {
  vec2 den = e + g * v;
  if (abs(den.x) >= abs(den.y)) {
    if (abs(den.x) < 1e-7) return false;
    u = (h.x - f.x * v) / den.x;
    return true;
  }
  if (abs(den.y) < 1e-7) return false;
  u = (h.y - f.y * v) / den.y;
  return true;
}

// Inverse bilinear (Inigo Quilez) — same algorithm as src/lib/math/quad.ts.
bool invBilinear(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d, out vec2 q) {
  vec2 e = b - a;
  vec2 f = d - a;
  vec2 g = a - b + c - d;
  vec2 h = p - a;

  float k2 = cross2(g, f);
  float k1 = cross2(e, f) + cross2(h, g);
  float k0 = cross2(h, e);

  float u;
  if (abs(k2) < 1e-7) {
    // Parallelogram: the quadratic degenerates to a linear solve.
    if (abs(k1) < 1e-9) return false;
    float v = -k0 / k1;
    if (!solveU(h, f, e, g, v, u)) return false;
    q = vec2(u, v);
    return true;
  }

  float disc = k1 * k1 - 4.0 * k0 * k2;
  if (disc < 0.0) return false;
  float w = sqrt(disc);

  // Two roots; keep whichever lands inside the unit square, else the first valid one.
  bool found = false;
  for (int i = 0; i < 2; i++) {
    float v = (-k1 + (i == 0 ? -w : w)) / (2.0 * k2);
    if (!solveU(h, f, e, g, v, u)) continue;
    if (u >= -1e-4 && u <= 1.0001 && v >= -1e-4 && v <= 1.0001) {
      q = vec2(u, v);
      return true;
    }
    if (!found) {
      q = vec2(u, v);
      found = true;
    }
  }
  return found;
}

// 01 — sandblasted glass: spiral of taps plus a per-pixel micro-normal.
vec3 fxFrosted(vec2 q, float a) {
  vec2 p = sq(q, a);
  vec2 micro = vec2(hash21(q * 517.0), hash21(q * 517.0 + 41.0)) - 0.5;
  float phase = hash21(q * 93.0) * 6.2831853;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 14; i++) {
    float f = (float(i) + 0.5) / 14.0;
    float ang = phase + f * 21.9911;
    acc += tapS(p + vec2(cos(ang), sin(ang)) * 0.018 * sqrt(f) + micro * 0.007, a);
  }
  return acc / 14.0 * 1.06 + 0.028;
}

// 02 — fluted reeded glass: each rib is a half-cylinder, refracting by its slope.
vec3 fxReeded(vec2 q, float a) {
  float ribs = 20.0 * a;
  float f = fract(q.x * ribs) - 0.5;
  float h = sqrt(max(0.25 - f * f, 1e-4));
  vec2 p = sq(q, a);
  vec2 off = vec2(clamp(-f / h, -3.0, 3.0) * 0.020, 0.0);
  vec3 col = tapS(p + off + vec2(0.0, -0.006), a) * 0.25
           + tapS(p + off, a) * 0.5
           + tapS(p + off + vec2(0.0, 0.006), a) * 0.25;
  float seam = smoothstep(0.40, 0.5, abs(f));
  float spec = pow(max(1.0 - abs(f + 0.20) * 3.6, 0.0), 3.0);
  return col * (1.0 - 0.38 * seam) + spec * 0.11;
}

// 03 — bathroom wavy glass. The surface is static; only the refraction moves
// the feed, and the sheen picks out slopes facing up-left.
vec3 fxRipple(vec2 q, float a) {
  vec2 p = sq(q, a);
  float c1 = cos(p.x * 34.0 + p.y * 9.0);
  float c2 = cos(p.y * 29.0 - p.x * 12.0);
  float c3 = cos((p.x + p.y) * 19.0);
  vec2 grad = vec2(c1 * 34.0 - c2 * 12.0 + c3 * 19.0, c1 * 9.0 + c2 * 29.0 + c3 * 19.0);
  vec3 col = tapS(p + grad * 0.00042, a);
  float sheen = clamp(dot(normalize(grad + 1e-5), normalize(vec2(-1.0, -1.0))), 0.0, 1.0);
  return col * (0.94 + 0.12 * sheen) + CYAN * pow(sheen, 8.0) * 0.10;
}

// 04 — leaded cathedral glass: hue per cell, dark cames on the borders.
vec3 fxStained(vec2 q, float a) {
  vec2 p = sq(q, a);
  vec2 pt = p + 0.5;
  vec2 centre, id;
  float f1, f2;
  cells(pt, 9.0, centre, id, f1, f2);
  vec2 facet = (centre - pt) * 0.12 + (hash22(id + 7.0) - 0.5) * 0.012;
  vec3 col = tapS(p + facet, a);
  vec3 tint = 0.55 + 0.45 * cos(6.2831853 * (hash21(id) + vec3(0.0, 0.33, 0.67)));
  col *= tint * 1.55;
  return mix(col, INK * 0.45, smoothstep(0.055, 0.0, f2 - f1));
}

// 05 — prismatic dispersion, splitting harder toward the quad edge.
vec3 fxPrism(vec2 q, float a) {
  vec2 p = sq(q, a);
  float r = length(p);
  vec2 dir = r > 1e-4 ? p / r : vec2(0.0);
  float amt = 0.055 * r * smoothstep(0.05, 0.62, r);
  vec3 col = vec3(
    tapS(p + dir * amt, a).r,
    tapS(p + dir * amt * 0.4, a).g,
    tapS(p - dir * amt * 0.55, a).b
  );
  vec3 fringe = 0.5 + 0.5 * cos(6.2831853 * (r * 3.2 + vec3(0.0, 0.33, 0.67)));
  return col + fringe * smoothstep(0.24, 0.72, r) * 0.09;
}

// 06 — shattered pane: every shard offsets and tilts its own slice of the feed.
vec3 fxIce(vec2 q, float a) {
  vec2 p = sq(q, a);
  vec2 centre, id;
  float f1, f2;
  cells(p + 0.5, 7.0, centre, id, f1, f2);
  vec2 seed = hash22(id);
  float ang = (seed.x - 0.5) * 0.32;
  float s = sin(ang), c = cos(ang);
  vec2 pivot = centre - 0.5;
  vec2 shard = pivot + mat2(c, s, -s, c) * (p - pivot) + (seed - 0.5) * 0.05;
  vec3 col = tapS(shard, a) * (0.90 + 0.20 * seed.y);
  float fracture = smoothstep(0.042, 0.0, f2 - f1);
  return mix(col, col * 1.35 + vec3(0.28, 0.44, 0.50), fracture);
}

// 07 — glass-brick wall: each block is a lens showing only what sits behind it.
vec3 fxGlassBlock(vec2 q, float a) {
  vec2 grid = vec2(5.0, 4.0);
  vec2 g = q * grid;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  vec2 bulge = f * (1.0 - 0.8 * dot(f, f));
  vec3 col = tap((id + 0.5 + bulge) / grid) * (0.92 + 0.16 * hash21(id));
  vec2 d = 0.5 - abs(f);
  float seam = 1.0 - smoothstep(0.0, 0.09, min(d.x, d.y));
  return mix(col, col * 0.42 + vec3(0.05, 0.09, 0.10), seam);
}

// 08 — the feed as a shadow-mask tube: RGB triads, scanlines, tube bulge.
vec3 fxCrt(vec2 q, float a, float t) {
  vec2 p = sq(q, a);
  vec2 b = p * (1.0 + 0.10 * dot(p, p));
  vec3 col = tapS(b, a);
  vec3 bloom = (tapS(b + vec2(0.013, 0.0), a) + tapS(b - vec2(0.013, 0.0), a)
              + tapS(b + vec2(0.0, 0.013), a) + tapS(b - vec2(0.0, 0.013), a)) * 0.25;
  col += max(bloom - 0.55, 0.0) * 0.75;
  float m = fract(q.x * 90.0 * a);
  vec3 mask = vec3(step(m, 0.3334), step(0.3334, m) * step(m, 0.6667), step(0.6667, m));
  float scan = 0.80 + 0.20 * cos(q.y * 6.2831853 * 120.0);
  float flick = 1.0 + 0.015 * sin(t * 62.0);
  return col * (mask * 1.05 + 0.42) * scan * flick * 1.4;
}

// 09 — coarse LED panel. Emitters carry the cell average and swell with luma.
vec3 fxLed(vec2 q, float a) {
  vec2 grid = vec2(58.0 * a, 58.0);
  vec2 c0 = (floor(q * grid) + 0.5) / grid;
  vec2 e = 0.22 / grid;
  vec3 avg = (tap(c0 + vec2(-e.x, -e.y)) + tap(c0 + vec2(e.x, -e.y))
            + tap(c0 + vec2(-e.x, e.y)) + tap(c0 + vec2(e.x, e.y))) * 0.25;
  vec2 f = abs(fract(q * grid) - 0.5);
  float d = max(f.x, f.y);
  float l = luma(avg);
  float size = 0.28 + 0.15 * sqrt(l);
  float emit = 1.0 - smoothstep(size - 0.07, size + 0.02, d);
  float halo = exp(-d * 5.0) * l * 0.30;
  return avg * (emit * 1.2 + halo) + INK * (1.0 - emit);
}

// 10 — DEXA inks on stock: 15° dot screen, dot area driven by ink coverage.
vec3 fxHalftone(vec2 q, float a) {
  vec2 grid = vec2(46.0 * a, 46.0);
  float c = cos(0.2618), s = sin(0.2618);
  vec2 rq = mat2(c, s, -s, c) * (q * grid);
  vec2 cell = fract(rq) - 0.5;
  vec2 qc = (mat2(c, -s, s, c) * (floor(rq) + 0.5)) / grid;
  float l = clamp(luma(tap(clamp(qc, 0.0, 1.0))), 0.0, 1.0);
  float ink = 1.0 - l;
  float rad = sqrt(ink) * 0.72;
  float dot_ = smoothstep(rad, rad - 0.10, length(cell));
  vec3 tint = mix(ORANGE, CYAN * 0.72, smoothstep(0.25, 0.85, ink));
  vec3 stock = PAPER * (0.96 + 0.06 * hash21(q * 730.0));
  return mix(stock, tint * 0.9, dot_);
}

// 11 — newsprint: grey screen at 45°, absorbent paper, ink bleeding in the darks.
vec3 fxNewsprint(vec2 q, float a) {
  vec2 grid = vec2(34.0 * a, 34.0);
  float c = cos(0.7854), s = sin(0.7854);
  vec2 rq = mat2(c, s, -s, c) * (q * grid);
  vec2 cell = fract(rq) - 0.5;
  vec2 qc = clamp((mat2(c, -s, s, c) * (floor(rq) + 0.5)) / grid, 0.0, 1.0);
  vec3 s0 = tap(qc);
  float sharp = luma(s0);
  float bleed = luma((s0 + tap(qc + vec2(0.006 / a, 0.0)) + tap(qc + vec2(0.0, 0.006))) / 3.0);
  float l = clamp(mix(sharp, bleed, smoothstep(0.55, 0.12, sharp)), 0.0, 1.0);
  float rad = sqrt(1.0 - l) * 0.78;
  float dot_ = smoothstep(rad, rad - 0.16, length(cell));
  float grain = hash21(q * 640.0);
  return mix(NEWS * (0.93 + 0.11 * grain), vec3(0.10, 0.10, 0.115) * (0.85 + 0.3 * grain), dot_);
}

// 12 — film stock: S-curve, warm fade, soft gate edge, live grain.
vec3 fxFilm(vec2 q, float a, float t) {
  vec2 p = sq(q, a);
  float r = length(p);
  vec3 soft = (tapS(p + vec2(0.007, 0.0), a) + tapS(p - vec2(0.007, 0.0), a)
             + tapS(p + vec2(0.0, 0.007), a) + tapS(p - vec2(0.0, 0.007), a)) * 0.25;
  vec3 col = mix(tap(q), soft, smoothstep(0.30, 0.62, r) * 0.8);
  col = col * col * (3.0 - 2.0 * col);
  col = col * vec3(1.06, 0.99, 0.90) + vec3(0.045, 0.032, 0.028);
  col += (hash21(q * 900.0 + fract(t) * 313.0) - 0.5) * 0.075 * (1.0 - 0.6 * luma(col));
  return col * (1.0 - 0.55 * smoothstep(0.28, 0.72, r));
}

vec3 effectColor(vec2 q, float a, float t) {
  if (uEffect == 0) return fxFrosted(q, a);
  if (uEffect == 1) return fxReeded(q, a);
  if (uEffect == 2) return fxRipple(q, a);
  if (uEffect == 3) return fxStained(q, a);
  if (uEffect == 4) return fxPrism(q, a);
  if (uEffect == 5) return fxIce(q, a);
  if (uEffect == 6) return fxGlassBlock(q, a);
  if (uEffect == 7) return fxCrt(q, a, t);
  if (uEffect == 8) return fxLed(q, a);
  if (uEffect == 9) return fxHalftone(q, a);
  if (uEffect == 10) return fxNewsprint(q, a);
  return fxFilm(q, a, t);
}

// Viewfinder brackets. dn = aspect-corrected distance to the nearest edge pair.
float ticks(vec2 dn) {
  float len = 0.13;
  float th = 0.028;
  float h = (1.0 - smoothstep(th * 0.7, th, dn.y)) * (1.0 - smoothstep(len * 0.8, len, dn.x));
  float v = (1.0 - smoothstep(th * 0.7, th, dn.x)) * (1.0 - smoothstep(len * 0.8, len, dn.y));
  return clamp(h + v, 0.0, 1.0);
}

void main() {
  vec2 uv = vec2(gl_FragCoord.x / uResolution.x, 1.0 - gl_FragCoord.y / uResolution.y);

  vec2 d = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  float vig = 1.0 - 0.5 * smoothstep(0.35, 0.95, length(d));
  vec3 col = feed(uv) * mix(1.0, 0.55, uHasFrame) * vig;

  vec2 q;
  if (invBilinear(uv, uCorners[0], uCorners[1], uCorners[2], uCorners[3], q) &&
      q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) {
    float a = quadAspect();
    vec2 dn = vec2(min(q.x, 1.0 - q.x) * a, min(q.y, 1.0 - q.y));
    float edge = min(dn.x, dn.y);
    float rim = 1.0 - smoothstep(BAND * 0.55, BAND, edge);
    float glow = 1.0 - smoothstep(0.0, BAND * 7.0, edge);

    vec3 inner = mix(effectColor(q, a, uTime), CYAN, max(rim, ticks(dn)) * 0.92);
    inner += CYAN * glow * glow * 0.22;
    col = mix(col, inner, smoothstep(0.12, 0.9, uHasFrame));
  }

  fragColor = vec4(col, 1.0);
}
`
