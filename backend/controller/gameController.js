import prisma from "../prismaClient.js";
import { buildRankPayload, getRankName, getWarPointReward } from "../utils/rankSystem.js";
import {
  getBuildingSelect,
  hasRangerTalaColumn,
  stripUnsupportedBuildingFields,
} from "../utils/buildingSchemaSupport.js";

const DEFAULT_GOLD = 1200;
const DEFAULT_ENERGY = 0;

const serializeTimestamp = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
};

const serializeBuilding = (building) => ({
  id: building.id,
  type: building.type,
  x: building.x,
  y: building.y,
  level: building.level ?? 1,
  isUpgrading: Boolean(building.isUpgrading),
  upgradeCompleteAt: serializeTimestamp(building.upgradeCompleteAt),
  machineGold: building.machineGold ?? 0,
  lastGeneratedAt: serializeTimestamp(building.lastGeneratedAt),
  soldierCount: building.soldierCount ?? 0,
  rangerTalaCount: building.rangerTalaCount ?? 0,
  isSleeping: Boolean(building.isSleeping),
  lastWagePaidAt: serializeTimestamp(building.lastWagePaidAt),
  lastFedAt: serializeTimestamp(building.lastFedAt),
  hasChopper: Boolean(building.hasChopper),
  hasTank: Boolean(building.hasTank),
  tankShotsRemaining: Math.max(0, Math.floor(Number(building.tankShotsRemaining ?? 0) || 0)),
  chopperShotsRemaining: Math.max(0, Math.floor(Number(building.chopperShotsRemaining ?? 0) || 0)),
});

const parseOptionalDate = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeBuildingPayload = (building, supportsRangerTalaColumn = true) => {
  const type = typeof building?.type === "string" ? building.type.trim() : "";
  const x = Number(building?.x ?? building?.col);
  const y = Number(building?.y ?? building?.row);
  const level = Math.max(1, Math.floor(Number(building?.level ?? 1) || 1));
  const machineGold = Math.max(0, Math.floor(Number(building?.machineGold ?? 0) || 0));
  const soldierCount = Math.max(0, Math.floor(Number(building?.soldierCount ?? 0) || 0));
  const rangerTalaCount = Math.max(0, Math.floor(Number(building?.rangerTalaCount ?? 0) || 0));
  const hasChopper = Boolean(building?.hasChopper);
  const hasTank = Boolean(building?.hasTank);

  if (!type || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return stripUnsupportedBuildingFields({
    type,
    x: Math.floor(x),
    y: Math.floor(y),
    level,
    isUpgrading: Boolean(building?.isUpgrading),
    upgradeCompleteAt: parseOptionalDate(building?.upgradeCompleteAt),
    machineGold,
    lastGeneratedAt: parseOptionalDate(building?.lastGeneratedAt),
    soldierCount,
    rangerTalaCount,
    isSleeping: Boolean(building?.isSleeping) && (soldierCount + rangerTalaCount) > 0,
    lastWagePaidAt: parseOptionalDate(building?.lastWagePaidAt),
    lastFedAt: parseOptionalDate(building?.lastFedAt),
    hasChopper,
    hasTank,
    tankShotsRemaining: hasTank
      ? Math.max(0, Math.min(10, Math.floor(Number(building?.tankShotsRemaining ?? 10) || 10)))
      : 0,
    chopperShotsRemaining: hasChopper
      ? Math.max(0, Math.min(15, Math.floor(Number(building?.chopperShotsRemaining ?? 15) || 15)))
      : 0,
  }, supportsRangerTalaColumn);
};

const getVillageSnapshotForUser = async (userId) => {
  const supportsRangerTalaColumn = await hasRangerTalaColumn();
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      gold: true,
      energy: true,
      buildings: {
        select: getBuildingSelect(supportsRangerTalaColumn),
        orderBy: [
          { y: "asc" },
          { x: "asc" },
          { id: "asc" },
        ],
      },
    },
  });

  return {
    gold: user?.gold ?? DEFAULT_GOLD,
    energy: user?.energy ?? DEFAULT_ENERGY,
    buildings: (user?.buildings ?? []).map(serializeBuilding),
  };
};

const buildTargetPayload = (target) => {
  const targetBuildings = [...(target.buildings ?? [])].map(serializeBuilding);
  const townHall = targetBuildings.find((building) => building.type === "town-hall") ?? null;

  return {
    id: target.id,
    name: target.name || target.email,
    playerId: target.playerId || `PLYR-${String(target.id).padStart(6, "0")}`,
    gold: target.gold ?? 0,
    townHallLevel: townHall?.level ?? 0,
    defense: `${targetBuildings.length} structures`,
    loot: Math.max(0, Math.floor((target.gold ?? 0) * 0.2)),
    buildings: targetBuildings,
  };
};

export const getGameState = async (req, res) => {
  const user = await prisma.user.findUnique({
    where: {
      id: req.user.id,
    },
    select: {
      gold: true,
      energy: true,
    },
  });

  res.json({
    gold: user?.gold ?? DEFAULT_GOLD,
    energy: user?.energy ?? DEFAULT_ENERGY,
  });
};

export const getGameSnapshot = async (req, res) => {
  try {
    const snapshot = await getVillageSnapshotForUser(req.user.id);
    res.json(snapshot);
  } catch (error) {
    console.error("getGameSnapshot error:", error);
    res.status(500).json({ message: "Unable to load game snapshot" });
  }
};

export const updateGameState = async (req, res) => {
  const nextGold = Number(req.body.gold);
  const hasEnergy = req.body?.energy !== undefined && req.body?.energy !== null;
  const nextEnergy = hasEnergy ? Number(req.body.energy) : null;

  if (!Number.isFinite(nextGold) || nextGold < 0) {
    return res.status(400).json({ message: "Invalid gold value" });
  }

  if (hasEnergy && (!Number.isFinite(nextEnergy) || nextEnergy < 0)) {
    return res.status(400).json({ message: "Invalid energy value" });
  }

  const user = await prisma.user.update({
    where: {
      id: req.user.id,
    },
    data: {
      gold: Math.floor(nextGold),
      ...(hasEnergy ? { energy: Math.floor(nextEnergy) } : {}),
    },
    select: {
      gold: true,
      energy: true,
    },
  });

  res.json(user);
};

export const addGoldToSelectedPlayer = async (req, res) => {
  try {
    const configuredAdminKey = String(process.env.ADMIN_API_KEY || "").trim();
    const providedAdminKey = String(req.headers["x-admin-key"] || "").trim();

    if (!configuredAdminKey) {
      return res.status(503).json({ message: "ADMIN_API_KEY is not configured" });
    }

    if (!providedAdminKey || providedAdminKey !== configuredAdminKey) {
      return res.status(403).json({ message: "Invalid admin key" });
    }

    const amount = Number(req.body?.amount);
    const playerIdRaw = typeof req.body?.playerId === "string" ? req.body.playerId.trim() : "";
    const emailRaw = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const userIdRaw = req.body?.userId;
    const numericUserId = Number.isInteger(Number(userIdRaw)) ? Number(userIdRaw) : null;

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Amount must be a positive number" });
    }

    if (!playerIdRaw && !emailRaw && numericUserId === null) {
      return res.status(400).json({ message: "Provide playerId, email, or userId" });
    }

    const selectors = [];

    if (playerIdRaw) {
      selectors.push({ playerId: playerIdRaw.toUpperCase() });
    }

    if (emailRaw) {
      selectors.push({ email: emailRaw });
    }

    if (numericUserId !== null) {
      selectors.push({ id: numericUserId });
    }

    const target = await prisma.user.findFirst({
      where: {
        OR: selectors,
      },
      select: {
        id: true,
      },
    });

    if (!target) {
      return res.status(404).json({ message: "Player not found" });
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: target.id,
      },
      data: {
        gold: {
          increment: Math.floor(amount),
        },
      },
      select: {
        id: true,
        name: true,
        playerId: true,
        email: true,
        gold: true,
      },
    });

    return res.json({
      message: "Gold added successfully",
      addedGold: Math.floor(amount),
      player: updatedUser,
    });
  } catch (error) {
    console.error("addGoldToSelectedPlayer error:", error);
    return res.status(500).json({ message: "Unable to add gold to selected player" });
  }
};

// ADD BUILDING
export const addBuilding = async (req, res) => {
  const supportsRangerTalaColumn = await hasRangerTalaColumn();
  const normalizedBuilding = normalizeBuildingPayload(req.body, supportsRangerTalaColumn);

  if (!normalizedBuilding) {
    return res.status(400).json({ message: "Invalid building payload" });
  }

  const building = await prisma.building.create({
    data: {
      ...normalizedBuilding,
      userId: req.user.id,
    },
    select: getBuildingSelect(supportsRangerTalaColumn),
  });

  res.json(serializeBuilding(building));
};

// GET USER BUILDINGS
export const getBuildings = async (req, res) => {
  const supportsRangerTalaColumn = await hasRangerTalaColumn();
  const buildings = await prisma.building.findMany({
    where: {
      userId: req.user.id,
    },
    select: getBuildingSelect(supportsRangerTalaColumn),
  });

  res.json(buildings.map(serializeBuilding));
};

export const syncGameSnapshot = async (req, res) => {
  try {
    const supportsRangerTalaColumn = await hasRangerTalaColumn();
    const nextGold = Number(req.body?.gold);
    const hasEnergy = req.body?.energy !== undefined && req.body?.energy !== null;
    const nextEnergy = hasEnergy ? Number(req.body?.energy) : null;
    const incomingBuildings = Array.isArray(req.body?.buildings) ? req.body.buildings : null;

    if (
      !Number.isFinite(nextGold)
      || nextGold < 0
      || (hasEnergy && (!Number.isFinite(nextEnergy) || nextEnergy < 0))
      || !incomingBuildings
    ) {
      return res.status(400).json({ message: "Invalid snapshot payload" });
    }

    const normalizedBuildings = incomingBuildings
      .map((building) => normalizeBuildingPayload(building, supportsRangerTalaColumn))
      .filter(Boolean);

    if (normalizedBuildings.length !== incomingBuildings.length) {
      return res.status(400).json({ message: "One or more buildings are invalid" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          id: req.user.id,
        },
        data: {
          gold: Math.floor(nextGold),
          ...(hasEnergy ? { energy: Math.floor(nextEnergy) } : {}),
        },
      });

      await tx.building.deleteMany({
        where: {
          userId: req.user.id,
        },
      });

      if (normalizedBuildings.length > 0) {
        await tx.building.createMany({
          data: normalizedBuildings.map((building) => ({
            ...stripUnsupportedBuildingFields(building, supportsRangerTalaColumn),
            userId: req.user.id,
          })),
        });
      }
    });

    const snapshot = await getVillageSnapshotForUser(req.user.id);
    res.json(snapshot);
  } catch (error) {
    console.error("syncGameSnapshot error:", error);
    res.status(500).json({ message: "Unable to save game snapshot" });
  }
};

export const getWarTarget = async (req, res) => {
  try {
    const supportsRangerTalaColumn = await hasRangerTalaColumn();
    const requestedPlayerId = String(req.query.playerId ?? "").trim();
    let target = null;

    if (requestedPlayerId) {
      const normalizedPlayerId = requestedPlayerId.toUpperCase();

      target = await prisma.user.findFirst({
        where: {
          id: {
            not: req.user.id,
          },
          buildings: {
            some: {},
          },
          OR: [
            { playerId: normalizedPlayerId },
            { email: requestedPlayerId },
            Number.isInteger(Number(requestedPlayerId))
              ? { id: Number(requestedPlayerId) }
              : undefined,
          ].filter(Boolean),
        },
        select: {
          id: true,
          name: true,
          playerId: true,
          email: true,
          gold: true,
          buildings: {
            select: getBuildingSelect(supportsRangerTalaColumn),
            orderBy: [
              { y: "asc" },
              { x: "asc" },
            ],
          },
        },
      });

      if (!target) {
        return res.status(404).json({ message: "Enemy base not found for that player ID." });
      }
    } else {
      const opponents = await prisma.user.findMany({
        where: {
          id: {
            not: req.user.id,
          },
          buildings: {
            some: {},
          },
        },
        select: {
          id: true,
          name: true,
          playerId: true,
          email: true,
          gold: true,
          buildings: {
            select: getBuildingSelect(supportsRangerTalaColumn),
            orderBy: [
              { y: "asc" },
              { x: "asc" },
            ],
          },
        },
      });

      if (opponents.length === 0) {
        return res.status(404).json({ message: "No real enemy village found in the database." });
      }

      target = opponents[Math.floor(Math.random() * opponents.length)];
    }

    res.json(buildTargetPayload(target));
  } catch (error) {
    console.error("getWarTarget error:", error);
    res.status(500).json({ message: "Unable to find war target" });
  }
};

export const getWarEnemies = async (req, res) => {
  try {
    const supportsRangerTalaColumn = await hasRangerTalaColumn();
    const opponents = await prisma.user.findMany({
      where: {
        id: {
          not: req.user.id,
        },
        buildings: {
          some: {},
        },
      },
      select: {
        id: true,
        name: true,
        playerId: true,
        email: true,
        gold: true,
        buildings: {
          select: getBuildingSelect(supportsRangerTalaColumn),
          orderBy: [
            { y: "asc" },
            { x: "asc" },
          ],
        },
      },
      orderBy: [
        { id: "asc" },
      ],
      take: 24,
    });

    res.json(
      opponents.map((target) => {
        const payload = buildTargetPayload(target);

        return {
          id: payload.id,
          name: payload.name,
          playerId: payload.playerId,
          townHallLevel: payload.townHallLevel,
          defense: payload.defense,
          loot: payload.loot,
        };
      })
    );
  } catch (error) {
    console.error("getWarEnemies error:", error);
    res.status(500).json({ message: "Unable to load enemy list" });
  }
};

export const applyWarResolution = async (req, res) => {
  try {
    const supportsRangerTalaColumn = await hasRangerTalaColumn();
    const targetUserId = Number(req.body?.targetUserId);
    const requestedLoot = Math.max(0, Math.floor(Number(req.body?.loot ?? 0) || 0));
    const destructionPercent = Math.max(0, Math.floor(Number(req.body?.destructionPercent ?? 0) || 0));
    const defenderLosses = typeof req.body?.defenderLosses === "object" && req.body?.defenderLosses
      ? req.body.defenderLosses
      : null;

    if (!Number.isInteger(targetUserId) || targetUserId <= 0 || !defenderLosses) {
      return res.status(400).json({ message: "Invalid war resolution payload" });
    }

    if (targetUserId === req.user.id) {
      return res.status(400).json({ message: "You cannot resolve a battle against yourself" });
    }

    const target = await prisma.user.findUnique({
      where: {
        id: targetUserId,
      },
      select: {
        id: true,
        gold: true,
        buildings: {
          where: {
            type: "command-center",
          },
          select: {
            id: true,
            soldierCount: true,
            ...(supportsRangerTalaColumn ? { rangerTalaCount: true } : {}),
          },
        },
      },
    });

    if (!target) {
      return res.status(404).json({ message: "Target account not found" });
    }

    const maxLoot = Math.max(0, Math.floor((target.gold ?? 0) * 0.2));
    const transferredLoot = Math.min(requestedLoot, maxLoot);
    const awardedWarPoints = getWarPointReward(destructionPercent);
    let attackerGold = 0;
    let targetGold = 0;
    let attackerWarPoints = 0;
    let attackerRankName = getRankName(0);

    await prisma.$transaction(async (tx) => {
      const attacker = await tx.user.findUnique({
        where: {
          id: req.user.id,
        },
        select: {
          warPoints: true,
        },
      });

      for (const building of target.buildings) {
        const rawLoss = defenderLosses[String(building.id)] ?? defenderLosses[building.id] ?? 0;
        const loss = Math.max(0, Math.floor(Number(rawLoss) || 0));

        if (!loss) {
          continue;
        }

        await tx.building.update({
          where: {
            id: building.id,
          },
          data: stripUnsupportedBuildingFields({
            soldierCount: Math.max(
              0,
              Number(building.soldierCount ?? 0) - Math.min(
                Math.max(0, Number(building.soldierCount ?? 0) || 0),
                loss
              )
            ),
            rangerTalaCount: Math.max(
              0,
              Number(building.rangerTalaCount ?? 0) - Math.max(
                0,
                loss - Math.max(0, Number(building.soldierCount ?? 0) || 0)
              )
            ),
          }, supportsRangerTalaColumn),
        });
      }

      const updatedTarget = await tx.user.update({
        where: {
          id: targetUserId,
        },
        data: {
          gold: Math.max(0, Number(target.gold ?? 0) - transferredLoot),
        },
        select: {
          gold: true,
        },
      });

      const updatedAttacker = await tx.user.update({
        where: {
          id: req.user.id,
        },
        data: {
          gold: {
            increment: transferredLoot,
          },
          warPoints: {
            increment: awardedWarPoints,
          },
          rankName: getRankName((attacker?.warPoints ?? 0) + awardedWarPoints),
        },
        select: {
          gold: true,
          warPoints: true,
          rankName: true,
        },
      });

      attackerGold = updatedAttacker.gold ?? 0;
      attackerWarPoints = updatedAttacker.warPoints ?? 0;
      attackerRankName = updatedAttacker.rankName || getRankName(updatedAttacker.warPoints ?? 0);
      targetGold = updatedTarget.gold ?? 0;
    });

    res.json({
      success: true,
      transferredLoot,
      attackerGold,
      targetGold,
      awardedWarPoints,
      ...buildRankPayload(attackerWarPoints),
      rankName: attackerRankName,
    });
  } catch (error) {
    console.error("applyWarResolution error:", error);
    res.status(500).json({ message: "Unable to save battle defender losses" });
  }
};

export const updateBuilding = async (req, res) => {
  const supportsRangerTalaColumn = await hasRangerTalaColumn();
  const buildingId = Number(req.params.id);
  const { x, y, level, isUpgrading, upgradeCompleteAt } = req.body;

  const building = await prisma.building.findFirst({
    where: {
      id: buildingId,
      userId: req.user.id,
    },
    select: {
      id: true,
    },
  });

  if (!building) {
    return res.status(404).json({ message: "Building not found" });
  }

  const nextData = {};

  if (Number.isFinite(Number(x))) {
    nextData.x = Number(x);
  }

  if (Number.isFinite(Number(y))) {
    nextData.y = Number(y);
  }

  if (Number.isInteger(Number(level)) && Number(level) > 0) {
    nextData.level = Number(level);
  }

  if (typeof isUpgrading === "boolean") {
    nextData.isUpgrading = isUpgrading;
  }

  if (upgradeCompleteAt === null) {
    nextData.upgradeCompleteAt = null;
  } else if (upgradeCompleteAt) {
    const parsedUpgradeCompleteAt = new Date(upgradeCompleteAt);

    if (!Number.isNaN(parsedUpgradeCompleteAt.getTime())) {
      nextData.upgradeCompleteAt = parsedUpgradeCompleteAt;
    }
  }

  if (Number.isFinite(Number(req.body.machineGold))) {
    nextData.machineGold = Math.max(0, Math.floor(Number(req.body.machineGold)));
  }

  if (Number.isFinite(Number(req.body.soldierCount))) {
    nextData.soldierCount = Math.max(0, Math.floor(Number(req.body.soldierCount)));
  }

  if (supportsRangerTalaColumn && Number.isFinite(Number(req.body.rangerTalaCount))) {
    nextData.rangerTalaCount = Math.max(0, Math.floor(Number(req.body.rangerTalaCount)));
  }

  if (typeof req.body.hasChopper === "boolean") {
    nextData.hasChopper = req.body.hasChopper;
  }

  if (typeof req.body.hasTank === "boolean") {
    nextData.hasTank = req.body.hasTank;
  }

  if (Number.isFinite(Number(req.body.tankShotsRemaining))) {
    nextData.tankShotsRemaining = Math.max(0, Math.min(10, Math.floor(Number(req.body.tankShotsRemaining))));
  }

  if (Number.isFinite(Number(req.body.chopperShotsRemaining))) {
    nextData.chopperShotsRemaining = Math.max(0, Math.min(15, Math.floor(Number(req.body.chopperShotsRemaining))));
  }

  if (req.body.lastGeneratedAt !== undefined) {
    nextData.lastGeneratedAt = parseOptionalDate(req.body.lastGeneratedAt);
  }

  if (req.body.lastWagePaidAt !== undefined) {
    nextData.lastWagePaidAt = parseOptionalDate(req.body.lastWagePaidAt);
  }

  if (req.body.lastFedAt !== undefined) {
    nextData.lastFedAt = parseOptionalDate(req.body.lastFedAt);
  }

  const updatedBuilding = await prisma.building.update({
    where: {
      id: buildingId,
    },
    data: stripUnsupportedBuildingFields(nextData, supportsRangerTalaColumn),
    select: getBuildingSelect(supportsRangerTalaColumn),
  });

  res.json(serializeBuilding(updatedBuilding));
};

export const deleteBuilding = async (req, res) => {
  try {
    const buildingId = Number(req.params.id);

    if (!Number.isInteger(buildingId) || buildingId <= 0) {
      return res.status(400).json({ message: "Invalid building id" });
    }

    const building = await prisma.building.findFirst({
      where: {
        id: buildingId,
        userId: req.user.id,
      },
      select: {
        id: true,
      },
    });

    if (!building) {
      return res.status(404).json({ message: "Building not found" });
    }

    await prisma.building.delete({
      where: {
        id: buildingId,
      },
    });

    res.json({ success: true, id: buildingId });
  } catch (error) {
    console.error("deleteBuilding error:", error);
    res.status(500).json({ message: "Unable to delete building" });
  }
};
