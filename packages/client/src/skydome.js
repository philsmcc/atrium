// SPDX-License-Identifier: MIT
// Atrium Skydome — procedural gradient sky with soft animated clouds

import * as THREE from 'three'

const VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldPosition;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
varying vec3 vWorldPosition;

// --- Noise helpers (value noise, cheap and soft) ---
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f); // smoothstep
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  vec2 shift = vec2(100.0);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vWorldPosition - cameraPosition);
  float elevation = dir.y;  // -1 (nadir) to +1 (zenith)

  // --- Sky gradient ---
  // Horizon haze → mid-sky blue → deep zenith blue
  vec3 horizonColor = vec3(0.75, 0.85, 0.95);   // pale blue-white
  vec3 midColor     = vec3(0.40, 0.65, 0.92);   // soft blue
  vec3 zenithColor  = vec3(0.22, 0.40, 0.75);   // deeper blue

  float t = clamp(elevation, 0.0, 1.0);
  vec3 sky;
  if (t < 0.3) {
    sky = mix(horizonColor, midColor, t / 0.3);
  } else {
    sky = mix(midColor, zenithColor, (t - 0.3) / 0.7);
  }

  // Below horizon: fade toward a ground fog color
  if (elevation < 0.0) {
    vec3 groundFog = vec3(0.65, 0.75, 0.82);
    float gt = clamp(-elevation * 4.0, 0.0, 1.0);
    sky = mix(sky, groundFog, gt);
  }

  // --- Clouds ---
  // Project direction onto a dome plane for UV
  float domeY = max(elevation, 0.02);
  vec2 uv = dir.xz / (domeY + 0.3) * 1.8;

  // Slow drift
  float t1 = uTime * 0.006;
  float t2 = uTime * 0.003;

  // Two cloud layers at different scales and speeds
  float c1 = fbm(uv * 3.0 + vec2(t1, t1 * 0.7));
  float c2 = fbm(uv * 6.0 + vec2(-t2 * 1.3, t2));

  // Combine layers
  float cloud = c1 * 0.6 + c2 * 0.4;

  // Shape: threshold + soft edge, more cloud coverage = 0.38-0.42 threshold
  float coverage = 0.40;
  cloud = smoothstep(coverage, coverage + 0.25, cloud);

  // Fade clouds near horizon (too far away to see detail)
  float horizonFade = smoothstep(0.0, 0.15, elevation);
  cloud *= horizonFade;

  // Cloud color: bright white with a slight warm tint
  vec3 cloudColor = vec3(1.0, 0.99, 0.96);

  // Subtle cloud shadow on underside
  vec3 cloudShadow = vec3(0.75, 0.82, 0.90);
  vec3 finalCloud = mix(cloudShadow, cloudColor, smoothstep(0.0, 0.5, cloud));

  vec3 color = mix(sky, finalCloud, cloud * 0.85);

  gl_FragColor = vec4(color, 1.0);
}
`

/**
 * Create a skydome mesh.
 * @param {object} [opts]
 * @param {number} [opts.radius=400] — sphere radius (must be < camera far plane)
 * @returns {{ mesh: THREE.Mesh, update: (dt: number) => void }}
 */
export function createSkydome({ radius = 400 } = {}) {
  const geometry = new THREE.SphereGeometry(radius, 48, 32)
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0.0 },
    },
    side: THREE.BackSide,     // render inside of sphere
    depthWrite: false,        // draw behind everything
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = '__atrium_skydome'
  mesh.renderOrder = -1000    // render first
  mesh.frustumCulled = false  // always visible

  let elapsed = 0

  function update(dt) {
    elapsed += dt
    material.uniforms.uTime.value = elapsed
  }

  return { mesh, update }
}
