import React from 'react';
import { Camera, CameraOff, Layers } from 'lucide-react';
import type { CameraStatus } from '../types/camera';

interface HeaderProps {
  status: CameraStatus;
  onToggleCamera: () => void;
  onOpenRoadmap: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  onToggleCamera,
  onOpenRoadmap,
}) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 px-6 sm:px-12 pt-6 sm:pt-10 flex justify-between items-end bg-gradient-to-b from-[#020205]/90 via-[#020205]/40 to-transparent pb-4 backdrop-blur-xs">
      {/* Brand & Logo with Frosted Glass Typography */}
      <div>
        <h1 className="text-3xl sm:text-5xl font-extralight tracking-[0.35em] sm:tracking-[0.4em] text-white opacity-90 mb-1 leading-none font-display">
          AURA
        </h1>
        <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.25em] sm:tracking-[0.3em] text-blue-400 font-bold opacity-60">
          Neuromorphic Particle System // V 1.0.0
        </p>
      </div>

      {/* Right side System Status & Controls */}
      <div className="flex items-center gap-4 sm:gap-6">
        {/* System Status Pill / Telemetry */}
        <div className="hidden md:flex flex-col items-end">
          <span className="text-[9px] uppercase tracking-[0.2em] text-white/40 mb-1">
            System Status
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                status === 'active'
                  ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                  : status === 'requesting'
                  ? 'bg-amber-400 animate-ping shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                  : status === 'error'
                  ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                  : 'bg-white/30'
              }`}
            />
            <span className="text-xs font-mono tracking-wider text-white/90">
              {status === 'active'
                ? 'FEED: LIVE'
                : status === 'requesting'
                ? 'CONNECTING'
                : status === 'error'
                ? 'ERROR'
                : 'STANDBY'}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="hidden md:block h-8 w-[1px] bg-white/10" />

        {/* Environment Pill */}
        <div className="hidden lg:flex flex-col items-end">
          <span className="text-[9px] uppercase tracking-[0.2em] text-white/40 mb-1">
            Environment
          </span>
          <span className="text-xs font-mono tracking-wider uppercase text-white/80">
            Local_Browser
          </span>
        </div>

        {/* Divider */}
        <div className="hidden lg:block h-8 w-[1px] bg-white/10" />

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            id="btn-roadmap"
            onClick={onOpenRoadmap}
            className="px-3.5 sm:px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full backdrop-blur-md flex items-center gap-2 text-white/70 hover:text-white text-[10px] uppercase tracking-[0.2em] font-semibold transition shadow-sm cursor-pointer"
            title="View Roadmap"
          >
            <Layers className="w-3.5 h-3.5 text-white/50" />
            <span className="hidden sm:inline">Roadmap</span>
          </button>

          <button
            id="btn-header-camera-toggle"
            onClick={onToggleCamera}
            className={`px-4 sm:px-6 py-2 sm:py-2.5 text-[10px] uppercase tracking-[0.2em] font-bold rounded-full transition-all shadow-xl flex items-center gap-2 cursor-pointer ${
              status === 'active'
                ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 backdrop-blur-md'
                : 'bg-white text-black hover:bg-blue-300'
            }`}
          >
            {status === 'active' ? (
              <>
                <CameraOff className="w-3.5 h-3.5" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Camera className="w-3.5 h-3.5" />
                <span>{status === 'requesting' ? 'Connecting' : 'Start Camera'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

