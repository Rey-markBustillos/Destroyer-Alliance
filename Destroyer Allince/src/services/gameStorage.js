const STORAGE_PREFIX = "destroyer-alliance-save";
const LEGACY_GOLD_KEY = "destroyer-alliance-gold";
const LEGACY_BUILDINGS_KEY = "destroyer-alliance-buildings";

const normalizeGold = (gold) => {
  const parsed = Number(gold);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 1200;
};

const normalizeBuildings = (buildings) => {
  if (!Array.isArray(buildings)) {
    return [];
  }

  return buildings
    .map((building) => ({
      id: building?.id ?? null,
      type: building?.type ?? null,
      x: Number(building?.x ?? building?.col ?? 0),
      y: Number(building?.y ?? building?.row ?? 0),
      level: Math.max(1, Number(building?.level ?? 1) || 1),
      isUpgrading: Boolean(building?.isUpgrading),
      upgradeCompleteAt: building?.upgradeCompleteAt
        ? Number(new Date(building.upgradeCompleteAt).getTime() || building.upgradeCompleteAt)
        : null,
      machineGold: Math.max(0, Number(building?.machineGold ?? 0) || 0),
      lastGeneratedAt: Number(building?.lastGeneratedAt ?? Date.now()),
      soldierCount: Math.max(0, Number(building?.soldierCount ?? 0) || 0),
      lastWagePaidAt: Number(building?.lastWagePaidAt ?? Date.now()),
    }))
    .filter((building) => typeof building.type === "string");
};

const getStorageKey = (session) => {
  const scope = session?.id ? `user:${session.id}` : "guest";
  return `${STORAGE_PREFIX}:${scope}`;
};

const getLegacySnapshot = () => {
  const legacyGoldRaw = localStorage.getItem(LEGACY_GOLD_KEY);
  const legacyBuildingsRaw = localStorage.getItem(LEGACY_BUILDINGS_KEY);

  if (!legacyGoldRaw && !legacyBuildingsRaw) {
    return null;
  }

  let legacyBuildings = [];

  if (legacyBuildingsRaw) {
    try {
      legacyBuildings = JSON.parse(legacyBuildingsRaw);
    } catch {
      legacyBuildings = [];
    }
  }

  return {
    gold: normalizeGold(legacyGoldRaw),
    buildings: normalizeBuildings(legacyBuildings),
    savedAt: Date.now(),
  };
};

export const getGameSnapshot = (session) => {
  const storageKey = getStorageKey(session);
  const raw = localStorage.getItem(storageKey);

  if (!raw) {
    const legacySnapshot = getLegacySnapshot();

    if (!legacySnapshot) {
      return null;
    }

    localStorage.setItem(storageKey, JSON.stringify(legacySnapshot));
    return legacySnapshot;
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      gold: normalizeGold(parsed?.gold),
      buildings: normalizeBuildings(parsed?.buildings),
      savedAt: Number(parsed?.savedAt ?? 0),
    };
  } catch {
    localStorage.removeItem(storageKey);
    return null;
  }
};

export const saveGameSnapshot = (snapshot, session) => {
  const payload = {
    gold: normalizeGold(snapshot?.gold),
    buildings: normalizeBuildings(snapshot?.buildings),
    savedAt: Date.now(),
  };

  localStorage.setItem(getStorageKey(session), JSON.stringify(payload));

  return payload;
};
