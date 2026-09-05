import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import type {
  Point3D,
  HandState,
  HandInteractionState,
  HandTrackerConfig,
  TrackerStatus,
  Handedness,
} from './handTypes';
import { HandLandmark } from './handTypes';
import { HandLandmarksSmoother, VelocityTracker } from './smoothing';
import { calculatePalmCenter, calculateHandScale, distance3D, calculateMidpoint } from './landmarkUtils';
import { GestureRecognizer } from './gestureDetection';

const DEFAULT_CONFIG: HandTrackerConfig = {
  maxNumHands: 2,
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  smoothingAlpha: 0.85,
  velocitySmoothingAlpha: 0.75,
};

interface HandPipelineSlot {
  smoother: HandLandmarksSmoother;
  velocityTracker: VelocityTracker;
  palmVelocityTracker: VelocityTracker;
  gestureRecognizer: GestureRecognizer;
}

export class HandTracker {
  private handLandmarker: HandLandmarker | null = null;
  private status: TrackerStatus = 'idle';
  private config: HandTrackerConfig;
  private lastVideoTime = -1;
  private loadPromise: Promise<void> | null = null;
  private errorMessage = '';

  // Separate tracking slots for consistent smoothing across frames
  private slots: Map<string, HandPipelineSlot> = new Map();

  constructor(config: Partial<HandTrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.getSlot('Left');
    this.getSlot('Right');
  }

  private getSlot(handedness: string): HandPipelineSlot {
    let slot = this.slots.get(handedness);
    if (!slot) {
      slot = {
        smoother: new HandLandmarksSmoother(this.config.smoothingAlpha),
        velocityTracker: new VelocityTracker(this.config.velocitySmoothingAlpha),
        palmVelocityTracker: new VelocityTracker(this.config.velocitySmoothingAlpha),
        gestureRecognizer: new GestureRecognizer(),
      };
      this.slots.set(handedness, slot);
    }
    return slot;
  }

  public getStatus(): TrackerStatus {
    return this.status;
  }

  public getErrorMessage(): string {
    return this.errorMessage;
  }

  public setConfig(newConfig: Partial<HandTrackerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    for (const slot of this.slots.values()) {
      slot.smoother.setAlpha(this.config.smoothingAlpha);
    }
    if (this.handLandmarker) {
      this.handLandmarker.setOptions({
        numHands: this.config.maxNumHands,
        minHandDetectionConfidence: this.config.minHandDetectionConfidence,
        minHandPresenceConfidence: this.config.minHandPresenceConfidence,
        minTrackingConfidence: this.config.minTrackingConfidence,
      });
    }
  }

  /**
   * Initializes MediaPipe Hand Landmarker via recommended vision tasks bundle
   */
  public async initialize(): Promise<void> {
    if (this.handLandmarker) return;
    if (this.loadPromise) return this.loadPromise;

    this.status = 'loading_model';
    this.loadPromise = (async () => {
      try {
        const wasmFileset = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        try {
          // Attempt GPU delegate first
          this.handLandmarker = await HandLandmarker.createFromOptions(wasmFileset, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: this.config.maxNumHands,
            minHandDetectionConfidence: this.config.minHandDetectionConfidence,
            minHandPresenceConfidence: this.config.minHandPresenceConfidence,
            minTrackingConfidence: this.config.minTrackingConfidence,
          });
        } catch (gpuError) {
          console.warn('MediaPipe GPU initialization fallback to CPU:', gpuError);
          this.handLandmarker = await HandLandmarker.createFromOptions(wasmFileset, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numHands: this.config.maxNumHands,
            minHandDetectionConfidence: this.config.minHandDetectionConfidence,
            minHandPresenceConfidence: this.config.minHandPresenceConfidence,
            minTrackingConfidence: this.config.minTrackingConfidence,
          });
        }

        this.status = 'ready';
      } catch (err: any) {
        this.status = 'error';
        this.errorMessage = err?.message || 'Failed to initialize MediaPipe Hand Landmarker';
        console.error('Failed to load Hand Landmarker:', err);
        throw err;
      }
    })();

    return this.loadPromise;
  }

  /**
   * Processes a video frame and produces smoothed HandInteractionState
   */
  public processVideoFrame(videoElement: HTMLVideoElement, timestamp: number): HandInteractionState | null {
    if (!this.handLandmarker || this.status === 'error') {
      return null;
    }

    if (
      videoElement.readyState < 2 ||
      videoElement.paused ||
      videoElement.ended ||
      videoElement.videoWidth === 0 ||
      videoElement.videoHeight === 0
    ) {
      return null;
    }

    // Ensure timestamp strictly increases for MediaPipe detectForVideo
    const frameTime = Math.max(timestamp, this.lastVideoTime + 0.001);
    this.lastVideoTime = frameTime;

    let result: HandLandmarkerResult;
    try {
      result = this.handLandmarker.detectForVideo(videoElement, frameTime);
    } catch (e) {
      console.warn('Frame detection error:', e);
      return null;
    }

    this.status = 'tracking';
    return this.convertResultToInteractionState(result, frameTime);
  }

  private convertResultToInteractionState(
    result: HandLandmarkerResult,
    timestamp: number
  ): HandInteractionState {
    const rawHandsList = result.landmarks || [];
    const handednessList = result.handednesses || [];

    const hands: HandState[] = [];
    const presentHandednesses = new Set<string>();

    for (let i = 0; i < rawHandsList.length; i++) {
      const rawPoints = rawHandsList[i];
      if (!rawPoints || rawPoints.length < 21) continue;

      const handednessCategory = handednessList[i]?.[0];
      const handedness: Handedness =
        (handednessCategory?.categoryName as Handedness) || (i === 0 ? 'Right' : 'Left');
      const score = handednessCategory?.score ?? 0.8;

      presentHandednesses.add(handedness);
      const slot = this.getSlot(handedness);

      // Convert raw normalized coordinates
      const rawLandmarks: Point3D[] = rawPoints.map((pt) => ({
        x: pt.x,
        y: pt.y,
        z: pt.z ?? 0,
      }));

      // Apply exponential smoothing
      const smoothedLandmarks = slot.smoother.update(rawLandmarks);

      // Key landmark extractions
      const wrist = smoothedLandmarks[HandLandmark.WRIST];
      const palmCenter = calculatePalmCenter(smoothedLandmarks);
      const thumbTip = smoothedLandmarks[HandLandmark.THUMB_TIP];
      const indexTip = smoothedLandmarks[HandLandmark.INDEX_FINGER_TIP];
      const middleTip = smoothedLandmarks[HandLandmark.MIDDLE_FINGER_TIP];
      const ringTip = smoothedLandmarks[HandLandmark.RING_FINGER_TIP];
      const pinkyTip = smoothedLandmarks[HandLandmark.PINKY_TIP];
      const indexMcp = smoothedLandmarks[HandLandmark.INDEX_FINGER_MCP];

      // Derived spatial values
      const handScale = calculateHandScale(smoothedLandmarks);
      const pinchDistance = distance3D(thumbTip, indexTip);
      const normalizedPinchRatio = pinchDistance / handScale;

      // Velocities
      const { velocity, speed } = slot.velocityTracker.update(indexTip, timestamp);
      const { velocity: palmVelocity } = slot.palmVelocityTracker.update(palmCenter, timestamp);

      // Gesture Recognition
      const gestureResult = slot.gestureRecognizer.detect(smoothedLandmarks);

      const handState: HandState = {
        id: `${handedness}-${i}`,
        handedness,
        score,
        landmarks: smoothedLandmarks,
        rawLandmarks,
        wrist,
        palmCenter,
        thumbTip,
        indexTip,
        middleTip,
        ringTip,
        pinkyTip,
        indexMcp,
        handScale,
        pinchDistance,
        normalizedPinchRatio,
        isPinching: gestureResult.isPinching,
        isOpenPalm: gestureResult.isOpenPalm,
        gesture: gestureResult.gesture,
        gestureConfidence: gestureResult.confidence,
        velocity,
        palmVelocity,
        speed,
      };

      hands.push(handState);
    }

    // Reset slots that were not detected this frame to avoid stale velocity spikes
    for (const [key, slot] of this.slots.entries()) {
      if (!presentHandednesses.has(key)) {
        slot.velocityTracker.reset();
        slot.palmVelocityTracker.reset();
        slot.gestureRecognizer.reset();
      }
    }

    // Build Multi-hand interaction state
    const leftHand = hands.find((h) => h.handedness === 'Left');
    const rightHand = hands.find((h) => h.handedness === 'Right');
    const primaryHand = hands[0];
    const secondaryHand = hands[1];

    let handDistance: number | undefined;
    let centerPoint: Point3D | undefined;
    let relativeVelocity: Point3D | undefined;
    let relativeSpeed: number | undefined;

    if (hands.length >= 2) {
      const h1 = hands[0];
      const h2 = hands[1];
      handDistance = distance3D(h1.palmCenter, h2.palmCenter);
      centerPoint = calculateMidpoint(h1.palmCenter, h2.palmCenter);

      // Relative velocity vector (h1 - h2)
      relativeVelocity = {
        x: h1.palmVelocity.x - h2.palmVelocity.x,
        y: h1.palmVelocity.y - h2.palmVelocity.y,
        z: h1.palmVelocity.z - h2.palmVelocity.z,
      };
      relativeSpeed = Math.hypot(relativeVelocity.x, relativeVelocity.y, relativeVelocity.z);
    }

    return {
      hands,
      leftHand,
      rightHand,
      primaryHand,
      secondaryHand,
      handsCount: hands.length,
      handDistance,
      centerPoint,
      relativeVelocity,
      relativeSpeed,
      timestamp,
    };
  }

  public reset(): void {
    for (const slot of this.slots.values()) {
      slot.smoother.reset();
      slot.velocityTracker.reset();
      slot.palmVelocityTracker.reset();
      slot.gestureRecognizer.reset();
    }
  }

  public dispose(): void {
    this.reset();
    if (this.handLandmarker) {
      this.handLandmarker.close();
      this.handLandmarker = null;
    }
    this.status = 'idle';
    this.loadPromise = null;
  }
}
