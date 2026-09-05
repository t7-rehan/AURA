import type { Point3D } from './handTypes';
import { HandLandmark } from './handTypes';

/**
 * 3D Euclidean distance
 */
export function distance3D(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.hypot(dx, dy, dz);
}

/**
 * 2D Screen distance (x, y)
 */
export function distance2D(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Calculates anatomical center of the palm
 * Average of Wrist (0), Index MCP (5), Middle MCP (9), Ring MCP (13), and Pinky MCP (17)
 */
export function calculatePalmCenter(landmarks: Point3D[]): Point3D {
  if (landmarks.length < 21) {
    return { x: 0.5, y: 0.5, z: 0 };
  }

  const wrist = landmarks[HandLandmark.WRIST];
  const indexMcp = landmarks[HandLandmark.INDEX_FINGER_MCP];
  const middleMcp = landmarks[HandLandmark.MIDDLE_FINGER_MCP];
  const ringMcp = landmarks[HandLandmark.RING_FINGER_MCP];
  const pinkyMcp = landmarks[HandLandmark.PINKY_MCP];

  return {
    x: (wrist.x + indexMcp.x + middleMcp.x + ringMcp.x + pinkyMcp.x) / 5,
    y: (wrist.y + indexMcp.y + middleMcp.y + ringMcp.y + pinkyMcp.y) / 5,
    z: (wrist.z + indexMcp.z + middleMcp.z + ringMcp.z + pinkyMcp.z) / 5,
  };
}

/**
 * Calculates hand reference scale (wrist to middle finger MCP)
 * Used to normalize pinch and gesture thresholds invariant to camera distance
 */
export function calculateHandScale(landmarks: Point3D[]): number {
  if (landmarks.length < 21) return 0.15;

  const wrist = landmarks[HandLandmark.WRIST];
  const middleMcp = landmarks[HandLandmark.MIDDLE_FINGER_MCP];
  const scale = distance3D(wrist, middleMcp);
  
  // Guard against near-zero division
  return Math.max(0.01, scale);
}

/**
 * Calculates midpoint between two 3D points
 */
export function calculateMidpoint(a: Point3D, b: Point3D): Point3D {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}
