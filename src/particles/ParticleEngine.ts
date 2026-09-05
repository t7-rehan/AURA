import * as THREE from 'three';
import { ParticleSystem } from './ParticleSystem';
import { ParticlePhysics } from './ParticlePhysics';
import {
  QUALITY_TIERS,
  type QualityTier,
  type ParticleInteractionMode,
  type ParticlePatternType,
} from './ParticleConfig';
import type { HandInteractionState } from '../handTracking/handTypes';
import type { ViewportBounds } from '../visualization/VisualizationScene';

export class ParticleEngine {
  private system: ParticleSystem;
  private physics: ParticlePhysics;

  private qualityTier: QualityTier = 'high';
  private particleCount: number;

  private scene: THREE.Scene;
  private bounds: ViewportBounds | undefined;
  private fadeOpacity = 1.0;
  private isFadingIn = true;
  private fadeSpeed = 2.0;

  private elapsedTime = 0;
  private currentMode: ParticleInteractionMode = 'FREE';

  constructor(scene: THREE.Scene, initialQuality: QualityTier = 'high', bounds?: ViewportBounds) {
    this.scene = scene;
    this.qualityTier = initialQuality;
    this.bounds = bounds;
    this.particleCount = QUALITY_TIERS[this.qualityTier].particleCount;

    this.physics = new ParticlePhysics(this.particleCount);
    if (bounds) {
      this.physics.updateBounds(bounds);
    }
    this.system = new ParticleSystem(this.particleCount, bounds);

    this.scene.add(this.system.points);
  }

  public updateBounds(bounds: ViewportBounds): void {
    this.bounds = bounds;
    this.physics.updateBounds(bounds);
  }

  public setQualityTier(tier: QualityTier): void {
    if (this.qualityTier === tier) return;
    this.qualityTier = tier;
    const newCount = QUALITY_TIERS[tier].particleCount;

    this.scene.remove(this.system.points);
    this.system.dispose();

    this.particleCount = newCount;
    this.physics.resize(newCount);
    this.system = new ParticleSystem(this.particleCount, this.bounds);
    this.system.setGlobalOpacity(this.fadeOpacity);
    this.scene.add(this.system.points);
  }

  public getQualityTier(): QualityTier {
    return this.qualityTier;
  }

  public getParticleCount(): number {
    return this.particleCount;
  }

  public getCurrentMode(): ParticleInteractionMode {
    return this.currentMode;
  }

  public getIsDualHandActive(): boolean {
    return this.physics.getIsDualHandActive();
  }

  public getPartitionWeight(): number {
    return this.physics.getPartitionWeight();
  }

  public getSmoothedHands(): {
    handA: { x: number; y: number; z: number } | null;
    handB: { x: number; y: number; z: number } | null;
  } {
    return this.physics.getSmoothedHands();
  }

  public getGroupPatterns(): {
    unified: ParticlePatternType;
    groupA: ParticlePatternType;
    groupB: ParticlePatternType;
  } {
    return {
      unified: this.physics.unifiedState.pattern,
      groupA: this.physics.groupAState.pattern,
      groupB: this.physics.groupBState.pattern,
    };
  }

  public setPalette(paletteIndex: number): void {
    this.physics.setPalette(paletteIndex);
  }

  public setPattern(
    target: 'unified' | 'groupA' | 'groupB',
    pattern: ParticlePatternType
  ): void {
    this.physics.setPattern(target, pattern);
  }

  public startFadeIn(): void {
    this.isFadingIn = true;
  }

  public startFadeOut(): void {
    this.isFadingIn = false;
  }

  public update(
    dt: number,
    handState: HandInteractionState | null,
    isMirrored: boolean = true
  ): void {
    this.elapsedTime += dt;

    // Smooth Entrance / Exit Opacity Fading
    if (this.isFadingIn) {
      this.fadeOpacity = Math.min(1.0, this.fadeOpacity + dt * this.fadeSpeed);
    } else {
      this.fadeOpacity = Math.max(0.0, this.fadeOpacity - dt * this.fadeSpeed * 1.5);
    }
    this.system.setGlobalOpacity(this.fadeOpacity);
    this.system.setTime(this.elapsedTime);

    // Run GPU Particle Simulation
    this.currentMode = this.physics.update(
      dt,
      this.particleCount,
      this.system.positions,
      this.system.velocities,
      this.system.colors,
      this.system.alphas,
      this.system.sizes,
      handState,
      isMirrored
    );

    // Upload updated buffers to GPU
    this.system.markBuffersUpdated();
  }

  public setPixelRatio(dpr: number): void {
    this.system.setPixelRatio(dpr);
  }

  public dispose(): void {
    this.scene.remove(this.system.points);
    this.system.dispose();
  }
}
