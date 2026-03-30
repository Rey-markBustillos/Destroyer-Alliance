const GAME_MUSIC_SRC = "/assets/GAME-MUSIC/Steel Horizon.mp3";
const DEFAULT_VOLUME = 0.7;
const DEFAULT_FADE_IN_MS = 1500;
const GLOBAL_SOUND_MANAGER_KEY = "__destroyerAllianceSoundManager__";
const SOUND_SETTINGS_STORAGE_KEY = "destroyer-alliance-sound-settings";

const clampVolume = (value) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return DEFAULT_VOLUME;
  }

  if (numericValue > 1) {
    return Math.max(0, Math.min(1, numericValue / 100));
  }

  return Math.max(0, Math.min(1, numericValue));
};

class SoundManager {
  constructor() {
    this.audioElement = null;
    this.targetVolume = DEFAULT_VOLUME;
    this.isMuted = false;
    this.fadeAnimationFrame = null;
    this.fadeToken = 0;
    this.pendingPlayPromise = null;
    this.autoplayRecoveryAttached = false;
    this.trackSrc = GAME_MUSIC_SRC;
    this.statusListeners = new Set();

    this.hydrateSettingsFromStorage();
  }

  hydrateSettingsFromStorage() {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const rawSettings = window.localStorage.getItem(SOUND_SETTINGS_STORAGE_KEY);

      if (!rawSettings) {
        return;
      }

      const parsed = JSON.parse(rawSettings);
      this.targetVolume = clampVolume(parsed?.volume ?? DEFAULT_VOLUME);
      this.isMuted = Boolean(parsed?.isMuted);
    } catch {
      this.targetVolume = DEFAULT_VOLUME;
      this.isMuted = false;
    }
  }

  persistSettings() {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        SOUND_SETTINGS_STORAGE_KEY,
        JSON.stringify({
          volume: this.targetVolume,
          isMuted: this.isMuted,
        })
      );
    } catch {
      // Ignore storage failures so audio still works.
    }
  }

  ensureAudioElement() {
    if (typeof window === "undefined") {
      return null;
    }

    if (!this.audioElement) {
      const audio = new window.Audio();
      audio.loop = true;
      audio.preload = "auto";
      audio.playsInline = true;
      audio.volume = this.targetVolume;
      audio.muted = this.isMuted;
      this.audioElement = audio;
    }

    const resolvedTrackSrc = new URL(this.trackSrc, window.location.href).href;

    if (this.audioElement.src !== resolvedTrackSrc) {
      this.audioElement.src = this.trackSrc;
    }

    this.audioElement.loop = true;
    this.audioElement.muted = this.isMuted;
    return this.audioElement;
  }

  preloadBackgroundMusic() {
    const audio = this.ensureAudioElement();

    if (!audio) {
      return;
    }

    try {
      if (audio.readyState < 3) {
        audio.load();
      }
    } catch {
      // Ignore preload failures so gameplay is never blocked by audio.
    }
  }

  async startBackgroundMusic({
    fadeInDurationMs = DEFAULT_FADE_IN_MS,
    volume = this.targetVolume,
  } = {}) {
    const audio = this.ensureAudioElement();

    if (!audio) {
      return false;
    }

    this.targetVolume = clampVolume(volume);
    this.persistSettings();
    this.preloadBackgroundMusic();

    if (!audio.paused && !audio.ended) {
      if (!this.isMuted && fadeInDurationMs > 0 && audio.volume < this.targetVolume) {
        this.fadeTo(this.targetVolume, fadeInDurationMs).then(() => {
          this.notifyStatusChange();
        });
      } else {
        audio.volume = this.targetVolume;
      }

      audio.muted = this.isMuted;
      this.notifyStatusChange();
      return true;
    }

    if (this.pendingPlayPromise) {
      try {
        await this.pendingPlayPromise;
        this.notifyStatusChange();
        return true;
      } catch {
        return false;
      }
    }

    this.cancelFade();
    audio.volume = this.isMuted ? this.targetVolume : 0;
    audio.muted = true;
    this.pendingPlayPromise = Promise.resolve(audio.play());

    try {
      await this.pendingPlayPromise;
      this.pendingPlayPromise = null;

      if (this.isMuted) {
        audio.muted = true;
        audio.volume = this.targetVolume;
      } else {
        audio.muted = false;

        if (fadeInDurationMs > 0) {
          await this.fadeTo(this.targetVolume, fadeInDurationMs);
        } else {
          audio.volume = this.targetVolume;
        }
      }

      this.notifyStatusChange();
      return true;
    } catch {
      this.pendingPlayPromise = null;
      audio.muted = this.isMuted;
      this.attachAutoplayRecovery();
      this.notifyStatusChange();
      return false;
    }
  }

  setBackgroundMusicVolume(volume, { fadeDurationMs = 250, persist = true } = {}) {
    this.targetVolume = clampVolume(volume);
    const audio = this.ensureAudioElement();

    if (persist) {
      this.persistSettings();
    }

    if (!audio) {
      this.notifyStatusChange();
      return this.targetVolume;
    }

    if (!this.isMuted && fadeDurationMs > 0 && !audio.paused) {
      this.fadeTo(this.targetVolume, fadeDurationMs).then(() => {
        this.notifyStatusChange();
      });
      return this.targetVolume;
    }

    this.cancelFade();
    audio.volume = this.targetVolume;
    this.notifyStatusChange();
    return this.targetVolume;
  }

  stepBackgroundMusicVolume(delta, { fadeDurationMs = 180 } = {}) {
    const currentVolume = Number(this.targetVolume) || 0;
    const nextVolume = clampVolume(currentVolume + (Number(delta) || 0));
    return this.setBackgroundMusicVolume(nextVolume, { fadeDurationMs });
  }

  setMuted(muted, { persist = true } = {}) {
    this.isMuted = Boolean(muted);
    const audio = this.ensureAudioElement();

    if (persist) {
      this.persistSettings();
    }

    if (audio) {
      audio.muted = this.isMuted;
      audio.volume = this.targetVolume;
    }

    if (!this.isMuted) {
      this.startBackgroundMusic({
        fadeInDurationMs: 450,
        volume: this.targetVolume,
      });
    }

    this.notifyStatusChange();
    return this.isMuted;
  }

  toggleMuted() {
    return this.setMuted(!this.isMuted);
  }

  async fadeOutBackgroundMusic({ durationMs = 1000, pauseAfterFade = true } = {}) {
    const audio = this.audioElement;

    if (!audio || audio.paused) {
      return;
    }

    await this.fadeTo(0, durationMs);

    if (pauseAfterFade) {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = this.targetVolume;
    }

    this.notifyStatusChange();
  }

  stopBackgroundMusic() {
    const audio = this.audioElement;

    if (!audio) {
      return;
    }

    this.cancelFade();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = this.targetVolume;
    this.notifyStatusChange();
  }

  getStatus() {
    const volumePercent = Math.round(this.targetVolume * 100);

    return {
      isReady: Boolean(this.audioElement),
      isPlaying: Boolean(this.audioElement) && !this.audioElement.paused,
      isMuted: this.isMuted,
      volume: this.targetVolume,
      volumePercent,
      audibleVolume: this.isMuted ? 0 : this.targetVolume,
      src: this.trackSrc,
    };
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    this.statusListeners.add(listener);
    listener(this.getStatus());

    return () => {
      this.statusListeners.delete(listener);
    };
  }

  notifyStatusChange() {
    const status = this.getStatus();
    this.statusListeners.forEach((listener) => {
      try {
        listener(status);
      } catch {
        // Ignore listener errors to keep audio stable.
      }
    });
  }

  attachAutoplayRecovery() {
    if (this.autoplayRecoveryAttached || typeof window === "undefined") {
      return;
    }

    this.autoplayRecoveryAttached = true;
    const events = ["pointerdown", "keydown", "touchstart"];

    const cleanup = () => {
      if (!this.autoplayRecoveryAttached) {
        return;
      }

      this.autoplayRecoveryAttached = false;
      events.forEach((eventName) => {
        window.removeEventListener(eventName, retryPlayback);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };

    const retryPlayback = async () => {
      const started = await this.startBackgroundMusic({
        fadeInDurationMs: 700,
        volume: this.targetVolume,
      });

      if (started) {
        cleanup();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        retryPlayback();
      }
    };

    events.forEach((eventName) => {
      window.addEventListener(eventName, retryPlayback, { passive: true });
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  fadeTo(targetVolume, durationMs) {
    const audio = this.audioElement;

    if (!audio) {
      return Promise.resolve();
    }

    if (typeof window === "undefined") {
      audio.volume = clampVolume(targetVolume);
      return Promise.resolve();
    }

    const safeDurationMs = Math.max(0, Number(durationMs) || 0);
    const clampedTarget = clampVolume(targetVolume);
    const startVolume = audio.volume;

    if (safeDurationMs === 0 || Math.abs(startVolume - clampedTarget) < 0.0001) {
      this.cancelFade();
      audio.volume = clampedTarget;
      return Promise.resolve();
    }

    this.cancelFade();
    const fadeId = ++this.fadeToken;

    return new Promise((resolve) => {
      const startTime = performance.now();

      const step = (timestamp) => {
        if (fadeId !== this.fadeToken || !this.audioElement) {
          resolve();
          return;
        }

        const elapsed = timestamp - startTime;
        const progress = Math.max(0, Math.min(1, elapsed / safeDurationMs));
        const nextVolume = startVolume + ((clampedTarget - startVolume) * progress);
        this.audioElement.volume = nextVolume;

        if (progress >= 1) {
          this.fadeAnimationFrame = null;
          resolve();
          return;
        }

        this.fadeAnimationFrame = window.requestAnimationFrame(step);
      };

      this.fadeAnimationFrame = window.requestAnimationFrame(step);
    });
  }

  cancelFade() {
    if (this.fadeAnimationFrame && typeof window !== "undefined") {
      window.cancelAnimationFrame(this.fadeAnimationFrame);
    }

    this.fadeAnimationFrame = null;
    this.fadeToken += 1;
  }
}

let fallbackManagerInstance = null;

const getOrCreateGlobalSoundManager = () => {
  if (typeof window === "undefined") {
    if (!fallbackManagerInstance) {
      fallbackManagerInstance = new SoundManager();
    }

    return fallbackManagerInstance;
  }

  if (!window[GLOBAL_SOUND_MANAGER_KEY]) {
    window[GLOBAL_SOUND_MANAGER_KEY] = new SoundManager();
  }

  return window[GLOBAL_SOUND_MANAGER_KEY];
};

const soundManager = getOrCreateGlobalSoundManager();

export { GAME_MUSIC_SRC };
export const getSoundManager = () => soundManager;
export const preloadGameMusic = () => soundManager.preloadBackgroundMusic();
export const startGameMusic = (options) => soundManager.startBackgroundMusic(options);
export const setGameMusicVolume = (volume, options) => soundManager.setBackgroundMusicVolume(volume, options);
export const stepGameMusicVolume = (delta, options) => soundManager.stepBackgroundMusicVolume(delta, options);
export const setGameMusicMuted = (muted, options) => soundManager.setMuted(muted, options);
export const toggleGameMusicMute = () => soundManager.toggleMuted();
export const fadeOutGameMusic = (options) => soundManager.fadeOutBackgroundMusic(options);

export default soundManager;
