import React from 'react';
import { 
  X, 
  CheckCircle2, 
  Circle, 
  Cpu, 
  Camera, 
  Hand, 
  Sparkles, 
  BrainCircuit, 
  Layers 
} from 'lucide-react';

interface RoadmapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STAGES = [
  {
    stage: '01',
    title: 'Camera & Foundation',
    status: 'completed',
    icon: Camera,
    desc: 'Project structure, dark futuristic HUD, local webcam capture, horizontal mirror, device switching & stream lifecycle management.',
  },
  {
    stage: '02',
    title: 'MediaPipe Two-Hand Tracking',
    status: 'completed',
    icon: Hand,
    desc: 'Real-time two-hand 3D landmark extraction, exponential smoothing, velocity tracking, and normalized OPEN_PALM / PINCH gesture detection.',
  },
  {
    stage: '03',
    title: 'GPU Particle Engine & Universe',
    status: 'completed',
    icon: Sparkles,
    desc: 'Immersive full-screen WebGL particle field (6,000 to 55,000+ points), pure black cosmos, OPEN_PALM repel, PINCH attraction nexus, and two-hand spatial expansion.',
  },
  {
    stage: '04',
    title: 'Fluid Dynamics, Trails & Dual-Hand Groups',
    status: 'completed',
    icon: Cpu,
    desc: 'Velocity-aware anisotropic motion trails, fluid wake momentum, tangential vortex dynamics, coherent flow fields, and independent dual-hand particle universe partitioning.',
  },
  {
    stage: '05',
    title: 'Neural Classifier & Presets',
    status: 'upcoming',
    icon: BrainCircuit,
    desc: 'Extended gesture library, audio-reactive harmonic synthesis, and multi-layered custom visual shader presets.',
  },
];

export const RoadmapModal: React.FC<RoadmapModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fadeIn">
      <div className="relative w-full max-w-2xl rounded-3xl bg-[#020205]/95 border border-white/10 shadow-2xl overflow-hidden backdrop-blur-3xl text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/80">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display font-light text-lg tracking-wide text-white">
                AURA Architecture Roadmap
              </h3>
              <p className="text-[10px] uppercase tracking-widest text-blue-400 font-mono">
                Progressive Module Expansion
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-white/40 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Roadmap Steps */}
        <div className="p-6 sm:p-8 max-h-[65vh] overflow-y-auto space-y-3.5">
          {STAGES.map((item) => {
            const Icon = item.icon;
            const isCompleted = item.status === 'completed';

            return (
              <div
                key={item.stage}
                className={`relative p-4 rounded-2xl border transition-all ${
                  isCompleted
                    ? 'bg-white/[0.05] border-white/20 shadow-lg'
                    : 'bg-white/[0.01] border-white/5 opacity-70'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center ${
                      isCompleted
                        ? 'bg-white text-black font-bold shadow-md'
                        : 'bg-white/5 text-white/40 border border-white/10'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-blue-400 font-bold">
                          STAGE {item.stage}
                        </span>
                        <h4 className="font-medium text-sm text-white/90">{item.title}</h4>
                      </div>
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Active (v1.0)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-white/30 bg-white/5 border border-white/5 px-2.5 py-0.5 rounded-full">
                          <Circle className="w-2 h-2" />
                          <span>Upcoming</span>
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-white/50 leading-relaxed font-light">
                      {item.desc}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-8 py-4 bg-white/[0.02] border-t border-white/[0.08] flex items-center justify-between text-xs text-white/40">
          <span className="text-[10px] uppercase tracking-widest font-mono">Zero Cloud Telemetry • 100% In-Browser</span>
          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs uppercase tracking-widest font-semibold transition cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
