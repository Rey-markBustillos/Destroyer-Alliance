import fs from "fs/promises";
import path from "path";

import dotenv from "dotenv";

import prisma from "../prismaClient.js";

dotenv.config();

const DEFAULT_GOLD = 1200;
const DEFAULT_ENERGY = 0;

const usage = () => {
  console.log("Usage: node scripts/force-sync-snapshots.js <path-to-snapshots.json>");
  console.log("JSON format: an array of entries with one of id/playerId/email plus snapshot data.");
};

const parseOptionalDate = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeBuilding = (building) => {
  const type = typeof building?.type === "string" ? building.type.trim() : "";
  const x = Number(building?.x ?? building?.col);
  const y = Number(building?.y ?? building?.row);

  if (!type || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return {
    type,
    x: Math.floor(x),
    y: Math.floor(y),
    level: Math.max(1, Math.floor(Number(building?.level ?? 1) || 1)),
    isUpgrading: Boolean(building?.isUpgrading),
    upgradeCompleteAt: parseOptionalDate(building?.upgradeCompleteAt),
    machineGold: Math.max(0, Math.floor(Number(building?.machineGold ?? 0) || 0)),
    lastGeneratedAt: parseOptionalDate(building?.lastGeneratedAt),
    soldierCount: Math.max(0, Math.floor(Number(building?.soldierCount ?? 0) || 0)),
    rangerTalaCount: Math.max(0, Math.floor(Number(building?.rangerTalaCount ?? 0) || 0)),
    lastWagePaidAt: parseOptionalDate(building?.lastWagePaidAt),
    lastFedAt: parseOptionalDate(building?.lastFedAt),
    hasChopper: Boolean(building?.hasChopper),
    hasTank: Boolean(building?.hasTank),
    tankShotsRemaining: Boolean(building?.hasTank)
      ? Math.max(0, Math.min(10, Math.floor(Number(building?.tankShotsRemaining ?? 10) || 10)))
      : 0,
    chopperShotsRemaining: Boolean(building?.hasChopper)
      ? Math.max(0, Math.min(15, Math.floor(Number(building?.chopperShotsRemaining ?? 15) || 15)))
      : 0,
  };
};

const normalizeSnapshot = (entry) => {
  const buildings = Array.isArray(entry?.snapshot?.buildings)
    ? entry.snapshot.buildings
    : Array.isArray(entry?.buildings)
      ? entry.buildings
      : [];

  const normalizedBuildings = buildings.map(normalizeBuilding).filter(Boolean);

  if (normalizedBuildings.length !== buildings.length) {
    throw new Error("Snapshot contains invalid buildings.");
  }

  return {
    gold: Math.max(
      0,
      Math.floor(
        Number(entry?.snapshot?.gold ?? entry?.gold ?? DEFAULT_GOLD) || DEFAULT_GOLD
      )
    ),
    energy: Math.max(
      0,
      Math.floor(
        Number(entry?.snapshot?.energy ?? entry?.energy ?? DEFAULT_ENERGY) || DEFAULT_ENERGY
      )
    ),
    buildings: normalizedBuildings,
  };
};

const buildUserWhere = (entry) => {
  if (Number.isInteger(Number(entry?.id))) {
    return { id: Number(entry.id) };
  }

  if (typeof entry?.playerId === "string" && entry.playerId.trim()) {
    return { playerId: entry.playerId.trim().toUpperCase() };
  }

  if (typeof entry?.email === "string" && entry.email.trim()) {
    return { email: entry.email.trim() };
  }

  return null;
};

const main = async () => {
  const sourceArg = process.argv[2];

  if (!sourceArg || sourceArg === "--help" || sourceArg === "-h") {
    usage();
    process.exit(sourceArg ? 0 : 1);
  }

  const sourcePath = path.resolve(process.cwd(), sourceArg);
  const raw = await fs.readFile(sourcePath, "utf8");
  const entries = JSON.parse(raw);

  if (!Array.isArray(entries)) {
    throw new Error("Snapshot file must be a JSON array.");
  }

  await prisma.$connect();

  let updatedUsers = 0;

  for (const [index, entry] of entries.entries()) {
    const where = buildUserWhere(entry);

    if (!where) {
      throw new Error(`Entry ${index + 1} is missing id, playerId, or email.`);
    }

    const user = await prisma.user.findUnique({
      where,
      select: {
        id: true,
        email: true,
        playerId: true,
      },
    });

    if (!user) {
      throw new Error(`Entry ${index + 1} did not match any user.`);
    }

    const snapshot = normalizeSnapshot(entry);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          gold: snapshot.gold,
          energy: snapshot.energy,
        },
      });

      await tx.building.deleteMany({
        where: { userId: user.id },
      });

      if (snapshot.buildings.length > 0) {
        await tx.building.createMany({
          data: snapshot.buildings.map((building) => ({
            ...building,
            userId: user.id,
          })),
        });
      }
    });

    updatedUsers += 1;
    console.log(
      `Synced ${user.playerId ?? `user:${user.id}`} (${user.email}) with ${snapshot.buildings.length} buildings.`
    );
  }

  console.log(`Done. Updated ${updatedUsers} account(s).`);
};

main()
  .catch((error) => {
    console.error("force-sync-snapshots failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
