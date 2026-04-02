import { useEffect, useState } from "react";

const FRAME_SPEED_MS = 120;

export default function SpriteAnimator({
  sprite,
  frameWidth,
  frameHeight,
  totalFrames,
  displayWidth = frameWidth,
  displayHeight = frameHeight,
  className = "",
  frameClassName = "",
  chrome = true,
  label = "sprite-animation",
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
    width: `${displayWidth}px`,
    height: `${displayHeight}px`,
    backgroundImage: `url(${sprite})`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: `-${frameIndex * displayWidth}px 0px`,
    backgroundSize: `${displayWidth * safeFrames}px ${displayHeight}px`,
    imageRendering: "pixelated",
  };

  const frameElement = (
    <div
      style={spriteStyle}
      aria-label={label}
      className={frameClassName}
    />
  );

  if (!chrome) {
    return (
      <div className={className}>
        {frameElement}
      </div>
    );
  }

  return (
    <div className={`flex justify-center items-center w-full ${className}`}>
      <div className="rounded-xl border border-emerald-500/35 bg-black/45 p-3 shadow-lg shadow-emerald-500/20">
        {frameElement}
      </div>
    </div>
  );
}
