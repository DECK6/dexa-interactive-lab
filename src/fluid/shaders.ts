const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
out vec4 fragColor;
`

const FIELD_CODEC = `
#ifdef LOW_PRECISION
const float FIELD_ZERO = 128.0 / 255.0;
const float VELOCITY_SCALE = 0.04;
const float SCALAR_SCALE = 0.04;
vec2 readVelocity(vec4 value) { return (value.rg - FIELD_ZERO) / VELOCITY_SCALE; }
vec4 writeVelocity(vec2 value) {
  return vec4(clamp(value * VELOCITY_SCALE + FIELD_ZERO, 0.0, 1.0), FIELD_ZERO, 1.0);
}
float readScalar(vec4 value) { return (value.r - FIELD_ZERO) / SCALAR_SCALE; }
vec4 writeScalar(float value) {
  float packed = clamp(value * SCALAR_SCALE + FIELD_ZERO, 0.0, 1.0);
  return vec4(packed, FIELD_ZERO, FIELD_ZERO, 1.0);
}
#else
vec2 readVelocity(vec4 value) { return value.rg; }
vec4 writeVelocity(vec2 value) { return vec4(value, 0.0, 1.0); }
float readScalar(vec4 value) { return value.r; }
vec4 writeScalar(float value) { return vec4(value, 0.0, 0.0, 1.0); }
#endif
`

const MANUAL_FILTER = `
vec4 sampleField(sampler2D field, vec2 uv, bool manualFilter) {
  if (!manualFilter) return texture(field, uv);
  ivec2 size = textureSize(field, 0);
  vec2 pixel = clamp(uv, vec2(0.0), vec2(1.0)) * vec2(size) - 0.5;
  ivec2 base = ivec2(floor(pixel));
  vec2 f = fract(pixel);
  ivec2 hi = size - 1;
  ivec2 p00 = clamp(base, ivec2(0), hi);
  ivec2 p10 = clamp(base + ivec2(1, 0), ivec2(0), hi);
  ivec2 p01 = clamp(base + ivec2(0, 1), ivec2(0), hi);
  ivec2 p11 = clamp(base + ivec2(1, 1), ivec2(0), hi);
  vec4 a = mix(texelFetch(field, p00, 0), texelFetch(field, p10, 0), f.x);
  vec4 b = mix(texelFetch(field, p01, 0), texelFetch(field, p11, 0), f.x);
  return mix(a, b, f.y);
}
`

export const CURL_FS = `${HEADER}
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
${FIELD_CODEC}
void main() {
  vec2 uv = gl_FragCoord.xy * uTexelSize;
  float left = readVelocity(texture(uVelocity, uv - vec2(uTexelSize.x, 0.0))).y;
  float right = readVelocity(texture(uVelocity, uv + vec2(uTexelSize.x, 0.0))).y;
  float bottom = readVelocity(texture(uVelocity, uv - vec2(0.0, uTexelSize.y))).x;
  float top = readVelocity(texture(uVelocity, uv + vec2(0.0, uTexelSize.y))).x;
  float curl = 0.5 * (right - left - top + bottom);
  fragColor = writeScalar(curl);
}
`

export const VORTICITY_FS = `${HEADER}
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uStrength;
${FIELD_CODEC}
void main() {
  vec2 uv = gl_FragCoord.xy * uTexelSize;
  float left = abs(readScalar(texture(uCurl, uv - vec2(uTexelSize.x, 0.0))));
  float right = abs(readScalar(texture(uCurl, uv + vec2(uTexelSize.x, 0.0))));
  float bottom = abs(readScalar(texture(uCurl, uv - vec2(0.0, uTexelSize.y))));
  float top = abs(readScalar(texture(uCurl, uv + vec2(0.0, uTexelSize.y))));
  float centre = readScalar(texture(uCurl, uv));
  vec2 gradient = 0.5 * vec2(right - left, top - bottom);
  gradient /= length(gradient) + 1e-5;
  vec2 force = vec2(gradient.y, -gradient.x) * centre * uStrength;
  vec2 velocity = readVelocity(texture(uVelocity, uv));
  fragColor = writeVelocity(velocity + clamp(force, vec2(-8.0), vec2(8.0)) * uDt);
}
`

export const DIVERGENCE_FS = `${HEADER}
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
${FIELD_CODEC}
void main() {
  vec2 uv = gl_FragCoord.xy * uTexelSize;
  float left = readVelocity(texture(uVelocity, uv - vec2(uTexelSize.x, 0.0))).x;
  float right = readVelocity(texture(uVelocity, uv + vec2(uTexelSize.x, 0.0))).x;
  float bottom = readVelocity(texture(uVelocity, uv - vec2(0.0, uTexelSize.y))).y;
  float top = readVelocity(texture(uVelocity, uv + vec2(0.0, uTexelSize.y))).y;
  float divergence = 0.5 * (right - left + top - bottom);
  fragColor = writeScalar(divergence);
}
`

export const PRESSURE_FS = `${HEADER}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexelSize;
${FIELD_CODEC}
void main() {
  vec2 uv = gl_FragCoord.xy * uTexelSize;
  float left = readScalar(texture(uPressure, uv - vec2(uTexelSize.x, 0.0)));
  float right = readScalar(texture(uPressure, uv + vec2(uTexelSize.x, 0.0)));
  float bottom = readScalar(texture(uPressure, uv - vec2(0.0, uTexelSize.y)));
  float top = readScalar(texture(uPressure, uv + vec2(0.0, uTexelSize.y)));
  float divergence = readScalar(texture(uDivergence, uv));
  float pressure = (left + right + bottom + top - divergence) * 0.25;
  fragColor = writeScalar(pressure);
}
`

export const GRADIENT_SUBTRACT_FS = `${HEADER}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
${FIELD_CODEC}
void main() {
  vec2 uv = gl_FragCoord.xy * uTexelSize;
  float left = readScalar(texture(uPressure, uv - vec2(uTexelSize.x, 0.0)));
  float right = readScalar(texture(uPressure, uv + vec2(uTexelSize.x, 0.0)));
  float bottom = readScalar(texture(uPressure, uv - vec2(0.0, uTexelSize.y)));
  float top = readScalar(texture(uPressure, uv + vec2(0.0, uTexelSize.y)));
  vec2 gradient = 0.5 * vec2(right - left, top - bottom);
  vec2 velocity = readVelocity(texture(uVelocity, uv));
  fragColor = writeVelocity(velocity - gradient);
}
`

export const ADVECTION_FS = `${HEADER}
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform vec2 uVelocityToUv;
uniform float uDt;
uniform float uDissipation;
uniform bool uManualFilter;
uniform bool uSourceEncoded;
uniform bool uTargetEncoded;
${FIELD_CODEC}
${MANUAL_FILTER}
void main() {
  vec2 uv = gl_FragCoord.xy * uTexelSize;
  vec2 velocity = readVelocity(sampleField(uVelocity, uv, uManualFilter));
  vec2 coord = uv - uDt * velocity * uVelocityToUv;
  vec4 source = sampleField(uSource, coord, uManualFilter);
  float decay = exp(-uDissipation * uDt);
  if (uSourceEncoded) {
    vec2 advected = readVelocity(source) * decay;
    fragColor = uTargetEncoded ? writeVelocity(advected) : vec4(advected, 0.0, 1.0);
  } else {
    fragColor = max(source, vec4(0.0)) * decay;
  }
}
`

export const SPLAT_FS = `${HEADER}
uniform sampler2D uTarget;
uniform vec2 uTexelSize;
uniform vec2 uAspect;
uniform vec2 uPoints[10];
uniform vec2 uVelocities[10];
uniform vec3 uColors[10];
uniform float uRadii[10];
uniform float uIntensities[10];
uniform float uBursts[10];
uniform int uCount;
uniform int uKind;
${FIELD_CODEC}
void main() {
  vec2 uv = gl_FragCoord.xy * uTexelSize;
  vec4 current = texture(uTarget, uv);
  if (uKind == 0) {
    vec2 total = readVelocity(current);
    for (int i = 0; i < 10; i++) {
      if (i >= uCount) break;
      vec2 offset = (uv - uPoints[i]) * uAspect;
      float ink = exp(-dot(offset, offset) / max(uRadii[i], 1e-8));
      vec2 radial = offset / (length(offset) + 1e-5);
      vec2 tangent = normalize(vec2(-offset.y, offset.x) + vec2(1e-5)) * 0.025;
      vec2 impulse = uVelocities[i] + tangent + radial * uBursts[i] * 0.72;
      total += impulse * ink * uIntensities[i];
    }
    fragColor = writeVelocity(total);
  } else {
    vec4 total = current;
    for (int i = 0; i < 10; i++) {
      if (i >= uCount) break;
      vec2 offset = (uv - uPoints[i]) * uAspect;
      float ink = exp(-dot(offset, offset) / max(uRadii[i], 1e-8));
      total += vec4(uColors[i], 1.0) * ink * uIntensities[i];
    }
    fragColor = total;
  }
}
`

export const DISPLAY_FS = `${HEADER}
uniform sampler2D uDye;
uniform sampler2D uVideo;
uniform vec2 uResolution;
uniform vec2 uCover;
uniform float uVideoDim;
uniform bool uHasVideo;
uniform bool uManualFilter;
${MANUAL_FILTER}
const vec3 INK = vec3(13.0, 14.0, 16.0) / 255.0;
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 base = INK;
  if (uHasVideo) {
    vec2 videoUv = (uv - 0.5) * uCover + 0.5;
    // Video rows start at the top while gl_FragCoord starts at the bottom: flip v, mirror u.
    vec3 feed = texture(uVideo, vec2(1.0 - videoUv.x, 1.0 - videoUv.y)).rgb;
    base = mix(INK, feed, clamp(uVideoDim, 0.0, 1.0));
  }
  vec3 dye = max(sampleField(uDye, uv, uManualFilter).rgb, vec3(0.0));
  vec3 neon = 1.0 - exp(-dye * 1.35);
  vec3 screened = 1.0 - (1.0 - base) * (1.0 - neon);
  fragColor = vec4(clamp(screened, 0.0, 1.0), 1.0);
}
`
