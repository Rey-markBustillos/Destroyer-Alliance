import { useEffect, useState } from "react";

const MOBILE_DEVICE_PATTERN = /Android|webOS|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i;

const getBackdropFilterSupport = () => {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") {
    return false;
  }

  return CSS.supports("backdrop-filter: blur(1px)")
    || CSS.supports("-webkit-backdrop-filter: blur(1px)");
};

export const getVisualEffectsProfile = () => {
  const hasWindow = typeof window !== "undefined";
  const hasNavigator = typeof navigator !== "undefined";
  const viewport = hasWindow ? window.visualViewport : null;
  const windowWidth = hasWindow ? Number(window.innerWidth ?? 0) || 0 : 0;
  const windowHeight = hasWindow ? Number(window.innerHeight ?? 0) || 0 : 0;
  const viewportWidth = Math.round(Number(viewport?.width ?? windowWidth) || 0);
  const viewportHeight = Math.round(Number(viewport?.height ?? windowHeight) || 0);
  const shortEdge = Math.min(
    viewportWidth || Number.POSITIVE_INFINITY,
    viewportHeight || Number.POSITIVE_INFINITY
  );
  const userAgent = hasNavigator ? String(navigator.userAgent ?? "") : "";
  const maxTouchPoints = hasNavigator ? Number(navigator.maxTouchPoints ?? 0) || 0 : 0;
  const hasCoarsePointer = hasWindow ? window.matchMedia?.("(pointer: coarse)")?.matches ?? false : false;
  const prefersReducedMotion = hasWindow
    ? window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
    : false;
  const isTouchCapable = maxTouchPoints > 0 || (hasWindow && "ontouchstart" in window);
  const isMobileLike = MOBILE_DEVICE_PATTERN.test(userAgent)
    || ((hasCoarsePointer || isTouchCapable) && Number.isFinite(shortEdge) && shortEdge <= 900);
  const supportsBackdropFilter = getBackdropFilterSupport();
  const reduceEffects = prefersReducedMotion || !supportsBackdropFilter || isMobileLike;

  return {
    isMobileLike,
    reduceEffects,
    reduceMotion: reduceEffects || prefersReducedMotion,
    supportsBackdropFilter,
  };
};

export const useVisualEffectsProfile = () => {
  const [profile, setProfile] = useState(() => getVisualEffectsProfile());

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQueries = [
      window.matchMedia?.("(pointer: coarse)"),
      window.matchMedia?.("(prefers-reduced-motion: reduce)"),
    ].filter(Boolean);

    const updateProfile = () => {
      setProfile(getVisualEffectsProfile());
    };

    const viewport = window.visualViewport;

    updateProfile();
    window.addEventListener("resize", updateProfile);
    window.addEventListener("orientationchange", updateProfile);
    viewport?.addEventListener("resize", updateProfile);
    mediaQueries.forEach((query) => query.addEventListener?.("change", updateProfile));

    return () => {
      window.removeEventListener("resize", updateProfile);
      window.removeEventListener("orientationchange", updateProfile);
      viewport?.removeEventListener("resize", updateProfile);
      mediaQueries.forEach((query) => query.removeEventListener?.("change", updateProfile));
    };
  }, []);

  return profile;
};
