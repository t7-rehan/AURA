import type {
  ParticlePhysicsConfig,
  ParticleInteractionMode,
  ParticleColorPalette,
  ParticlePatternType,
} from './ParticleConfig';
import { DEFAULT_PHYSICS_CONFIG, PARTICLE_PALETTES } from './ParticleConfig';
import { GroupPatternState } from './ParticlePattern';
import type { HandInteractionState } from '../handTracking/handTypes';
import type { ViewportBounds } from '../visualization/VisualizationScene';

export interface WorldHand {
  id: string;
  handedness: 'Left' | 'Right';
  tip: { x: number; y: number; z: number };
  palm: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  isOpenPalm: boolean;
  isPinching: boolean;
  handScale: number;
}

interface DriftingVortex {
  x: number;
  y: number;
  z: number;
  strength: number;
  radius: number;
  axisX: number;
  axisY: number;
  axisZ: number;
  radialFreq: number;
  radialAmp: number;
  rosetteLobes: number;
  rosetteAmp: number;
}

export class ParticlePhysics {
  private config: ParticlePhysicsConfig;
  private currentMode: ParticleInteractionMode = 'FREE';
  private palette: ParticleColorPalette;
  private time = 0;

  // Viewport bounds in Three.js world space
  private bounds: ViewportBounds = {
    halfWidth: 100,
    halfHeight: 60,
    width: 200,
    height: 120,
    depth: 40,
  };

  // Dual-Hand Partition & Stability State
  public groupAState: GroupPatternState;
  public groupBState: GroupPatternState;
  public unifiedState: GroupPatternState;

  private partitionWeight = 0.0; // 0.0 = Single Universe, 1.0 = Dual Groups Split
  private isDualHandActive = false;
  private dualHandConfirmFrames = 0;
  private singleHandConfirmFrames = 0;

  // Hand Anchors in World Space with Ultra-Fast Exponential Response (1-2 frame latency)
  private smoothedAnchorA = { x: -25, y: 0, z: 0 };
  private smoothedAnchorB = { x: 25, y: 0, z: 0 };
  private smoothedUnifiedAnchor = { x: 0, y: 0, z: 0 };

  // Previous Hand Positions for Outlier Rejection & Smooth Velocity Tracking
  private rawPrevHandA = { x: -25, y: 0, z: 0 };
  private rawPrevHandB = { x: 25, y: 0, z: 0 };
  private smoothedVelA = { x: 0, y: 0, z: 0 };
  private smoothedVelB = { x: 0, y: 0, z: 0 };

  // Gesture Intensity Weights for Immediate Attack & Release
  private gestureWeightA = { openPalm: 0.0, pinch: 0.0 };
  private gestureWeightB = { openPalm: 0.0, pinch: 0.0 };

  constructor(count: number, config: Partial<ParticlePhysicsConfig> = {}) {
    this.config = { ...DEFAULT_PHYSICS_CONFIG, ...config };
    this.palette = PARTICLE_PALETTES[0];

    const halfCount = Math.floor(count / 2);
    this.groupAState = new GroupPatternState(halfCount, 'FREE');
    this.groupBState = new GroupPatternState(count - halfCount, 'FREE');
    this.unifiedState = new GroupPatternState(count, 'FREE');
  }

  public resize(count: number): void {
    const halfCount = Math.floor(count / 2);
    this.groupAState.resize(halfCount);
    this.groupBState.resize(count - halfCount);
    this.unifiedState.resize(count);
  }

  public updateBounds(bounds: ViewportBounds): void {
    this.bounds = bounds;
  }

  public getBounds(): ViewportBounds {
    return this.bounds;
  }

  public setConfig(config: Partial<ParticlePhysicsConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public setPalette(paletteIndex: number): void {
    const idx = Math.max(0, Math.min(paletteIndex, PARTICLE_PALETTES.length - 1));
    this.palette = PARTICLE_PALETTES[idx];
  }

  public getCurrentMode(): ParticleInteractionMode {
    return this.currentMode;
  }

  public getIsDualHandActive(): boolean {
    return this.isDualHandActive;
  }

  public getPartitionWeight(): number {
    return this.partitionWeight;
  }

  public getSmoothedHands(): {
    handA: { x: number; y: number; z: number; gesture?: string } | null;
    handB: { x: number; y: number; z: number; gesture?: string } | null;
  } {
    return {
      handA: {
        x: this.smoothedAnchorA.x,
        y: this.smoothedAnchorA.y,
        z: this.smoothedAnchorA.z,
        gesture:
          this.gestureWeightA.openPalm > 0.4
            ? 'OPEN_PALM'
            : this.gestureWeightA.pinch > 0.4
            ? 'PINCH'
            : 'FREE',
      },
      handB: this.isDualHandActive
        ? {
            x: this.smoothedAnchorB.x,
            y: this.smoothedAnchorB.y,
            z: this.smoothedAnchorB.z,
            gesture:
              this.gestureWeightB.openPalm > 0.4
                ? 'OPEN_PALM'
                : this.gestureWeightB.pinch > 0.4
                ? 'PINCH'
                : 'FREE',
          }
        : null,
    };
  }

  public setPattern(
    target: 'unified' | 'groupA' | 'groupB',
    pattern: ParticlePatternType
  ): void {
    if (target === 'unified') {
      this.unifiedState.setPattern(pattern);
      this.groupAState.setPattern(pattern);
      this.groupBState.setPattern(pattern);
    } else if (target === 'groupA') {
      this.groupAState.setPattern(pattern);
    } else if (target === 'groupB') {
      this.groupBState.setPattern(pattern);
    }
  }

  /**
   * Transforms normalized MediaPipe 3D coordinates [0..1] directly into
   * the visible Three.js viewport dimensions, taking into account aspect ratio and camera projection.
   */
  public mapHandToWorld(
    normX: number,
    normY: number,
    normZ: number,
    isMirrored: boolean = true
  ): { x: number; y: number; z: number } {
    const screenNormX = isMirrored ? (1.0 - normX) : normX;
    const screenNormY = normY;

    const x = (screenNormX - 0.5) * (this.bounds.halfWidth * 2.0);
    const y = (0.5 - screenNormY) * (this.bounds.halfHeight * 2.0);
    const z = -normZ * 20.0;

    return { x, y, z };
  }

  /**
   * Reusable multi-scale divergence-free 3D curl flow field:
   * 70% Large-Scale slow broad movement (k1 = 0.014)
   * 20% Medium-Scale vortex & orbital currents (k2 = 0.030)
   * 10% Small-Scale subtle spatially-coherent turbulence (k3 = 0.060)
   * Guaranteed divergence-free: small position change -> small velocity change;
   * neighboring particles always share coherent fluid velocities.
   */
  public getCurlFlow(
    px: number,
    py: number,
    pz: number,
    t: number
  ): { x: number; y: number; z: number } {
    // Large Scale (70%): slow sweeping streamlines
    const k1 = 0.014;
    const w1 = t * 0.22;
    const lvx = -Math.sin(k1 * py - w1 * 0.7) - Math.cos(k1 * pz + w1 * 0.9);
    const lvy = -Math.sin(k1 * pz - w1 * 0.8) - Math.cos(k1 * px + w1 * 1.1);
    const lvz = -Math.sin(k1 * px - w1) - Math.cos(k1 * py + w1 * 0.75);

    // Medium Scale (20%): secondary loops
    const k2 = 0.030;
    const w2 = t * 0.38;
    const mvx = -Math.sin(k2 * py - w2 * 0.7) - Math.cos(k2 * pz + w2 * 0.9);
    const mvy = -Math.sin(k2 * pz - w2 * 0.8) - Math.cos(k2 * px + w2 * 1.1);
    const mvz = -Math.sin(k2 * px - w2) - Math.cos(k2 * py + w2 * 0.75);

    // Small Scale (10%): fine divergence-free fluid swirls (never noisy)
    const k3 = 0.060;
    const w3 = t * 0.55;
    const svx = -Math.sin(k3 * py - w3 * 0.7) - Math.cos(k3 * pz + w3 * 0.9);
    const svy = -Math.sin(k3 * pz - w3 * 0.8) - Math.cos(k3 * px + w3 * 1.1);
    const svz = -Math.sin(k3 * px - w3) - Math.cos(k3 * py + w3 * 0.75);

    const fx = lvx * 0.70 + mvx * 0.20 + svx * 0.10;
    const fy = lvy * 0.70 + mvy * 0.20 + svy * 0.10;
    const fz = lvz * 0.70 + mvz * 0.20 + svz * 0.10;

    const len = Math.sqrt(fx * fx + fy * fy + fz * fz + 0.0001);
    return { x: fx / len, y: fy / len, z: fz / len };
  }

  /**
   * Main fluid particle simulation step running directly on flat GPU typed arrays.
   * acceleration = baseFlow + vortexFlow + orbitalFlow + cohesion + handForce + handWake + boundaryForce
   * velocity += acceleration * deltaTime
   * velocity *= exp(-damping * deltaTime)
   * position += velocity * deltaTime
   */
  public update(
    dt: number,
    totalCount: number,
    positions: Float32Array,
    velocities: Float32Array,
    colors: Float32Array,
    alphas: Float32Array,
    sizes: Float32Array,
    handState: HandInteractionState | null,
    isMirrored: boolean = true
  ): ParticleInteractionMode {
    // 1. Frame-rate independent physics with safety delta clamping
    const safeDt = Math.max(0.001, Math.min(dt, 0.033));
    this.time += safeDt * this.config.flowSpeed;

    // 2. Extract & process world hands with outlier protection
    const worldHands: WorldHand[] = [];
    if (handState && handState.hands.length > 0) {
      for (const hand of handState.hands) {
        const tip = this.mapHandToWorld(hand.indexTip.x, hand.indexTip.y, hand.indexTip.z, isMirrored);
        const palm = this.mapHandToWorld(hand.palmCenter.x, hand.palmCenter.y, hand.palmCenter.z, isMirrored);

        const scaleX = this.bounds.halfWidth * 2.0;
        const scaleY = this.bounds.halfHeight * 2.0;
        const rawVx = (isMirrored ? -hand.velocity.x : hand.velocity.x) * scaleX;
        const rawVy = -hand.velocity.y * scaleY;
        const rawVz = -hand.velocity.z * 30.0;

        const handSpeed = Math.hypot(rawVx, rawVy, rawVz);
        const maxHandSpd = this.config.maxHandSpeed;
        const clampedVx = handSpeed > maxHandSpd ? (rawVx / handSpeed) * maxHandSpd : rawVx;
        const clampedVy = handSpeed > maxHandSpd ? (rawVy / handSpeed) * maxHandSpd : rawVy;
        const clampedVz = handSpeed > maxHandSpd ? (rawVz / handSpeed) * maxHandSpd : rawVz;

        worldHands.push({
          id: hand.id,
          handedness: hand.handedness,
          tip,
          palm,
          velocity: { x: clampedVx, y: clampedVy, z: clampedVz },
          isOpenPalm: hand.isOpenPalm,
          isPinching: hand.isPinching,
          handScale: hand.handScale,
        });
      }
    }

    // 3. Dual-Hand Stability & Debouncing
    if (worldHands.length >= 2) {
      this.dualHandConfirmFrames++;
      this.singleHandConfirmFrames = 0;
      if (this.dualHandConfirmFrames >= 3) {
        this.isDualHandActive = true;
      }
    } else {
      this.singleHandConfirmFrames++;
      this.dualHandConfirmFrames = 0;
      if (this.singleHandConfirmFrames >= 4) {
        this.isDualHandActive = false;
      }
    }

    // Smooth Partition Weight Transition (Single Universe <-> Dual Groups)
    const partitionTarget = this.isDualHandActive ? 1.0 : 0.0;
    const partitionSpeed = this.isDualHandActive ? 2.8 : 2.0;
    if (this.partitionWeight < partitionTarget) {
      this.partitionWeight = Math.min(partitionTarget, this.partitionWeight + safeDt * partitionSpeed);
    } else if (this.partitionWeight > partitionTarget) {
      this.partitionWeight = Math.max(partitionTarget, this.partitionWeight - safeDt * partitionSpeed);
    }

    // 4. Stable Spatial Assignment for Hand A (Left) and Hand B (Right)
    let handA: WorldHand | null = null;
    let handB: WorldHand | null = null;

    if (worldHands.length === 1) {
      handA = worldHands[0];
    } else if (worldHands.length >= 2) {
      const h0 = worldHands[0];
      const h1 = worldHands[1];
      if (h0.palm.x <= h1.palm.x) {
        handA = h0;
        handB = h1;
      } else {
        handA = h1;
        handB = h0;
      }
    }

    // Outlier Rejection & Snappy Hand Smoothing (Responsive within 1-2 frames)
    const maxHandJump = 160.0;
    const smoothFactor = 1.0 - Math.exp(-safeDt * 48.0);
    const velSmoothFactor = 1.0 - Math.exp(-safeDt * 42.0);
    const gestureSpeed = 1.0 - Math.exp(-safeDt * 38.0);

    if (handA) {
      const targetPos = handA.isOpenPalm ? handA.palm : handA.tip;
      const jumpDist = Math.hypot(
        targetPos.x - this.rawPrevHandA.x,
        targetPos.y - this.rawPrevHandA.y,
        targetPos.z - this.rawPrevHandA.z
      );

      if (jumpDist > maxHandJump) {
        const ratio = maxHandJump / jumpDist;
        targetPos.x = this.rawPrevHandA.x + (targetPos.x - this.rawPrevHandA.x) * ratio;
        targetPos.y = this.rawPrevHandA.y + (targetPos.y - this.rawPrevHandA.y) * ratio;
        targetPos.z = this.rawPrevHandA.z + (targetPos.z - this.rawPrevHandA.z) * ratio;
      }

      this.rawPrevHandA.x = targetPos.x;
      this.rawPrevHandA.y = targetPos.y;
      this.rawPrevHandA.z = targetPos.z;

      this.smoothedAnchorA.x += (targetPos.x - this.smoothedAnchorA.x) * smoothFactor;
      this.smoothedAnchorA.y += (targetPos.y - this.smoothedAnchorA.y) * smoothFactor;
      this.smoothedAnchorA.z += (targetPos.z - this.smoothedAnchorA.z) * smoothFactor;

      this.smoothedVelA.x += (handA.velocity.x - this.smoothedVelA.x) * velSmoothFactor;
      this.smoothedVelA.y += (handA.velocity.y - this.smoothedVelA.y) * velSmoothFactor;
      this.smoothedVelA.z += (handA.velocity.z - this.smoothedVelA.z) * velSmoothFactor;

      const targetPalm = handA.isOpenPalm ? 1.0 : 0.0;
      const targetPinch = handA.isPinching ? 1.0 : 0.0;
      this.gestureWeightA.openPalm += (targetPalm - this.gestureWeightA.openPalm) * gestureSpeed;
      this.gestureWeightA.pinch += (targetPinch - this.gestureWeightA.pinch) * gestureSpeed;
    } else {
      this.gestureWeightA.openPalm = Math.max(0.0, this.gestureWeightA.openPalm - safeDt * 14.0);
      this.gestureWeightA.pinch = Math.max(0.0, this.gestureWeightA.pinch - safeDt * 14.0);
      this.smoothedVelA.x *= 0.85;
      this.smoothedVelA.y *= 0.85;
      this.smoothedVelA.z *= 0.85;
    }

    if (handB) {
      const targetPos = handB.isOpenPalm ? handB.palm : handB.tip;
      const jumpDist = Math.hypot(
        targetPos.x - this.rawPrevHandB.x,
        targetPos.y - this.rawPrevHandB.y,
        targetPos.z - this.rawPrevHandB.z
      );

      if (jumpDist > maxHandJump) {
        const ratio = maxHandJump / jumpDist;
        targetPos.x = this.rawPrevHandB.x + (targetPos.x - this.rawPrevHandB.x) * ratio;
        targetPos.y = this.rawPrevHandB.y + (targetPos.y - this.rawPrevHandB.y) * ratio;
        targetPos.z = this.rawPrevHandB.z + (targetPos.z - this.rawPrevHandB.z) * ratio;
      }

      this.rawPrevHandB.x = targetPos.x;
      this.rawPrevHandB.y = targetPos.y;
      this.rawPrevHandB.z = targetPos.z;

      this.smoothedAnchorB.x += (targetPos.x - this.smoothedAnchorB.x) * smoothFactor;
      this.smoothedAnchorB.y += (targetPos.y - this.smoothedAnchorB.y) * smoothFactor;
      this.smoothedAnchorB.z += (targetPos.z - this.smoothedAnchorB.z) * smoothFactor;

      this.smoothedVelB.x += (handB.velocity.x - this.smoothedVelB.x) * velSmoothFactor;
      this.smoothedVelB.y += (handB.velocity.y - this.smoothedVelB.y) * velSmoothFactor;
      this.smoothedVelB.z += (handB.velocity.z - this.smoothedVelB.z) * velSmoothFactor;

      const targetPalm = handB.isOpenPalm ? 1.0 : 0.0;
      const targetPinch = handB.isPinching ? 1.0 : 0.0;
      this.gestureWeightB.openPalm += (targetPalm - this.gestureWeightB.openPalm) * gestureSpeed;
      this.gestureWeightB.pinch += (targetPinch - this.gestureWeightB.pinch) * gestureSpeed;
    } else {
      this.gestureWeightB.openPalm = Math.max(0.0, this.gestureWeightB.openPalm - safeDt * 14.0);
      this.gestureWeightB.pinch = Math.max(0.0, this.gestureWeightB.pinch - safeDt * 14.0);
      this.smoothedVelB.x *= 0.85;
      this.smoothedVelB.y *= 0.85;
      this.smoothedVelB.z *= 0.85;
    }

    // Unified Anchor & Two-Hand Merging Distance
    let twoHandMergeFactor = 0.0;
    if (worldHands.length === 1) {
      this.smoothedUnifiedAnchor.x += (this.smoothedAnchorA.x - this.smoothedUnifiedAnchor.x) * smoothFactor;
      this.smoothedUnifiedAnchor.y += (this.smoothedAnchorA.y - this.smoothedUnifiedAnchor.y) * smoothFactor;
      this.smoothedUnifiedAnchor.z += (this.smoothedAnchorA.z - this.smoothedUnifiedAnchor.z) * smoothFactor;
    } else if (worldHands.length >= 2) {
      const midX = (this.smoothedAnchorA.x + this.smoothedAnchorB.x) * 0.5;
      const midY = (this.smoothedAnchorA.y + this.smoothedAnchorB.y) * 0.5;
      const midZ = (this.smoothedAnchorA.z + this.smoothedAnchorB.z) * 0.5;
      this.smoothedUnifiedAnchor.x += (midX - this.smoothedUnifiedAnchor.x) * smoothFactor;
      this.smoothedUnifiedAnchor.y += (midY - this.smoothedUnifiedAnchor.y) * smoothFactor;
      this.smoothedUnifiedAnchor.z += (midZ - this.smoothedUnifiedAnchor.z) * smoothFactor;

      const handDist = Math.hypot(
        this.smoothedAnchorA.x - this.smoothedAnchorB.x,
        this.smoothedAnchorA.y - this.smoothedAnchorB.y,
        this.smoothedAnchorA.z - this.smoothedAnchorB.z
      );
      twoHandMergeFactor = Math.max(0.0, Math.min(1.0, 1.0 - (handDist - 16.0) / 22.0));
    }

    // 5. Update Pattern State Progress
    const patternAInfo = this.groupAState.update(safeDt);
    const patternBInfo = this.groupBState.update(safeDt);
    const unifiedPatternInfo = this.unifiedState.update(safeDt);

    // 6. Interaction Mode Telemetry
    if (this.isDualHandActive) {
      this.currentMode = 'DUAL_CONTROL';
    } else if (worldHands.length > 0) {
      const primary = worldHands[0];
      if (primary.isPinching) {
        this.currentMode = 'ATTRACT';
      } else if (primary.isOpenPalm) {
        this.currentMode = 'REPEL';
      } else {
        this.currentMode = 'FREE';
      }
    } else {
      this.currentMode = 'FREE';
    }

    // 7. Simulation Constants & Viewport Extents
    const halfCount = Math.floor(totalCount / 2);
    // Exponential momentum damping: velocity *= exp(-dampingCoeff * dt)
    const dampingCoeff = (1.0 - this.config.damping) * 60.0 + 0.35;
    const damping = Math.exp(-dampingCoeff * safeDt);
    const returnStr = this.config.returnStrength;
    const t = this.time;
    const { primary, secondary, highlight } = this.palette;

    const pWeight = this.partitionWeight;
    const invPWeight = 1.0 - pWeight;

    // Viewport Rectangular Extents (Soft elastic boundary)
    const limitX = this.bounds.halfWidth * 0.94;
    const limitY = this.bounds.halfHeight * 0.94;
    const limitZ = 22.0;

    // -------------------------------------------------------------------------
    // DYNAMIC MOVING VORTEX CENTERS (Instruction 5, 6, 7)
    // Slowly drift through the scene to create living, continuously evolving formations:
    // rosettes, circular rings, orbital bands, and curving ribbons!
    // -------------------------------------------------------------------------
    const vortices: DriftingVortex[] = [
      // Vortex 0: Primary Core Vortex (Atomic Rosette + Concentric Breathing Rings)
      {
        x: Math.sin(t * 0.22) * 6.5,
        y: Math.cos(t * 0.18) * 4.5,
        z: Math.sin(t * 0.14) * 2.5,
        strength: 34.0,
        radius: 54.0,
        axisX: Math.sin(t * 0.12) * 0.12,
        axisY: Math.cos(t * 0.12) * 0.12,
        axisZ: 0.98,
        radialFreq: 0.14,
        radialAmp: 3.2,
        rosetteLobes: 4, // 4-lobed atomic rosette petals (reference frames 00:04-00:06)
        rosetteAmp: 0.28 * Math.sin(t * 0.35),
      },
      // Vortex 1: Upper-Left Orbital Satellite (Clockwise Tilted Stream)
      {
        x: -limitX * 0.44 + Math.sin(t * 0.28) * 8.0,
        y: limitY * 0.40 + Math.cos(t * 0.24) * 6.0,
        z: Math.sin(t * 0.32) * 3.5,
        strength: -24.0,
        radius: 40.0,
        axisX: 0.25,
        axisY: 0.35,
        axisZ: 0.90,
        radialFreq: 0.18,
        radialAmp: 2.2,
        rosetteLobes: 3,
        rosetteAmp: 0.15,
      },
      // Vortex 2: Lower-Right Orbital Satellite (Counter-Clockwise Tilted Stream)
      {
        x: limitX * 0.44 + Math.cos(t * 0.26) * 8.0,
        y: -limitY * 0.40 + Math.sin(t * 0.22) * 6.0,
        z: -Math.sin(t * 0.32) * 3.5,
        strength: 24.0,
        radius: 40.0,
        axisX: -0.25,
        axisY: -0.35,
        axisZ: 0.90,
        radialFreq: 0.18,
        radialAmp: 2.2,
        rosetteLobes: 3,
        rosetteAmp: 0.15,
      },
      // Vortex 3: Dynamic Connecting Ribbon Bridge
      {
        x: Math.sin(t * 0.34) * 14.0,
        y: -limitY * 0.16 + Math.cos(t * 0.28) * 5.0,
        z: Math.cos(t * 0.30) * 4.0,
        strength: 18.0,
        radius: 34.0,
        axisX: 0.1,
        axisY: 0.1,
        axisZ: 0.98,
        radialFreq: 0.12,
        radialAmp: 1.5,
        rosetteLobes: 2,
        rosetteAmp: 0.1,
      },
    ];

    const v0 = vortices[0];
    const flowBaseSpeed = 19.0 * this.config.flowFieldStrength;
    const responseFactor = 3.2; // Spring-like flow response factor (Instruction 14)

    // =========================================================================
    // ZERO-ALLOCATION HIGH PERFORMANCE PARTICLE SIMULATION LOOP
    // =========================================================================
    for (let i = 0; i < totalCount; i++) {
      const i3 = i * 3;
      const isGroupA = i < halfCount;
      const groupLocalIdx = isGroupA ? i : i - halfCount;

      let px = positions[i3];
      let py = positions[i3 + 1];
      let pz = positions[i3 + 2];

      let vx = velocities[i3];
      let vy = velocities[i3 + 1];
      let vz = velocities[i3 + 2];

      // -----------------------------------------------------------------------
      // 1. BASE FLOW (Divergence-Free Multi-Scale Curl Flow) (Instruction 2, 3, 4)
      // -----------------------------------------------------------------------
      const curl = this.getCurlFlow(px, py, pz, t);
      const baseFlowX = curl.x * flowBaseSpeed;
      const baseFlowY = curl.y * flowBaseSpeed;
      const baseFlowZ = curl.z * flowBaseSpeed;

      // -----------------------------------------------------------------------
      // 2. VORTEX & ORBITAL FLOW (Instruction 5, 6, 7)
      // Tangential velocity + Harmonic Radial Velocity across Drifting Centers
      // -----------------------------------------------------------------------
      let vortexFlowX = 0;
      let vortexFlowY = 0;
      let vortexFlowZ = 0;

      for (let vIdx = 0; vIdx < 4; vIdx++) {
        const v = vortices[vIdx];
        const dx = px - v.x;
        const dy = py - v.y;
        const dz = pz - v.z;
        const distSq = dx * dx + dy * dy + dz * dz + 4.0;
        const dist = Math.sqrt(distSq);

        if (dist < v.radius * 2.2) {
          const invDist = 1.0 / dist;
          const falloff = 1.0 / (1.0 + (dist / v.radius) * (dist / v.radius));

          // Tangential direction: cross(axis, offset)
          let tx = v.axisY * dz - v.axisZ * dy;
          let ty = v.axisZ * dx - v.axisX * dz;
          let tz = v.axisX * dy - v.axisY * dx;
          const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz + 0.001);
          tx /= tLen;
          ty /= tLen;
          tz /= tLen;

          // Rosette lobe angle modulation (Instruction 5, 7)
          const angle = Math.atan2(dy, dx);
          const rosetteMod = 1.0 + v.rosetteAmp * Math.cos(v.rosetteLobes * angle - t * 0.45);

          // Tangential velocity component
          const tanSpeed = v.strength * falloff * rosetteMod;
          const vTanX = tx * tanSpeed;
          const vTanY = ty * tanSpeed;
          const vTanZ = tz * tanSpeed;

          // Harmonic radial velocity (creates nested rings and breathing ribbons)
          const radialSpeed = Math.sin(dist * v.radialFreq - t * 0.5) * v.radialAmp * falloff;
          const vRadX = (dx * invDist) * radialSpeed;
          const vRadY = (dy * invDist) * radialSpeed;
          const vRadZ = (dz * invDist) * radialSpeed;

          vortexFlowX += vTanX + vRadX;
          vortexFlowY += vTanY + vRadY;
          vortexFlowZ += vTanZ + vRadZ;
        }
      }

      // -----------------------------------------------------------------------
      // 3. CENTRAL COHESION FORCE (Instruction 8: FLOW + COHESION, NOT GRAVITY BALL)
      // -----------------------------------------------------------------------
      const cdx = v0.x - px;
      const cdy = v0.y - py;
      const cdz = v0.z - pz;
      const cDist = Math.sqrt(cdx * cdx + cdy * cdy + cdz * cdz + 0.001);
      const cohesionMag = 2.2 * Math.tanh(cDist / 48.0);
      const accCohesionX = (cdx / cDist) * cohesionMag;
      const accCohesionY = (cdy / cDist) * cohesionMag;
      const accCohesionZ = (cdz / cDist) * (cohesionMag * 0.7);

      // -----------------------------------------------------------------------
      // 4. SPRING-LIKE FLOW ACCELERATION & INERTIA (Instruction 13, 14)
      // targetVelocity = baseFlow + vortexFlow
      // accelerationFlow = (targetVelocity - velocity) * responseFactor
      // -----------------------------------------------------------------------
      const targetFlowVx = baseFlowX * 0.40 + vortexFlowX * 0.85;
      const targetFlowVy = baseFlowY * 0.40 + vortexFlowY * 0.85;
      const targetFlowVz = baseFlowZ * 0.40 + vortexFlowZ * 0.85;

      const accFlowX = (targetFlowVx - vx) * responseFactor;
      const accFlowY = (targetFlowVy - vy) * responseFactor;
      const accFlowZ = (targetFlowVz - vz) * responseFactor;

      // -----------------------------------------------------------------------
      // 5. PROCEDURAL TARGET SPRING FORCES (if pattern mode active)
      // -----------------------------------------------------------------------
      let accPatternX = 0;
      let accPatternY = 0;
      let accPatternZ = 0;
      const springK = this.config.patternSpringForce;

      if (pWeight > 0.01) {
        const targetBuffer = isGroupA ? this.groupAState.targetBuffer : this.groupBState.targetBuffer;
        const patternInfo = isGroupA ? patternAInfo : patternBInfo;
        const anchor = isGroupA ? this.smoothedAnchorA : this.smoothedAnchorB;

        if (targetBuffer && targetBuffer.length > groupLocalIdx * 3 + 2) {
          const txRaw = targetBuffer[groupLocalIdx * 3];
          const tyRaw = targetBuffer[groupLocalIdx * 3 + 1];
          const tzRaw = targetBuffer[groupLocalIdx * 3 + 2];

          const txRot = txRaw * patternInfo.rotCos - tyRaw * patternInfo.rotSin;
          const tyRot = txRaw * patternInfo.rotSin + tyRaw * patternInfo.rotCos;

          const dualTargetX = anchor.x + txRot;
          const dualTargetY = anchor.y + tyRot;
          const dualTargetZ = anchor.z + tzRaw;

          let targetX = dualTargetX;
          let targetY = dualTargetY;
          let targetZ = dualTargetZ;

          if (pWeight < 0.99 && this.unifiedState.targetBuffer) {
            const uRawX = this.unifiedState.targetBuffer[i3];
            const uRawY = this.unifiedState.targetBuffer[i3 + 1];
            const uRawZ = this.unifiedState.targetBuffer[i3 + 2];
            const uRotX = uRawX * unifiedPatternInfo.rotCos - uRawY * unifiedPatternInfo.rotSin;
            const uRotY = uRawX * unifiedPatternInfo.rotSin + uRawY * unifiedPatternInfo.rotCos;
            const uTargetX = this.smoothedUnifiedAnchor.x + uRotX;
            const uTargetY = this.smoothedUnifiedAnchor.y + uRotY;
            const uTargetZ = this.smoothedUnifiedAnchor.z + uRawZ;

            targetX = dualTargetX * pWeight + uTargetX * invPWeight;
            targetY = dualTargetY * pWeight + uTargetY * invPWeight;
            targetZ = dualTargetZ * pWeight + uTargetZ * invPWeight;
          }

          accPatternX = (targetX - px) * springK * 2.2;
          accPatternY = (targetY - py) * springK * 2.2;
          accPatternZ = (targetZ - pz) * springK * 2.2;
        }
      } else if (this.unifiedState.targetBuffer && this.unifiedState.targetBuffer.length > i3 + 2) {
        const uRawX = this.unifiedState.targetBuffer[i3];
        const uRawY = this.unifiedState.targetBuffer[i3 + 1];
        const uRawZ = this.unifiedState.targetBuffer[i3 + 2];
        const uRotX = uRawX * unifiedPatternInfo.rotCos - uRawY * unifiedPatternInfo.rotSin;
        const uRotY = uRawX * unifiedPatternInfo.rotSin + uRawY * unifiedPatternInfo.rotCos;

        const targetX = this.smoothedUnifiedAnchor.x + uRotX;
        const targetY = this.smoothedUnifiedAnchor.y + uRotY;
        const targetZ = this.smoothedUnifiedAnchor.z + uRawZ;

        accPatternX = (targetX - px) * springK * 2.2;
        accPatternY = (targetY - py) * springK * 2.2;
        accPatternZ = (targetZ - pz) * springK * 2.2;
      }

      // -----------------------------------------------------------------------
      // 6. FAST FLUID HAND INTERACTION (Instruction 16, 17, 18, 19, 20, 21, 22, 23)
      // Directional Wake + Swirling Vortex + Open Palm Repulsion + Pinch Gravity
      // -----------------------------------------------------------------------
      const activeHand = isGroupA ? handA : (handB || (pWeight < 0.2 ? handA : null));
      let activeAnchor = isGroupA ? this.smoothedAnchorA : (handB ? this.smoothedAnchorB : this.smoothedAnchorA);
      let activeVel = isGroupA ? this.smoothedVelA : (handB ? this.smoothedVelB : this.smoothedVelA);
      let activeGestures = isGroupA ? this.gestureWeightA : (handB ? this.gestureWeightB : this.gestureWeightA);

      // Two-Hand Merging: When hands come close together, smoothly interpolate anchors & forces
      if (twoHandMergeFactor > 0.01 && handA && handB) {
        const midAnchorX = (this.smoothedAnchorA.x + this.smoothedAnchorB.x) * 0.5;
        const midAnchorY = (this.smoothedAnchorA.y + this.smoothedAnchorB.y) * 0.5;
        const midAnchorZ = (this.smoothedAnchorA.z + this.smoothedAnchorB.z) * 0.5;
        const midVelX = (this.smoothedVelA.x + this.smoothedVelB.x) * 0.5;
        const midVelY = (this.smoothedVelA.y + this.smoothedVelB.y) * 0.5;
        const midVelZ = (this.smoothedVelA.z + this.smoothedVelB.z) * 0.5;

        activeAnchor = {
          x: activeAnchor.x * (1.0 - twoHandMergeFactor) + midAnchorX * twoHandMergeFactor,
          y: activeAnchor.y * (1.0 - twoHandMergeFactor) + midAnchorY * twoHandMergeFactor,
          z: activeAnchor.z * (1.0 - twoHandMergeFactor) + midAnchorZ * twoHandMergeFactor,
        };
        activeVel = {
          x: activeVel.x * (1.0 - twoHandMergeFactor) + midVelX * twoHandMergeFactor,
          y: activeVel.y * (1.0 - twoHandMergeFactor) + midVelY * twoHandMergeFactor,
          z: activeVel.z * (1.0 - twoHandMergeFactor) + midVelZ * twoHandMergeFactor,
        };
        activeGestures = {
          openPalm: Math.max(this.gestureWeightA.openPalm, this.gestureWeightB.openPalm),
          pinch: Math.max(this.gestureWeightA.pinch, this.gestureWeightB.pinch),
        };
      }

      let accWakeX = 0;
      let accWakeY = 0;
      let accWakeZ = 0;

      let accHandForceX = 0;
      let accHandForceY = 0;
      let accHandForceZ = 0;

      let minHandDist = 9999;

      if (activeHand) {
        const hdx = px - activeAnchor.x;
        const hdy = py - activeAnchor.y;
        const hdz = pz - activeAnchor.z;
        const distSq = hdx * hdx + hdy * hdy + hdz * hdz + 0.0001;
        const dist = Math.sqrt(distSq);
        minHandDist = dist;

        const invDist = 1.0 / dist;
        const dirX = hdx * invDist;
        const dirY = hdy * invDist;
        const dirZ = hdz * invDist;

        // Tangential Swirl / Vortex Vector around the hand
        const swirlX = -dirY;
        const swirlY = dirX;

        // 6A. Directional Fluid Velocity Wake (Instruction 18)
        const wakeRadius = this.config.fingertipInfluenceRadius * 1.5;
        if (dist < wakeRadius) {
          const wakeFactor = Math.pow(1.0 - dist / wakeRadius, 1.4);
          const wakeStrength = this.config.fluidWakeForce;

          accWakeX += activeVel.x * wakeFactor * wakeStrength * 1.35;
          accWakeY += activeVel.y * wakeFactor * wakeStrength * 1.35;
          accWakeZ += activeVel.z * wakeFactor * wakeStrength * 1.35;

          // Tangential curl around moving hand creates swirling trailing vortices
          const handSpeed = Math.hypot(activeVel.x, activeVel.y);
          if (handSpeed > 1.0) {
            const curlAmt = Math.min(1.0, handSpeed / 28.0) * this.config.vortexForce * 0.75;
            accWakeX += swirlX * wakeFactor * curlAmt * 1.2;
            accWakeY += swirlY * wakeFactor * curlAmt * 1.2;
          }
        }

        // 6B. OPEN_PALM: Strong Local Fluid Dispersion Wave (Instruction 19)
        if (activeGestures.openPalm > 0.01) {
          const repelRadius = this.config.handRepelRadius;
          if (dist < repelRadius) {
            const factor = Math.pow(1.0 - dist / repelRadius, 1.35);
            const repelF = factor * this.config.handRepelForce * activeGestures.openPalm;

            accHandForceX += dirX * repelF * 1.8;
            accHandForceY += dirY * repelF * 1.8;
            accHandForceZ += dirZ * repelF * 0.9;

            // Fluid curl around perimeter of palm
            accHandForceX += swirlX * repelF * 0.45;
            accHandForceY += swirlY * repelF * 0.45;
          }
        }

        // 6C. PINCH: Local Attractor + Vortex (Instruction 20: Magnetic Attraction + Swirling Vortex)
        if (activeGestures.pinch > 0.01) {
          const attractRadius = this.config.handAttractRadius;
          if (dist < attractRadius) {
            const factor = Math.pow(1.0 - dist / attractRadius, 1.3);
            const attractF = factor * this.config.handAttractForce * activeGestures.pinch;
            const vortexStrength = factor * this.config.vortexForce * 2.2 * activeGestures.pinch;

            // Inward magnetic pull toward pinch point
            accHandForceX -= dirX * attractF * 1.9;
            accHandForceY -= dirY * attractF * 1.9;
            accHandForceZ -= dirZ * attractF * 0.95;

            // Fast swirling orbital vortex around pinch point
            accHandForceX += swirlX * vortexStrength * 1.8;
            accHandForceY += swirlY * vortexStrength * 1.8;
          }
        }
      }

      // -----------------------------------------------------------------------
      // 7. SOFT BOUNDARY RESTORING FORCE (Instruction 24: No hard bounce, soft curve)
      // -----------------------------------------------------------------------
      let accBoundX = 0;
      let accBoundY = 0;
      let accBoundZ = 0;

      const boundMarginX = limitX * 0.88;
      if (Math.abs(px) > boundMarginX) {
        const pen = (Math.abs(px) - boundMarginX) / (limitX - boundMarginX);
        const force = Math.pow(Math.min(2.0, pen), 1.8) * returnStr * 60.0;
        accBoundX -= Math.sign(px) * force;
        // Tangent deflection curving gracefully along boundary
        accBoundY += Math.sign(px) * (py > 0 ? -1 : 1) * force * 0.28;
      }

      const boundMarginY = limitY * 0.88;
      if (Math.abs(py) > boundMarginY) {
        const pen = (Math.abs(py) - boundMarginY) / (limitY - boundMarginY);
        const force = Math.pow(Math.min(2.0, pen), 1.8) * returnStr * 60.0;
        accBoundY -= Math.sign(py) * force;
        accBoundX += Math.sign(py) * (px > 0 ? -1 : 1) * force * 0.28;
      }

      if (Math.abs(pz) > limitZ) {
        const pen = Math.abs(pz) - limitZ;
        accBoundZ -= Math.sign(pz) * pen * returnStr * 60.0;
      }

      // -----------------------------------------------------------------------
      // 8. FINAL ACCELERATION INTEGRATION & MOMENTUM (Instruction 1, 13)
      // acceleration = baseFlow + vortexFlow + orbitalFlow + cohesion + handForce + handWake + boundaryForce
      // -----------------------------------------------------------------------
      const accTotalX = accFlowX + accCohesionX + accWakeX + accHandForceX + accBoundX + accPatternX;
      const accTotalY = accFlowY + accCohesionY + accWakeY + accHandForceY + accBoundY + accPatternY;
      const accTotalZ = accFlowZ + accCohesionZ + accWakeZ + accHandForceZ + accBoundZ + accPatternZ;

      vx += accTotalX * safeDt;
      vy += accTotalY * safeDt;
      vz += accTotalZ * safeDt;

      // Moderate damping preserving particle momentum & fluid glide
      vx *= damping;
      vy *= damping;
      vz *= damping;

      const speedSq = vx * vx + vy * vy + vz * vz;
      const maxVel = this.config.maxVelocity;
      if (speedSq > maxVel * maxVel) {
        const invSpeed = maxVel / Math.sqrt(speedSq);
        vx *= invSpeed;
        vy *= invSpeed;
        vz *= invSpeed;
      }

      // -----------------------------------------------------------------------
      // 9. CONTINUOUS POSITION INTEGRATION (No direct teleportation, no per-frame jitter)
      // -----------------------------------------------------------------------
      px += vx * safeDt;
      py += vy * safeDt;
      pz += vz * safeDt;

      positions[i3] = px;
      positions[i3 + 1] = py;
      positions[i3 + 2] = pz;

      velocities[i3] = vx;
      velocities[i3 + 1] = vy;
      velocities[i3 + 2] = vz;

      // -----------------------------------------------------------------------
      // 10. COLOR, RADIANCE & LUMINOUS ENERGY MODULATION (Instruction 26, 27)
      // White core + cyan/teal + subtle purple + subtle green, additive radiance
      // -----------------------------------------------------------------------
      const currentSpeed = Math.sqrt(speedSq);
      const speedNorm = Math.min(1.0, currentSpeed / 20.0);
      const proximityNorm = Math.max(0.0, 1.0 - minHandDist / 36.0);

      const groupHueOffset = isGroupA ? 0.0 : (pWeight * 0.28);
      const blendA = ((Math.sin(i * 0.04 + t * 0.45 + groupHueOffset) + 1.0) * 0.5);

      let r = primary[0] * blendA + secondary[0] * (1.0 - blendA);
      let g = primary[1] * blendA + secondary[1] * (1.0 - blendA);
      let b = primary[2] * blendA + secondary[2] * (1.0 - blendA);

      // Fast streaming particles and particles near hands ignite with pure white star-core heat
      if (speedNorm > 0.05 || proximityNorm > 0.05) {
        const energeticWeight = Math.max(speedNorm, proximityNorm);
        r = r * (1.0 - energeticWeight) + highlight[0] * energeticWeight;
        g = g * (1.0 - energeticWeight) + highlight[1] * energeticWeight;
        b = b * (1.0 - energeticWeight) + highlight[2] * energeticWeight;
      }

      colors[i3] = r;
      colors[i3 + 1] = g;
      colors[i3 + 2] = b;

      const baseAlpha = 0.58 + 0.35 * Math.sin(i * 0.08 + t);
      alphas[i] = Math.min(1.0, baseAlpha + speedNorm * 0.45 + proximityNorm * 0.45);
    }

    return this.currentMode;
  }
}
