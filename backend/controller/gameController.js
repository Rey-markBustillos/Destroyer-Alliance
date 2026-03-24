import prisma from "../prismaClient.js";

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
  const { x, y } = req.body;

  const building = await prisma.building.findFirst({
    where: {
      id: buildingId,
      userId: req.user.id,
    },
  });

  if (!building) {
    return res.status(404).json({ message: "Building not found" });
  }

  const updatedBuilding = await prisma.building.update({
    where: {
      id: buildingId,
    },
    data: {
      x,
      y,
    },
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
