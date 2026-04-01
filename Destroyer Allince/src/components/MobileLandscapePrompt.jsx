import { useEffect, useState } from "react";

const isMobileViewport = () => {
  if (typeof window === "undefined") {
    return false;
  }

  const viewportWidth = Math.min(window.innerWidth || 0, window.screen?.width || window.innerWidth || 0);
  const hasCoarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;

  return viewportWidth <= 900 && hasCoarsePointer;
};

const isPortraitViewport = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return window.innerHeight > window.innerWidth;
};

const requestFullscreen = async () => {
  const root = document.documentElement;

  if (document.fullscreenElement || !root?.requestFullscreen) {
    return true;
  }

  try {
    await root.requestFullscreen();
    return true;
  } catch {
    return false;
  }
};

const requestLandscapeLock = async () => {
  if (typeof window === "undefined") {
    return false;
  }

  const orientationApi = window.screen?.orientation;

  if (!orientationApi?.lock) {
    return false;
  }

  try {
    await orientationApi.lock("landscape");
    return true;
  } catch {
    return false;
  }
};

const tryEnterLandscape = async () => {
  await requestFullscreen();
  const locked = await requestLandscapeLock();
  return locked;
};

export default function MobileLandscapePrompt() {
  const [isMobile, setIsMobile] = useState(() => isMobileViewport());
  const [isPortrait, setIsPortrait] = useState(() => isPortraitViewport());

  useEffect(() => {
    const updateViewportState = () => {
      setIsMobile(isMobileViewport());
      setIsPortrait(isPortraitViewport());
    };

    const handleFirstInteraction = () => {
      if (!isMobileViewport()) {
        return;
      }

      void tryEnterLandscape();
    };

    updateViewportState();
    window.addEventListener("resize", updateViewportState);
    window.addEventListener("orientationchange", updateViewportState);
    window.addEventListener("touchstart", handleFirstInteraction, { passive: true });
    window.addEventListener("pointerdown", handleFirstInteraction, { passive: true });

    return () => {
      window.removeEventListener("resize", updateViewportState);
      window.removeEventListener("orientationchange", updateViewportState);
      window.removeEventListener("touchstart", handleFirstInteraction);
      window.removeEventListener("pointerdown", handleFirstInteraction);
    };
  }, []);

  if (!isMobile || !isPortrait) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/84 px-5 text-white backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[1.4rem] border border-white/12 bg-[linear-gradient(180deg,rgba(15,23,42,0.95)_0%,rgba(15,23,42,0.88)_100%)] p-5 text-center shadow-[0_24px_70px_rgba(2,6,23,0.5)]">
        <p className="text-[0.72rem] uppercase tracking-[0.32em] text-cyan-300/75">Mobile Landscape</p>
        <h2 className="mt-3 text-xl font-black text-white">Rotate Your Phone</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Mas maayos ang map, buildings, at controls kapag naka-landscape ang phone habang naglalaro.
        </p>
        <button
          type="button"
          onClick={() => {
            void tryEnterLandscape();
          }}
          className="mt-4 rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-950 transition hover:bg-cyan-300"
        >
          Try Landscape
        </button>
      </div>
    </div>
  );
}
