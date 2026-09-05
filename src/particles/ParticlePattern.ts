import type { ParticlePatternType } from './ParticleConfig';

export interface PatternTargetData {
  positions: Float32Array; // [x0, y0, z0, x1, y1, z1, ...]
}

export class PatternGenerator {
  /**
   * Generates a structured, fluid cosmic universe with natural density variations:
   * dense core vortex, sweeping orbital streams, secondary flow lobes, and organic flow displacements.
   */
  /**
   * Generates a structured, fluid cosmic universe matching reference fluid physics:
   * 40% orbital bands (concentric rings & tilted 3D elliptical shells),
   * 30% vortex streams (logarithmic spiral arms),
   * 20% central flowing field (multi-lobed atomic rosette core),
   * 10% scattered outer particles (framing cosmic halo).
   */
  public static generateRandomCosmos(
    count: number,
    halfWidth: number = 100,
    halfHeight: number = 60,
    depth: number = 35
  ): PatternTargetData {
    const positions = new Float32Array(count * 3);
    const maxRadius = Math.min(halfWidth, halfHeight) * 0.88;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      const seed = Math.random();

      let x = 0;
      let y = 0;
      let z = 0;

      if (seed < 0.40) {
        // 1. 40% Orbital Bands (Concentric rings & tilted elliptical loops, as seen in reference)
        // Quantized radii with small radial spread creates distinct dense concentric bands
        const bandIndex = i % 5;
        const baseR = (0.22 + bandIndex * 0.16) * maxRadius;
        const radialSpread = (Math.random() - 0.5) * (maxRadius * 0.045);
        const r = Math.max(5.0, baseR + radialSpread);
        
        const theta = Math.random() * Math.PI * 2;
        // Tilted 3D orbital plane for each band (creating intersecting atomic loops)
        const tiltAngle = (bandIndex * Math.PI) / 5;
        const tiltCos = Math.cos(tiltAngle * 0.45);
        const tiltSin = Math.sin(tiltAngle * 0.45);

        const bx = Math.cos(theta) * r * 1.12;
        const by = Math.sin(theta) * r * 0.92;
        
        x = bx * tiltCos;
        y = by;
        z = bx * tiltSin + (Math.random() - 0.5) * 3.5;
      } else if (seed < 0.70) {
        // 2. 30% Vortex Streams (Curved logarithmic spiral streams connecting core to perimeter)
        const u = Math.random();
        const r = (0.15 + 0.85 * Math.pow(u, 0.8)) * maxRadius;
        const armIndex = i % 4;
        const baseArmAngle = (armIndex * Math.PI * 2) / 4;
        
        // Logarithmic spiral stream phase
        const spiralPhase = baseArmAngle + Math.log(1.0 + r * 0.08) * 3.2;
        const streamScatter = (Math.random() - 0.5) * (maxRadius * 0.04);
        const angle = spiralPhase + (streamScatter / r);

        x = Math.cos(angle) * r * (halfWidth / maxRadius * 0.85);
        y = Math.sin(angle) * r * (halfHeight / maxRadius * 0.85);
        z = Math.sin(spiralPhase * 2.0) * (depth * 0.22) + (Math.random() - 0.5) * 3.0;
      } else if (seed < 0.90) {
        // 3. 20% Central Flowing Field (Multi-lobed atomic rosette surrounding dark inner core)
        const u = Math.random();
        const rInner = maxRadius * 0.08;
        const rOuter = maxRadius * 0.38;
        const r = rInner + Math.sqrt(u) * (rOuter - rInner);
        
        const theta = Math.random() * Math.PI * 2;
        // 4-lobe and 6-lobe rosette modulation creates atomic petals (reference frames 00:04-00:06)
        const lobes = (i % 2 === 0) ? 4 : 6;
        const rosetteR = r * (0.85 + 0.25 * Math.cos(lobes * theta));

        x = Math.cos(theta) * rosetteR * 1.15;
        y = Math.sin(theta) * rosetteR * 0.95;
        z = (Math.random() - 0.5) * 4.0;
      } else {
        // 4. 10% Scattered Outer Particles (Soft framing cosmic halo)
        const angle = Math.random() * Math.PI * 2;
        const r = (0.82 + 0.18 * Math.random()) * maxRadius;
        x = Math.cos(angle) * r * (halfWidth / maxRadius * 0.94);
        y = Math.sin(angle) * r * (halfHeight / maxRadius * 0.92);
        z = (Math.random() - 0.5) * (depth * 0.4);
      }

      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
    }

    return { positions };
  }

  /**
   * Procedural 3D Galaxy: Dense core, 4 logarithmic spiral arms, vertical Gaussian thickness
   */
  public static generateGalaxy(
    count: number,
    radius: number = 42,
    arms: number = 4
  ): PatternTargetData {
    const positions = new Float32Array(count * 3);
    const armAngle = (Math.PI * 2) / arms;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      // 22% particles in dense nucleus, 78% in spiral arms
      const isCore = Math.random() < 0.22;

      if (isCore) {
        const u = Math.random();
        const r = Math.pow(u, 1.8) * (radius * 0.35);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        positions[idx] = r * Math.sin(phi) * Math.cos(theta);
        positions[idx + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.8;
        positions[idx + 2] = r * Math.cos(phi) * 0.6;
      } else {
        const u = Math.random();
        const r = (0.2 + 0.8 * Math.pow(u, 0.75)) * radius;
        const armIndex = i % arms;
        
        const spiral = Math.pow(r / radius, 0.7) * 4.2;
        const scatter = (Math.random() - 0.5) * (0.35 + 0.3 * (r / radius));
        const angle = armIndex * armAngle + spiral + scatter;

        const thickness = (1.0 - (r / radius) * 0.65) * 8.5;
        const z = (Math.random() - 0.5) * thickness;

        positions[idx] = Math.cos(angle) * r;
        positions[idx + 1] = Math.sin(angle) * r;
        positions[idx + 2] = z;
      }
    }

    return { positions };
  }

  /**
   * Procedural Volumetric Nebula: Organic, irregular fractal cloud with multiple turbulent energy lobes
   */
  public static generateNebula(
    count: number,
    radius: number = 40,
    depth: number = 32
  ): PatternTargetData {
    const positions = new Float32Array(count * 3);

    const lobes = [
      { x: 0.35 * radius, y: 0.25 * radius, z: 0.1 * depth, weight: 0.3, spread: 0.55 },
      { x: -0.4 * radius, y: -0.2 * radius, z: -0.2 * depth, weight: 0.25, spread: 0.5 },
      { x: -0.1 * radius, y: 0.45 * radius, z: 0.3 * depth, weight: 0.25, spread: 0.45 },
      { x: 0.2 * radius, y: -0.35 * radius, z: -0.15 * depth, weight: 0.2, spread: 0.4 },
    ];

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      const rand = Math.random();
      let cumulative = 0;
      let selectedLobe = lobes[0];
      for (const lobe of lobes) {
        cumulative += lobe.weight;
        if (rand <= cumulative) {
          selectedLobe = lobe;
          break;
        }
      }

      const u = Math.random();
      const r = Math.pow(u, 0.7) * (radius * selectedLobe.spread);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      const turb1 = Math.sin(theta * 3.0 + phi * 2.0) * (radius * 0.12);
      const turb2 = Math.cos(theta * 2.0 - phi * 4.0) * (radius * 0.12);

      positions[idx] = selectedLobe.x + (r + turb1) * Math.sin(phi) * Math.cos(theta);
      positions[idx + 1] = selectedLobe.y + (r + turb2) * Math.sin(phi) * Math.sin(theta);
      positions[idx + 2] = selectedLobe.z + (r * 0.6) * Math.cos(phi);
    }

    return { positions };
  }

  /**
   * Procedural 3D Sphere: Volumetric Fibonacci / Gaussian shell with rich luminous depth
   */
  public static generateSphere(
    count: number,
    radius: number = 32
  ): PatternTargetData {
    const positions = new Float32Array(count * 3);
    const goldenRatio = (1 + Math.sqrt(5)) / 2;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      const theta = 2 * Math.PI * i / goldenRatio;
      const phi = Math.acos(1 - 2 * (i + 0.5) / count);

      const isInternal = Math.random() < 0.25;
      const r = isInternal
        ? Math.pow(Math.random(), 0.6) * radius * 0.85
        : radius * (0.88 + 0.12 * Math.random());

      positions[idx] = r * Math.sin(phi) * Math.cos(theta);
      positions[idx + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[idx + 2] = r * Math.cos(phi);
    }

    return { positions };
  }

  /**
   * Generates target positions for a specific pattern and particle count
   */
  public static generatePattern(pattern: ParticlePatternType, count: number): Float32Array | null {
    if (pattern === 'FREE') {
      return null;
    }
    if (pattern === 'GALAXY') {
      return PatternGenerator.generateGalaxy(count).positions;
    }
    if (pattern === 'NEBULA') {
      return PatternGenerator.generateNebula(count).positions;
    }
    if (pattern === 'SPHERE') {
      return PatternGenerator.generateSphere(count).positions;
    }
    return null;
  }
}

/**
 * Manages pattern state, smooth morphing progress, rotational movement, and spatial anchor for a particle group
 */
export class GroupPatternState {
  public pattern: ParticlePatternType = 'FREE';
  public targetBuffer: Float32Array | null = null;
  public previousBuffer: Float32Array | null = null;

  public transitionProgress = 1.0;
  public transitionDuration = 1.6; // Seconds
  public rotationAngle = 0;
  public rotationSpeed = 0.25; // Rad/sec

  public anchorX = 0;
  public anchorY = 0;
  public anchorZ = 0;
  public scale = 1.0;

  private count: number;

  constructor(count: number, initialPattern: ParticlePatternType = 'FREE') {
    this.count = count;
    this.setPattern(initialPattern);
  }

  public resize(newCount: number): void {
    if (this.count === newCount) return;
    this.count = newCount;
    if (this.pattern !== 'FREE') {
      this.targetBuffer = PatternGenerator.generatePattern(this.pattern, this.count);
    } else {
      this.targetBuffer = null;
    }
    this.previousBuffer = null;
    this.transitionProgress = 1.0;
  }

  public setPattern(newPattern: ParticlePatternType): void {
    if (this.pattern === newPattern && this.targetBuffer !== null) return;
    
    this.previousBuffer = this.targetBuffer;
    this.pattern = newPattern;
    this.targetBuffer = PatternGenerator.generatePattern(newPattern, this.count);
    
    this.transitionProgress = 0.0;

    if (newPattern === 'GALAXY') {
      this.rotationSpeed = 0.32;
    } else if (newPattern === 'NEBULA') {
      this.rotationSpeed = 0.14;
    } else if (newPattern === 'SPHERE') {
      this.rotationSpeed = 0.20;
    } else {
      this.rotationSpeed = 0.0;
    }
  }

  public update(dt: number): { weight: number; rotCos: number; rotSin: number } {
    if (this.transitionProgress < 1.0) {
      this.transitionProgress = Math.min(1.0, this.transitionProgress + dt / this.transitionDuration);
    }

    const easedWeight =
      this.transitionProgress *
      this.transitionProgress *
      (3 - 2 * this.transitionProgress);

    this.rotationAngle += this.rotationSpeed * dt;
    const rotCos = Math.cos(this.rotationAngle);
    const rotSin = Math.sin(this.rotationAngle);

    return { weight: easedWeight, rotCos, rotSin };
  }
}
