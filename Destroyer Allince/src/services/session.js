const STORAGE_KEY = "destroyer-alliance-auth";
const INTRO_PENDING_KEY = "destroyer-alliance-intro-pending";
const WELCOME_BACK_KEY = "destroyer-alliance-welcome-back";

export const saveSession = (session) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

export const getSession = () => {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

export const clearSession = () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(INTRO_PENDING_KEY);
  localStorage.removeItem(WELCOME_BACK_KEY);
};

export const getToken = () => getSession()?.token ?? null;

export const markIntroPending = () => {
  localStorage.setItem(INTRO_PENDING_KEY, "true");
};

export const isIntroPending = () => localStorage.getItem(INTRO_PENDING_KEY) === "true";

export const clearIntroPending = () => {
  localStorage.removeItem(INTRO_PENDING_KEY);
};

export const markWelcomeBackPending = () => {
  localStorage.setItem(WELCOME_BACK_KEY, "true");
};

export const isWelcomeBackPending = () => localStorage.getItem(WELCOME_BACK_KEY) === "true";

export const clearWelcomeBackPending = () => {
  localStorage.removeItem(WELCOME_BACK_KEY);
};
