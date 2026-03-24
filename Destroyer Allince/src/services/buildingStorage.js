const STORAGE_KEY = "destroyer-alliance-buildings";

export const getBuildingKey = (building) =>
  `${building.type}:${Number(building.y ?? building.row ?? 0)}:${Number(building.x ?? building.col ?? 0)}`;

export const getStoredBuildings = () => {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
};

export const saveStoredBuildings = (buildings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(buildings));
};

export const upsertStoredBuilding = (building) => {
  const buildings = getStoredBuildings();
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

  saveStoredBuildings(nextBuildings);
  return nextBuildings;
};

export const mergeStoredBuildings = (buildings) => {
  const merged = new Map();

  getStoredBuildings().forEach((building) => {
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
  saveStoredBuildings(result);
  return result;
};

export const removeStoredBuilding = (buildingToRemove) => {
  const nextBuildings = getStoredBuildings().filter(
    (building) => getBuildingKey(building) !== getBuildingKey(buildingToRemove)
  );

  saveStoredBuildings(nextBuildings);
  return nextBuildings;
};
