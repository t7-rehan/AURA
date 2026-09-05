/**
 * GPU Fluid Particle Shaders with Velocity-Aware Motion Trails
 * Delivers luminous strands and flowing comet trails that stretch along particle velocity vectors,
 * with soft Gaussian cores and additive radiance.
 */

export const particleVertexShader = /* glsl */ `
  attribute vec3 aVelocity;
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSizeMultiplier;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vSpeed;
  varying vec2 vScreenVelDir;

  void main() {
    vColor = aColor;
    vAlpha = aAlpha;

    float speed = length(aVelocity);
    vSpeed = speed;

    // View space transformation
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Perspective point attenuation based on camera distance (depth-dependent sizing)
    float distanceAtten = 175.0 / max(1.0, -mvPosition.z);

    // Calculate screen/view-space 2D velocity direction for trail alignment
    vec3 viewVel = mat3(modelViewMatrix) * aVelocity;
    float viewSpeed2D = length(viewVel.xy);
    vScreenVelDir = viewSpeed2D > 0.05 ? (viewVel.xy / viewSpeed2D) : vec2(1.0, 0.0);
    
    // Smooth velocity-dependent quad expansion:
    // Low velocity (< 0.8): compact round point
    // Medium/High velocity: stretches proportionally to render continuous fluid trails
    float speedStretch = 1.0;
    if (speed > 0.8) {
      speedStretch = 1.0 + clamp((speed - 0.8) * 0.15, 0.0, 3.6);
    }
    
    gl_PointSize = clamp(aSize * uPixelRatio * uSizeMultiplier * distanceAtten * speedStretch, 2.2, 130.0);
  }
`;

export const particleFragmentShader = /* glsl */ `
  uniform float uGlobalOpacity;
  uniform float uGlowIntensity;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vSpeed;
  varying vec2 vScreenVelDir;

  void main() {
    // Center-origin coordinates from [0, 1] to [-0.5, 0.5] with Y inverted to match 3D view space (+Y up)
    vec2 coord = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y);

    // Rotate quad coordinates so +X axis aligns directly with particle velocity direction
    float cosA = vScreenVelDir.x;
    float sinA = vScreenVelDir.y;
    vec2 rotatedCoord = vec2(
      coord.x * cosA + coord.y * sinA,
      -coord.x * sinA + coord.y * cosA
    );

    // Velocity-aware stretching
    // Low speed (< 0.8): pure isotropic circle
    // Higher speed: stretches along X (motion axis) and slightly narrows along Y for needle-like streams
    float stretchFactor = 1.0;
    float widthFactor = 1.0;
    if (vSpeed > 0.8) {
      float excessSpeed = vSpeed - 0.8;
      stretchFactor = 1.0 + clamp(excessSpeed * 0.18, 0.0, 4.2);
      widthFactor = 1.0 + clamp(excessSpeed * 0.04, 0.0, 0.75);
    }

    vec2 stretchedCoord = vec2(
      rotatedCoord.x / stretchFactor,
      rotatedCoord.y * widthFactor
    );

    float dist = length(stretchedCoord);
    if (dist > 0.5) {
      discard;
    }

    // Directional comet trail falloff:
    // Leading head (+X) has a tight radiant rim; trailing wake (-X) has smooth luminous decay
    float trailFade = 1.0;
    if (vSpeed > 0.8) {
      if (rotatedCoord.x < 0.0) {
        float tailProgress = -rotatedCoord.x / (0.5 * stretchFactor);
        trailFade = pow(clamp(1.0 - tailProgress, 0.0, 1.0), 1.55);
      } else {
        float headProgress = rotatedCoord.x / 0.5;
        trailFade = pow(clamp(1.0 - headProgress, 0.0, 1.0), 0.80);
      }
    }

    // Multi-tier radiance: intense hot core + luminous fluid corona
    float coreGlow = smoothstep(0.18, 0.0, dist);
    float haloGlow = pow(clamp(1.0 - dist * 2.0, 0.0, 1.0), 1.35) * trailFade;
    
    // High speed particles become brighter and hotter
    float speedBoost = 1.0 + clamp(vSpeed * 0.07, 0.0, 1.5);
    float totalIntensity = (coreGlow * 2.4 + haloGlow * 1.35) * uGlowIntensity * speedBoost;

    // Hot energetic center blends toward pure radiant white (matching reference video)
    vec3 hotColor = mix(vColor, vec3(1.0, 1.0, 1.0), clamp(coreGlow * 1.15 + vSpeed * 0.035, 0.0, 0.96));

    // Output with additive radiance
    float finalAlpha = vAlpha * uGlobalOpacity * haloGlow;
    gl_FragColor = vec4(hotColor * totalIntensity, finalAlpha);
  }
`;
