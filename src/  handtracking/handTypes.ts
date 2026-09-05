export type Handedness = 'Left' | 'Right';

export type GestureType = 'OPEN_PALM' | 'PINCH' | 'UNKNOWN';

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export enum HandLandmark {
  WRIST = 0,
  THUMB_CMC = 1,
  THUMB_MCP = 2,
  THUMB_IP = 3,
  THUMB_TIP = 4,
  INDEX_FINGER_MCP = 5,
  INDEX_FINGER_PIP = 6,
  INDEX_FINGER_DIP = 7,
  INDEX_FINGER_TIP = 8,
  MIDDLE_FINGER_MCP = 9,
  MIDDLE_FINGER_PIP = 10,
  MIDDLE_FINGER_DIP = 11,
  MIDDLE_FINGER_TIP = 12,
  RING_FINGER_MCP = 13,
  RING_FINGER_PIP = 14,
  RING_FINGER_DIP = 15,
  RING_FINGER_TIP = 16,
  PINKY_MCP = 17,
  PINKY_PIP = 18,
  PINKY_DIP = 19,
  PINKY_TIP = 20,
}

export const HAND_CONNECTIONS: [number, number][] = [
  // Palm base
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [0, 17],                              // Palm bottom to pinky MCP
  [5, 9], [9, 13], [13, 17],            // Palm knuckle bridge
  [9, 10], [10, 11], [11, 12],          // Middle
  [13, 14], [14, 15], [15, 16],         // Ring
  [17, 18], [18, 19], [19, 20],         // Pinky
];

export interface HandState {
  id: string;
  handedness: Handedness;
  score: number;
  landmarks: Point3D[];          // 21 smoothed normalized 3D landmarks
  rawLandmarks: Point3D[];       // 21 raw landmarks
  
  // Key points for direct access
  wrist: Point3D;
  palmCenter: Point3D;
  thumbTip: Point3D;
  indexTip: Point3D;
  middleTip: Point3D;
  ringTip: Point3D;
  pinkyTip: Point3D;
  indexMcp: Point3D;

  // Derived metrics
  handScale: number;             // Reference distance (wrist to middle knuckle)
  pinchDistance: number;         // 3D Euclidean distance between thumb and index
  normalizedPinchRatio: number;  // pinchDistance / handScale
  isPinching: boolean;
  isOpenPalm: boolean;
  gesture: GestureType;
  gestureConfidence: number;

  // Velocities (units per second)
  velocity: Point3D;
  palmVelocity: Point3D;
  speed: number;
}

export interface HandInteractionState {
  hands: HandState[];
  primaryHand?: HandState;
  secondaryHand?: HandState;
  leftHand?: HandState;
  rightHand?: HandState;
  
  // Two-hand combined interaction metrics
  handsCount: number;
  handDistance?: number;         // 3D distance between palm centers
  centerPoint?: Point3D;         // Midpoint between palms
  relativeVelocity?: Point3D;    // Vector of hand separation
  relativeSpeed?: number;        // Rate of convergence/divergence
  timestamp: number;
}

export interface HandTrackerConfig {
  maxNumHands: number;
  minHandDetectionConfidence: number;
  minHandPresenceConfidence: number;
  minTrackingConfidence: number;
  smoothingAlpha: number;         // Low-pass filter weight (0 = freeze, 1 = no smoothing)
  velocitySmoothingAlpha: number;
}

export type TrackerStatus = 'idle' | 'loading_model' | 'ready' | 'tracking' | 'error';
