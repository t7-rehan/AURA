export type CameraStatus = 'uninitialized' | 'requesting' | 'active' | 'stopped' | 'error';

export type CameraErrorCode = 
  | 'PERMISSION_DENIED'
  | 'DEVICE_NOT_FOUND'
  | 'DEVICE_IN_USE'
  | 'UNSUPPORTED_BROWSER'
  | 'OVERCONSTRAINED'
  | 'UNKNOWN';

export interface CameraErrorInfo {
  code: CameraErrorCode;
  title: string;
  message: string;
  suggestion: string;
}

export interface VideoResolution {
  width: number;
  height: number;
  label?: string;
}

export interface CameraMetrics {
  width: number;
  height: number;
  frameRate: number;
  aspectRatio: number;
  facingMode?: string;
}
