import prisma from "../prismaClient.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

const buildPlayerId = (id) => `PLYR-${String(id).padStart(6, "0")}`;
const RENAME_COST = 5000;

const ensurePlayerId = async (user) => {
  if (user?.playerId) {
    return user;
  }

  return prisma.user.update({
    where: { id: user.id },
    data: { playerId: buildPlayerId(user.id) },
  });
};

// REGISTER
export const registerUser = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    const userExists = await prisma.user.findUnique({
      where: { email },
    });

    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const createdUser = await prisma.user.create({
      data: {
        name: name?.trim() || "Commander",
        email,
        password: hashedPassword,
      },
    });

    const user = await ensurePlayerId(createdUser);

    const safeUser = await ensurePlayerId(user);

    res.json({
      id: safeUser.id,
      name: safeUser.name,
      playerId: safeUser.playerId,
      email: safeUser.email,
      gold: safeUser.gold,
      token: generateToken(safeUser.id),
    });
  } catch (error) {
    console.error("registerUser failed:", error);
    res.status(500).json({ message: "Registration failed on the server." });
  }
};

// LOGIN
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    res.json({
      id: user.id,
      name: user.name,
      playerId: user.playerId,
      email: user.email,
      gold: user.gold,
      token: generateToken(user.id),
    });
  } catch (error) {
    console.error("loginUser failed:", error);
    res.status(500).json({ message: "Login failed on the server." });
  }
};

// PROFILE
export const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        playerId: true,
        email: true,
        gold: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "Profile not found" });
    }

    if (user.playerId) {
      return res.json(user);
    }

    const patchedUser = await prisma.user.update({
      where: { id: user.id },
      data: { playerId: buildPlayerId(user.id) },
      select: {
        id: true,
        name: true,
        playerId: true,
        email: true,
        gold: true,
      },
    });

    res.json(patchedUser);
  } catch (error) {
    console.error("getProfile failed:", error);
    res.status(500).json({ message: "Unable to load profile." });
  }
};

export const updateProfileName = async (req, res) => {
  try {
    const requestedName = typeof req.body?.name === "string" ? req.body.name.trim() : "";

    if (requestedName.length < 3) {
      return res.status(400).json({ message: "Player name must be at least 3 characters." });
    }

    if (requestedName.length > 24) {
      return res.status(400).json({ message: "Player name must be 24 characters or less." });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        playerId: true,
        email: true,
        gold: true,
      },
    });

    if (!currentUser) {
      return res.status(404).json({ message: "Profile not found" });
    }

    if ((currentUser.gold ?? 0) < RENAME_COST) {
      return res.status(400).json({ message: "You need 5000 gold to change your player name." });
    }

    if ((currentUser.name ?? "").trim() === requestedName) {
      return res.status(400).json({ message: "Enter a different player name." });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: requestedName,
        gold: {
          decrement: RENAME_COST,
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

    res.json({
      ...updatedUser,
      renameCost: RENAME_COST,
      message: "Player name updated successfully.",
    });
  } catch (error) {
    console.error("updateProfileName failed:", error);
    res.status(500).json({ message: "Unable to update player name." });
  }
};
