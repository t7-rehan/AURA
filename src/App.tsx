import React, { useState, useEffect } from 'react';
import { useWebcam } from './hooks/useWebcam';
import { Header } from './components/Header';
import { VisualizationViewport } from './components/VisualizationViewport';
import { WebcamPreview } from './components/WebcamPreview';
import { RoadmapModal } from './components/RoadmapModal';
import { HandTrackingService } from './handTracking/HandTrackingService';

export default function App() {
  const {
    videoRef,
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
  } = useWebcam();

  const [isRoadmapOpen, setIsRoadmapOpen] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(false);

  // Pre-load the MediaPipe Hand Landmarker model asset in the background on startup
  useEffect(() => {
    HandTrackingService.initModel().catch(() => {
      // Model loading will retry on demand when camera turns active
    });
  }, []);

  // Synchronize hand tracking lifecycle with camera stream
  useEffect(() => {
    if (status === 'active' && videoRef.current) {
      HandTrackingService.startTracking(videoRef.current).catch((e) => {
        console.error('Failed to start hand tracker:', e);
      });
    } else if (status !== 'active') {
      HandTrackingService.stopTracking();
    }
  }, [status, videoRef]);

  const handleToggleCamera = () => {
    if (status === 'active') {
      stopCamera();
    } else {
      startCamera();
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#020205] text-white select-none">
      {/* Top Header & Telemetry Navigation */}
      <Header
        status={status}
        onToggleCamera={handleToggleCamera}
        onOpenRoadmap={() => setIsRoadmapOpen(true)}
      />

      {/* Main Full-Screen Three.js Particle Universe & Standby Viewport */}
      <VisualizationViewport
        status={status}
        metrics={metrics}
        isMirrored={isMirrored}
        onStartCamera={startCamera}
        onStopCamera={stopCamera}
        isDebugOpen={isDebugOpen}
        onToggleDebug={() => setIsDebugOpen((prev) => !prev)}
      />

      {/* Floating Webcam Debug Console & Persistent HTML5 Video Stream */}
      <WebcamPreview
        videoRef={videoRef}
        status={status}
        error={error}
        metrics={metrics}
        isMirrored={isMirrored}
        devices={devices}
        selectedDeviceId={selectedDeviceId}
        isDebugOpen={isDebugOpen}
        onToggleDebug={() => setIsDebugOpen((prev) => !prev)}
        onStartCamera={startCamera}
        onStopCamera={stopCamera}
        onSwitchCamera={switchCamera}
        onToggleMirror={toggleMirror}
      />

      {/* Architecture Roadmap Modal */}
      <RoadmapModal
        isOpen={isRoadmapOpen}
        onClose={() => setIsRoadmapOpen(false)}
      />
    </div>
  );
}
