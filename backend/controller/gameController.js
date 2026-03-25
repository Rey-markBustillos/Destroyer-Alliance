import prisma from "../prismaClient.js";

export const getGameState = async (req, res) => {
  const user = await prisma.user.findUnique({
    where: {
      id: req.user.id,
    },
    select: {
      gold: true,
    },
  });

  res.json({
    gold: user?.gold ?? 1200,
  });
};

export const updateGameState = async (req, res) => {
  const nextGold = Number(req.body.gold);

  if (!Number.isFinite(nextGold) || nextGold < 0) {
    return res.status(400).json({ message: "Invalid gold value" });
  }

  const user = await prisma.user.update({
    where: {
      id: req.user.id,
    },
    data: {
      gold: Math.floor(nextGold),
    },
    select: {
      gold: true,
    },
  });

  res.json(user);
};

// ADD BUILDING
export const addBuilding = async (req, res) => {
  const { type, x, y } = req.body;

  const building = await prisma.building.create({
    data: {
      type,
      x,
      y,
      userId: req.user.id,
    },
  });

  res.json(building);
};

// GET USER BUILDINGS
export const getBuildings = async (req, res) => {
  const buildings = await prisma.building.findMany({
    where: {
      userId: req.user.id,
    },
  });

  res.json(buildings);
};

export const updateBuilding = async (req, res) => {
  const buildingId = Number(req.params.id);
  const { x, y, level, isUpgrading, upgradeCompleteAt } = req.body;

  const building = await prisma.building.findFirst({
    where: {
      id: buildingId,
      userId: req.user.id,
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

  const updatedBuilding = await prisma.building.update({
    where: {
      id: buildingId,
    },
    data: nextData,
  });

  res.json(updatedBuilding);
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
