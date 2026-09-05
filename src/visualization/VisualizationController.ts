import { VisualizationScene } from './VisualizationScene';
import { ParticleEngine } from '../particles/ParticleEngine';
import { HandTrackingService } from '../handTracking/HandTrackingService';
import type {
  QualityTier,
  ParticleInteractionMode,
  ParticlePatternType,
} from '../particles/ParticleConfig';

export interface VisualizerMetrics {
  fps: number;
  particleCount: number;
  qualityTier: QualityTier;
  interactionMode: ParticleInteractionMode;
  handsDetected: number;
  activeGestures: string[];
  isDualHand: boolean;
  unifiedPattern: ParticlePatternType;
  groupAPattern: ParticlePatternType;
  groupBPattern: ParticlePatternType;
  groupACount: number;
  groupBCount: number;
  partitionWeight: number;
}

export type MetricsListener = (metrics: VisualizerMetrics) => void;

export class VisualizationController {
  private scene: VisualizationScene | null = null;
  private engine: ParticleEngine | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private isMirrored = true;
  private isDebugVisible = false;

  private lastTime = 0;
  private frameCount = 0;
  private fps = 60;
  private lastFpsUpdate = 0;

  private metricsListeners: Set<MetricsListener> = new Set();
  private lastMetricsBroadcast = 0;

  public initialize(container: HTMLElement, qualityTier: QualityTier = 'high'): void {
    if (this.scene) return;

    this.scene = new VisualizationScene(container);
    const initialBounds = this.scene.getVisibleBounds();

    this.engine = new ParticleEngine(this.scene.scene, qualityTier, initialBounds);
    this.engine.startFadeIn();

    // Hook responsive dynamic resize events
    this.scene.onResize((bounds) => {
      if (this.engine) {
        this.engine.updateBounds(bounds);
      }
    });
  }

  public setMirrored(mirrored: boolean): void {
    this.isMirrored = mirrored;
  }

  public setDebugVisible(visible: boolean): void {
    this.isDebugVisible = visible;
    if (this.scene) {
      this.scene.setDebugVisible(visible);
    }
  }

  public setQualityTier(tier: QualityTier): void {
    if (this.engine) {
      this.engine.setQualityTier(tier);
    }
  }

  public setPalette(paletteIndex: number): void {
    if (this.engine) {
      this.engine.setPalette(paletteIndex);
    }
  }

  public setPattern(
    target: 'unified' | 'groupA' | 'groupB',
    pattern: ParticlePatternType
  ): void {
    if (this.engine) {
      this.engine.setPattern(target, pattern);
    }
  }

  public subscribeMetrics(listener: MetricsListener): () => void {
    this.metricsListeners.add(listener);
    return () => {
      this.metricsListeners.delete(listener);
    };
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.lastFpsUpdate = this.lastTime;
    if (this.engine) {
      this.engine.startFadeIn();
    }
    this.loop();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.engine) {
      this.engine.startFadeOut();
    }
  }

  private loop = (): void => {
    if (!this.isRunning || !this.scene || !this.engine) {
      return;
    }

    const now = performance.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // Calculate FPS
    this.frameCount++;
    if (now - this.lastFpsUpdate >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }

    // Direct zero-overhead read of current hand tracking state
    const handState = HandTrackingService.getLatestState();

    // Run GPU Particle Simulation
    this.engine.update(dt, handState, this.isMirrored);

    // Update debug visualizer markers if debug mode is active
    if (this.isDebugVisible) {
      const smoothed = this.engine.getSmoothedHands();
      this.scene.updateDebugMarkers(smoothed.handA, smoothed.handB);
    }

    // Render WebGL Scene
    this.scene.render();

    // Throttled metrics broadcast to React UI (~10Hz)
    if (now - this.lastMetricsBroadcast >= 100 && this.metricsListeners.size > 0) {
      this.lastMetricsBroadcast = now;
      const count = this.engine.getParticleCount();
      const halfCount = Math.floor(count / 2);
      const patterns = this.engine.getGroupPatterns();

      const metrics: VisualizerMetrics = {
        fps: this.fps,
        particleCount: count,
        qualityTier: this.engine.getQualityTier(),
        interactionMode: this.engine.getCurrentMode(),
        handsDetected: handState.handsCount,
        activeGestures: handState.hands.map((h) => `${h.handedness}: ${h.gesture}`),
        isDualHand: this.engine.getIsDualHandActive(),
        unifiedPattern: patterns.unified,
        groupAPattern: patterns.groupA,
        groupBPattern: patterns.groupB,
        groupACount: halfCount,
        groupBCount: count - halfCount,
        partitionWeight: this.engine.getPartitionWeight(),
      };
      for (const listener of this.metricsListeners) {
        listener(metrics);
      }
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  public dispose(): void {
    this.stop();
    if (this.engine) {
      this.engine.dispose();
      this.engine = null;
    }
    if (this.scene) {
      this.scene.dispose();
      this.scene = null;
    }
    this.metricsListeners.clear();
  }
}
