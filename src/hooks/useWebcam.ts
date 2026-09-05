import { useState, useEffect, useRef, useCallback } from 'react';
import type { CameraStatus, CameraErrorInfo, CameraMetrics } from '../types/camera';

export function useWebcam() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<CameraStatus>('uninitialized');
  const [error, setError] = useState<CameraErrorInfo | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [metrics, setMetrics] = useState<CameraMetrics>({
    width: 0,
    height: 0,
    frameRate: 0,
    aspectRatio: 16 / 9,
  });

  // Query and update available video inputs
  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return;
    }
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter((d) => d.kind === 'videoinput');
      setDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch {
      // Ignore enumeration errors
    }
  }, [selectedDeviceId]);

  // Clean stop all tracks
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus('stopped');
    setMetrics((prev) => ({ ...prev, width: 0, height: 0 }));
  }, []);

  // Parse error into structured human friendly format
  const parseCameraError = (err: unknown): CameraErrorInfo => {
    const errorObj = err as Error;
    const name = errorObj?.name || '';

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return {
        code: 'PERMISSION_DENIED',
        title: 'Camera Access Blocked',
        message: 'Browser webcam permission was denied or dismissed.',
        suggestion: 'Please click the camera icon in your browser URL bar and allow access to continue.',
      };
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        code: 'DEVICE_NOT_FOUND',
        title: 'No Webcam Detected',
        message: 'No video capture hardware was found on your system.',
        suggestion: 'Please verify your camera is plugged in or enabled in system privacy settings.',
      };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        code: 'DEVICE_IN_USE',
        title: 'Camera Currently Busy',
        message: 'Another application (e.g. Zoom, Teams, Meet) might be using your webcam.',
        suggestion: 'Close other applications using the camera, then try clicking "Start Camera" again.',
      };
    }
    if (name === 'OverconstrainedError') {
      return {
        code: 'OVERCONSTRAINED',
        title: 'Resolution Constraint Not Met',
        message: 'The requested video settings are not supported by your hardware.',
        suggestion: 'Defaulting to standard resolution. Retrying with basic constraints...',
      };
    }
    return {
      code: 'UNKNOWN',
      title: 'Webcam Initialization Failed',
      message: errorObj?.message || 'An unexpected error occurred while starting the camera.',
      suggestion: 'Ensure your browser supports WebRTC/getUserMedia and reload the page.',
    };
  };

  // Start webcam feed with ideal constraints
  const startCamera = useCallback(async (deviceIdToUse?: string): Promise<boolean> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const errInfo: CameraErrorInfo = {
        code: 'UNSUPPORTED_BROWSER',
        title: 'WebRTC Unsupported',
        message: 'Your browser environment does not support webcam media devices.',
        suggestion: 'Please use a modern browser such as Chrome, Edge, Safari, or Firefox.',
      };
      setError(errInfo);
      setStatus('error');
      return false;
    }

    // Stop existing stream first if active
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setStatus('requesting');
    setError(null);

    const targetDeviceId = deviceIdToUse || selectedDeviceId;

    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 60 },
    };

    if (targetDeviceId) {
      videoConstraints.deviceId = { exact: targetDeviceId };
    } else {
      videoConstraints.facingMode = 'user';
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().catch((e) => {
              console.warn('Autoplay error caught gracefully:', e);
            });

            const videoTrack = stream.getVideoTracks()[0];
            const trackSettings = videoTrack?.getSettings?.() || {};

            setMetrics({
              width: videoRef.current.videoWidth || trackSettings.width || 1280,
              height: videoRef.current.videoHeight || trackSettings.height || 720,
              frameRate: trackSettings.frameRate || 30,
              aspectRatio:
                videoRef.current.videoWidth && videoRef.current.videoHeight
                  ? videoRef.current.videoWidth / videoRef.current.videoHeight
                  : 16 / 9,
              facingMode: trackSettings.facingMode || 'user',
            });
          }
        };
      }

      setStatus('active');
      setError(null);

      // Refresh device list after permission is granted (to get actual labels)
      refreshDevices();
      return true;
    } catch (err) {
      const parsedErr = parseCameraError(err);
      setError(parsedErr);
      setStatus('error');
      return false;
    }
  }, [selectedDeviceId, refreshDevices]);

  // Switch to another camera device
  const switchCamera = useCallback(async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (status === 'active' || status === 'requesting') {
      return await startCamera(deviceId);
    }
    return true;
  }, [status, startCamera]);

  const toggleMirror = useCallback(() => {
    setIsMirrored((prev) => !prev);
  }, []);

  // Listen for device connects/disconnects
  useEffect(() => {
    refreshDevices();
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
      };
    }
  }, [refreshDevices]);

  // Cleanup stream on component unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return {
    videoRef,
    stream: streamRef.current,
    status,
    error,
    devices,
    selectedDeviceId,
    isMirrored,
    metrics,
    startCamera,
    stopCamera,
    switchCamera,
    toggleMirror,
    refreshDevices,
  };
}
