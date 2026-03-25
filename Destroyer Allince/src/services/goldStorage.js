import { getGameSnapshot, saveGameSnapshot } from "./gameStorage";

export const getStoredGold = (session = null) => getGameSnapshot(session)?.gold ?? null;

export const saveStoredGold = (gold, session = null) => {
  const snapshot = getGameSnapshot(session) ?? { buildings: [] };
  return saveGameSnapshot(
    {
      ...snapshot,
      gold,
    },
    session
  );
};
