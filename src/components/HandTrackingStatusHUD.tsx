import React, { useState, useEffect } from 'react';
import { HandTrackingService } from '../handTracking/HandTrackingService';
import type { HandInteractionState, TrackerStatus } from '../handTracking/handTypes';
import { Hand, Sparkles } from 'lucide-react';

export const HandTrackingStatusHUD: React.FC = () => {
  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [interactionState, setInteractionState] = useState<HandInteractionState>({
    hands: [],
    handsCount: 0,
    timestamp: 0,
  });

  useEffect(() => {
    // Subscribe to status changes
    const unsubStatus = HandTrackingService.subscribeStatus((newStatus) => {
      setStatus(newStatus);
    });

    // Throttled UI state updates to avoid React re-rendering 60 times/sec
    let lastUiUpdate = 0;
    const unsubFrame = HandTrackingService.subscribeFrame((state) => {
      const now = performance.now();
      // Throttle UI React state updates to ~12Hz (every 80ms)
      if (now - lastUiUpdate >= 80) {
        lastUiUpdate = now;
        setInteractionState(state);
      }
    });

    return () => {
      unsubStatus();
      unsubFrame();
    };
  }, []);

  const leftHand = interactionState.hands.find((h) => h.handedness === 'Left');
  const rightHand = interactionState.hands.find((h) => h.handedness === 'Right');
  const handsCount = interactionState.handsCount;

  return (
    <div
      id="hand-tracking-hud"
      className="w-72 sm:w-80 bg-black/60 backdrop-blur-2xl rounded-2xl border border-white/10 p-3.5 shadow-2xl transition-all duration-300 text-white"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Hand className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[10px] uppercase tracking-widest font-bold text-white/90 font-mono">
            Hand Tracking
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              status === 'tracking' && handsCount > 0
                ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                : status === 'tracking'
                ? 'bg-blue-400'
                : status === 'loading_model'
                ? 'bg-amber-400 animate-ping'
                : status === 'error'
                ? 'bg-rose-500'
                : 'bg-white/30'
            }`}
          />
          <span className="text-[9px] font-mono uppercase tracking-wider text-white/70 font-semibold">
            {status === 'tracking' && handsCount > 0
              ? 'ACTIVE'
              : status === 'tracking'
              ? 'SCANNING'
              : status === 'loading_model'
              ? 'INITIALIZING'
              : status === 'ready'
              ? 'READY'
              : 'STANDBY'}
          </span>
        </div>
      </div>

      {/* Hands Detected Counter */}
      <div className="flex items-center justify-between py-2 text-xs">
        <span className="text-[10px] uppercase tracking-widest text-white/50 font-mono">
          Hands Detected
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
              handsCount > 0
                ? 'bg-white/15 text-white border border-white/20'
                : 'bg-white/5 text-white/40'
            }`}
          >
            {handsCount} / 2
          </span>
        </div>
      </div>

      {/* Hand Slots Data */}
      <div className="space-y-2 pt-1">
        {/* Left Hand Slot */}
        <div
          className={`p-2 rounded-xl border transition-all ${
            leftHand
              ? 'bg-sky-500/10 border-sky-500/30'
              : 'bg-white/[0.02] border-white/5 opacity-50'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-mono uppercase tracking-wider font-bold text-sky-400">
              Left Hand
            </span>
            {leftHand ? (
              <span
                className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded font-bold ${
                  leftHand.gesture === 'PINCH'
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                    : leftHand.gesture === 'OPEN_PALM'
                    ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'
                    : 'bg-white/10 text-white/70'
                }`}
              >
                {leftHand.gesture}
              </span>
            ) : (
              <span className="text-[8px] font-mono text-white/30 uppercase">No Signal</span>
            )}
          </div>

          {leftHand ? (
            <div className="grid grid-cols-2 gap-1 text-[9px] font-mono text-white/80">
              <div>
                <span className="text-white/40 mr-1">Index:</span>
                X {leftHand.indexTip.x.toFixed(2)} Y {leftHand.indexTip.y.toFixed(2)}
              </div>
              <div className="text-right">
                <span className="text-white/40 mr-1">Vel:</span>
                {leftHand.speed.toFixed(3)}
              </div>
            </div>
          ) : (
            <div className="text-[9px] font-mono text-white/30 italic">
              Awaiting hand presence...
            </div>
          )}
        </div>

        {/* Right Hand Slot */}
        <div
          className={`p-2 rounded-xl border transition-all ${
            rightHand
              ? 'bg-purple-500/10 border-purple-500/30'
              : 'bg-white/[0.02] border-white/5 opacity-50'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-mono uppercase tracking-wider font-bold text-purple-400">
              Right Hand
            </span>
            {rightHand ? (
              <span
                className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded font-bold ${
                  rightHand.gesture === 'PINCH'
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                    : rightHand.gesture === 'OPEN_PALM'
                    ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'
                    : 'bg-white/10 text-white/70'
                }`}
              >
                {rightHand.gesture}
              </span>
            ) : (
              <span className="text-[8px] font-mono text-white/30 uppercase">No Signal</span>
            )}
          </div>

          {rightHand ? (
            <div className="grid grid-cols-2 gap-1 text-[9px] font-mono text-white/80">
              <div>
                <span className="text-white/40 mr-1">Index:</span>
                X {rightHand.indexTip.x.toFixed(2)} Y {rightHand.indexTip.y.toFixed(2)}
              </div>
              <div className="text-right">
                <span className="text-white/40 mr-1">Vel:</span>
                {rightHand.speed.toFixed(3)}
              </div>
            </div>
          ) : (
            <div className="text-[9px] font-mono text-white/30 italic">
              Awaiting hand presence...
            </div>
          )}
        </div>
      </div>

      {/* Two-Hand Interaction Metrics */}
      {handsCount >= 2 && interactionState.handDistance !== undefined && (
        <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[9px] font-mono text-white/70">
          <div className="flex items-center gap-1 text-blue-400">
            <Sparkles className="w-3 h-3" />
            <span>Dual Hand Link</span>
          </div>
          <div>
            <span className="text-white/40 mr-1">Span:</span>
            {interactionState.handDistance.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
};
