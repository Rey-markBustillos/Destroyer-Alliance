const subscribers = new Set();

let deferredPromptEvent = null;
let initialized = false;
let installed = false;

const isIosDevice = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const isTouchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

  return /iphone|ipad|ipod/.test(userAgent) || isTouchMac;
};

const isStandaloneDisplay = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
};

const getSnapshot = () => ({
  canPromptInstall: Boolean(deferredPromptEvent),
  isIos: isIosDevice(),
  isInstalled: installed || isStandaloneDisplay(),
});

const notifySubscribers = () => {
  const snapshot = getSnapshot();
  subscribers.forEach((listener) => listener(snapshot));
};

export const initializePwaInstall = () => {
  if (initialized || typeof window === "undefined") {
    return;
  }

  initialized = true;
  installed = isStandaloneDisplay();

  const standaloneMedia = window.matchMedia("(display-mode: standalone)");

  const handleBeforeInstallPrompt = (event) => {
    event.preventDefault();
    deferredPromptEvent = event;
    notifySubscribers();
  };

  const handleInstalled = () => {
    installed = true;
    deferredPromptEvent = null;
    notifySubscribers();
  };

  const handleStandaloneChange = (event) => {
    installed = Boolean(event.matches);
    notifySubscribers();
  };

  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleInstalled);
  standaloneMedia.addEventListener?.("change", handleStandaloneChange);

  notifySubscribers();
};

export const subscribeToPwaInstall = (listener) => {
  initializePwaInstall();
  subscribers.add(listener);
  listener(getSnapshot());

  return () => {
    subscribers.delete(listener);
  };
};

export const promptForPwaInstall = async () => {
  if (!deferredPromptEvent) {
    return false;
  }

  const promptEvent = deferredPromptEvent;
  deferredPromptEvent = null;
  notifySubscribers();

  promptEvent.prompt();

  try {
    const outcome = await promptEvent.userChoice;

    if (outcome?.outcome === "accepted") {
      installed = true;
    }
  } finally {
    notifySubscribers();
  }

  return true;
};
