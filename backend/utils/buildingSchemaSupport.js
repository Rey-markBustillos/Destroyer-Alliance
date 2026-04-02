import prisma from "../prismaClient.js";

const BUILDING_BASE_SELECT = {
  id: true,
  type: true,
  x: true,
  y: true,
  level: true,
  isUpgrading: true,
  upgradeCompleteAt: true,
  machineGold: true,
  lastGeneratedAt: true,
  soldierCount: true,
  isSleeping: true,
  lastWagePaidAt: true,
  lastFedAt: true,
  hasChopper: true,
  hasTank: true,
  tankShotsRemaining: true,
  chopperShotsRemaining: true,
};

const LEADERBOARD_BUILDING_SELECT = {
  type: true,
  soldierCount: true,
  hasTank: true,
  hasChopper: true,
};

let rangerTalaColumnSupportPromise;

export const hasRangerTalaColumn = async () => {
  if (!rangerTalaColumnSupportPromise) {
    rangerTalaColumnSupportPromise = prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Building'
          AND column_name = 'rangerTalaCount'
      ) AS "exists"
    `
      .then((result) => Boolean(result?.[0]?.exists))
      .catch((error) => {
        console.warn("Unable to detect rangerTalaCount column support:", error);
        return false;
      });
  }

  return rangerTalaColumnSupportPromise;
};

export const getBuildingSelect = (supportsRangerTalaColumn) => ({
  ...BUILDING_BASE_SELECT,
  ...(supportsRangerTalaColumn ? { rangerTalaCount: true } : {}),
});

export const getLeaderboardBuildingSelect = (supportsRangerTalaColumn) => ({
  ...LEADERBOARD_BUILDING_SELECT,
  ...(supportsRangerTalaColumn ? { rangerTalaCount: true } : {}),
});

export const stripUnsupportedBuildingFields = (buildingData, supportsRangerTalaColumn) => {
  if (supportsRangerTalaColumn) {
    return buildingData;
  }

  const { rangerTalaCount, ...compatibleBuildingData } = buildingData;
  return compatibleBuildingData;
};
