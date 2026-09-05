import type { Point3D } from './handTypes';

/**
 * Exponential Low-Pass Smoother for 3D landmarks
 * new = alpha * current + (1 - alpha) * previous
 */
export class Point3DSmoother {
  private prev: Point3D | null = null;
  private alpha: number;

  constructor(alpha = 0.65) {
    this.alpha = alpha;
  }

  public setAlpha(alpha: number): void {
    this.alpha = Math.max(0.01, Math.min(1.0, alpha));
  }

  public update(current: Point3D): Point3D {
    if (!this.prev) {
      this.prev = { x: current.x, y: current.y, z: current.z };
      return { ...this.prev };
    }

    const a = this.alpha;
    const smoothed: Point3D = {
      x: a * current.x + (1 - a) * this.prev.x,
      y: a * current.y + (1 - a) * this.prev.y,
      z: a * current.z + (1 - a) * this.prev.z,
    };

    this.prev = smoothed;
    return smoothed;
  }

  public reset(): void {
    this.prev = null;
  }
}

/**
 * Smoother array for all 21 hand landmarks
 */
export class HandLandmarksSmoother {
  private smoothers: Point3DSmoother[] = [];
  private alpha: number;

  constructor(alpha = 0.65) {
    this.alpha = alpha;
    for (let i = 0; i < 21; i++) {
      this.smoothers.push(new Point3DSmoother(alpha));
    }
  }

  public setAlpha(alpha: number): void {
    this.alpha = alpha;
    for (const s of this.smoothers) {
      s.setAlpha(alpha);
    }
  }

  public update(rawLandmarks: Point3D[]): Point3D[] {
    if (rawLandmarks.length !== 21) return rawLandmarks;
    return rawLandmarks.map((pt, i) => this.smoothers[i].update(pt));
  }

  public reset(): void {
    for (const s of this.smoothers) {
      s.reset();
    }
  }
}

/**
 * Robust Velocity Tracker for hand positions
 * Computes velocity vector (units/sec) using time delta and exponential low-pass filter
 */
export class VelocityTracker {
  private prevPos: Point3D | null = null;
  private prevTimestamp = 0;
  private filteredVelocity: Point3D = { x: 0, y: 0, z: 0 };
  private alpha: number;

  constructor(alpha = 0.5) {
    this.alpha = alpha;
  }

  public update(currentPos: Point3D, timestamp: number): { velocity: Point3D; speed: number } {
    if (!this.prevPos || this.prevTimestamp <= 0) {
      this.prevPos = { ...currentPos };
      this.prevTimestamp = timestamp;
      this.filteredVelocity = { x: 0, y: 0, z: 0 };
      return { velocity: { ...this.filteredVelocity }, speed: 0 };
    }

    const dt = (timestamp - this.prevTimestamp) / 1000; // in seconds
    this.prevTimestamp = timestamp;

    if (dt <= 0.0001 || dt > 0.5) {
      // Guard against frame stalls or negative dt
      this.prevPos = { ...currentPos };
      return { velocity: { ...this.filteredVelocity }, speed: Math.hypot(this.filteredVelocity.x, this.filteredVelocity.y, this.filteredVelocity.z) };
    }

    const rawVx = (currentPos.x - this.prevPos.x) / dt;
    const rawVy = (currentPos.y - this.prevPos.y) / dt;
    const rawVz = (currentPos.z - this.prevPos.z) / dt;

    this.prevPos = { ...currentPos };

    // Apply exponential smoothing to velocity
    const a = this.alpha;
    this.filteredVelocity = {
      x: a * rawVx + (1 - a) * this.filteredVelocity.x,
      y: a * rawVy + (1 - a) * this.filteredVelocity.y,
      z: a * rawVz + (1 - a) * this.filteredVelocity.z,
    };

    const speed = Math.hypot(
      this.filteredVelocity.x,
      this.filteredVelocity.y,
      this.filteredVelocity.z
    );

    return { velocity: { ...this.filteredVelocity }, speed };
  }

  public reset(): void {
    this.prevPos = null;
    this.prevTimestamp = 0;
    this.filteredVelocity = { x: 0, y: 0, z: 0 };
  }
}
