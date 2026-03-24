import { useEffect, useState } from "react";

const FRAME_SPEED_MS = 120;

export default function SpriteAnimator({
  sprite,
  frameWidth,
  frameHeight,
  totalFrames,
}) {
  const safeFrames = Math.max(1, Number(totalFrames) || 1);
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (safeFrames <= 1) {
      return;
    }

    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % safeFrames);
    }, FRAME_SPEED_MS);

    return () => {
      clearInterval(timer);
    };
  }, [safeFrames]);

  const spriteStyle = {
    width: `${frameWidth}px`,
    height: `${frameHeight}px`,
    backgroundImage: `url(${sprite})`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: `-${frameIndex * frameWidth}px 0px`,
    backgroundSize: `${frameWidth * safeFrames}px ${frameHeight}px`,
    imageRendering: "pixelated",
  };

  return (
    <div className="flex justify-center items-center w-full">
      <div className="rounded-xl border border-emerald-500/35 bg-black/45 p-3 shadow-lg shadow-emerald-500/20">
        <div style={spriteStyle} aria-label="sprite-animation" />
      </div>
    </div>
  );
}
