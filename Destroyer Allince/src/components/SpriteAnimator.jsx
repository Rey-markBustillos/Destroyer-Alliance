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
  const safeFrameWidth = Math.max(1, Number(frameWidth) || 1);
  const safeFrameHeight = Math.max(1, Number(frameHeight) || 1);
  const safeDisplayWidth = Math.max(1, Number(displayWidth) || safeFrameWidth);
  const safeDisplayHeight = Math.max(1, Number(displayHeight) || safeFrameHeight);
  const scaleX = safeDisplayWidth / safeFrameWidth;
  const scaleY = safeDisplayHeight / safeFrameHeight;
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

  useEffect(() => {
    setFrameIndex(0);
  }, [sprite, safeFrameWidth, safeFrameHeight, safeFrames]);

  const spriteStyle = {
    width: `${safeDisplayWidth}px`,
    height: `${safeDisplayHeight}px`,
    backgroundImage: `url(${sprite})`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: `-${frameIndex * safeFrameWidth * scaleX}px 0px`,
    backgroundSize: `${safeFrameWidth * safeFrames * scaleX}px ${safeFrameHeight * scaleY}px`,
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
