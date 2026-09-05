import { HandTracker } from './HandTracker';
import type {
  HandInteractionState,
  HandTrackerConfig,
  TrackerStatus,
} from './handTypes';

export type FrameListener = (state: HandInteractionState) => void;
export type StatusListener = (status: TrackerStatus, error?: string) => void;

class HandTrackingServiceSingleton {
  private tracker: HandTracker;
  private videoElement: HTMLVideoElement | null = null;
  private animationFrameId: number | null = null;
  private frameListeners: Set<FrameListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();
  
  private latestState: HandInteractionState = {
    hands: [],
    handsCount: 0,
    timestamp: 0,
  };

  private isRunning = false;
  private fps = 0;
  private frameCount = 0;
  private lastFpsUpdateTime = performance.now();

  constructor() {
    this.tracker = new HandTracker();
  }

  public getStatus(): TrackerStatus {
    return this.tracker.getStatus();
  }

  public getErrorMessage(): string {
    return this.tracker.getErrorMessage();
  }

  public getFps(): number {
    return this.fps;
  }

  /**
   * Fast, zero-overhead direct state access for RAF loops (e.g., Three.js particle engine)
   */
  public getLatestState(): HandInteractionState {
    return this.latestState;
  }

  public setConfig(config: Partial<HandTrackerConfig>): void {
    this.tracker.setConfig(config);
  }

  public subscribeFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  }

  public subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.tracker.getStatus(), this.tracker.getErrorMessage());
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private notifyStatus(status: TrackerStatus, error?: string): void {
    for (const listener of this.statusListeners) {
      listener(status, error);
    }
  }

  /**
   * Pre-initializes the MediaPipe model asset
   */
  public async initModel(): Promise<void> {
    try {
      this.notifyStatus('loading_model');
      await this.tracker.initialize();
      this.notifyStatus(this.tracker.getStatus());
    } catch (e: any) {
      this.notifyStatus('error', e?.message || 'Model initialization failed');
      throw e;
    }
  }

  /**
   * Starts tracking on a live HTMLVideoElement
   */
  public async startTracking(videoElement: HTMLVideoElement): Promise<void> {
    this.videoElement = videoElement;
    if (this.isRunning) return;

    if (this.tracker.getStatus() !== 'ready' && this.tracker.getStatus() !== 'tracking') {
      await this.initModel();
    }

    this.isRunning = true;
    this.loop();
  }

  /**
   * Stops tracking loop
   */
  public stopTracking(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.videoElement = null;
    this.tracker.reset();
    this.latestState = {
      hands: [],
      handsCount: 0,
      timestamp: performance.now(),
    };
    for (const listener of this.frameListeners) {
      listener(this.latestState);
    }
    this.notifyStatus('ready');
  }

  private loop = (): void => {
    if (!this.isRunning || !this.videoElement) {
      return;
    }

    const now = performance.now();

    // Calculate FPS
    this.frameCount++;
    if (now - this.lastFpsUpdateTime >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdateTime));
      this.frameCount = 0;
      this.lastFpsUpdateTime = now;
    }

    const interactionState = this.tracker.processVideoFrame(this.videoElement, now);

    if (interactionState) {
      this.latestState = interactionState;
      // High-performance broadcast to direct listeners (canvas overlay, etc.)
      for (const listener of this.frameListeners) {
        listener(interactionState);
      }
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };
}

export const HandTrackingService = new HandTrackingServiceSingleton();
