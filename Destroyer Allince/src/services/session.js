const STORAGE_KEY = "destroyer-alliance-auth";

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
};

export const getToken = () => getSession()?.token ?? null;
