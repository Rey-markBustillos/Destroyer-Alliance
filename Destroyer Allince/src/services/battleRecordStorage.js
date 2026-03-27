const STORAGE_PREFIX = "destroyer-alliance-battle-records";

const getStorageKey = (session) => {
  const scope = session?.id ? `user:${session.id}` : "guest";
  return `${STORAGE_PREFIX}:${scope}`;
};

export const getBattleRecords = (session = null) => {
  const raw = localStorage.getItem(getStorageKey(session));

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(getStorageKey(session));
    return [];
  }
};

export const saveBattleRecord = (record, session = null) => {
  const current = getBattleRecords(session);
  const next = [
    {
      id: record?.id ?? `battle-${Date.now()}`,
      savedAt: Date.now(),
      ...record,
    },
    ...current,
  ].slice(0, 20);

  localStorage.setItem(getStorageKey(session), JSON.stringify(next));
  return next;
};
