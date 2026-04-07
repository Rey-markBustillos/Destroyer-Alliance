import { useEffect, useMemo, useState } from "react";

const getViewportSize = () => {
  if (typeof window === "undefined") {
    return { width: 0, height: 0 };
  }

  const viewport = window.visualViewport;

  return {
    width: Math.round(Number(viewport?.width ?? window.innerWidth ?? 0) || 0),
    height: Math.round(Number(viewport?.height ?? window.innerHeight ?? 0) || 0),
  };
};

export default function ScaledStage({
  children,
  baseWidth = 1280,
  baseHeight = 720,
  padding = 12,
  className = "",
}) {
  const [viewportSize, setViewportSize] = useState(() => getViewportSize());

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const updateViewportSize = () => {
      setViewportSize(getViewportSize());
    };

    const viewport = window.visualViewport;

    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);
    window.addEventListener("orientationchange", updateViewportSize);
    viewport?.addEventListener("resize", updateViewportSize);

    return () => {
      window.removeEventListener("resize", updateViewportSize);
      window.removeEventListener("orientationchange", updateViewportSize);
      viewport?.removeEventListener("resize", updateViewportSize);
    };
  }, []);

  const { scale, width, height } = useMemo(() => {
    const availableWidth = Math.max(0, viewportSize.width - (padding * 2));
    const availableHeight = Math.max(0, viewportSize.height - (padding * 2));
    const nextScale = Math.min(
      1,
      availableWidth > 0 ? availableWidth / baseWidth : 1,
      availableHeight > 0 ? availableHeight / baseHeight : 1
    );

    return {
      scale: Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1,
      width: baseWidth,
      height: baseHeight,
    };
  }, [baseHeight, baseWidth, padding, viewportSize.height, viewportSize.width]);

  return (
    <div className="relative flex h-full min-h-full w-full items-center justify-center p-3">
      <div
        className="relative overflow-hidden"
        style={{
          width: `${width * scale}px`,
          height: `${height * scale}px`,
        }}
      >
        <div
          className={`desktop-stage ${className}`.trim()}
          style={{
            width: `${width}px`,
            height: `${height}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
