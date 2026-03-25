import { getGameSnapshot, saveGameSnapshot } from "./gameStorage";

export const getBuildingKey = (building) =>
  `${building.type}:${Number(building.y ?? building.row ?? 0)}:${Number(building.x ?? building.col ?? 0)}`;

export const getStoredBuildings = (session = null) =>
  getGameSnapshot(session)?.buildings ?? [];

export const saveStoredBuildings = (buildings, session = null) => {
  const snapshot = getGameSnapshot(session) ?? { gold: 1200 };
  const savedSnapshot = saveGameSnapshot(
    {
      ...snapshot,
      buildings,
    },
    session
  );

  return savedSnapshot.buildings ?? [];
};

export const upsertStoredBuilding = (building, session = null) => {
  const buildings = getStoredBuildings(session);
  const buildingKey = getBuildingKey(building);
  const nextBuildings = [...buildings];
  const existingIndex = nextBuildings.findIndex(
    (entry) => getBuildingKey(entry) === buildingKey
  );

  if (existingIndex >= 0) {
    nextBuildings[existingIndex] = {
      ...nextBuildings[existingIndex],
      ...building,
    };
  } else {
    nextBuildings.push(building);
  }

  return saveStoredBuildings(nextBuildings, session);
};

export const mergeStoredBuildings = (buildings, session = null) => {
  const merged = new Map();

  getStoredBuildings(session).forEach((building) => {
    merged.set(getBuildingKey(building), building);
  });

  buildings.forEach((building) => {
    const buildingKey = getBuildingKey(building);
    merged.set(buildingKey, {
      ...(merged.get(buildingKey) ?? {}),
      ...building,
    });
  });

  const result = Array.from(merged.values());
  return saveStoredBuildings(result, session);
};

export const removeStoredBuilding = (buildingToRemove, session = null) => {
  const nextBuildings = getStoredBuildings(session).filter(
    (building) => getBuildingKey(building) !== getBuildingKey(buildingToRemove)
  );

  return saveStoredBuildings(nextBuildings, session);
};
