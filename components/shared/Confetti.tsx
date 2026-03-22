"use client";

import { useEffect, useState } from "react";

interface ConfettiProps {
  active: boolean;
  duration?: number;
}

const COLORS = ["#00E5B4", "#F0B429", "#00D68F", "#FF4560", "#4A90E2", "#F0F4FF"];
const COUNT = 40;

interface Piece {
  id: number;
  color: string;
  x: number;
  delay: number;
  duration: number;
  size: number;
  rotation: number;
}

export function Confetti({ active, duration = 3000 }: ConfettiProps) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) return;

    const newPieces: Piece[] = Array.from({ length: COUNT }, (_, i) => ({
      id: i,
      color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? COLORS[0]!,
      x: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 2.5 + Math.random() * 1.5,
      size: 6 + Math.random() * 6,
      rotation: Math.random() * 360,
    }));

    setPieces(newPieces);
    setVisible(true);

    const timer = setTimeout(() => {
      setVisible(false);
      setPieces([]);
    }, duration);

    return () => clearTimeout(timer);
  }, [active, duration]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden"
      aria-hidden="true"
    >
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="confetti-piece absolute"
          style={{
            left: `${piece.x}%`,
            top: "-10px",
            width: piece.size,
            height: piece.size,
            backgroundColor: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            transform: `rotate(${piece.rotation}deg)`,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
          }}
        />
      ))}
    </div>
  );
}
