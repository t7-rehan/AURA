import React, { useState } from 'react';
import { 
  CameraOff, 
  FlipHorizontal, 
  Maximize2, 
  Minimize2, 
  AlertTriangle, 
  SlidersHorizontal,
  ChevronDown,
  EyeOff,
  Hand,
  X
} from 'lucide-react';
import type { CameraStatus, CameraErrorInfo, CameraMetrics } from '../types/camera';
import { HandLandmarkOverlay } from './HandLandmarkOverlay';
import { HandTrackingStatusHUD } from './HandTrackingStatusHUD';

interface WebcamPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: CameraErrorInfo | null;
  metrics: CameraMetrics;
  isMirrored: boolean;
  devices: MediaDeviceInfo[];
  selectedDeviceId: string;
  isDebugOpen: boolean;
  onToggleDebug: () => void;
  onStartCamera: () => void;
  onStopCamera: () => void;
  onSwitchCamera: (deviceId: string) => void;
  onToggleMirror: () => void;
}

export const WebcamPreview: React.FC<WebcamPreviewProps> = ({
  videoRef,
  status,
  error,
  metrics,
  isMirrored,
  devices,
  selectedDeviceId,
  isDebugOpen,
  onToggleDebug,
  onStartCamera,
  onStopCamera,
  onSwitchCamera,
  onToggleMirror,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [showHudCard, setShowHudCard] = useState(true);

  // Single persistent video element always mounted so MediaPipe frames never stall
  return (
    <>
      {/* Floating Webcam Debug Panel */}
      <div
        id="webcam-floating-panel"
        className={`fixed bottom-6 sm:bottom-10 right-6 sm:right-10 z-40 flex flex-col items-end gap-3 transition-all duration-300 ${
          isDebugOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Two-Hand Tracking Status Panel */}
        {status === 'active' && showHudCard && isDebugOpen && (
          <HandTrackingStatusHUD />
        )}

        {/* Frosted Glass Floating Card */}
        <div className="w-72 sm:w-80 bg-black/85 backdrop-blur-2xl rounded-2xl border border-white/20 overflow-hidden relative shadow-2xl transition-all duration-300">
          
          {/* Top bar with status & utility buttons */}
          <div className="absolute top-3 left-3 right-3 z-20 flex justify-between items-center pointer-events-auto">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  status === 'active'
                    ? 'bg-emerald-400 animate-pulse'
                    : status === 'requesting'
                    ? 'bg-amber-400 animate-ping'
                    : status === 'error'
                    ? 'bg-rose-500'
                    : 'bg-white/30'
                }`}
              />
              <span className="text-[9px] uppercase tracking-widest font-bold text-white/90 font-mono">
                Vision_Debug
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {status === 'active' && (
                <>
                  <button
                    id="btn-toggle-landmarks-overlay"
                    onClick={() => setShowLandmarks(!showLandmarks)}
                    className={`p-1 rounded-md transition border ${
                      showLandmarks
                        ? 'text-blue-400 bg-blue-500/10 border-blue-400/40'
                        : 'text-white/40 bg-black/40 border-white/10'
                    }`}
                    title={showLandmarks ? 'Landmark Skeleton On' : 'Landmark Skeleton Off'}
                  >
                    <Hand className="w-3 h-3" />
                  </button>

                  <button
                    id="btn-toggle-hud-settings"
                    onClick={() => setShowSettings(!showSettings)}
                    className={`p-1 rounded-md text-white/50 hover:text-white bg-black/40 hover:bg-black/70 border border-white/10 transition ${
                      showSettings ? 'text-blue-400 border-blue-400/40' : ''
                    }`}
                    title="Camera Settings"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                  </button>
                </>
              )}

              <button
                id="btn-toggle-minimize"
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1 rounded-md text-white/50 hover:text-white bg-black/40 hover:bg-black/70 border border-white/10 transition"
                title={isMinimized ? 'Expand' : 'Minimize'}
              >
                {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
              </button>

              <button
                id="btn-close-debug-view"
                onClick={onToggleDebug}
                className="p-1 rounded-md text-white/50 hover:text-white bg-black/40 hover:bg-black/70 border border-white/10 transition"
                title="Close Debug View"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Video Area (Single persistent HTML5 video element) */}
          <div
            className={`relative w-full aspect-video bg-gradient-to-br from-zinc-900 via-neutral-950 to-black flex items-center justify-center overflow-hidden transition-all duration-300 ${
              isMinimized ? 'h-0 aspect-auto overflow-hidden' : ''
            }`}
          >
            {/* Visual Video Stream (Never unmounted, never display:none) */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-transform duration-300 ${
                isMirrored ? 'scale-x-[-1]' : 'scale-x-100'
              } ${status === 'active' ? 'opacity-100' : 'opacity-0'}`}
            />

            {/* Visual Hand Landmark Skeleton Overlay */}
            {status === 'active' && showLandmarks && isDebugOpen && !isMinimized && (
              <HandLandmarkOverlay isMirrored={isMirrored} />
            )}

            {/* Scanline overlay for subtle texture */}
            {status === 'active' && !isMinimized && (
              <div className="absolute inset-0 pointer-events-none hud-scanline opacity-15" />
            )}

            {/* Inactive Standby State */}
            {(status === 'uninitialized' || status === 'stopped') && !isMinimized && (
              <div className="flex flex-col items-center gap-2 opacity-40">
                <EyeOff className="w-6 h-6 text-white" />
                <span className="text-[9px] uppercase tracking-widest font-mono">Standby</span>
              </div>
            )}

            {/* Requesting Access State */}
            {status === 'requesting' && !isMinimized && (
              <div className="flex flex-col items-center gap-2.5 p-4 text-center">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span className="text-[9px] uppercase tracking-widest text-white/80 font-mono">
                  Awaiting Permission
                </span>
              </div>
            )}

            {/* Error State */}
            {status === 'error' && error && !isMinimized && (
              <div className="flex flex-col items-center gap-1.5 p-4 text-center z-10">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <span className="text-[10px] font-medium text-rose-300">{error.title}</span>
                <button
                  id="btn-retry-camera"
                  onClick={onStartCamera}
                  className="mt-1 px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/15 rounded-full text-[9px] uppercase tracking-widest font-mono transition"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Bottom Gradient HUD with FPS and details */}
            {!isMinimized && (
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] uppercase tracking-widest font-bold text-white/60">
                    {status === 'active' ? (isMirrored ? 'Mirrored Stream' : 'Direct Stream') : 'Optical Matrix'}
                  </span>
                  <span className="text-[8px] font-mono text-white/40">
                    {status === 'active' ? `${metrics.frameRate}.00 FPS` : '0.00 FPS'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* In-HUD Settings Drawer */}
          {!isMinimized && showSettings && status === 'active' && (
              <div className="p-3 bg-black/90 border-t border-white/10 text-xs flex flex-col gap-2">
                {devices.length > 1 && (
                  <div>
                    <label className="text-[9px] uppercase tracking-widest text-white/40 block mb-1 font-mono">
                      Input Device
                    </label>
                    <div className="relative">
                      <select
                        value={selectedDeviceId}
                        onChange={(e) => onSwitchCamera(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white/90 text-xs appearance-none pr-8 focus:outline-none"
                      >
                        {devices.map((device, idx) => (
                          <option key={device.deviceId || idx} value={device.deviceId} className="bg-neutral-900 text-white">
                            {device.label || `Camera ${idx + 1}`}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-white/40 absolute right-2.5 top-2.5 pointer-events-none" />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-white/60">Horizontal Mirror</span>
                  <button
                    id="btn-toggle-mirror"
                    onClick={onToggleMirror}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] border transition ${
                      isMirrored
                        ? 'bg-white/15 border-white/30 text-white'
                        : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                  >
                    <FlipHorizontal className="w-3 h-3" />
                    <span>{isMirrored ? 'On' : 'Off'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-white/60">Tracking Telemetry</span>
                  <button
                    id="btn-toggle-hud-card"
                    onClick={() => setShowHudCard(!showHudCard)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] border transition ${
                      showHudCard
                        ? 'bg-blue-500/20 border-blue-400/40 text-blue-300'
                        : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                  >
                    <span>{showHudCard ? 'Shown' : 'Hidden'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
    </>
  );
};
