import Phaser from "phaser";

import Building from "../objects/Building";
import { BUILDING_LIST } from "../utils/buildingTypes";
import {
  configureHdSprite,
  createAmbientWorldLighting,
  createSoftShadow,
} from "../utils/renderQuality";

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const MAP_ROWS = 12;
const MAP_COLS = 12;
const INITIAL_ZOOM = 0.9;
const BATTLE_CAMERA_PADDING_X = 220;
const BATTLE_CAMERA_PADDING_Y = 220;
const RAID_PREVIEW_READY_DELAY_MS = 1800;
const RAID_TIME_LIMIT_MS = 180000;
const RAID_DEPLOY_INTERVAL_MS = 180;
const SOLDIER_WALK_FRAME_MS = 130;
const SOLDIER_WALK_BOB_AMPLITUDE = 1.2;
const SOLDIER_WALK_BOB_SPEED = 0.016;
const SOLDIER_DIRECTION_DEADZONE = 4;
const SOLDIER_DIRECTION_SWITCH_RATIO = 1.18;
const AIR_DEFENSE_TARGET_PRIORITY = ["rocket", "jet", "helicopter"];
const DEPLOYABLE_MIN_ROW = MAP_ROWS - 3;
const SOLDIER_WALK_TEXTURES = {
  front: ["soldier-front-walk-1", "soldier-front-walk-2"],
  back: ["soldier-back-walk-1", "soldier-back-walk-2"],
  left: ["soldier-left-walk-1", "soldier-left-walk-2"],
  right: ["soldier-right-walk-1", "soldier-right-walk-2"],
};
const SOLDIER_FIRING_TEXTURES = {
  front: "soldier-front-firing",
  back: "soldier-back-firing",
  left: "soldier-left-firing",
  right: "soldier-right-firing",
};
const TANK_IDLE_TEXTURE = "tank-owned";
const TANK_ATTACK_TEXTURES = {
  right: "tank-attack-right",
  "down-right": "tank-attack-down-right",
  down: "tank-attack-down",
  "down-left": "tank-attack-down-left",
  left: "tank-attack-left",
  "up-left": "tank-attack-up-left",
  up: "tank-attack-up",
  "up-right": "tank-attack-up-right",
};
const TANK_BARREL_LENGTH = 22;
const TANK_RENDER_MAX_WIDTH = 64;
const TANK_RENDER_MAX_HEIGHT = 48;
const VEHICLE_SHOTS_PER_CHARGE = {
  tank: 10,
  helicopter: 15,
};

const darkenColor = (hex, amount = 16) => {
  const color = Phaser.Display.Color.ValueToColor(hex);
  color.darken(amount);
  return color.color;
};

const clamp = Phaser.Math.Clamp;
const distanceBetween = Phaser.Math.Distance.Between;

const UNIT_CONFIG = {
  soldier: {
    maxHealth: 80,
    speed: 24,
    range: 108,
    detectRange: 172,
    damage: 14,
    cooldownMs: 880,
    preferredTargets: ["tower", "guard", "building", "wall"],
    lootScale: 1,
  },
  tank: {
    maxHealth: 260,
    speed: 30,
    range: 124,
    detectRange: 188,
    damage: 80,
    cooldownMs: 1320,
    preferredTargets: ["tower", "building", "wall", "guard"],
    lootScale: 1.35,
  },
  helicopter: {
    maxHealth: 170,
    speed: 68,
    range: 144,
    detectRange: 208,
    damage: 24,
    cooldownMs: 980,
    preferredTargets: ["tower", "building", "guard", "wall"],
    altitude: -26,
    lootScale: 1.2,
  },
  guard: {
    maxHealth: 90,
    speed: 24,
    range: 92,
    detectRange: 156,
    damage: 10,
    cooldownMs: 980,
    preferredTargets: ["soldier", "tank", "helicopter"],
  },
};

const SOLDIER_DAMAGE_MODIFIERS = {
  vsStructure: 0.7,
  vsTank: 0.62,
  vsHelicopter: 0.56,
};

const VEHICLE_LEVEL_BONUS = {
  tank: {
    healthPerLevel: 120,
    damagePerLevel: 18,
  },
  helicopter: {
    healthPerLevel: 70,
    damagePerLevel: 10,
  },
};

const STRUCTURE_LOOT = {
  "town-hall": 340,
  "command-center": 340,
  "wood-machine": 120,
  skyport: 150,
  "air-defense": 220,
  tent: 180,
  tower: 85,
  wall: 10,
  storage: 140,
};

const structureSortValue = (entry) => {
  if (entry.kind === "air-defense") {
    return 5;
  }

  if (entry.kind === "tower") {
    return 4;
  }

  if (entry.kind === "wall") {
    return 1;
  }

  return 3;
};

const normalizeDirection = (dx, dy) => {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }

  return dy >= 0 ? "front" : "back";
};

const getDeterministicSeed = (value) => {
  const text = String(value ?? "");
  let seed = 7;

  for (let index = 0; index < text.length; index += 1) {
    seed = ((seed * 31) + text.charCodeAt(index)) % 100000;
  }

  return seed;
};

const resolveStableDirection = (currentDirection, dx, dy) => {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (absX < SOLDIER_DIRECTION_DEADZONE && absY < SOLDIER_DIRECTION_DEADZONE) {
    return currentDirection ?? "front";
  }

  if (absX > absY * SOLDIER_DIRECTION_SWITCH_RATIO) {
    return dx >= 0 ? "right" : "left";
  }

  if (absY > absX * SOLDIER_DIRECTION_SWITCH_RATIO) {
    return dy >= 0 ? "front" : "back";
  }

  return currentDirection ?? normalizeDirection(dx, dy);
};

const getTankDirectionFromAngle = (angle, fallbackDirection = "down") => {
  if (!Number.isFinite(angle)) {
    return fallbackDirection;
  }

  const angleDeg = Phaser.Math.RadToDeg(angle);

  if (angleDeg >= -22.5 && angleDeg < 22.5) {
    return "right";
  }

  if (angleDeg >= 22.5 && angleDeg < 67.5) {
    return "down-right";
  }

  if (angleDeg >= 67.5 && angleDeg < 112.5) {
    return "down";
  }

  if (angleDeg >= 112.5 && angleDeg < 157.5) {
    return "down-left";
  }

  if (angleDeg >= 157.5 || angleDeg < -157.5) {
    return "left";
  }

  if (angleDeg >= -157.5 && angleDeg < -112.5) {
    return "up-left";
  }

  if (angleDeg >= -112.5 && angleDeg < -67.5) {
    return "up";
  }

  if (angleDeg >= -67.5 && angleDeg < -22.5) {
    return "up-right";
  }

  return fallbackDirection;
};

const getTankTextureForDirection = (direction = "down") => {
  return TANK_ATTACK_TEXTURES[direction] ?? TANK_IDLE_TEXTURE;
};

const getTargetAimPoint = (target) => {
  if (!target) {
    return { x: 0, y: 0 };
  }

  if (target.kind) {
    const yOffset = target.kind === "wall"
      ? 16
      : target.kind === "tower"
        ? 54
        : target.kind === "air-defense"
          ? 52
          : 60;
    return {
      x: target.x,
      y: target.y - yOffset,
    };
  }

  const yOffset = target.type === "tank"
    ? 24
    : target.type === "helicopter"
      ? 28
      : 22;
  return {
    x: target.x,
    y: target.y - yOffset,
  };
};

const getUnitPriority = (unitType, candidate) => {
  const priorities = UNIT_CONFIG[unitType]?.preferredTargets ?? [];
  const kind = candidate.kind === "building" ? "building" : candidate.kind;
  const matchIndex = priorities.indexOf(kind);

  return matchIndex === -1 ? priorities.length + 1 : matchIndex;
};

const canUnitTarget = (unit, candidate) => {
  if (!unit || !candidate) {
    return false;
  }

  if (unit.type === "tank" && candidate.type === "helicopter") {
    return false;
  }

  return true;
};

const isFlyingUnit = (entry) => ["rocket", "jet", "helicopter"].includes(entry?.type);

const getAirDefenseTargetPriority = (target) => {
  const matchIndex = AIR_DEFENSE_TARGET_PRIORITY.indexOf(target?.type);
  return matchIndex === -1 ? AIR_DEFENSE_TARGET_PRIORITY.length + 1 : matchIndex;
};

const getAirDefenseProfile = (level = 1) => {
  const resolvedLevel = Math.max(1, Number(level ?? 1) || 1);

  return {
    detectionRadius: 340 + ((resolvedLevel - 1) * 60),
    missileRange: 250 + ((resolvedLevel - 1) * 40),
    gunRange: 150 + ((resolvedLevel - 1) * 24),
    missileDamage: 56 + ((resolvedLevel - 1) * 18),
    gunDamage: 9 + ((resolvedLevel - 1) * 4),
    missileCooldownMs: 10000,
    gunCooldownMs: Math.max(140, 220 - ((resolvedLevel - 1) * 40)),
    gunHeatLimit: 7 + ((resolvedLevel - 1) * 2),
    missileLaunchers: 1 + (resolvedLevel >= 2 ? 1 : 0),
  };
};

const getVehicleStatsForLevel = (type, level = 1) => {
  const unitConfig = UNIT_CONFIG[type];
  const levelBonus = VEHICLE_LEVEL_BONUS[type];
  const resolvedLevel = Math.max(1, Number(level ?? 1) || 1);

  if (!unitConfig || !levelBonus) {
    return {
      health: Math.max(1, Number(unitConfig?.maxHealth ?? 1) || 1),
      damage: Math.max(1, Number(unitConfig?.damage ?? 1) || 1),
    };
  }

  return {
    health: unitConfig.maxHealth + ((resolvedLevel - 1) * levelBonus.healthPerLevel),
    damage: unitConfig.damage + ((resolvedLevel - 1) * levelBonus.damagePerLevel),
  };
};

const normalizeVehicleUnit = (unit, index, fallbackType) => ({
  id: unit?.id ?? `${fallbackType}-${index}`,
  health: Math.max(1, Number(unit?.health ?? UNIT_CONFIG[fallbackType].maxHealth) || UNIT_CONFIG[fallbackType].maxHealth),
  damage: Math.max(1, Number(unit?.damage ?? UNIT_CONFIG[fallbackType].damage) || UNIT_CONFIG[fallbackType].damage),
  shotsRemaining: Math.max(
    0,
    Math.floor(
      Number(
        unit?.shotsRemaining
          ?? unit?.maxShots
          ?? VEHICLE_SHOTS_PER_CHARGE[fallbackType]
          ?? 0
      ) || 0
    )
  ),
  maxShots: Math.max(
    1,
    Math.floor(Number(unit?.maxShots ?? VEHICLE_SHOTS_PER_CHARGE[fallbackType] ?? 1) || 1)
  ),
});

export default class BattleScene extends Phaser.Scene {
  constructor(runtimeOptions = {}) {
    super("GameScene");
    this.runtimeOptions = runtimeOptions;
  }

  create() {
    this.iso = {
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      rows: MAP_ROWS,
      cols: MAP_COLS,
    };
    this.pointerDrag = {
      active: false,
      moved: false,
      startX: 0,
      startY: 0,
      cameraScrollX: 0,
      cameraScrollY: 0,
    };
    this.lastDeployAt = 0;
    this.worldBounds = null;

    this.groundLayer = this.add.layer();
    this.ambientLayer = this.add.layer();
    this.structureLayer = this.add.layer();
    this.unitLayer = this.add.layer();
    this.effectLayer = this.add.layer();
    this.overlayLayer = this.add.layer();
    this.groundLayer.setDepth(-40);
    this.ambientLayer.setDepth(-10);
    this.structureLayer.setDepth(20);
    this.unitLayer.setDepth(24);
    this.effectLayer.setDepth(32);
    this.overlayLayer.setDepth(40);

    this.computeBoardMetrics();
    this.drawBoard();
    this.createCamera();
    this.bindInput();
    this.resetRaidState();
    this.game.events.emit("game-scene-ready");
  }

  resetRaidState() {
    this.raid = {
      phase: "idle",
      target: null,
      army: { soldiers: 0, energy: 0, tanks: 0, tankUnits: [], helicopters: 0, helicopterUnits: [] },
      structures: [],
      attackers: [],
      reserves: {
        energy: 0,
        soldiers: 0,
        tankUnits: [],
        helicopterUnits: [],
      },
      selectedDeploymentType: "soldier",
      defenders: [],
      projectiles: [],
      effects: [],
      loot: 0,
      maxLoot: 0,
      destructionPercent: 0,
      totalStructureHealth: 0,
      destroyedHealth: 0,
      defenderLosses: {},
      summary: null,
      energySpent: 0,
      lastUiEmitAt: 0,
      startedAt: 0,
    };
  }

  computeBoardMetrics() {
    const corners = [
      this.gridToWorld(0, 0),
      this.gridToWorld(this.iso.cols - 1, 0),
      this.gridToWorld(0, this.iso.rows - 1),
      this.gridToWorld(this.iso.cols - 1, this.iso.rows - 1),
    ];
    const halfW = this.iso.tileWidth / 2;
    const halfH = this.iso.tileHeight / 2;
    const minY = Math.min(...corners.map(({ y }) => y - halfH));
    const maxY = Math.max(...corners.map(({ y }) => y + halfH));
    const boardHeight = maxY - minY;

    this.iso.originX = this.scale.width / 2;
    this.iso.originY = this.scale.height / 2 - (minY + boardHeight / 2) + this.iso.tileHeight / 2;

    const centeredCorners = [
      this.gridToWorld(0, 0),
      this.gridToWorld(this.iso.cols - 1, 0),
      this.gridToWorld(0, this.iso.rows - 1),
      this.gridToWorld(this.iso.cols - 1, this.iso.rows - 1),
    ];

    const worldMinX = Math.min(...centeredCorners.map(({ x }) => x - halfW));
    const worldMaxX = Math.max(...centeredCorners.map(({ x }) => x + halfW));
    const worldMinY = Math.min(...centeredCorners.map(({ y }) => y - halfH)) - 360;
    const worldMaxY = Math.max(...centeredCorners.map(({ y }) => y + halfH)) + 340;

    this.worldBounds = {
      minX: worldMinX - 320,
      maxX: worldMaxX + 320,
      minY: worldMinY,
      maxY: worldMaxY,
      width: worldMaxX - worldMinX + 640,
      height: worldMaxY - worldMinY,
    };
  }

  gridToWorld(x, y) {
    return {
      x: (x - y) * this.iso.tileWidth / 2 + (this.iso.originX ?? 0),
      y: (x + y) * this.iso.tileHeight / 2 + (this.iso.originY ?? 0),
    };
  }

  worldToGrid(worldX, worldY) {
    const localX = worldX - this.iso.originX;
    const localY = worldY - this.iso.originY;

    return {
      col: Math.round((localX / (this.iso.tileWidth / 2) + localY / (this.iso.tileHeight / 2)) / 2),
      row: Math.round((localY / (this.iso.tileHeight / 2) - localX / (this.iso.tileWidth / 2)) / 2),
    };
  }

  createDiamondPoints(centerX, centerY) {
    const halfW = this.iso.tileWidth / 2;
    const halfH = this.iso.tileHeight / 2;

    return [
      new Phaser.Geom.Point(centerX, centerY - halfH),
      new Phaser.Geom.Point(centerX + halfW, centerY),
      new Phaser.Geom.Point(centerX, centerY + halfH),
      new Phaser.Geom.Point(centerX - halfW, centerY),
    ];
  }

  createDiamondSidePoints(centerX, centerY, side = "left", drop = 12) {
    const halfW = this.iso.tileWidth / 2;
    const halfH = this.iso.tileHeight / 2;

    if (side === "right") {
      return [
        new Phaser.Geom.Point(centerX, centerY + halfH),
        new Phaser.Geom.Point(centerX + halfW, centerY),
        new Phaser.Geom.Point(centerX + halfW, centerY + drop),
        new Phaser.Geom.Point(centerX, centerY + halfH + drop),
      ];
    }

    return [
      new Phaser.Geom.Point(centerX - halfW, centerY),
      new Phaser.Geom.Point(centerX, centerY + halfH),
      new Phaser.Geom.Point(centerX, centerY + halfH + drop),
      new Phaser.Geom.Point(centerX - halfW, centerY + drop),
    ];
  }

  getTileColor(row, col) {
    const seed = Math.abs((row * 47) + (col * 29) + ((row - col) * 13));
    const palette = [0x7da55d, 0x739d56, 0x679148, 0x86ae67, 0x6b944d, 0x8ab06c];

    return palette[seed % palette.length];
  }

  drawBoard() {
    if (this.textures.exists("base")) {
      const boardCenter = this.gridToWorld((this.iso.cols - 1) / 2, (this.iso.rows - 1) / 2);
      const base = this.add.image(boardCenter.x, boardCenter.y + this.iso.tileHeight * 2.2, "base");
      base.setOrigin(0.5, 0.5);
      configureHdSprite(base, {
        scene: this,
        maxWidth: this.iso.cols * this.iso.tileWidth * 1.5,
        maxHeight: this.iso.rows * this.iso.tileHeight * 2.9,
      });
      base.setTint(0xf8fafc);
      base.setDepth(-30);
      this.groundLayer.add(base);
      createAmbientWorldLighting(this, this.ambientLayer, {
        centerX: boardCenter.x,
        centerY: boardCenter.y + this.iso.tileHeight * 2.05,
        width: this.iso.cols * this.iso.tileWidth * 1.65,
        height: this.iso.rows * this.iso.tileHeight * 2.95,
      });
      return;
    }

    for (let row = 0; row < this.iso.rows; row += 1) {
      for (let col = 0; col < this.iso.cols; col += 1) {
        const { x, y } = this.gridToWorld(col, row);
        const tile = this.add.graphics();
        const top = this.createDiamondPoints(x, y);
        const leftFace = this.createDiamondSidePoints(x, y, "left", 12);
        const rightFace = this.createDiamondSidePoints(x, y, "right", 12);
        const topColor = this.getTileColor(row, col);

        tile.fillStyle(darkenColor(topColor, 32), 0.95);
        tile.fillPoints(leftFace, true);
        tile.fillStyle(darkenColor(topColor, 18), 1);
        tile.fillPoints(rightFace, true);
        tile.fillStyle(topColor, 1);
        tile.fillPoints(top, true);
        tile.lineStyle(2, darkenColor(topColor, 26), 0.75);
        tile.strokePoints([...top, top[0]], false, false);
        tile.setDepth(row + col);
        this.groundLayer.add(tile);
      }
    }
  }

  createCamera() {
    const camera = this.cameras.main;
    camera.setBackgroundColor("#020617");
    camera.setBounds(
      this.worldBounds.minX,
      this.worldBounds.minY,
      this.worldBounds.width,
      this.worldBounds.height
    );
    camera.centerOn(this.iso.originX, this.iso.originY + this.iso.rows * this.iso.tileHeight / 2);
    camera.setZoom(INITIAL_ZOOM);
    camera.roundPixels = false;
  }

  bindInput() {
    this.input.on("pointerdown", (pointer) => {
      if (this.raid?.phase !== "active") {
        return;
      }

      this.handleBattlefieldDeploy(pointer.worldX, pointer.worldY);
    });

    this.input.on("pointerup", (pointer) => {
      if (this.raid?.phase !== "active") {
        return;
      }

      this.handleBattlefieldDeploy(pointer.worldX, pointer.worldY);
    });
  }

  clearRaidVisuals() {
    const destroyDisplay = (entry) => {
      entry?.display?.destroy?.();
      entry?.healthBar?.destroy?.();
      entry?.shadow?.destroy?.();
      entry?.radarPulse?.destroy?.();
    };

    this.raid?.structures?.forEach(destroyDisplay);
    this.raid?.attackers?.forEach(destroyDisplay);
    this.raid?.defenders?.forEach(destroyDisplay);
    this.raid?.projectiles?.forEach((entry) => entry.display?.destroy?.());
    this.raid?.effects?.forEach((entry) => entry.display?.destroy?.());
    this.tweens.killAll();
    this.resetRaidState();
  }

  previewRaidTarget({ target, army }) {
    this.clearRaidVisuals();
    const normalizedTankUnits = Array.isArray(army?.tankUnits) && army.tankUnits.length > 0
      ? army.tankUnits.map((tank, index) => normalizeVehicleUnit(tank, index, "tank"))
      : Array.from({ length: Math.max(0, Number(army?.tanks ?? 0) || 0) }, (_, index) =>
        normalizeVehicleUnit(getVehicleStatsForLevel("tank", 1), index, "tank"));
    const normalizedHelicopterUnits = Array.isArray(army?.helicopterUnits) && army.helicopterUnits.length > 0
      ? army.helicopterUnits.map((helicopter, index) => normalizeVehicleUnit(helicopter, index, "helicopter"))
      : Array.from({ length: Math.max(0, Number(army?.helicopters ?? 0) || 0) }, (_, index) =>
        normalizeVehicleUnit(getVehicleStatsForLevel("helicopter", 1), index, "helicopter"));
    this.raid.target = target ?? null;
    this.raid.army = {
      soldiers: Math.max(0, Number(army?.soldiers ?? 0) || 0),
      energy: Math.max(0, Number(army?.energy ?? 0) || 0),
      tanks: normalizedTankUnits.length,
      tankUnits: normalizedTankUnits.map((unit) => ({ ...unit })),
      helicopters: normalizedHelicopterUnits.length,
      helicopterUnits: normalizedHelicopterUnits.map((unit) => ({ ...unit })),
    };
    this.raid.reserves = {
      energy: Math.max(0, Number(army?.energy ?? 0) || 0),
      soldiers: Math.max(0, Number(army?.soldiers ?? 0) || 0),
      tankUnits: normalizedTankUnits.map((unit) => ({ ...unit })),
      helicopterUnits: normalizedHelicopterUnits.map((unit) => ({ ...unit })),
    };
    this.raid.selectedDeploymentType = this.getFirstAvailableDeploymentType();
    this.raid.maxLoot = Math.max(0, Number(target?.loot ?? 0) || 0);
    this.raid.phase = target ? "scouting" : "idle";

    if (!target) {
      this.emitRaidState(true);
      return;
    }

    this.createTargetVillage(target);
    this.runCameraReveal();
    this.time.delayedCall(RAID_PREVIEW_READY_DELAY_MS, () => {
      if (this.raid.target?.id !== target.id) {
        return;
      }

      this.raid.phase = "ready";
      this.emitRaidState(true);
    });

    this.emitRaidState(true);
  }

  createTargetVillage(target) {
    const targetBuildings = Array.isArray(target?.buildings) ? target.buildings : [];

    targetBuildings.forEach((entry) => {
      const buildingType = BUILDING_LIST.find((item) => item.id === entry.type);

      if (!buildingType) {
        return;
      }

      const world = this.gridToWorld(entry.x, entry.y);
      const display = new Building(this, world.x, world.y, buildingType, {
        animatePlacement: false,
      });
      display.row = Number(entry.y);
      display.col = Number(entry.x);
      display.persistedId = entry.id ?? null;
      display.hasChopper = Boolean(entry.hasChopper);
      display.hasTank = Boolean(entry.hasTank);
      display.setLevel(Number(entry.level ?? 1));
      display.setSkyportState?.(display.hasChopper);
      display.setBattleTankState?.(display.hasTank);
      display.setBattleHealth(null, null);
      display.setDepth(330 + entry.x + entry.y);
      this.structureLayer.add(display);

      const maxHealth = this.getStructureMaxHealth(entry.type, entry.level);
      const structure = {
        id: String(entry.id ?? `${entry.type}-${entry.x}-${entry.y}`),
        sourceId: entry.id ?? null,
        kind: entry.type === "air-defense" ? "air-defense" : "building",
        type: entry.type,
        row: Number(entry.y),
        col: Number(entry.x),
        x: world.x,
        y: world.y,
        maxHealth,
        health: maxHealth,
        loot: STRUCTURE_LOOT[entry.type] ?? 90,
        display,
        healthBar: this.createHealthBar(58),
        shadow: null,
        level: Number(entry.level ?? 1),
        destroyed: false,
      };

      if (entry.type === "air-defense") {
        const airDefenseProfile = getAirDefenseProfile(entry.level);
        structure.attackRange = airDefenseProfile.missileRange;
        structure.gunRange = airDefenseProfile.gunRange;
        structure.detectionRadius = airDefenseProfile.detectionRadius;
        structure.missileDamage = airDefenseProfile.missileDamage;
        structure.gunDamage = airDefenseProfile.gunDamage;
        structure.missileCooldownMs = airDefenseProfile.missileCooldownMs;
        structure.gunCooldownMs = airDefenseProfile.gunCooldownMs;
        structure.gunHeatLimit = airDefenseProfile.gunHeatLimit;
        structure.missileLaunchers = airDefenseProfile.missileLaunchers;
        structure.lastAttackAt = 0;
        structure.lastGunShotAt = 0;
        structure.gunHeat = 0;
        structure.lockTargetId = null;
        structure.lockStacks = 0;
        structure.lastKnownTargetAt = 0;
        structure.radarPulse = this.createRadarPulse(structure.x, structure.y - 24);
      }

      this.overlayLayer.add(structure.healthBar);
      this.raid.structures.push(structure);
    });

    this.raid.structures.sort((left, right) => structureSortValue(left) - structureSortValue(right));
    this.raid.totalStructureHealth = this.raid.structures.reduce((sum, entry) => sum + entry.maxHealth, 0);
    this.centerCameraOnVillage();
    this.updateStructureHealthBars();
  }

  spawnBaseDefenders() {
    const hasTentDefenders = this.raid.structures.some(
      (entry) => !entry.destroyed && entry.type === "tent"
    );
    const commandCenters = this.raid.structures.filter(
      (entry) => !entry.destroyed && (entry.type === "tent" || (!hasTentDefenders && entry.type === "command-center"))
    );
    const tankBays = this.raid.structures.filter(
      (entry) => !entry.destroyed && entry.type === "battle-tank"
    );
    const skyports = this.raid.structures.filter(
      (entry) => !entry.destroyed && entry.type === "skyport"
    );

    commandCenters.forEach((structure) => {
      const sourceBuilding = this.raid.target?.buildings?.find((building) => building.id === structure.sourceId);
      const defenderCount = Math.max(0, Number(sourceBuilding?.soldierCount ?? 0) || 0);

      Array.from({ length: defenderCount }).forEach((_, index) => {
        this.time.delayedCall(index * 120, () => {
          if (this.raid.phase !== "active") {
            return;
          }

          const offsetCol = ((index % 3) - 1) * 0.48;
          const offsetRow = Math.floor(index / 3) * 0.24;
          const spawnPoint = this.gridToWorld(structure.col + offsetCol, structure.row + 1 + offsetRow);
          const defender = this.createUnit("guard", spawnPoint.x, spawnPoint.y, `guard-${structure.id}-${index}`, {
            isDefender: true,
            sourceBuildingId: structure.sourceId,
          });

          defender.anchor = {
            x: structure.x,
            y: structure.y + 34,
          };
          defender.sourceBuildingId = structure.sourceId;
          this.raid.defenders.push(defender);
          this.emitRaidState(true);
        });
      });
    });

    tankBays.forEach((structure, index) => {
      const sourceBuilding = this.raid.target?.buildings?.find((building) => building.id === structure.sourceId);

      if (!sourceBuilding?.hasTank) {
        return;
      }

      const tankStats = getVehicleStatsForLevel("tank", sourceBuilding?.level ?? structure.level ?? 1);

      this.time.delayedCall(160 + (index * 140), () => {
        if (this.raid.phase !== "active" || structure.destroyed) {
          return;
        }

        const spawnPoint = this.gridToWorld(structure.col + 0.15, structure.row + 0.95);
        const defender = this.createUnit("tank", spawnPoint.x, spawnPoint.y, `def-tank-${structure.id}`, {
          isDefender: true,
          sourceBuildingId: structure.sourceId,
          statOverrides: tankStats,
        });

        defender.anchor = {
          x: structure.x,
          y: structure.y + 28,
        };
        defender.sourceBuildingId = structure.sourceId;
        this.raid.defenders.push(defender);
        this.emitRaidState(true);
      });
    });

    skyports.forEach((structure, index) => {
      const sourceBuilding = this.raid.target?.buildings?.find((building) => building.id === structure.sourceId);

      if (!sourceBuilding?.hasChopper) {
        return;
      }

      const helicopterStats = getVehicleStatsForLevel("helicopter", sourceBuilding?.level ?? structure.level ?? 1);

      this.time.delayedCall(220 + (index * 160), () => {
        if (this.raid.phase !== "active" || structure.destroyed) {
          return;
        }

        const spawnPoint = this.gridToWorld(structure.col + 0.25, structure.row + 0.55);
        const defender = this.createUnit("helicopter", spawnPoint.x, spawnPoint.y, `def-heli-${structure.id}`, {
          isDefender: true,
          sourceBuildingId: structure.sourceId,
          statOverrides: helicopterStats,
        });

        defender.anchor = {
          x: structure.x,
          y: structure.y - 8,
        };
        defender.sourceBuildingId = structure.sourceId;
        this.raid.defenders.push(defender);
        this.emitRaidState(true);
      });
    });
  }

  runCameraReveal() {
    const focusStructure = this.getBattleFocusStructure();
    const camera = this.cameras.main;

    if (!focusStructure) {
      return;
    }

    camera.stopFollow();
    camera.pan(focusStructure.x, focusStructure.y - 36, 980, "Sine.easeInOut");
    camera.zoomTo(1.1, 1080);
    this.time.delayedCall(980, () => {
      this.centerCameraOnVillage(980, 0.94);
    });
  }

  centerCameraOnVillage(duration = 0, zoom = INITIAL_ZOOM) {
    if (!this.raid.structures.length) {
      return;
    }

    const minX = Math.min(...this.raid.structures.map((entry) => entry.x));
    const maxX = Math.max(...this.raid.structures.map((entry) => entry.x));
    const minY = Math.min(...this.raid.structures.map((entry) => entry.y));
    const maxY = Math.max(...this.raid.structures.map((entry) => entry.y));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2 + 42;
    const targetWidth = Math.max(1, maxX - minX + BATTLE_CAMERA_PADDING_X);
    const targetHeight = Math.max(1, maxY - minY + BATTLE_CAMERA_PADDING_Y);
    const fitZoom = Math.min(
      this.scale.width / targetWidth,
      this.scale.height / targetHeight
    );
    const resolvedZoom = Math.min(zoom, fitZoom);

    if (duration > 0) {
      this.cameras.main.pan(centerX, centerY, duration, "Sine.easeInOut");
      this.cameras.main.zoomTo(resolvedZoom, duration);
      return;
    }

    this.cameras.main.centerOn(centerX, centerY);
    this.cameras.main.setZoom(resolvedZoom);
  }

  createHealthBar(width = 42) {
    const graphics = this.add.graphics();
    graphics.barWidth = width;
    graphics.setDepth(9999);
    return graphics;
  }

  getRemainingReserveCount() {
    return Math.max(0, Number(this.raid?.reserves?.soldiers ?? 0) || 0)
      + this.getAvailableRaidVehicleCount("tank")
      + this.getAvailableRaidVehicleCount("helicopter");
  }

  getAvailableRaidEnergy() {
    const reserveEnergy = Number(this.raid?.reserves?.energy);
    const armyEnergy = Number(this.raid?.army?.energy);

    if (Number.isFinite(reserveEnergy) && reserveEnergy >= 0) {
      return reserveEnergy;
    }

    if (Number.isFinite(armyEnergy) && armyEnergy >= 0) {
      return armyEnergy;
    }

    return 0;
  }

  getAvailableRaidVehicleCount(type) {
    if (type === "tank") {
      const reserveCount = Array.isArray(this.raid?.reserves?.tankUnits)
        ? this.raid.reserves.tankUnits.filter((unit) => (unit?.shotsRemaining ?? 0) > 0).length
        : Number(this.raid?.reserves?.tanks);
      const armyCount = Array.isArray(this.raid?.army?.tankUnits)
        ? this.raid.army.tankUnits.filter((unit) => (unit?.shotsRemaining ?? 0) > 0).length
        : Number(this.raid?.army?.tanks);

      if (Number.isFinite(reserveCount) && reserveCount >= 0) {
        return reserveCount;
      }

      if (Number.isFinite(armyCount) && armyCount >= 0) {
        return armyCount;
      }

      return 0;
    }

    if (type === "helicopter") {
      const reserveCount = Array.isArray(this.raid?.reserves?.helicopterUnits)
        ? this.raid.reserves.helicopterUnits.filter((unit) => (unit?.shotsRemaining ?? 0) > 0).length
        : Number(this.raid?.reserves?.helicopters);
      const armyCount = Array.isArray(this.raid?.army?.helicopterUnits)
        ? this.raid.army.helicopterUnits.filter((unit) => (unit?.shotsRemaining ?? 0) > 0).length
        : Number(this.raid?.army?.helicopters);

      if (Number.isFinite(reserveCount) && reserveCount >= 0) {
        return reserveCount;
      }

      if (Number.isFinite(armyCount) && armyCount >= 0) {
        return armyCount;
      }

      return 0;
    }

    return 0;
  }

  canDeployVehicleType(type) {
    if (type === "soldier") {
      return (this.raid?.reserves?.soldiers ?? 0) > 0;
    }

    if (type === "tank") {
      return this.getAvailableRaidVehicleCount("tank") > 0;
    }

    if (type === "helicopter") {
      return this.getAvailableRaidVehicleCount("helicopter") > 0;
    }

    return false;
  }

  getFirstAvailableDeploymentType() {
    if (this.canDeployVehicleType("soldier")) {
      return "soldier";
    }

    if (this.canDeployVehicleType("tank")) {
      return "tank";
    }

    if (this.canDeployVehicleType("helicopter")) {
      return "helicopter";
    }

    return "soldier";
  }

  setDeploymentType(type = "soldier") {
    if (!["soldier", "tank", "helicopter"].includes(type) || !this.canDeployVehicleType(type)) {
      return false;
    }

    this.raid.selectedDeploymentType = type;
    this.emitRaidState(true);
    return true;
  }

  createRadarPulse(x, y) {
    const pulse = this.add.circle(x, y, 20, 0x38bdf8, 0.08);
    pulse.setStrokeStyle(2, 0x7dd3fc, 0.24);
    pulse.setDepth(140);
    this.effectLayer.add(pulse);

    this.tweens.add({
      targets: pulse,
      scale: 2.6,
      alpha: 0.02,
      duration: 1200,
      repeat: -1,
      ease: "Sine.easeOut",
      onRepeat: () => {
        pulse.setScale(1);
        pulse.setAlpha(0.08);
      },
    });

    return pulse;
  }

  drawHealthBar(graphics, x, y, current, max, colors = { fill: 0x22c55e, back: 0x0f172a }) {
    graphics.clear();

    if (current <= 0 || max <= 0) {
      graphics.setVisible(false);
      return;
    }

    const progress = clamp(current / max, 0, 1);
    graphics.fillStyle(colors.back, 0.88);
    graphics.fillRoundedRect(x - graphics.barWidth / 2, y, graphics.barWidth, 7, 4);
    graphics.fillStyle(progress < 0.35 ? 0xef4444 : progress < 0.7 ? 0xf59e0b : colors.fill, 1);
    graphics.fillRoundedRect(x - graphics.barWidth / 2 + 1, y + 1, (graphics.barWidth - 2) * progress, 5, 3);
    graphics.lineStyle(1, 0xffffff, 0.18);
    graphics.strokeRoundedRect(x - graphics.barWidth / 2, y, graphics.barWidth, 7, 4);
    graphics.setVisible(true);
  }

  updateStructureHealthBars() {
    this.raid.structures.forEach((entry) => {
      if (entry.destroyed) {
        entry.healthBar?.setVisible(false);
        entry.radarPulse?.setVisible(false);
        return;
      }

      if (entry.radarPulse) {
        entry.radarPulse.setPosition(entry.x, entry.y - 24);
      }

      const offset = entry.kind === "air-defense"
        ? -86
        : entry.kind === "tower"
          ? -76
          : entry.kind === "wall"
            ? -30
            : -96;
      this.drawHealthBar(entry.healthBar, entry.x, entry.y + offset, entry.health, entry.maxHealth, {
        fill: entry.kind === "air-defense" ? 0x38bdf8 : entry.kind === "tower" ? 0xf97316 : 0x22c55e,
        back: 0x111827,
      });
    });
  }

  createUnit(type, x, y, id, options = {}) {
    const config = UNIT_CONFIG[type];
    const resolvedHealth = Math.max(1, Number(options?.statOverrides?.health ?? config.maxHealth) || config.maxHealth);
    const resolvedDamage = Math.max(1, Number(options?.statOverrides?.damage ?? config.damage) || config.damage);
    const display = this.add.container(x, y);
    const shadow = createSoftShadow(this, {
      x: 0,
      y: 7,
      width: type === "tank" ? 40 : 20,
      height: type === "tank" ? 12 : 10,
      alpha: type === "helicopter" ? 0.11 : 0.16,
    });
    display.add(shadow);

    if (type === "soldier" || type === "guard") {
      const texture = type === "guard" ? SOLDIER_WALK_TEXTURES.back[0] : SOLDIER_WALK_TEXTURES.front[0];
      const sprite = this.add.image(0, 0, texture);
      sprite.setOrigin(0.5, 1);
      configureHdSprite(sprite, {
        scene: this,
        maxWidth: 26,
        maxHeight: 38,
      });
      sprite.setTint(type === "guard" ? 0xffc0c0 : 0xffffff);
      display.add(sprite);
    } else if (type === "tank") {
      if (this.textures.exists(TANK_IDLE_TEXTURE)) {
        const sprite = this.add.image(0, 0, TANK_IDLE_TEXTURE);
        sprite.setOrigin(0.5, 1);
        configureHdSprite(sprite, {
          scene: this,
          maxWidth: TANK_RENDER_MAX_WIDTH,
          maxHeight: TANK_RENDER_MAX_HEIGHT,
        });
        display.add(sprite);
      } else {
        const body = this.add.graphics();
        body.fillStyle(0x475569, 1);
        body.fillRoundedRect(-18, -17, 36, 20, 7);
        body.fillStyle(0x94a3b8, 1);
        body.fillCircle(0, -20, 10);
        body.fillStyle(0x1e293b, 1);
        body.fillRect(7, -23, 20, 4);
        display.add(body);
      }
    } else if (type === "helicopter") {
      const copter = this.add.graphics();
      copter.fillStyle(0x16a34a, 1);
      copter.fillRoundedRect(-16, -13, 32, 16, 7);
      copter.fillStyle(0x86efac, 1);
      copter.fillCircle(-5, -5, 4);
      copter.fillRect(-24, -24, 48, 3);
      copter.fillRect(12, -10, 18, 2);
      display.add(copter);
      display.setY(y + (config.altitude ?? 0));
      shadow.setAlpha(0.18);
    }

    display.setDepth(520 + y / 4);
    this.unitLayer.add(display);

    const unit = {
      id,
      type,
      x,
      y,
      display,
      shadow,
      sprite: display.list?.find?.((child) => child.texture) ?? null,
      healthBar: this.createHealthBar(36),
      health: resolvedHealth,
      maxHealth: resolvedHealth,
      speed: config.speed,
      range: config.range,
      damage: resolvedDamage,
      cooldownMs: config.cooldownMs,
      lastAttackAt: 0,
      destroyed: false,
      isDefender: Boolean(options.isDefender),
      lootScale: config.lootScale ?? 1,
      direction: options?.direction ?? "front",
      visualState: "idle",
      walkFrameIndex: 0,
      walkFrameElapsed: 0,
      firingUntil: 0,
      isMoving: false,
      detectRange: config.detectRange ?? (config.range + 48),
      focusTargetId: null,
      hasTankTarget: false,
      tankAttackDirection: null,
      tankInAttackRange: false,
      aimAngle: null,
      shotsRemaining: Number(options?.shotsRemaining ?? Number.POSITIVE_INFINITY),
      maxShots: Number(options?.maxShots ?? Number.POSITIVE_INFINITY),
    };

    this.updateUnitVisual(unit, 0);
    this.overlayLayer.add(unit.healthBar);
    return unit;
  }

  startRaidAttack() {
    if (!this.raid.target || this.raid.phase === "active") {
      return;
    }

    this.raid.attackers.forEach((entry) => this.destroyUnit(entry));
    this.raid.defenders.forEach((entry) => this.destroyUnit(entry));
    this.raid.attackers = [];
    this.raid.defenders = [];
    this.raid.projectiles.forEach((entry) => entry.display?.destroy?.());
    this.raid.projectiles = [];
    this.raid.effects.forEach((entry) => entry.display?.destroy?.());
    this.raid.effects = [];
    this.raid.loot = 0;
    this.raid.reserves.energy = this.getAvailableRaidEnergy();
    this.raid.energySpent = 0;
    this.raid.defenderLosses = {};
    this.raid.summary = null;
    this.raid.startedAt = this.time.now;
    this.raid.phase = "active";
    this.raid.reserves = {
      energy: this.getAvailableRaidEnergy(),
      soldiers: this.raid.army.soldiers,
      tankUnits: Array.isArray(this.raid.army.tankUnits)
        ? this.raid.army.tankUnits.map((unit) => ({ ...unit }))
        : [],
      helicopterUnits: Array.isArray(this.raid.army.helicopterUnits)
        ? this.raid.army.helicopterUnits.map((unit) => ({ ...unit }))
        : [],
    };
    this.raid.selectedDeploymentType = this.getFirstAvailableDeploymentType();
    this.spawnBaseDefenders();
    this.centerCameraOnVillage(560, 1.02);
    this.emitRaidState(true);
  }

  update(_time, delta) {
    if (!this.raid || this.raid.phase !== "active") {
      return;
    }

    const dt = delta / 1000;
    this.updateAttackers(dt);
    this.updateDefenders(dt);
    this.updateTowers();
    this.updateProjectiles(dt);
    this.updateEffects(dt);
    this.updateStructureHealthBars();
    this.updateUnitHealthBars();
    this.updateUnitVisuals(delta);
    this.updateRaidProgress();
    this.emitRaidState();
  }

  updateUnitVisual(unit, deltaMs = 0) {
    if (!unit) {
      return;
    }

    if (unit.type === "tank") {
      const isFiring = this.time.now < Number(unit.firingUntil ?? 0);
      const nextState = isFiring ? "firing" : unit.isMoving ? "walk" : "idle";
      const nextTexture = unit.hasTankTarget
        ? getTankTextureForDirection(unit.tankAttackDirection ?? "down")
        : TANK_IDLE_TEXTURE;

      if (unit.sprite && (unit.visualState !== nextState || unit.sprite.texture?.key !== nextTexture)) {
        unit.sprite.setTexture(nextTexture);
        configureHdSprite(unit.sprite, {
          scene: this,
          maxWidth: TANK_RENDER_MAX_WIDTH,
          maxHeight: TANK_RENDER_MAX_HEIGHT,
        });
      }

      unit.visualState = nextState;
      unit.sprite?.setY(0);
      return;
    }

    if (!unit.sprite) {
      return;
    }

    if (unit.type !== "soldier" && unit.type !== "guard") {
      return;
    }

    const direction = unit.direction ?? "front";
    const isFiring = this.time.now < Number(unit.firingUntil ?? 0);
    const walkTextures = SOLDIER_WALK_TEXTURES[direction] ?? SOLDIER_WALK_TEXTURES.front;
    const firingTexture = SOLDIER_FIRING_TEXTURES[direction] ?? SOLDIER_FIRING_TEXTURES.front;

    if (isFiring) {
      if (unit.visualState !== "firing" || unit.sprite.texture?.key !== firingTexture) {
        unit.visualState = "firing";
        unit.sprite.setTexture(firingTexture);
        configureHdSprite(unit.sprite, {
          scene: this,
          maxWidth: 26,
          maxHeight: 38,
        });
        unit.sprite.setTint(unit.type === "guard" ? 0xffc0c0 : 0xffffff);
      }
      unit.sprite.setY(0);
      return;
    }

    if (!unit.isMoving) {
      const idleTexture = walkTextures[0];

      if (unit.visualState !== "idle" || unit.sprite.texture?.key !== idleTexture) {
        unit.visualState = "idle";
        unit.walkFrameElapsed = 0;
        unit.walkFrameIndex = 0;
        unit.sprite.setTexture(idleTexture);
        configureHdSprite(unit.sprite, {
          scene: this,
          maxWidth: 26,
          maxHeight: 38,
        });
        unit.sprite.setTint(unit.type === "guard" ? 0xffc0c0 : 0xffffff);
      }

      unit.sprite.setY(0);
      return;
    }

    unit.walkFrameElapsed = Number(unit.walkFrameElapsed ?? 0) + deltaMs;
    if (deltaMs > 0 && unit.walkFrameElapsed >= SOLDIER_WALK_FRAME_MS) {
      while (unit.walkFrameElapsed >= SOLDIER_WALK_FRAME_MS) {
        unit.walkFrameElapsed -= SOLDIER_WALK_FRAME_MS;
        unit.walkFrameIndex = (Number(unit.walkFrameIndex ?? 0) + 1) % walkTextures.length;
      }
    }

    const nextTexture = walkTextures[Number(unit.walkFrameIndex ?? 0) % walkTextures.length];
    if (unit.visualState !== "walk" || unit.sprite.texture?.key !== nextTexture) {
      unit.visualState = "walk";
      unit.sprite.setTexture(nextTexture);
      configureHdSprite(unit.sprite, {
        scene: this,
        maxWidth: 26,
        maxHeight: 38,
      });
      unit.sprite.setTint(unit.type === "guard" ? 0xffc0c0 : 0xffffff);
    }

    const numericId = Number(unit.id);
    const safeSeed = Number.isFinite(numericId) ? numericId : getDeterministicSeed(unit.id);
    const bobSeed = safeSeed * 17;
    unit.sprite.setY(Math.sin((this.time.now + bobSeed) * SOLDIER_WALK_BOB_SPEED) * SOLDIER_WALK_BOB_AMPLITUDE);
  }

  updateUnitVisuals(deltaMs) {
    [...this.raid.attackers, ...this.raid.defenders].forEach((unit) => {
      if (!unit?.destroyed) {
        this.updateUnitVisual(unit, deltaMs);
      }
    });
  }

  updateAttackers(dt) {
    this.raid.attackers.forEach((unit) => {
      if (unit.destroyed) {
        return;
      }

      const livingDefenders = this.raid.defenders.filter((entry) => !entry.destroyed);
      const livingStructures = this.raid.structures.filter((entry) => !entry.destroyed);
      const target = this.getAttackerPriorityTarget(unit, livingDefenders, livingStructures);

      if (!target) {
        if (unit.type === "tank") {
          this.resetTankAttackState(unit);
        }
        return;
      }

      this.advanceUnit(unit, target, dt);
    });
  }

  updateDefenders(dt) {
    this.raid.defenders.forEach((unit) => {
      if (unit.destroyed) {
        return;
      }

      const livingAttackers = this.raid.attackers.filter((entry) => !entry.destroyed);

      if (!livingAttackers.length) {
        if (unit.type === "tank") {
          this.resetTankAttackState(unit);
        }
        return;
      }

      const target = unit.type === "tank"
        ? this.getNearestTargetByDistance(
          unit,
          livingAttackers.filter((candidate) => candidate.type === "soldier" || candidate.type === "guard")
        ) ?? this.getFocusedUnitTarget(unit, livingAttackers)
        : this.getFocusedUnitTarget(unit, livingAttackers);

      if (!target) {
        if (unit.type === "tank") {
          this.resetTankAttackState(unit);
        }
        return;
      }

      if (unit.anchor && distanceBetween(unit.x, unit.y, target.x, target.y) > 160) {
        this.moveUnitToward(unit, unit.anchor.x, unit.anchor.y, dt);
        if (unit.type === "tank") {
          this.updateTankAttackDirection(unit, target, false);
        }
        return;
      }

      this.advanceUnit(unit, target, dt);
    });
  }

  updateTowers() {
    const livingAttackers = this.raid.attackers.filter((entry) => !entry.destroyed);

    this.raid.structures.forEach((entry) => {
      if (entry.destroyed || !livingAttackers.length) {
        return;
      }

      if (entry.kind === "air-defense") {
        this.updateAirDefense(entry, livingAttackers);
        return;
      }

      if (entry.kind !== "tower") {
        return;
      }

      let target = null;
      let nearestDistance = Number.POSITIVE_INFINITY;

      livingAttackers.forEach((unit) => {
        const distance = distanceBetween(entry.x, entry.y, unit.x, unit.y);

        if (distance < nearestDistance && distance <= entry.attackRange) {
          nearestDistance = distance;
          target = unit;
        }
      });

      if (!target || this.time.now - entry.lastAttackAt < entry.attackCooldownMs) {
        return;
      }

      entry.lastAttackAt = this.time.now;
      this.spawnProjectile(entry.x, entry.y - 52, target, 220, 0xf97316, 3, () => {
        this.damageUnit(target, entry.attackDamage);
      });
      this.flashDisplay(entry.display, 0xfef3c7);
    });
  }

  updateAirDefense(structure, livingAttackers) {
    const flyingTargets = livingAttackers.filter((unit) => {
      const distance = distanceBetween(structure.x, structure.y, unit.x, unit.y);
      return isFlyingUnit(unit) && distance <= structure.detectionRadius;
    });

    if (!flyingTargets.length) {
      structure.gunHeat = Math.max(0, (structure.gunHeat ?? 0) - 0.18);
      structure.lockTargetId = null;
      structure.lockStacks = 0;
      return;
    }

    const target = [...flyingTargets].sort((left, right) => {
      const priorityDiff = getAirDefenseTargetPriority(left) - getAirDefenseTargetPriority(right);

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return distanceBetween(structure.x, structure.y, left.x, left.y)
        - distanceBetween(structure.x, structure.y, right.x, right.y);
    })[0];

    if (!target) {
      return;
    }

    if (structure.lockTargetId === target.id) {
      structure.lockStacks = Math.min(4, (structure.lockStacks ?? 0) + 1);
    } else {
      structure.lockTargetId = target.id;
      structure.lockStacks = 1;
    }

    const targetDistance = distanceBetween(structure.x, structure.y, target.x, target.y);
    const lockBonus = 1 + ((structure.lockStacks ?? 0) * 0.08);

    this.createLaserIndicator(structure.x, structure.y - 42, target.x, target.y - 16, 0x38bdf8, 90);

    if (
      targetDistance <= structure.attackRange
      && this.time.now - (structure.lastAttackAt ?? 0) >= structure.missileCooldownMs
    ) {
      structure.lastAttackAt = this.time.now;

      Array.from({ length: structure.missileLaunchers ?? 1 }).forEach((_, launcherIndex) => {
        this.time.delayedCall(launcherIndex * 140, () => {
          if (this.raid.phase !== "active" || structure.destroyed || target.destroyed) {
            return;
          }

          this.spawnProjectile(
            structure.x + (launcherIndex === 0 ? -12 : 12),
            structure.y - 44,
            target,
            260,
            0xf97316,
            5,
            () => {
              this.damageUnit(target, structure.missileDamage * lockBonus, structure);
            },
            { kind: "missile", smokeTrail: true, blastScale: 0.4 }
          );
        });
      });

      this.flashDisplay(structure.display, 0x7dd3fc);
      return;
    }

    if (
      targetDistance <= structure.gunRange
      && (structure.gunHeat ?? 0) < structure.gunHeatLimit
      && this.time.now - (structure.lastGunShotAt ?? 0) >= structure.gunCooldownMs
    ) {
      structure.lastGunShotAt = this.time.now;
      structure.gunHeat = Math.min(structure.gunHeatLimit, (structure.gunHeat ?? 0) + 1);
      this.spawnProjectile(
        structure.x,
        structure.y - 40,
        target,
        340,
        0x93c5fd,
        2,
        () => {
          this.damageUnit(target, structure.gunDamage * lockBonus, structure);
        },
        { kind: "gun", blastScale: 0.18 }
      );
      this.flashDisplay(structure.display, 0xe0f2fe);
      return;
    }

    structure.gunHeat = Math.max(0, (structure.gunHeat ?? 0) - 0.08);
  }

  updateProjectiles(dt) {
    this.raid.projectiles = this.raid.projectiles.filter((entry) => {
      if (!entry.target || entry.target.destroyed) {
        entry.display?.destroy?.();
        return false;
      }

      const dx = entry.target.x - entry.x;
      const dy = entry.target.y - entry.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const step = Math.min(distance, entry.speed * dt);
      entry.x += (dx / distance) * step;
      entry.y += (dy / distance) * step;
      entry.display.setPosition(entry.x, entry.y);

      if (entry.smokeTrail) {
        entry.lastTrailAt = (entry.lastTrailAt ?? 0) + dt;

        if (entry.lastTrailAt >= 0.04) {
          entry.lastTrailAt = 0;
          this.createSmokeEffect(entry.x, entry.y, 0.14);
          this.createExplosion(entry.x, entry.y, 0xf97316, 0.08);
        }
      }

      if (distance <= 10) {
        entry.onHit?.();
        this.createExplosion(entry.x, entry.y, entry.color, entry.blastScale ?? 0.3);
        entry.display?.destroy?.();
        return false;
      }

      return true;
    });
  }

  updateEffects(dt) {
    this.raid.effects = this.raid.effects.filter((entry) => {
      entry.life -= dt;

      if (entry.type === "float-text") {
        entry.display.y -= 24 * dt;
        entry.display.setAlpha(Math.max(0, entry.life / entry.totalLife));
      } else if (entry.type === "smoke") {
        entry.display.scale += dt * 0.3;
        entry.display.setAlpha(Math.max(0, entry.life / entry.totalLife) * 0.55);
      } else if (entry.type === "blast") {
        entry.display.scale += dt * 1.4;
        entry.display.setAlpha(Math.max(0, entry.life / entry.totalLife));
      }

      if (entry.life > 0) {
        return true;
      }

      entry.display?.destroy?.();
      return false;
    });
  }

  handleBattlefieldDeploy(worldX, worldY) {
    if (this.time.now - this.lastDeployAt < 120) {
      return;
    }

    const tile = this.getNearestDeployTile(worldX, worldY);

    if (!tile) {
      return;
    }

    this.lastDeployAt = this.time.now;

    const type = this.raid.selectedDeploymentType ?? this.getFirstAvailableDeploymentType();

    if (type === "soldier" && (this.raid.reserves.soldiers ?? 0) > 0) {
      this.raid.reserves.soldiers -= 1;
      this.deployAttackerUnit("soldier", tile.col + 0.2, tile.row + 0.1);
    } else if (type === "tank" && this.getAvailableRaidVehicleCount("tank") > 0) {
      const tankIndex = this.raid.reserves.tankUnits.findIndex((entry) => (entry?.shotsRemaining ?? 0) > 0);
      const tank = tankIndex >= 0
        ? this.raid.reserves.tankUnits.splice(tankIndex, 1)[0]
        : null;

      if (!tank) {
        this.emitRaidState(true);
        return;
      }

      this.deployAttackerUnit("tank", tile.col + 0.2, tile.row + 0.1, {
        id: tank?.id,
        health: tank?.health,
        damage: tank?.damage,
        shotsRemaining: tank?.shotsRemaining ?? VEHICLE_SHOTS_PER_CHARGE.tank,
        maxShots: tank?.maxShots ?? VEHICLE_SHOTS_PER_CHARGE.tank,
      });
    } else if (type === "helicopter" && this.getAvailableRaidVehicleCount("helicopter") > 0) {
      const helicopterIndex = this.raid.reserves.helicopterUnits.findIndex((entry) => (entry?.shotsRemaining ?? 0) > 0);
      const helicopter = helicopterIndex >= 0
        ? this.raid.reserves.helicopterUnits.splice(helicopterIndex, 1)[0]
        : null;

      if (!helicopter) {
        this.emitRaidState(true);
        return;
      }

      this.deployAttackerUnit("helicopter", tile.col + 0.2, tile.row - 0.05, {
        id: helicopter?.id,
        health: helicopter?.health,
        damage: helicopter?.damage,
        shotsRemaining: helicopter?.shotsRemaining ?? VEHICLE_SHOTS_PER_CHARGE.helicopter,
        maxShots: helicopter?.maxShots ?? VEHICLE_SHOTS_PER_CHARGE.helicopter,
      });
    } else {
      this.raid.selectedDeploymentType = this.getFirstAvailableDeploymentType();
      this.emitRaidState(true);
      return;
    }

    if (
      type === this.raid.selectedDeploymentType
      && !this.canDeployVehicleType(type)
    ) {
      this.raid.selectedDeploymentType = this.getFirstAvailableDeploymentType();
    }

    this.emitRaidState(true);
  }

  getNearestDeployTile(worldX, worldY) {
    const rawTile = this.worldToGrid(worldX, worldY);

    if (!rawTile) {
      return null;
    }

    const baseRow = clamp(Number(rawTile.row ?? DEPLOYABLE_MIN_ROW), DEPLOYABLE_MIN_ROW, this.iso.rows - 1);
    const baseCol = clamp(Number(rawTile.col ?? 0), 0, this.iso.cols - 1);
    const candidateOffsets = [
      { row: 0, col: 0 },
      { row: 0, col: -1 },
      { row: 0, col: 1 },
      { row: -1, col: 0 },
      { row: -1, col: -1 },
      { row: -1, col: 1 },
      { row: 1, col: 0 },
      { row: 0, col: -2 },
      { row: 0, col: 2 },
    ];

    for (const offset of candidateOffsets) {
      const row = clamp(baseRow + offset.row, DEPLOYABLE_MIN_ROW, this.iso.rows - 1);
      const col = clamp(baseCol + offset.col, 0, this.iso.cols - 1);
      const world = this.gridToWorld(col + 0.2, row + 0.1);
      const occupied = this.raid.attackers.some(
        (entry) => !entry.destroyed && distanceBetween(entry.x, entry.y, world.x, world.y) < 22
      );

      if (!occupied) {
        return { row, col };
      }
    }

    return null;
  }

  deployAttackerUnit(type, col, row, unitOptions = null) {
    const { x, y } = this.gridToWorld(col, row);
    const attacker = this.createUnit(
      type,
      x,
      y,
      unitOptions?.id ?? `${type}-manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      {
        statOverrides: unitOptions
          ? {
            health: unitOptions.health,
            damage: unitOptions.damage,
          }
          : null,
        shotsRemaining: unitOptions?.shotsRemaining,
        maxShots: unitOptions?.maxShots,
      }
    );
    this.raid.attackers.push(attacker);
    this.createSmokeEffect(x, y + 4, type === "tank" ? 0.5 : 0.36);
  }

  advanceUnit(unit, target, dt) {
    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    const distance = distanceBetween(unit.x, unit.y, target.x, target.y);
    const config = UNIT_CONFIG[unit.type];

    if (distance <= config.range) {
      unit.isMoving = false;
      if (unit.type === "tank") {
        this.updateTankAttackDirection(unit, target, true);
      } else {
        unit.direction = resolveStableDirection(unit.direction, dx, dy);
      }

      if (
        this.time.now - unit.lastAttackAt >= config.cooldownMs
        && ((unit.type !== "tank" && unit.type !== "helicopter") || (unit.shotsRemaining ?? 0) > 0)
      ) {
        unit.lastAttackAt = this.time.now;
        this.fireAtTarget(unit, target);
      }
      return;
    }

    this.moveUnitToward(unit, target.x, target.y, dt);
    if (unit.type === "tank") {
      this.updateTankAttackDirection(unit, target, false);
    }
  }

  updateTankAttackDirection(unit, target, inAttackRange = false) {
    if (unit?.type !== "tank" || !target) {
      return;
    }

    const aimPoint = getTargetAimPoint(target);
    const dx = aimPoint.x - unit.x;
    const dy = aimPoint.y - unit.y;
    const targetAngle = Math.atan2(dy, dx);
    unit.hasTankTarget = true;
    unit.tankInAttackRange = inAttackRange;
    unit.aimAngle = targetAngle;
    unit.tankAttackDirection = getTankDirectionFromAngle(targetAngle, unit.tankAttackDirection ?? "down");
  }

  resetTankAttackState(unit) {
    if (unit?.type !== "tank") {
      return;
    }

    unit.hasTankTarget = false;
    unit.tankInAttackRange = false;
    unit.tankAttackDirection = null;
    unit.aimAngle = null;
  }

  moveUnitToward(unit, targetX, targetY, dt) {
    const dx = targetX - unit.x;
    const dy = targetY - unit.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const step = Math.min(distance, unit.speed * dt);
    unit.isMoving = step > 0.01;
    unit.x += (dx / distance) * step;
    unit.y += (dy / distance) * step;
    unit.direction = resolveStableDirection(unit.direction, dx, dy);
    this.positionUnit(unit);
  }

  positionUnit(unit) {
    const baseY = unit.type === "helicopter"
      ? unit.y + (UNIT_CONFIG.helicopter.altitude ?? -26)
      : unit.y;

    unit.display.setPosition(unit.x, baseY);
    unit.display.setDepth(520 + unit.y / 4);
  }

  fireAtTarget(unit, target) {
    if ((unit.type === "tank" || unit.type === "helicopter") && (unit.shotsRemaining ?? 0) <= 0) {
      return;
    }

    const color = unit.type === "tank" ? 0xf59e0b : unit.type === "helicopter" ? 0x86efac : 0xe2e8f0;
    const width = unit.type === "tank" ? 4 : 2;
    const speed = unit.type === "tank" ? 170 : 260;

    if (unit.type === "tank") {
      this.updateTankAttackDirection(unit, target, true);
    } else {
      unit.direction = resolveStableDirection(unit.direction, target.x - unit.x, target.y - unit.y);
    }

    if (unit.type === "soldier" || unit.type === "guard" || unit.type === "tank") {
      unit.firingUntil = this.time.now + (unit.type === "tank" ? 240 : 170);
      unit.visualState = "firing";
      this.updateUnitVisual(unit, 0);
    }

    let projectileX = unit.x;
    let projectileY = unit.y - (unit.type === "tank" ? 18 : 24);
    if (unit.type === "tank") {
      const aimPoint = getTargetAimPoint(target);
      const aimAngle = Number.isFinite(unit.aimAngle)
        ? unit.aimAngle
        : Math.atan2(aimPoint.y - unit.y, aimPoint.x - unit.x);
      projectileX += Math.cos(aimAngle) * TANK_BARREL_LENGTH;
      projectileY += Math.sin(aimAngle) * TANK_BARREL_LENGTH;
    }

    this.spawnProjectile(projectileX, projectileY, target, speed, color, width, () => {
      if (target.kind) {
        this.damageStructure(target, unit.damage, unit);
      } else {
        this.damageUnit(target, unit.damage, unit);
      }
    });
    if (unit.type === "tank" || unit.type === "helicopter") {
      unit.shotsRemaining = Math.max(0, Number(unit.shotsRemaining ?? 0) - 1);
      this.emitRaidState();
    }
    this.flashDisplay(unit.display, color);
  }

  spawnProjectile(x, y, target, speed, color, width, onHit, options = {}) {
    const display = this.add.circle(x, y, width, color, 0.95);
    display.setDepth(9000);
    this.effectLayer.add(display);
    this.raid.projectiles.push({
      x,
      y,
      target,
      speed,
      color,
      display,
      onHit,
      kind: options.kind ?? "default",
      smokeTrail: Boolean(options.smokeTrail),
      blastScale: options.blastScale ?? 0.3,
      lastTrailAt: 0,
    });
  }

  createLaserIndicator(x1, y1, x2, y2, color = 0x38bdf8, duration = 100) {
    const laser = this.add.graphics();
    laser.setDepth(9055);
    laser.lineStyle(2, color, 0.65);
    laser.beginPath();
    laser.moveTo(x1, y1);
    laser.lineTo(x2, y2);
    laser.strokePath();
    this.effectLayer.add(laser);

    this.time.delayedCall(duration, () => {
      laser.destroy();
    });
  }

  flashDisplay(display, color) {
    this.tweens.addCounter({
      from: 1,
      to: 0,
      duration: 120,
      onUpdate: (tween) => {
        const value = Math.round(tween.getValue() * 100);
        display.iterate?.((child) => child.setTint?.(Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.ValueToColor(0xffffff),
          Phaser.Display.Color.ValueToColor(color),
          100,
          value
        ).color));
      },
      onComplete: () => {
        display.iterate?.((child) => child.clearTint?.());
      },
    });
  }

  damageStructure(structure, amount, attacker) {
    if (structure.destroyed) {
      return;
    }

    let resolvedAmount = amount;

    if (attacker?.type === "soldier") {
      resolvedAmount *= SOLDIER_DAMAGE_MODIFIERS.vsStructure;
    }

    if (structure.type === "air-defense") {
      if (attacker?.type === "helicopter") {
        resolvedAmount *= 0.65;
      } else if (attacker?.type === "soldier" || attacker?.type === "tank") {
        resolvedAmount *= 1.22;
      }
    }

    structure.health = Math.max(0, structure.health - resolvedAmount);
    this.createFloatingText(`-${Math.round(resolvedAmount)}`, structure.x, structure.y - 64, "#fecaca");
    this.createSmokeEffect(structure.x, structure.y - 20, 0.28);

    if (structure.health > 0) {
      return;
    }

    structure.destroyed = true;
    this.raid.destroyedHealth += structure.maxHealth;
    this.createExplosion(structure.x, structure.y - 18, 0xf97316, 0.48);
    this.tweens.add({
      targets: [structure.display, structure.healthBar],
      alpha: 0,
      duration: 420,
      onComplete: () => {
        structure.display?.setVisible(false);
        structure.healthBar?.setVisible(false);
        structure.radarPulse?.destroy?.();
      },
    });

    const gainedLoot = Math.round((structure.loot ?? 0) * (attacker?.lootScale ?? 1));
    const availableLoot = Math.max(0, this.raid.maxLoot - this.raid.loot);
    const awardedLoot = Math.min(gainedLoot, availableLoot);

    if (awardedLoot > 0) {
      this.raid.loot += awardedLoot;
      this.createFloatingText(`+${awardedLoot} loot`, structure.x, structure.y - 90, "#fde68a");
    }
  }

  damageUnit(unit, amount, source = null) {
    if (unit.destroyed) {
      return;
    }

    let resolvedAmount = amount;

    if (source?.type === "soldier") {
      if (unit.type === "tank") {
        resolvedAmount *= SOLDIER_DAMAGE_MODIFIERS.vsTank;
      } else if (unit.type === "helicopter") {
        resolvedAmount *= SOLDIER_DAMAGE_MODIFIERS.vsHelicopter;
      }
    }

    unit.health = Math.max(0, unit.health - resolvedAmount);
    if (source?.id && source.id !== unit.id) {
      unit.focusTargetId = source.id;
    }
    this.createFloatingText(`-${Math.round(resolvedAmount)}`, unit.x, unit.y - 44, "#ffffff");

    if (unit.health > 0) {
      return;
    }

    unit.destroyed = true;
    if (unit.isDefender && unit.sourceBuildingId) {
      const key = String(unit.sourceBuildingId);
      this.raid.defenderLosses[key] = (this.raid.defenderLosses[key] ?? 0) + 1;
    }
    this.createExplosion(unit.x, unit.y - 8, unit.isDefender ? 0xef4444 : 0x93c5fd, 0.26);
    this.tweens.add({
      targets: [unit.display, unit.healthBar],
      alpha: 0,
      duration: 260,
      onComplete: () => {
        this.destroyUnit(unit);
      },
    });
  }

  destroyUnit(unit) {
    unit.display?.destroy?.();
    unit.healthBar?.destroy?.();
    unit.shadow?.destroy?.();
  }

  createExplosion(x, y, color, scale = 0.4) {
    const blast = this.add.circle(x, y, 14, color, 0.6);
    blast.setDepth(9100);
    blast.scale = scale;
    this.effectLayer.add(blast);
    this.raid.effects.push({
      type: "blast",
      display: blast,
      life: 0.26,
      totalLife: 0.26,
    });
    this.createSmokeEffect(x, y + 2, scale);
  }

  createSmokeEffect(x, y, scale = 0.35) {
    const smoke = this.add.circle(x, y, 12, 0x94a3b8, 0.45);
    smoke.scale = scale;
    smoke.setDepth(9050);
    this.effectLayer.add(smoke);
    this.raid.effects.push({
      type: "smoke",
      display: smoke,
      life: 0.72,
      totalLife: 0.72,
    });
  }

  createFloatingText(text, x, y, color = "#ffffff") {
    const display = this.add.text(x, y, text, {
      fontFamily: "Verdana",
      fontSize: "12px",
      fontStyle: "bold",
      color,
      stroke: "#0f172a",
      strokeThickness: 4,
    });
    display.setOrigin(0.5, 0.5);
    display.setDepth(9200);
    this.effectLayer.add(display);
    this.raid.effects.push({
      type: "float-text",
      display,
      life: 0.8,
      totalLife: 0.8,
    });
  }

  updateUnitHealthBars() {
    const allUnits = [...this.raid.attackers, ...this.raid.defenders];

    allUnits.forEach((unit) => {
      if (unit.destroyed) {
        unit.healthBar?.setVisible(false);
        return;
      }

      this.drawHealthBar(unit.healthBar, unit.x, unit.y - 48, unit.health, unit.maxHealth, {
        fill: unit.isDefender ? 0xef4444 : 0x38bdf8,
        back: 0x020617,
      });
    });
  }

  getNearestTarget(unit, targets) {
    let selected = null;
    let selectedDistance = Number.POSITIVE_INFINITY;
    let selectedPriority = Number.POSITIVE_INFINITY;

    targets.forEach((candidate) => {
      if (!canUnitTarget(unit, candidate)) {
        return;
      }

      const priority = getUnitPriority(unit.type, candidate);
      const distance = distanceBetween(unit.x, unit.y, candidate.x, candidate.y);

      if (priority < selectedPriority || (priority === selectedPriority && distance < selectedDistance)) {
        selected = candidate;
        selectedDistance = distance;
        selectedPriority = priority;
      }
    });

    return selected;
  }

  getNearestTargetByDistance(unit, targets) {
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    targets.forEach((candidate) => {
      if (!canUnitTarget(unit, candidate)) {
        return;
      }

      const distance = distanceBetween(unit.x, unit.y, candidate.x, candidate.y);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    });

    return nearest;
  }

  getFocusedUnitTarget(unit, candidates) {
    const focusedTarget = unit.focusTargetId
      ? candidates.find(
        (candidate) => candidate.id === unit.focusTargetId && !candidate.destroyed && canUnitTarget(unit, candidate)
      ) ?? null
      : null;

    if (focusedTarget) {
      return focusedTarget;
    }

    return this.getNearestTarget(unit, candidates);
  }

  getAttackerPriorityTarget(unit, defenders, structures) {
    if (unit.type === "tank") {
      const nearestSoldierOrBuilding = this.getNearestTargetByDistance(
        unit,
        [
          ...defenders.filter((candidate) => candidate.type === "guard" || candidate.type === "soldier"),
          ...structures,
        ]
      );

      if (nearestSoldierOrBuilding) {
        return nearestSoldierOrBuilding;
      }

      return this.getNearestTargetByDistance(unit, [...defenders, ...structures]);
    }

    const focusedTarget = unit.focusTargetId
      ? defenders.find(
        (candidate) => candidate.id === unit.focusTargetId && !candidate.destroyed && canUnitTarget(unit, candidate)
      ) ?? null
      : null;

    if (focusedTarget) {
      return focusedTarget;
    }

    const detectedDefenders = defenders.filter(
      (candidate) =>
        canUnitTarget(unit, candidate)
        && distanceBetween(unit.x, unit.y, candidate.x, candidate.y) <= unit.detectRange
    );

    if (detectedDefenders.length > 0) {
      return this.getNearestTarget(unit, detectedDefenders);
    }

    return this.getNearestTarget(unit, structures);
  }

  getBattleFocusStructure() {
    if (!this.raid.structures.length) {
      return null;
    }

    return this.raid.structures.find((entry) => entry.type === "command-center")
      ?? [...this.raid.structures].sort((left, right) => {
        if (right.maxHealth !== left.maxHealth) {
          return right.maxHealth - left.maxHealth;
        }

        return structureSortValue(right) - structureSortValue(left);
      })[0]
      ?? null;
  }

  updateRaidProgress() {
    const remainingAttackers = this.raid.attackers.filter(
      (entry) => !entry.destroyed
        && (
          (entry.type !== "tank" && entry.type !== "helicopter")
          || (entry.shotsRemaining ?? 0) > 0
        )
    );
    const livingStructures = this.raid.structures.filter((entry) => !entry.destroyed);
    this.raid.destructionPercent = this.raid.totalStructureHealth <= 0
      ? 0
      : Math.round((this.raid.destroyedHealth / this.raid.totalStructureHealth) * 100);

    if (!livingStructures.length) {
      this.finishRaid("victory", "Enemy base destroyed.");
      return;
    }

    if (!remainingAttackers.length && this.getRemainingReserveCount() <= 0) {
      this.finishRaid("defeat", "Your strike force was wiped out.");
      return;
    }

    if (this.time.now - this.raid.startedAt >= RAID_TIME_LIMIT_MS) {
      this.finishRaid(this.raid.destructionPercent >= 60 ? "victory" : "defeat", "Raid timer expired.");
    }
  }

  finishRaid(outcome, reason) {
    if (this.raid.phase === "finished") {
      return;
    }

    const survivingAttackers = this.raid.attackers.filter((entry) => !entry.destroyed);
    const remainingReserves = {
      soldiers: Math.max(0, Number(this.raid.reserves?.soldiers ?? 0) || 0),
      tanks: Array.isArray(this.raid.reserves?.tankUnits) ? this.raid.reserves.tankUnits.length : 0,
      helicopters: Array.isArray(this.raid.reserves?.helicopterUnits) ? this.raid.reserves.helicopterUnits.length : 0,
    };
    const survivors = {
      soldiers: survivingAttackers.filter((entry) => entry.type === "soldier").length + remainingReserves.soldiers,
      tanks: survivingAttackers.filter((entry) => entry.type === "tank").length + remainingReserves.tanks,
      helicopters: survivingAttackers.filter((entry) => entry.type === "helicopter").length + remainingReserves.helicopters,
    };
    const survivingTankUnits = [
      ...survivingAttackers
        .filter((entry) => entry.type === "tank")
        .map((entry) => ({
          id: entry.id,
          shotsRemaining: Math.max(0, Number(entry.shotsRemaining ?? 0) || 0),
          maxShots: Math.max(1, Number(entry.maxShots ?? VEHICLE_SHOTS_PER_CHARGE.tank) || VEHICLE_SHOTS_PER_CHARGE.tank),
        })),
      ...(Array.isArray(this.raid.reserves?.tankUnits) ? this.raid.reserves.tankUnits : []).map((entry) => ({
        id: entry.id,
        shotsRemaining: Math.max(0, Number(entry.shotsRemaining ?? 0) || 0),
        maxShots: Math.max(1, Number(entry.maxShots ?? VEHICLE_SHOTS_PER_CHARGE.tank) || VEHICLE_SHOTS_PER_CHARGE.tank),
      })),
    ];
    const survivingHelicopterUnits = [
      ...survivingAttackers
        .filter((entry) => entry.type === "helicopter")
        .map((entry) => ({
          id: entry.id,
          shotsRemaining: Math.max(0, Number(entry.shotsRemaining ?? 0) || 0),
          maxShots: Math.max(1, Number(entry.maxShots ?? VEHICLE_SHOTS_PER_CHARGE.helicopter) || VEHICLE_SHOTS_PER_CHARGE.helicopter),
        })),
      ...(Array.isArray(this.raid.reserves?.helicopterUnits) ? this.raid.reserves.helicopterUnits : []).map((entry) => ({
        id: entry.id,
        shotsRemaining: Math.max(0, Number(entry.shotsRemaining ?? 0) || 0),
        maxShots: Math.max(1, Number(entry.maxShots ?? VEHICLE_SHOTS_PER_CHARGE.helicopter) || VEHICLE_SHOTS_PER_CHARGE.helicopter),
      })),
    ];

    this.raid.phase = "finished";
    this.raid.summary = {
      outcome,
      reason,
      destructionPercent: this.raid.destructionPercent,
      loot: this.raid.loot,
      energySpent: this.raid.energySpent ?? 0,
      remainingTroops: survivors.soldiers + survivors.tanks + survivors.helicopters,
      survivors,
      survivingTankUnits,
      survivingHelicopterUnits,
      defenderLosses: { ...this.raid.defenderLosses },
    };
    this.emitRaidState(true);
  }

  emitRaidState(force = false) {
    if (!force && this.time.now - this.raid.lastUiEmitAt < 120) {
      return;
    }

    this.raid.lastUiEmitAt = this.time.now;
    this.events.emit("raid-state-change", {
      phase: this.raid.phase,
      destructionPercent: this.raid.destructionPercent,
      loot: this.raid.loot,
      army: this.raid.army,
      reserves: {
        energy: this.getAvailableRaidEnergy(),
        soldiers: this.raid.reserves?.soldiers ?? 0,
        tanks: this.getAvailableRaidVehicleCount("tank"),
        helicopters: this.getAvailableRaidVehicleCount("helicopter"),
      },
      energy: this.getAvailableRaidEnergy(),
      selectedDeploymentType: this.raid.selectedDeploymentType ?? "soldier",
      target: this.raid.target,
      attackersRemaining: this.raid.attackers.filter((entry) => !entry.destroyed).length,
      defendersRemaining: this.raid.defenders.filter((entry) => !entry.destroyed).length
        + this.raid.structures.filter((entry) => !entry.destroyed && ["tower", "air-defense"].includes(entry.kind)).length,
      summary: this.raid.summary,
    });
  }

  getStructureMaxHealth(type, level = 1) {
    const base = {
      "town-hall": 520,
      "command-center": 520,
      "wood-machine": 180,
      skyport: 240,
      "battle-tank": 240,
      "air-defense": 320,
      tent: 290,
    }[type] ?? 160;

    return base + Math.max(0, Number(level ?? 1) - 1) * 80;
  }
}
