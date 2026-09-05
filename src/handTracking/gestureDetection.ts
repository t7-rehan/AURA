import type { Point3D, GestureType } from './handTypes';
import { HandLandmark } from './handTypes';
import { distance3D, calculateHandScale } from './landmarkUtils';

export interface GestureDetectionResult {
  gesture: GestureType;
  confidence: number;
  isOpenPalm: boolean;
  isPinching: boolean;
  pinchRatio: number;
  extendedFingersCount: number;
}

export class GestureRecognizer {
  // Hysteresis thresholds (normalized by handScale)
  private readonly PINCH_ENTER_RATIO = 0.32; // Enter pinch when thumb & index distance <= 0.32 * handScale
  private readonly PINCH_EXIT_RATIO = 0.42;  // Exit pinch when distance > 0.42 * handScale

  // Debouncing buffer (history of recent raw classifications)
  private history: GestureType[] = [];
  private readonly HISTORY_SIZE = 2;
  private currentDebouncedGesture: GestureType = 'UNKNOWN';
  private wasPinching = false;

  /**
   * Check if a specific finger is extended
   * A finger is considered extended if the tip is further from the wrist than its PIP/MCP joints
   */
  private isFingerExtended(
    landmarks: Point3D[],
    tipIdx: HandLandmark,
    pipIdx: HandLandmark,
    mcpIdx: HandLandmark
  ): boolean {
    const wrist = landmarks[HandLandmark.WRIST];
    const tipDist = distance3D(wrist, landmarks[tipIdx]);
    const pipDist = distance3D(wrist, landmarks[pipIdx]);
    const mcpDist = distance3D(wrist, landmarks[mcpIdx]);

    return tipDist > pipDist && pipDist > mcpDist;
  }

  /**
   * Check thumb extension
   */
  private isThumbExtended(landmarks: Point3D[]): boolean {
    const wrist = landmarks[HandLandmark.WRIST];
    const pinkyMcp = landmarks[HandLandmark.PINKY_MCP];
    const thumbTip = landmarks[HandLandmark.THUMB_TIP];
    const thumbMcp = landmarks[HandLandmark.THUMB_MCP];

    // Distance from thumb tip to pinky MCP vs thumb MCP to pinky MCP
    const tipToPinky = distance3D(thumbTip, pinkyMcp);
    const mcpToPinky = distance3D(thumbMcp, pinkyMcp);
    const tipToWrist = distance3D(thumbTip, wrist);
    const mcpToWrist = distance3D(thumbMcp, wrist);

    return tipToPinky > mcpToPinky * 1.1 && tipToWrist > mcpToWrist;
  }

  public detect(landmarks: Point3D[]): GestureDetectionResult {
    if (landmarks.length < 21) {
      return {
        gesture: 'UNKNOWN',
        confidence: 0,
        isOpenPalm: false,
        isPinching: false,
        pinchRatio: 1,
        extendedFingersCount: 0,
      };
    }

    const handScale = calculateHandScale(landmarks);
    const thumbTip = landmarks[HandLandmark.THUMB_TIP];
    const indexTip = landmarks[HandLandmark.INDEX_FINGER_TIP];

    // 1. Evaluate Pinch
    const rawPinchDist = distance3D(thumbTip, indexTip);
    const pinchRatio = rawPinchDist / handScale;

    let isPinching = false;
    if (this.wasPinching) {
      // Hysteresis release
      isPinching = pinchRatio <= this.PINCH_EXIT_RATIO;
    } else {
      // Hysteresis trigger
      isPinching = pinchRatio <= this.PINCH_ENTER_RATIO;
    }
    this.wasPinching = isPinching;

    // 2. Evaluate Open Palm (extended fingers)
    const thumbExt = this.isThumbExtended(landmarks);
    const indexExt = this.isFingerExtended(
      landmarks,
      HandLandmark.INDEX_FINGER_TIP,
      HandLandmark.INDEX_FINGER_PIP,
      HandLandmark.INDEX_FINGER_MCP
    );
    const middleExt = this.isFingerExtended(
      landmarks,
      HandLandmark.MIDDLE_FINGER_TIP,
      HandLandmark.MIDDLE_FINGER_PIP,
      HandLandmark.MIDDLE_FINGER_MCP
    );
    const ringExt = this.isFingerExtended(
      landmarks,
      HandLandmark.RING_FINGER_TIP,
      HandLandmark.RING_FINGER_PIP,
      HandLandmark.RING_FINGER_MCP
    );
    const pinkyExt = this.isFingerExtended(
      landmarks,
      HandLandmark.PINKY_TIP,
      HandLandmark.PINKY_PIP,
      HandLandmark.PINKY_MCP
    );

    let extendedCount = 0;
    if (thumbExt) extendedCount++;
    if (indexExt) extendedCount++;
    if (middleExt) extendedCount++;
    if (ringExt) extendedCount++;
    if (pinkyExt) extendedCount++;

    // Open palm requires at least 4 extended fingers (index, middle, ring, pinky, and ideally thumb)
    const isOpenPalm = !isPinching && extendedCount >= 4;

    // 3. Raw classification
    let rawGesture: GestureType = 'UNKNOWN';
    let rawConfidence = 0.5;

    if (isPinching) {
      rawGesture = 'PINCH';
      // Closer = higher confidence
      rawConfidence = Math.max(0.6, Math.min(1.0, 1.0 - (pinchRatio / this.PINCH_EXIT_RATIO) * 0.4));
    } else if (isOpenPalm) {
      rawGesture = 'OPEN_PALM';
      rawConfidence = extendedCount === 5 ? 0.95 : 0.8;
    } else {
      rawGesture = 'UNKNOWN';
      rawConfidence = 0.5;
    }

    // 4. Debounce with recent classification voting or immediate switch on confident gesture
    if (rawConfidence >= 0.75 && rawGesture !== 'UNKNOWN') {
      this.currentDebouncedGesture = rawGesture;
      this.history = [rawGesture];
    } else {
      this.history.push(rawGesture);
      if (this.history.length > this.HISTORY_SIZE) {
        this.history.shift();
      }

      // If either frame in 2-frame window detects the gesture, activate immediately
      const counts: Record<GestureType, number> = { OPEN_PALM: 0, PINCH: 0, UNKNOWN: 0 };
      for (const g of this.history) {
        counts[g]++;
      }

      if (counts.PINCH >= 1) {
        this.currentDebouncedGesture = 'PINCH';
      } else if (counts.OPEN_PALM >= 1) {
        this.currentDebouncedGesture = 'OPEN_PALM';
      } else {
        this.currentDebouncedGesture = 'UNKNOWN';
      }
    }

    return {
      gesture: this.currentDebouncedGesture,
      confidence: rawConfidence,
      isOpenPalm: this.currentDebouncedGesture === 'OPEN_PALM',
      isPinching: this.currentDebouncedGesture === 'PINCH',
      pinchRatio,
      extendedFingersCount: extendedCount,
    };
  }

  public reset(): void {
    this.history = [];
    this.currentDebouncedGesture = 'UNKNOWN';
    this.wasPinching = false;
  }
}
