import React, { useState, useEffect, useRef } from 'react';
import { Camera, Sparkles, Bug, X } from 'lucide-react';
import type { CameraStatus, CameraMetrics } from '../types/camera';
import { VisualizationController, type VisualizerMetrics } from '../visualization/VisualizationController';
import { QUALITY_TIERS, PARTICLE_PALETTES, DEFAULT_PARTICLE_COUNT, type QualityTier } from '../particles/ParticleConfig';

interface VisualizationViewportProps {
  status: CameraStatus;
  metrics: CameraMetrics;
  isMirrored: boolean;
  onStartCamera: () => void;
  onStopCamera: () => void;
  isDebugOpen: boolean;
  onToggleDebug: () => void;
}

export const VisualizationViewport: React.FC<VisualizationViewportProps> = ({
  status,
  metrics,
  isMirrored,
  onStartCamera,
  onStopCamera,
  isDebugOpen,
  onToggleDebug,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<VisualizationController | null>(null);

  const [selectedQuality, setSelectedQuality] = useState<QualityTier>('high');
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState<number>(0);

  const [liveMetrics, setLiveMetrics] = useState<VisualizerMetrics>({
    fps: 60,
    particleCount: DEFAULT_PARTICLE_COUNT,
    qualityTier: 'high',
    interactionMode: 'FREE',
    handsDetected: 0,
    activeGestures: [],
    isDualHand: false,
    unifiedPattern: 'FREE',
    groupAPattern: 'FREE',
    groupBPattern: 'FREE',
    groupACount: DEFAULT_PARTICLE_COUNT / 2,
    groupBCount: DEFAULT_PARTICLE_COUNT / 2,
    partitionWeight: 0,
  });

  // Auto-detect optimal quality tier on mount
  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const initialTier: QualityTier = isMobile ? 'performance' : 'high';
    setSelectedQuality(initialTier);
  }, []);

  // Initialize and manage Visualization Controller lifecycle
  useEffect(() => {
    if (status === 'active' && containerRef.current) {
      if (!controllerRef.current) {
        const controller = new VisualizationController();
        controller.initialize(containerRef.current, selectedQuality);
        controller.setMirrored(isMirrored);
        controller.setDebugVisible(isDebugOpen);
        controller.setPalette(selectedPaletteIndex);

        const unsub = controller.subscribeMetrics((m) => {
          setLiveMetrics(m);
        });

        controller.start();
        controllerRef.current = controller;

        return () => {
          unsub();
          controller.dispose();
          controllerRef.current = null;
        };
      } else {
        controllerRef.current.setMirrored(isMirrored);
        controllerRef.current.setDebugVisible(isDebugOpen);
        controllerRef.current.start();
      }
    } else if (status !== 'active' && controllerRef.current) {
      controllerRef.current.stop();
      controllerRef.current.dispose();
      controllerRef.current = null;
    }
  }, [status]);

  // Propagate mirrored state changes
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setMirrored(isMirrored);
    }
  }, [isMirrored]);

  // Propagate debug toggle
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setDebugVisible(isDebugOpen);
    }
  }, [isDebugOpen]);

  // Propagate quality tier changes
  const handleQualityChange = (tier: QualityTier) => {
    setSelectedQuality(tier);
    if (controllerRef.current) {
      controllerRef.current.setQualityTier(tier);
    }
  };

  // Propagate palette changes
  const handlePaletteChange = (idx: number) => {
    setSelectedPaletteIndex(idx);
    if (controllerRef.current) {
      controllerRef.current.setPalette(idx);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-black text-white select-none">
      {/* ========================================================================= */}
      {/* 1. ACTIVE IMMERSIVE WEBGL PARTICLE UNIVERSE (#000000 Background)          */}
      {/* ========================================================================= */}
      {status === 'active' && (
        <div className="relative w-full h-full bg-[#000000] overflow-hidden">
          {/* Three.js Canvas Container (Clips strictly to viewport) */}
          <div
            id="particle-webgl-canvas-container"
            ref={containerRef}
            className="absolute inset-0 w-full h-full z-0 cursor-crosshair overflow-hidden"
          />

          {/* Minimalist Floating Immersive Top Bar */}
          <div className="absolute top-5 left-5 right-5 z-20 flex justify-between items-center gap-3 pointer-events-none">
            {/* Left Brand Badge */}
            <div className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-black/50 backdrop-blur-xl border border-white/10 shadow-2xl">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                <span className="text-xs font-light tracking-[0.3em] uppercase text-white/90 font-display">
                  AURA
                </span>
              </div>
              <span className="text-white/20">|</span>
              <span className="text-[9px] font-mono text-white/60 tracking-wider">
                {liveMetrics.particleCount.toLocaleString()} PTS
              </span>
              <span className="text-white/20">|</span>
              <span className="text-[9px] font-mono text-emerald-400/90 font-bold">
                {liveMetrics.fps} FPS
              </span>
            </div>

            {/* Right Controls Suite (Minimal Palette, Particle Tier & Debug) */}
            <div className="pointer-events-auto flex items-center gap-2">
              {/* Minimal Palette Switcher */}
              <div className="hidden sm:flex items-center gap-1 p-1 bg-black/50 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl">
                {PARTICLE_PALETTES.map((pal, idx) => (
                  <button
                    key={pal.name}
                    id={`btn-palette-${idx}`}
                    onClick={() => handlePaletteChange(idx)}
                    className={`px-2.5 py-1 rounded-full text-[9px] font-mono tracking-wider transition cursor-pointer ${
                      selectedPaletteIndex === idx
                        ? 'bg-white/20 text-white font-bold border border-white/30'
                        : 'text-white/40 hover:text-white/80'
                    }`}
                    title={pal.name}
                  >
                    {pal.name.split(' ')[0]}
                  </button>
                ))}
              </div>

              {/* Particle Density / Quality Presets */}
              <div className="hidden md:flex items-center gap-1 p-1 bg-black/50 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl">
                {(Object.keys(QUALITY_TIERS) as QualityTier[]).map((tier) => (
                  <button
                    key={tier}
                    id={`btn-quality-${tier}`}
                    onClick={() => handleQualityChange(tier)}
                    className={`px-2.5 py-1 rounded-full text-[9px] font-mono uppercase tracking-wider transition cursor-pointer ${
                      selectedQuality === tier
                        ? 'bg-cyan-500/30 text-cyan-300 font-bold border border-cyan-400/40'
                        : 'text-white/40 hover:text-white/80'
                    }`}
                    title={QUALITY_TIERS[tier].description}
                  >
                    {QUALITY_TIERS[tier].label.split(' ')[0]}
                  </button>
                ))}
              </div>

              {/* Debug Toggle Button */}
              <button
                id="btn-toggle-debug-mode"
                onClick={onToggleDebug}
                className={`p-2 rounded-full border transition backdrop-blur-xl shadow-2xl cursor-pointer ${
                  isDebugOpen
                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                    : 'bg-black/50 border-white/10 text-white/50 hover:text-white'
                }`}
                title={isDebugOpen ? 'Hide Debug View' : 'Show Debug View'}
              >
                <Bug className="w-3.5 h-3.5" />
              </button>

              {/* Exit Visualization Mode Button */}
              <button
                id="btn-exit-visualization"
                onClick={onStopCamera}
                className="px-3.5 py-1.5 bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 rounded-full text-[10px] uppercase font-mono tracking-wider transition backdrop-blur-xl shadow-2xl flex items-center gap-1.5 cursor-pointer"
                title="Exit Visualization"
              >
                <X className="w-3 h-3" />
                <span className="hidden sm:inline">Exit</span>
              </button>
            </div>
          </div>

          {/* Minimalist Floating Bottom Gesture & Mode Indicator */}
          <div className="absolute bottom-6 left-0 right-0 z-20 flex justify-center pointer-events-none px-4">
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 px-5 py-2 rounded-full bg-black/65 backdrop-blur-2xl border border-white/15 shadow-[0_0_30px_rgba(0,0,0,0.8)] transition-all duration-300">
              {/* Interaction Mode Pulse Tag */}
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    liveMetrics.interactionMode === 'REPEL'
                      ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,1)]'
                      : liveMetrics.interactionMode === 'ATTRACT'
                      ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,1)]'
                      : liveMetrics.interactionMode === 'DUAL_CONTROL'
                      ? 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,1)]'
                      : 'bg-cyan-400/80 shadow-[0_0_8px_rgba(34,211,238,0.7)]'
                  }`}
                />
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold text-white/90">
                  {liveMetrics.interactionMode === 'DUAL_CONTROL'
                    ? 'DUAL UNIVERSE CONTROL'
                    : liveMetrics.interactionMode === 'REPEL'
                    ? 'REPEL FORCE (OPEN PALM)'
                    : liveMetrics.interactionMode === 'ATTRACT'
                    ? 'ATTRACT NEXUS (PINCH)'
                    : liveMetrics.handsDetected > 0
                    ? 'FLUID WAKE & VORTEX'
                    : 'COSMIC STREAM'}
                </span>
              </div>

              <span className="text-white/20">|</span>

              {/* Hand Detection Details */}
              <span className="text-[10px] font-mono text-white/60 tracking-wider">
                {liveMetrics.handsDetected === 0
                  ? 'AWAITING HANDS'
                  : liveMetrics.handsDetected === 1
                  ? `1 HAND LINKED (${liveMetrics.particleCount.toLocaleString()} PTS)`
                  : `GROUP A: ${liveMetrics.groupACount.toLocaleString()} PTS | GROUP B: ${liveMetrics.groupBCount.toLocaleString()} PTS`}
              </span>

              {/* Active Gesture Sub-pills if Dual Mode */}
              {liveMetrics.activeGestures.length > 0 && (
                <>
                  <span className="text-white/20">|</span>
                  <div className="flex items-center gap-1.5">
                    {liveMetrics.activeGestures.map((g, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-full text-[8px] font-mono uppercase bg-white/10 text-white/80 border border-white/10"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Development Diagnostics Overlay (Only visible in Debug Mode) */}
          {isDebugOpen && (
            <div
              id="pipeline-diagnostics-overlay"
              className="absolute top-20 left-5 z-30 p-3.5 rounded-2xl bg-black/80 backdrop-blur-2xl border border-white/15 shadow-2xl text-[10px] font-mono text-white/90 space-y-2 pointer-events-auto max-w-[280px]"
            >
              <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                <span className="font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Pipeline Diagnostics
                </span>
                <span className="text-[9px] text-white/40">v0.5.0</span>
              </div>

              {/* Video Pipeline */}
              <div className="space-y-0.5">
                <div className="text-[9px] uppercase tracking-wider text-white/40 font-bold">1. Video Input</div>
                <div className="flex justify-between text-white/70">
                  <span>Resolution:</span>
                  <span className="text-white font-bold">{metrics.width}x{metrics.height}</span>
                </div>
                <div className="flex justify-between text-white/70">
                  <span>Stream FPS:</span>
                  <span className="text-white font-bold">{metrics.frameRate} FPS</span>
                </div>
                <div className="flex justify-between text-white/70">
                  <span>Mirror Mode:</span>
                  <span className={isMirrored ? 'text-cyan-400 font-bold' : 'text-amber-400 font-bold'}>
                    {isMirrored ? 'MIRRORED (USER)' : 'DIRECT'}
                  </span>
                </div>
              </div>

              {/* MediaPipe Pipeline */}
              <div className="space-y-0.5 pt-1 border-t border-white/10">
                <div className="text-[9px] uppercase tracking-wider text-white/40 font-bold">2. Hand Landmarker</div>
                <div className="flex justify-between text-white/70">
                  <span>Hands Tracked:</span>
                  <span className="text-white font-bold">{liveMetrics.handsDetected} / 2</span>
                </div>
                <div className="flex justify-between text-white/70">
                  <span>Interaction Mode:</span>
                  <span className="text-emerald-400 font-bold">{liveMetrics.interactionMode}</span>
                </div>
                <div className="flex justify-between text-white/70">
                  <span>Visual Cursor:</span>
                  <span className="text-cyan-400 font-bold">ACTIVE (WORLD 3D)</span>
                </div>
              </div>

              {/* Three.js Particle Engine */}
              <div className="space-y-0.5 pt-1 border-t border-white/10">
                <div className="text-[9px] uppercase tracking-wider text-white/40 font-bold">3. WebGL Particles</div>
                <div className="flex justify-between text-white/70">
                  <span>Count:</span>
                  <span className="text-white font-bold">{liveMetrics.particleCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-white/70">
                  <span>Render Rate:</span>
                  <span className="text-emerald-400 font-bold">{liveMetrics.fps} FPS</span>
                </div>
                <div className="flex justify-between text-white/70">
                  <span>Quality Tier:</span>
                  <span className="text-cyan-400 font-bold uppercase">{liveMetrics.qualityTier}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. STANDBY AURA LANDING STAGE (When camera is NOT active)                 */}
      {/* ========================================================================= */}
      {status !== 'active' && (
        <div className="relative w-full h-full flex flex-col justify-between overflow-hidden bg-[#020205] text-white">
          {/* Soft Ambient Radial Diffusion Glows */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-cyan-900/20 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] bg-purple-900/20 rounded-full blur-[100px]" />
          </div>

          {/* Top spacing */}
          <div className="h-24 sm:h-28" />

          {/* Central Frosted Glass Circular Core Stage */}
          <main className="flex-1 flex flex-col items-center justify-center relative z-10 px-4">
            <div className="relative group">
              {/* Concentric Ambient Glass Rings */}
              <div className="absolute inset-0 bg-white/[0.02] rounded-full border border-white/5 scale-[1.2] transition-transform duration-700 group-hover:scale-[1.25]" />
              <div className="absolute inset-0 bg-white/[0.01] rounded-full border border-white/5 scale-[1.5] transition-transform duration-700 group-hover:scale-[1.55]" />

              {/* Main Frosted Glass Disc */}
              <div className="w-80 h-80 sm:w-96 sm:h-96 rounded-full flex flex-col items-center justify-center border border-white/10 bg-white/[0.03] backdrop-blur-3xl shadow-2xl relative overflow-hidden transition-all duration-500">
                {/* Subtle Gradient Sheen */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent opacity-50 pointer-events-none" />

                {/* Inner Content */}
                <div className="z-10 flex flex-col items-center gap-3 sm:gap-3.5 text-center px-6 sm:px-10">
                  {/* Glass Icon Circle */}
                  <div className="w-12 h-12 flex items-center justify-center rounded-full bg-white/5 border border-white/10 shadow-inner">
                    {status === 'requesting' ? (
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Sparkles className="w-5 h-5 text-cyan-400 animate-pulse" />
                    )}
                  </div>

                  {/* Headings */}
                  <h2 className="text-xl sm:text-2xl font-light tracking-wide text-white">
                    {status === 'requesting'
                      ? 'Requesting Access'
                      : 'Enter Particle Universe'}
                  </h2>

                  <p className="text-xs leading-relaxed text-white/40 max-w-[240px] sm:max-w-[270px]">
                    Immerse in fluid, luminous streams of energy. Create vortexes, wake trails, and dual-hand partitioned particle fields.
                  </p>

                  {/* Action Button */}
                  <button
                    id="btn-viewport-start-camera"
                    onClick={onStartCamera}
                    disabled={status === 'requesting'}
                    className="mt-2 sm:mt-3 px-8 py-3 bg-white text-black text-[10px] uppercase tracking-[0.2em] font-bold rounded-full hover:bg-cyan-200 transition-colors shadow-xl cursor-pointer disabled:opacity-50 flex items-center gap-2"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{status === 'requesting' ? 'Requesting...' : 'Start Camera'}</span>
                  </button>
                </div>
              </div>
            </div>
          </main>

          {/* Footer Bar */}
          <footer className="z-10 px-6 sm:px-12 pb-8 sm:pb-12 flex justify-between items-center mt-auto">
            <div className="flex gap-6 sm:gap-8">
              <div className="flex flex-col">
                <span className="text-[8px] uppercase tracking-[0.2em] text-white/30 mb-1 font-bold">
                  Fluid Dynamics
                </span>
                <span className="text-[10px] tracking-wide text-white/80 font-mono">
                  v0.4.4 // Responsive Frustum Bounds
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[8px] uppercase tracking-[0.2em] text-white/30 mb-1 font-bold">
                  Interaction
                </span>
                <span className="text-[10px] tracking-wide text-white/60 font-mono">
                  Wake / Curl / Dual Universe
                </span>
              </div>

              <div className="hidden md:flex flex-col">
                <span className="text-[8px] uppercase tracking-[0.2em] text-white/30 mb-1 font-bold">
                  Default Density
                </span>
                <span className="text-[10px] tracking-wide text-emerald-400 font-mono">
                  8,000 Flowing Particles
                </span>
              </div>
            </div>

            <div className="text-[9px] uppercase tracking-[0.3em] text-white/20 font-light text-right">
              Designed for the Future &copy; 2024 Aura Lab
            </div>
          </footer>
        </div>
      )}
    </div>
  );
};
