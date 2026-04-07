const STORAGE_KEY = "destroyer-alliance-auth";
const INTRO_PENDING_KEY = "destroyer-alliance-intro-pending";
const WELCOME_BACK_KEY = "destroyer-alliance-welcome-back";

const getPersistentStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
};

const getTabStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage;
};

export const saveSession = (session) => {
  const serializedSession = JSON.stringify(session);
  getTabStorage()?.setItem(STORAGE_KEY, serializedSession);
  getPersistentStorage()?.removeItem(STORAGE_KEY);
};

export const getSession = () => {
  const tabStorage = getTabStorage();
  const persistentStorage = getPersistentStorage();
  const tabRaw = tabStorage?.getItem(STORAGE_KEY);

  if (tabRaw) {
    try {
      return JSON.parse(tabRaw);
    } catch {
      tabStorage?.removeItem(STORAGE_KEY);
      return null;
    }
  }

  const persistentRaw = persistentStorage?.getItem(STORAGE_KEY);

  if (!persistentRaw) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(persistentRaw);
    tabStorage?.setItem(STORAGE_KEY, JSON.stringify(parsedSession));
    persistentStorage?.removeItem(STORAGE_KEY);
    return parsedSession;
  } catch {
    persistentStorage?.removeItem(STORAGE_KEY);
    return null;
  }
};

export const clearSession = () => {
  getTabStorage()?.removeItem(STORAGE_KEY);
  getPersistentStorage()?.removeItem(STORAGE_KEY);
  getPersistentStorage()?.removeItem(INTRO_PENDING_KEY);
  getPersistentStorage()?.removeItem(WELCOME_BACK_KEY);
};

export const getToken = () => getSession()?.token ?? null;

export const markIntroPending = () => {
  getPersistentStorage()?.setItem(INTRO_PENDING_KEY, "true");
};

export const isIntroPending = () => getPersistentStorage()?.getItem(INTRO_PENDING_KEY) === "true";

export const clearIntroPending = () => {
  getPersistentStorage()?.removeItem(INTRO_PENDING_KEY);
};

export const markWelcomeBackPending = () => {
  getPersistentStorage()?.setItem(WELCOME_BACK_KEY, "true");
};

export const isWelcomeBackPending = () => getPersistentStorage()?.getItem(WELCOME_BACK_KEY) === "true";

export const clearWelcomeBackPending = () => {
  getPersistentStorage()?.removeItem(WELCOME_BACK_KEY);
};
