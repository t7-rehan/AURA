import React, { useRef, useEffect } from 'react';
import { HandTrackingService } from '../handTracking/HandTrackingService';
import { HAND_CONNECTIONS, HandLandmark, type HandState } from '../handTracking/handTypes';

interface HandLandmarkOverlayProps {
  isMirrored: boolean;
  className?: string;
}

export const HandLandmarkOverlay: React.FC<HandLandmarkOverlayProps> = ({
  isMirrored,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mirroredRef = useRef(isMirrored);

  useEffect(() => {
    mirroredRef.current = isMirrored;
  }, [isMirrored]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const unsubscribe = HandTrackingService.subscribeFrame((interactionState) => {
      if (!canvas) return;
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      if (!interactionState || interactionState.hands.length === 0) {
        return;
      }

      const isMirroredCurrent = mirroredRef.current;

      // Coordinate mapping helper
      const mapPoint = (normX: number, normY: number) => {
        const x = isMirroredCurrent ? (1 - normX) * width : normX * width;
        const y = normY * height;
        return { x, y };
      };

      for (const hand of interactionState.hands) {
        drawHand(ctx, hand, mapPoint);
      }

      // If 2 hands detected, draw dynamic interaction line between palm centers
      if (interactionState.hands.length >= 2) {
        const p1 = mapPoint(interactionState.hands[0].palmCenter.x, interactionState.hands[0].palmCenter.y);
        const p2 = mapPoint(interactionState.hands[1].palmCenter.x, interactionState.hands[1].palmCenter.y);

        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Midpoint marker
        if (interactionState.centerPoint) {
          const mid = mapPoint(interactionState.centerPoint.x, interactionState.centerPoint.y);
          ctx.beginPath();
          ctx.arc(mid.x, mid.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
          ctx.fill();
        }
        ctx.restore();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const drawHand = (
    ctx: CanvasRenderingContext2D,
    hand: HandState,
    mapPoint: (x: number, y: number) => { x: number; y: number }
  ) => {
    const isLeft = hand.handedness === 'Left';
    const primaryColor = isLeft ? 'rgba(56, 189, 248, 0.85)' : 'rgba(168, 85, 247, 0.85)';
    const glowColor = isLeft ? 'rgba(56, 189, 248, 0.4)' : 'rgba(168, 85, 247, 0.4)';
    const boneColor = isLeft ? 'rgba(56, 189, 248, 0.5)' : 'rgba(168, 85, 247, 0.5)';

    // 1. Draw Skeleton Bones
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = boneColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
      const p1 = mapPoint(hand.landmarks[startIdx].x, hand.landmarks[startIdx].y);
      const p2 = mapPoint(hand.landmarks[endIdx].x, hand.landmarks[endIdx].y);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Draw Pinch Line if active
    if (hand.isPinching) {
      const thumb = mapPoint(hand.thumbTip.x, hand.thumbTip.y);
      const index = mapPoint(hand.indexTip.x, hand.indexTip.y);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(thumb.x, thumb.y);
      ctx.lineTo(index.x, index.y);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw All 21 Landmark Nodes
    for (let i = 0; i < hand.landmarks.length; i++) {
      const pt = mapPoint(hand.landmarks[i].x, hand.landmarks[i].y);
      const isIndexTip = i === HandLandmark.INDEX_FINGER_TIP;
      const isThumbTip = i === HandLandmark.THUMB_TIP;
      const isWrist = i === HandLandmark.WRIST;

      ctx.save();
      if (isIndexTip || isThumbTip) {
        // Highlight Index and Thumb tips with pulse aura
        const tipColor = isIndexTip ? '#38bdf8' : '#fbbf24';
        
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = tipColor;
        ctx.shadowColor = tipColor;
        ctx.shadowBlur = 12;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else if (isWrist) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = primaryColor;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 4;
        ctx.fill();
      }
      ctx.restore();
    }

    // 4. Draw Handedness & Gesture Badge near Palm
    const palm = mapPoint(hand.palmCenter.x, hand.palmCenter.y);
    ctx.save();
    ctx.font = 'bold 9px monospace';
    
    // Label text
    const label = `${hand.handedness.toUpperCase()}: ${hand.gesture}`;
    const textWidth = ctx.measureText(label).width;
    const badgeW = textWidth + 14;
    const badgeH = 18;
    const badgeX = palm.x - badgeW / 2;
    const badgeY = palm.y - 24;

    // Badge background
    ctx.fillStyle = 'rgba(2, 2, 5, 0.75)';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 9);
    ctx.fill();

    // Badge border
    ctx.strokeStyle = hand.isPinching
      ? 'rgba(245, 158, 11, 0.8)'
      : hand.isOpenPalm
      ? 'rgba(52, 211, 153, 0.8)'
      : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Badge text
    ctx.fillStyle = hand.isPinching
      ? '#fbbf24'
      : hand.isOpenPalm
      ? '#34d399'
      : '#e2e8f0';
    ctx.fillText(label, badgeX + 7, badgeY + 12);
    ctx.restore();
  };

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={360}
      className={`absolute inset-0 w-full h-full pointer-events-none z-10 ${className}`}
    />
  );
};
