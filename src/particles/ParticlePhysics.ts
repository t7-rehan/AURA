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
  private singleHandLossFrames = 0;

  // Hand Anchors in World Space with Snappy Exponential Response (<20ms latency)
  private smoothedAnchorA = { x: -25, y: 0, z: 0 };
  private smoothedAnchorB = { x: 25, y: 0, z: 0 };
  private smoothedUnifiedAnchor = { x: 0, y: 0, z: 0 };

  // Hand Positions for Physical Delta Velocity Tracking
  private prevHandPosA = { x: -25, y: 0, z: 0 };
  private prevHandPosB = { x: 25, y: 0, z: 0 };
  private hasPrevHandA = false;
  private hasPrevHandB = false;

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
   * Camera NDC Ray Unprojection:
   * Maps normalized MediaPipe coordinates [0..1] directly through the Three.js
   * perspective camera frustum (fov=60°, pos=(0,0,115)) onto world space at depth z.
   * Hand tip and palm in world space align directly with the screen ray under the hand.
   */
  public mapHandToWorld(
    normX: number,
    normY: number,
    normZ: number,
    isMirrored: boolean = true
  ): { x: number; y: number; z: number } {
    const screenNormX = isMirrored ? (1.0 - normX) : normX;
    const screenNormY = normY;

    // Normalized Device Coordinates in [-1, 1]
    const ndcX = (screenNormX - 0.5) * 2.0;
    const ndcY = (0.5 - screenNormY) * 2.0;

    // Hand depth mapped relative to world z=0 plane
    const z = Math.max(-25.0, Math.min(25.0, -normZ * 25.0));

    // Perspective camera at (0, 0, 115) with vertical FOV 60°:
    // tan(30°) = 0.5773502691896257
    const dist = 115.0 - z;
    const halfH = 0.5773502691896257 * dist;
    const aspect = this.bounds.halfWidth / Math.max(1.0, this.bounds.halfHeight);
    const halfW = halfH * aspect;

    const x = ndcX * halfW;
    const y = ndcY * halfH;

    return { x, y, z };
  }

  /**
   * Reusable multi-scale divergence-free 3D curl flow field:
   * 80% Large-Scale slow broad movement (k1 = 0.012)
   * 20% Medium-Scale braided current (k2 = 0.024)
   * Zero high-frequency noise: small position change -> small velocity change;
   * neighboring particles always share coherent laminar fluid velocities.
   */
  public getCurlFlow(
    px: number,
    py: number,
    pz: number,
    t: number
  ): { x: number; y: number; z: number } {
    // Large Scale (80%): sweeping streamlines
    const k1 = 0.012;
    const w1 = t * 0.16;
    const lvx = -Math.sin(k1 * py - w1 * 0.7) - Math.cos(k1 * pz + w1 * 0.9);
    const lvy = -Math.sin(k1 * pz - w1 * 0.8) - Math.cos(k1 * px + w1 * 1.1);
    const lvz = -Math.sin(k1 * px - w1) - Math.cos(k1 * py + w1 * 0.75);

    // Medium Scale (20%): braided secondary currents
    const k2 = 0.024;
    const w2 = t * 0.28;
    const mvx = -Math.sin(k2 * py - w2 * 0.7) - Math.cos(k2 * pz + w2 * 0.9);
    const mvy = -Math.sin(k2 * pz - w2 * 0.8) - Math.cos(k2 * px + w2 * 1.1);
    const mvz = -Math.sin(k2 * px - w2) - Math.cos(k2 * py + w2 * 0.75);

    const fx = lvx * 0.80 + mvx * 0.20;
    const fy = lvy * 0.80 + mvy * 0.20;
    const fz = lvz * 0.80 + mvz * 0.20;

    const len = Math.sqrt(fx * fx + fy * fy + fz * fz + 0.0001);
    return { x: fx / len, y: fy / len, z: fz / len };
  }

  /**
   * Main fluid particle simulation step running directly on flat GPU typed arrays.
   * acceleration = baseFlow + vortexFlow + cohesion + handForce + handWake + boundaryForce
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

    // 2. Extract & process world hands with persistent identity & low latency
    let handA: WorldHand | null = null;
    let handB: WorldHand | null = null;

    if (handState && handState.hands.length > 0) {
      const currentHands: WorldHand[] = [];
      for (const hand of handState.hands) {
        const tip = this.mapHandToWorld(hand.indexTip.x, hand.indexTip.y, hand.indexTip.z, isMirrored);
        const palm = this.mapHandToWorld(hand.palmCenter.x, hand.palmCenter.y, hand.palmCenter.z, isMirrored);

        currentHands.push({
          id: hand.id,
          handedness: hand.handedness,
          tip,
          palm,
          velocity: { x: 0, y: 0, z: 0 },
          isOpenPalm: hand.isOpenPalm,
          isPinching: hand.isPinching,
          handScale: hand.handScale,
        });
      }

      if (currentHands.length === 1) {
        handA = currentHands[0];
      } else if (currentHands.length >= 2) {
        // Persistent identity: MediaPipe handedness determines Group A (Left) / Group B (Right).
        const leftCandidate = currentHands.find((h) => h.handedness === 'Left');
        const rightCandidate = currentHands.find((h) => h.handedness === 'Right');

        if (leftCandidate && rightCandidate && leftCandidate !== rightCandidate) {
          handA = leftCandidate;
          handB = rightCandidate;
        } else {
          // Handedness ambiguous or duplicate: use spatial hysteresis against last known anchors
          const d0A = Math.hypot(
            currentHands[0].palm.x - this.smoothedAnchorA.x,
            currentHands[0].palm.y - this.smoothedAnchorA.y
          );
          const d1A = Math.hypot(
            currentHands[1].palm.x - this.smoothedAnchorA.x,
            currentHands[1].palm.y - this.smoothedAnchorA.y
          );
          if (d0A <= d1A) {
            handA = currentHands[0];
            handB = currentHands[1];
          } else {
            handA = currentHands[1];
            handB = currentHands[0];
          }
        }
      }
    }

    // 3. Dual-Hand Activation without delay (zero debounce delay)
    const hasTwoHands = handA !== null && handB !== null;
    if (hasTwoHands) {
      this.isDualHandActive = true;
      this.singleHandLossFrames = 0;
    } else {
      this.singleHandLossFrames++;
      if (this.singleHandLossFrames >= 2) {
        this.isDualHandActive = false;
      }
    }

    // Smooth Partition Weight Transition (Single Universe <-> Dual Groups)
    const partitionTarget = this.isDualHandActive ? 1.0 : 0.0;
    const partitionSpeed = safeDt * 4.5;
    if (this.partitionWeight < partitionTarget) {
      this.partitionWeight = Math.min(partitionTarget, this.partitionWeight + partitionSpeed);
    } else if (this.partitionWeight > partitionTarget) {
      this.partitionWeight = Math.max(partitionTarget, this.partitionWeight - partitionSpeed);
    }

    // Snappy Hand Smoothing & Delta Velocity Tracking (< 20ms response)
    const maxHandJump = 180.0;
    const smoothFactor = 1.0 - Math.exp(-safeDt * 55.0);
    const velSmoothFactor = 1.0 - Math.exp(-safeDt * 45.0);
    const gestureSpeed = 1.0 - Math.exp(-safeDt * 40.0);

    if (handA) {
      const targetPos = handA.isOpenPalm ? handA.palm : handA.tip;
      const jumpDist = Math.hypot(
        targetPos.x - this.prevHandPosA.x,
        targetPos.y - this.prevHandPosA.y,
        targetPos.z - this.prevHandPosA.z
      );

      if (jumpDist > maxHandJump && this.hasPrevHandA) {
        const ratio = maxHandJump / jumpDist;
        targetPos.x = this.prevHandPosA.x + (targetPos.x - this.prevHandPosA.x) * ratio;
        targetPos.y = this.prevHandPosA.y + (targetPos.y - this.prevHandPosA.y) * ratio;
        targetPos.z = this.prevHandPosA.z + (targetPos.z - this.prevHandPosA.z) * ratio;
      }

      if (this.hasPrevHandA) {
        const rawVx = (targetPos.x - this.prevHandPosA.x) / safeDt;
        const rawVy = (targetPos.y - this.prevHandPosA.y) / safeDt;
        const rawVz = (targetPos.z - this.prevHandPosA.z) / safeDt;
        const spd = Math.hypot(rawVx, rawVy, rawVz);
        const maxSpd = this.config.maxHandSpeed;
        const scale = spd > maxSpd ? maxSpd / spd : 1.0;
        this.smoothedVelA.x += (rawVx * scale - this.smoothedVelA.x) * velSmoothFactor;
        this.smoothedVelA.y += (rawVy * scale - this.smoothedVelA.y) * velSmoothFactor;
        this.smoothedVelA.z += (rawVz * scale - this.smoothedVelA.z) * velSmoothFactor;
      } else {
        this.hasPrevHandA = true;
      }

      this.prevHandPosA.x = targetPos.x;
      this.prevHandPosA.y = targetPos.y;
      this.prevHandPosA.z = targetPos.z;

      this.smoothedAnchorA.x += (targetPos.x - this.smoothedAnchorA.x) * smoothFactor;
      this.smoothedAnchorA.y += (targetPos.y - this.smoothedAnchorA.y) * smoothFactor;
      this.smoothedAnchorA.z += (targetPos.z - this.smoothedAnchorA.z) * smoothFactor;

      const targetPalm = handA.isOpenPalm ? 1.0 : 0.0;
      const targetPinch = handA.isPinching ? 1.0 : 0.0;
      this.gestureWeightA.openPalm += (targetPalm - this.gestureWeightA.openPalm) * gestureSpeed;
      this.gestureWeightA.pinch += (targetPinch - this.gestureWeightA.pinch) * gestureSpeed;
    } else {
      this.hasPrevHandA = false;
      this.gestureWeightA.openPalm = Math.max(0.0, this.gestureWeightA.openPalm - safeDt * 12.0);
      this.gestureWeightA.pinch = Math.max(0.0, this.gestureWeightA.pinch - safeDt * 12.0);
      this.smoothedVelA.x *= 0.85;
      this.smoothedVelA.y *= 0.85;
      this.smoothedVelA.z *= 0.85;
    }

    if (handB) {
      const targetPos = handB.isOpenPalm ? handB.palm : handB.tip;
      const jumpDist = Math.hypot(
        targetPos.x - this.prevHandPosB.x,
        targetPos.y - this.prevHandPosB.y,
        targetPos.z - this.prevHandPosB.z
      );

      if (jumpDist > maxHandJump && this.hasPrevHandB) {
        const ratio = maxHandJump / jumpDist;
        targetPos.x = this.prevHandPosB.x + (targetPos.x - this.prevHandPosB.x) * ratio;
        targetPos.y = this.prevHandPosB.y + (targetPos.y - this.prevHandPosB.y) * ratio;
        targetPos.z = this.prevHandPosB.z + (targetPos.z - this.prevHandPosB.z) * ratio;
      }

      if (this.hasPrevHandB) {
        const rawVx = (targetPos.x - this.prevHandPosB.x) / safeDt;
        const rawVy = (targetPos.y - this.prevHandPosB.y) / safeDt;
        const rawVz = (targetPos.z - this.prevHandPosB.z) / safeDt;
        const spd = Math.hypot(rawVx, rawVy, rawVz);
        const maxSpd = this.config.maxHandSpeed;
        const scale = spd > maxSpd ? maxSpd / spd : 1.0;
        this.smoothedVelB.x += (rawVx * scale - this.smoothedVelB.x) * velSmoothFactor;
        this.smoothedVelB.y += (rawVy * scale - this.smoothedVelB.y) * velSmoothFactor;
        this.smoothedVelB.z += (rawVz * scale - this.smoothedVelB.z) * velSmoothFactor;
      } else {
        this.hasPrevHandB = true;
      }

      this.prevHandPosB.x = targetPos.x;
      this.prevHandPosB.y = targetPos.y;
      this.prevHandPosB.z = targetPos.z;

      this.smoothedAnchorB.x += (targetPos.x - this.smoothedAnchorB.x) * smoothFactor;
      this.smoothedAnchorB.y += (targetPos.y - this.smoothedAnchorB.y) * smoothFactor;
      this.smoothedAnchorB.z += (targetPos.z - this.smoothedAnchorB.z) * smoothFactor;

      const targetPalm = handB.isOpenPalm ? 1.0 : 0.0;
      const targetPinch = handB.isPinching ? 1.0 : 0.0;
      this.gestureWeightB.openPalm += (targetPalm - this.gestureWeightB.openPalm) * gestureSpeed;
      this.gestureWeightB.pinch += (targetPinch - this.gestureWeightB.pinch) * gestureSpeed;
    } else {
      this.hasPrevHandB = false;
      this.gestureWeightB.openPalm = Math.max(0.0, this.gestureWeightB.openPalm - safeDt * 12.0);
      this.gestureWeightB.pinch = Math.max(0.0, this.gestureWeightB.pinch - safeDt * 12.0);
      this.smoothedVelB.x *= 0.85;
      this.smoothedVelB.y *= 0.85;
      this.smoothedVelB.z *= 0.85;
    }

    // Unified Anchor & Two-Hand Proximity Merging (<15% viewport distance)
    let twoHandMergeFactor = 0.0;
    const viewMetric = Math.min(this.bounds.width, this.bounds.height);
    const mergeThreshold = viewMetric * 0.28;
    const mergeFullDist = viewMetric * 0.10;

    if (this.isDualHandActive && handA && handB) {
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
      if (handDist < mergeThreshold) {
        twoHandMergeFactor = Math.max(
          0.0,
          Math.min(1.0, 1.0 - (handDist - mergeFullDist) / (mergeThreshold - mergeFullDist))
        );
      }
    } else if (handA) {
      this.smoothedUnifiedAnchor.x += (this.smoothedAnchorA.x - this.smoothedUnifiedAnchor.x) * smoothFactor;
      this.smoothedUnifiedAnchor.y += (this.smoothedAnchorA.y - this.smoothedUnifiedAnchor.y) * smoothFactor;
      this.smoothedUnifiedAnchor.z += (this.smoothedAnchorA.z - this.smoothedUnifiedAnchor.z) * smoothFactor;
    }

    // 4. Update Pattern State Progress (if an explicit pattern was requested)
    const patternAInfo = this.groupAState.update(safeDt);
    const patternBInfo = this.groupBState.update(safeDt);
    const unifiedPatternInfo = this.unifiedState.update(safeDt);

    // 5. Interaction Mode Telemetry
    if (this.isDualHandActive) {
      this.currentMode = 'DUAL_CONTROL';
    } else if (handA) {
      if (this.gestureWeightA.pinch > 0.4) {
        this.currentMode = 'ATTRACT';
      } else if (this.gestureWeightA.openPalm > 0.4) {
        this.currentMode = 'REPEL';
      } else {
        this.currentMode = 'FREE';
      }
    } else {
      this.currentMode = 'FREE';
    }

    // 6. Simulation Constants & Viewport Extents
    const halfCount = Math.floor(totalCount / 2);
    // Momentum damping preserving fluid glide
    const dampingCoeff = (1.0 - this.config.damping) * 60.0 + 0.28;
    const damping = Math.exp(-dampingCoeff * safeDt);
    const returnStr = this.config.returnStrength;
    const t = this.time;
    const { primary, secondary, highlight } = this.palette;

    const pWeight = this.partitionWeight;
    const invPWeight = 1.0 - pWeight;

    // Viewport Soft Restoring Boundaries
    const limitX = this.bounds.halfWidth * 0.94;
    const limitY = this.bounds.halfHeight * 0.94;
    const limitZ = 24.0;

    // -------------------------------------------------------------------------
    // AUTONOMOUS FLUID VORTICES
    // 1 dominant central vortex that precesses slowly + 2 gentle satellites.
    // Clean Lamb-Oseen tangential profiles (NO radial sine blast waves).
    // -------------------------------------------------------------------------
    const vortices: DriftingVortex[] = [
      // Primary Dominant Central Vortex (Atomic Core / Precessing Eye)
      {
        x: Math.sin(t * 0.16) * 7.5,
        y: Math.cos(t * 0.13) * 5.5,
        z: Math.sin(t * 0.10) * 2.5,
        strength: 28.0,
        radius: 24.0,
        axisX: Math.sin(t * 0.08) * 0.12,
        axisY: Math.cos(t * 0.08) * 0.12,
        axisZ: 0.98,
      },
      // Satellite 1: Upper-Left Gentle Orbital Stream (~18% strength)
      {
        x: -limitX * 0.42 + Math.sin(t * 0.22) * 7.0,
        y: limitY * 0.38 + Math.cos(t * 0.19) * 5.0,
        z: Math.sin(t * 0.25) * 3.0,
        strength: -5.5,
        radius: 32.0,
        axisX: 0.2,
        axisY: 0.3,
        axisZ: 0.93,
      },
      // Satellite 2: Lower-Right Gentle Orbital Stream (~18% strength)
      {
        x: limitX * 0.42 + Math.cos(t * 0.20) * 7.0,
        y: -limitY * 0.38 + Math.sin(t * 0.18) * 5.0,
        z: -Math.sin(t * 0.25) * 3.0,
        strength: 5.5,
        radius: 32.0,
        axisX: -0.2,
        axisY: -0.3,
        axisZ: 0.93,
      },
    ];

    const v0 = vortices[0];
    const flowBaseSpeed = 22.0 * this.config.flowFieldStrength;
    const responseFactor = 2.8; // Inertia-preserving fluid adherence

    // Natural fluid extent radius for gentle cohesion (zero inward force inside)
    const fluidRestRadius = Math.min(limitX, limitY) * 0.68;

    // Pre-calculate dual-hand mid properties for figure-8 binary star vortex
    const midX = (this.smoothedAnchorA.x + this.smoothedAnchorB.x) * 0.5;
    const midY = (this.smoothedAnchorA.y + this.smoothedAnchorB.y) * 0.5;
    const midZ = (this.smoothedAnchorA.z + this.smoothedAnchorB.z) * 0.5;

    // Check if patterns are requested
    const hasPatternA = this.groupAState.pattern !== 'FREE' && this.groupAState.targetBuffer !== null;
    const hasPatternB = this.groupBState.pattern !== 'FREE' && this.groupBState.targetBuffer !== null;
    const hasPatternUnified =
      this.unifiedState.pattern !== 'FREE' && this.unifiedState.targetBuffer !== null;

    // =========================================================================
    // ZERO-ALLOCATION HIGH PERFORMANCE SIMULATION LOOP
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
      // 1. BASE DIVERGENCE-FREE FLOW FIELD
      // -----------------------------------------------------------------------
      const curl = this.getCurlFlow(px, py, pz, t);
      const baseFlowX = curl.x * flowBaseSpeed;
      const baseFlowY = curl.y * flowBaseSpeed;
      const baseFlowZ = curl.z * flowBaseSpeed;

      // -----------------------------------------------------------------------
      // 2. VORTICES & ORBITAL FLOW (Lamb-Oseen Profile, Smooth Tangential Circulation)
      // -----------------------------------------------------------------------
      let vortexFlowX = 0;
      let vortexFlowY = 0;
      let vortexFlowZ = 0;

      for (let vIdx = 0; vIdx < 3; vIdx++) {
        const v = vortices[vIdx];
        const dx = px - v.x;
        const dy = py - v.y;
        const dz = pz - v.z;
        const distSq = dx * dx + dy * dy + dz * dz + 0.001;
        const dist = Math.sqrt(distSq);

        if (dist < v.radius * 2.5) {
          // Tangential direction: cross(axis, offset)
          let tx = v.axisY * dz - v.axisZ * dy;
          let ty = v.axisZ * dx - v.axisX * dz;
          let tz = v.axisX * dy - v.axisY * dx;
          const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz + 0.0001);
          tx /= tLen;
          ty /= tLen;
          tz /= tLen;

          // Lamb-Oseen profile: v_tan = (Gamma * r) / (r0^2 + r^2)
          const tanSpeed = (v.strength * dist) / (v.radius * v.radius + distSq);
          vortexFlowX += tx * tanSpeed;
          vortexFlowY += ty * tanSpeed;
          vortexFlowZ += tz * tanSpeed;
        }
      }

      // -----------------------------------------------------------------------
      // 3. GENTLE RESTORING COHESION (Zero inside fluid radius, soft restoring outside)
      // -----------------------------------------------------------------------
      const cdx = v0.x - px;
      const cdy = v0.y - py;
      const cdz = v0.z - pz;
      const cDist = Math.sqrt(cdx * cdx + cdy * cdy + cdz * cdz + 0.001);
      let accCohesionX = 0;
      let accCohesionY = 0;
      let accCohesionZ = 0;

      if (cDist > fluidRestRadius) {
        const excess = (cDist - fluidRestRadius) / 30.0;
        const cohesionMag = 2.4 * Math.tanh(excess);
        const invCDist = 1.0 / cDist;
        accCohesionX = cdx * invCDist * cohesionMag;
        accCohesionY = cdy * invCDist * cohesionMag;
        accCohesionZ = cdz * invCDist * (cohesionMag * 0.6);
      }

      // -----------------------------------------------------------------------
      // 4. FLUID ADHERENCE & MOMENTUM INERTIA
      // targetVelocity = baseFlow + vortexFlow
      // a_flow = (targetVelocity - velocity) * responseFactor
      // -----------------------------------------------------------------------
      const targetFlowVx = baseFlowX * 0.45 + vortexFlowX * 0.85;
      const targetFlowVy = baseFlowY * 0.45 + vortexFlowY * 0.85;
      const targetFlowVz = baseFlowZ * 0.45 + vortexFlowZ * 0.85;

      const accFlowX = (targetFlowVx - vx) * responseFactor;
      const accFlowY = (targetFlowVy - vy) * responseFactor;
      const accFlowZ = (targetFlowVz - vz) * responseFactor;

      // -----------------------------------------------------------------------
      // 5. PROCEDURAL PATTERN SPRINGS (ONLY active when explicit shape requested)
      // In 'FREE' flow, accPattern is strictly 0.
      // -----------------------------------------------------------------------
      let accPatternX = 0;
      let accPatternY = 0;
      let accPatternZ = 0;

      if (pWeight > 0.01 && (hasPatternA || hasPatternB)) {
        const targetBuffer = isGroupA ? this.groupAState.targetBuffer : this.groupBState.targetBuffer;
        const patternInfo = isGroupA ? patternAInfo : patternBInfo;
        const anchor = isGroupA ? this.smoothedAnchorA : this.smoothedAnchorB;
        const springK = this.config.patternSpringForce;

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

          if (pWeight < 0.99 && hasPatternUnified && this.unifiedState.targetBuffer) {
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

          accPatternX = (targetX - px) * springK;
          accPatternY = (targetY - py) * springK;
          accPatternZ = (targetZ - pz) * springK;
        }
      } else if (hasPatternUnified && this.unifiedState.targetBuffer) {
        const uRawX = this.unifiedState.targetBuffer[i3];
        const uRawY = this.unifiedState.targetBuffer[i3 + 1];
        const uRawZ = this.unifiedState.targetBuffer[i3 + 2];
        const uRotX = uRawX * unifiedPatternInfo.rotCos - uRawY * unifiedPatternInfo.rotSin;
        const uRotY = uRawX * unifiedPatternInfo.rotSin + uRawY * unifiedPatternInfo.rotCos;

        const targetX = this.smoothedUnifiedAnchor.x + uRotX;
        const targetY = this.smoothedUnifiedAnchor.y + uRotY;
        const targetZ = this.smoothedUnifiedAnchor.z + uRawZ;

        const springK = this.config.patternSpringForce;
        accPatternX = (targetX - px) * springK;
        accPatternY = (targetY - py) * springK;
        accPatternZ = (targetZ - pz) * springK;
      }

      // -----------------------------------------------------------------------
      // 6. HAND FORCES & VELOCITY WAKE
      // -----------------------------------------------------------------------
      // Group A follows Left hand; Group B follows Right hand.
      // When single hand is active, both groups interact with it.
      const activeHand = isGroupA ? handA : (handB || (pWeight < 0.1 ? handA : null));
      let activeAnchor = isGroupA ? this.smoothedAnchorA : (handB ? this.smoothedAnchorB : this.smoothedAnchorA);
      let activeVel = isGroupA ? this.smoothedVelA : (handB ? this.smoothedVelB : this.smoothedVelA);
      let activeGestures = isGroupA ? this.gestureWeightA : (handB ? this.gestureWeightB : this.gestureWeightA);

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

        // 6A. Physical Hand Velocity Wake: pushes fluid directly along hand motion
        const wakeRadius = this.config.fingertipInfluenceRadius * 1.5;
        if (dist < wakeRadius) {
          const wakeFactor = Math.pow(1.0 - dist / wakeRadius, 1.4);
          const wakeStrength = this.config.fluidWakeForce;

          accWakeX += activeVel.x * wakeFactor * wakeStrength * 0.9;
          accWakeY += activeVel.y * wakeFactor * wakeStrength * 0.9;
          accWakeZ += activeVel.z * wakeFactor * wakeStrength * 0.9;

          // Trailing curling vortices behind moving hand
          const handSpeed = Math.hypot(activeVel.x, activeVel.y);
          if (handSpeed > 1.5) {
            const curlAmt = Math.min(1.0, handSpeed / 25.0) * this.config.vortexForce * 0.6;
            accWakeX += swirlX * wakeFactor * curlAmt;
            accWakeY += swirlY * wakeFactor * curlAmt;
          }
        }

        // 6B. OPEN PALM: Fluid Obstacle (Radial Repulsion + Tangential Parting Stream)
        if (activeGestures.openPalm > 0.01) {
          const repelRadius = this.config.handRepelRadius;
          if (dist < repelRadius) {
            const factor = Math.pow(1.0 - dist / repelRadius, 1.5);
            const repelF = factor * this.config.handRepelForce * activeGestures.openPalm;

            // Radial repulsion preventing fluid penetration
            accHandForceX += dirX * repelF * 1.4;
            accHandForceY += dirY * repelF * 1.4;
            accHandForceZ += dirZ * repelF * 0.7;

            // Tangential deflection: particles deflect around the palm like water around a smooth stone
            // Relative velocity across hand normal
            const relVx = vx - activeVel.x;
            const relVy = vy - activeVel.y;
            const crossZ = dirX * relVy - dirY * relVx;
            const deflectSign = crossZ >= 0 ? 1.0 : -1.0;

            const deflectSpeed = repelF * 0.65;
            accHandForceX += swirlX * deflectSign * deflectSpeed;
            accHandForceY += swirlY * deflectSign * deflectSpeed;
          }
        }

        // 6C. PINCH: Magnetic Attractor with Orbital Accretion Disk (NO Point Collapse)
        if (activeGestures.pinch > 0.01) {
          const attractRadius = this.config.handAttractRadius;
          if (dist < attractRadius) {
            const factor = Math.pow(1.0 - dist / attractRadius, 1.25);
            const orbitRadius = 6.5; // Soft equilibrium orbital distance
            const coreRadius = 3.5;

            // Inward magnetic pull towards orbitRadius; if r < orbitRadius, gently cushions outward
            const radialDelta = dist - orbitRadius;
            const radialNorm = radialDelta / Math.max(dist, coreRadius);
            const attractF = radialNorm * factor * this.config.handAttractForce * 1.6 * activeGestures.pinch;

            accHandForceX -= dirX * attractF;
            accHandForceY -= dirY * attractF;
            accHandForceZ -= dirZ * attractF * 0.6;

            // Angular orbital swirl: speeds up closer to core (conservation of angular momentum)
            const swirlBoost = (attractRadius / (dist + coreRadius)) * factor;
            const swirlF = swirlBoost * this.config.vortexForce * 1.6 * activeGestures.pinch;

            accHandForceX += swirlX * swirlF;
            accHandForceY += swirlY * swirlF;
          }
        }
      }

      // 6D. TWO-HAND MERGING: Binary Star / Figure-8 Vortex when hands approach
      if (twoHandMergeFactor > 0.01 && handA && handB) {
        const mdx = px - midX;
        const mdy = py - midY;
        const mdz = pz - midZ;
        const mDistSq = mdx * mdx + mdy * mdy + mdz * mdz + 0.001;
        const mDist = Math.sqrt(mDistSq);

        if (mDist < mergeThreshold * 1.6) {
          const mInv = 1.0 / mDist;
          const mSwirlX = -mdy * mInv;
          const mSwirlY = mdx * mInv;
          const binaryStrength = 18.0 * twoHandMergeFactor;
          const falloff = 1.0 / (1.0 + (mDist / 28.0) * (mDist / 28.0));

          accHandForceX += mSwirlX * binaryStrength * falloff;
          accHandForceY += mSwirlY * binaryStrength * falloff;
        }
      }

      // -----------------------------------------------------------------------
      // 7. SOFT FRUSTUM BOUNDARIES (Curving Deflection Along Edges, No Hard Bounce)
      // -----------------------------------------------------------------------
      let accBoundX = 0;
      let accBoundY = 0;
      let accBoundZ = 0;

      const boundMarginX = limitX * 0.88;
      if (Math.abs(px) > boundMarginX) {
        const pen = (Math.abs(px) - boundMarginX) / (limitX - boundMarginX);
        const force = Math.pow(Math.min(2.0, pen), 1.8) * returnStr * 65.0;
        accBoundX -= Math.sign(px) * force;
        // Tangent deflection curving gracefully along boundary
        accBoundY += Math.sign(px) * (py > 0 ? -1 : 1) * force * 0.35;
      }

      const boundMarginY = limitY * 0.88;
      if (Math.abs(py) > boundMarginY) {
        const pen = (Math.abs(py) - boundMarginY) / (limitY - boundMarginY);
        const force = Math.pow(Math.min(2.0, pen), 1.8) * returnStr * 65.0;
        accBoundY -= Math.sign(py) * force;
        accBoundX += Math.sign(py) * (px > 0 ? -1 : 1) * force * 0.35;
      }

      if (Math.abs(pz) > limitZ) {
        const pen = Math.abs(pz) - limitZ;
        accBoundZ -= Math.sign(pz) * pen * returnStr * 60.0;
      }

      // -----------------------------------------------------------------------
      // 8. FINAL ACCELERATION INTEGRATION & MOMENTUM
      // acceleration = a_baseFlow + a_vortexFlow + a_cohesion + a_handForce + a_handWake + a_boundaryForce
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
      // 9. CONTINUOUS POSITION INTEGRATION (No teleportation, smooth stream trails)
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
      // 10. COLOR, RADIANCE & LUMINOUS ENERGY MODULATION
      // Luminous cyan/teal + violet/purple base with pure white core heat on speed/interaction
      // -----------------------------------------------------------------------
      const currentSpeed = Math.sqrt(speedSq);
      const speedNorm = Math.min(1.0, currentSpeed / 22.0);
      const proximityNorm = Math.max(0.0, 1.0 - minHandDist / 34.0);

      const groupHueOffset = isGroupA ? 0.0 : pWeight * 0.25;
      const blendA = (Math.sin(i * 0.035 + t * 0.4 + groupHueOffset) + 1.0) * 0.5;

      let r = primary[0] * blendA + secondary[0] * (1.0 - blendA);
      let g = primary[1] * blendA + secondary[1] * (1.0 - blendA);
      let b = primary[2] * blendA + secondary[2] * (1.0 - blendA);

      // Fast streaming particles and particles interacting with hands ignite with white star-core heat
      const energeticWeight = Math.max(speedNorm * 0.85, proximityNorm * 0.95);
      if (energeticWeight > 0.05) {
        r = r * (1.0 - energeticWeight) + highlight[0] * energeticWeight;
        g = g * (1.0 - energeticWeight) + highlight[1] * energeticWeight;
        b = b * (1.0 - energeticWeight) + highlight[2] * energeticWeight;
      }

      colors[i3] = r;
      colors[i3 + 1] = g;
      colors[i3 + 2] = b;

      const baseAlpha = 0.62 + 0.32 * Math.sin(i * 0.07 + t * 0.8);
      alphas[i] = Math.min(1.0, baseAlpha + speedNorm * 0.4 + proximityNorm * 0.4);
    }

    return this.currentMode;
  }
}
