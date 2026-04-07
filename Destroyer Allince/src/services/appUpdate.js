const APP_UPDATE_CHECK_INTERVAL_MS = 60000;
const CURRENT_BUILD_ID = typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "dev";

const subscribers = new Set();
const trackedWorkers = new WeakSet();
const trackedRegistrations = new WeakSet();

let initialized = false;
let waitingWorker = null;
let currentRegistration = null;
let state = {
  currentBuildId: CURRENT_BUILD_ID,
  latestBuildId: CURRENT_BUILD_ID,
  isUpdateAvailable: false,
};

const notifySubscribers = () => {
  const snapshot = {
    ...state,
    hasWaitingWorker: Boolean(waitingWorker),
  };

  subscribers.forEach((listener) => listener(snapshot));
};

const markUpdateAvailable = (latestBuildId = state.latestBuildId) => {
  const resolvedLatestBuildId = String(latestBuildId || state.latestBuildId || CURRENT_BUILD_ID);

  state = {
    ...state,
    latestBuildId: resolvedLatestBuildId,
    isUpdateAvailable: true,
  };
  notifySubscribers();
};

const monitorInstallingWorker = (worker) => {
  if (!worker || trackedWorkers.has(worker)) {
    return;
  }

  trackedWorkers.add(worker);
  worker.addEventListener("statechange", () => {
    if (worker.state === "installed" && navigator.serviceWorker.controller) {
      waitingWorker = currentRegistration?.waiting ?? worker;
      markUpdateAvailable(worker.scriptURL);
    }
  });
};

const trackRegistration = (registration) => {
  if (!registration) {
    return;
  }

  currentRegistration = registration;

  if (registration.waiting) {
    waitingWorker = registration.waiting;
    markUpdateAvailable(registration.waiting.scriptURL);
  }

  if (trackedRegistrations.has(registration)) {
    return;
  }

  trackedRegistrations.add(registration);

  if (registration.installing) {
    monitorInstallingWorker(registration.installing);
  }

  registration.addEventListener("updatefound", () => {
    monitorInstallingWorker(registration.installing);
  });
};

const fetchLatestBuildVersion = async () => {
  const response = await fetch(`/version.json?ts=${Date.now()}`, {
    cache: "no-store",
    headers: {
      "cache-control": "no-cache, no-store, max-age=0",
      pragma: "no-cache",
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return String(payload?.buildId ?? "").trim() || null;
};

export const checkForAppUpdate = async () => {
  try {
    await currentRegistration?.update?.();
  } catch (error) {
    console.warn("Unable to refresh service worker registration.", error);
  }

  try {
    const latestBuildId = await fetchLatestBuildVersion();

    if (latestBuildId && latestBuildId !== CURRENT_BUILD_ID) {
      markUpdateAvailable(latestBuildId);
      return true;
    }
  } catch (error) {
    console.warn("Unable to check for a newer app build.", error);
  }

  return false;
};

export const initializeAppUpdateMonitor = () => {
  if (initialized || typeof window === "undefined") {
    return;
  }

  initialized = true;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistration().then(trackRegistration).catch(() => {});
    navigator.serviceWorker.ready.then(trackRegistration).catch(() => {});
  }

  const handleFocusCheck = () => {
    checkForAppUpdate().catch(() => {});
  };

  const handleVisibilityChange = () => {
    if (!document.hidden) {
      handleFocusCheck();
    }
  };

  window.addEventListener("focus", handleFocusCheck);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  window.setInterval(() => {
    if (!document.hidden) {
      handleFocusCheck();
    }
  }, APP_UPDATE_CHECK_INTERVAL_MS);

  handleFocusCheck();
};

export const subscribeToAppUpdates = (listener) => {
  initializeAppUpdateMonitor();
  subscribers.add(listener);
  listener({
    ...state,
    hasWaitingWorker: Boolean(waitingWorker),
  });

  return () => {
    subscribers.delete(listener);
  };
};

export const reloadToLatestAppVersion = async () => {
  if (typeof window === "undefined") {
    return false;
  }

  if (waitingWorker && "serviceWorker" in navigator) {
    return new Promise((resolve) => {
      let handled = false;
      const finishReload = () => {
        if (handled) {
          return;
        }

        handled = true;
        window.location.reload();
        resolve(true);
      };

      navigator.serviceWorker.addEventListener("controllerchange", finishReload, { once: true });

      try {
        waitingWorker.postMessage({ type: "SKIP_WAITING" });
      } catch (error) {
        console.warn("Unable to activate the waiting service worker.", error);
      }

      window.setTimeout(finishReload, 1200);
    });
  }

  window.location.reload();
  return true;
};
