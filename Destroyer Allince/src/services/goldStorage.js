const STORAGE_KEY = "destroyer-alliance-gold";

export const getStoredGold = () => {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
};

export const saveStoredGold = (gold) => {
  const normalizedGold = Number(gold);

  if (!Number.isFinite(normalizedGold) || normalizedGold < 0) {
    return;
  }

  localStorage.setItem(STORAGE_KEY, String(Math.floor(normalizedGold)));
};
