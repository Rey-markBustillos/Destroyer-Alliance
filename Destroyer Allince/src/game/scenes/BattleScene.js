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
    speed: 38,
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
    speed: 46,
    range: 92,
    detectRange: 156,
    damage: 10,
    cooldownMs: 980,
    preferredTargets: ["soldier", "tank", "helicopter"],
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
      army: { soldiers: 0, tanks: 0, tankUnits: [], helicopters: 0 },
      structures: [],
      attackers: [],
      reserves: {
        soldiers: 0,
        tankUnits: [],
        helicopters: 0,
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
    camera.setBackgroundColor("rgba(2, 6, 23, 0)");
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
    this.raid.target = target ?? null;
    this.raid.army = {
      soldiers: Math.max(0, Number(army?.soldiers ?? 0) || 0),
      tanks: Math.max(0, Number(army?.tanks ?? 0) || 0),
      tankUnits: Array.isArray(army?.tankUnits)
        ? army.tankUnits.map((tank, index) => ({
          id: tank?.id ?? `tank-${index}`,
          health: Math.max(1, Number(tank?.health ?? UNIT_CONFIG.tank.maxHealth) || UNIT_CONFIG.tank.maxHealth),
          damage: Math.max(1, Number(tank?.damage ?? UNIT_CONFIG.tank.damage) || UNIT_CONFIG.tank.damage),
        }))
        : [],
      helicopters: Math.max(0, Number(army?.helicopters ?? 0) || 0),
    };
    this.raid.reserves = {
      soldiers: Math.max(0, Number(army?.soldiers ?? 0) || 0),
      tankUnits: Array.isArray(army?.tankUnits)
        ? army.tankUnits.map((tank, index) => ({
          id: tank?.id ?? `tank-${index}`,
          health: Math.max(1, Number(tank?.health ?? UNIT_CONFIG.tank.maxHealth) || UNIT_CONFIG.tank.maxHealth),
          damage: Math.max(1, Number(tank?.damage ?? UNIT_CONFIG.tank.damage) || UNIT_CONFIG.tank.damage),
        }))
        : [],
      helicopters: Math.max(0, Number(army?.helicopters ?? 0) || 0),
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

      this.time.delayedCall(160 + (index * 140), () => {
        if (this.raid.phase !== "active" || structure.destroyed) {
          return;
        }

        const spawnPoint = this.gridToWorld(structure.col + 0.15, structure.row + 0.95);
        const defender = this.createUnit("tank", spawnPoint.x, spawnPoint.y, `def-tank-${structure.id}`, {
          isDefender: true,
          sourceBuildingId: structure.sourceId,
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

      this.time.delayedCall(220 + (index * 160), () => {
        if (this.raid.phase !== "active" || structure.destroyed) {
          return;
        }

        const spawnPoint = this.gridToWorld(structure.col + 0.25, structure.row + 0.55);
        const defender = this.createUnit("helicopter", spawnPoint.x, spawnPoint.y, `def-heli-${structure.id}`, {
          isDefender: true,
          sourceBuildingId: structure.sourceId,
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
      + (Array.isArray(this.raid?.reserves?.tankUnits) ? this.raid.reserves.tankUnits.length : 0)
      + Math.max(0, Number(this.raid?.reserves?.helicopters ?? 0) || 0);
  }

  getFirstAvailableDeploymentType() {
    if ((this.raid?.reserves?.soldiers ?? 0) > 0) {
      return "soldier";
    }

    if ((this.raid?.reserves?.tankUnits?.length ?? 0) > 0) {
      return "tank";
    }

    if ((this.raid?.reserves?.helicopters ?? 0) > 0) {
      return "helicopter";
    }

    return "soldier";
  }

  setDeploymentType(type = "soldier") {
    if (!["soldier", "tank", "helicopter"].includes(type)) {
      return;
    }

    this.raid.selectedDeploymentType = type;
    this.emitRaidState(true);
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
      width: type === "tank" ? 30 : 20,
      height: 10,
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
      const body = this.add.graphics();
      body.fillStyle(0x475569, 1);
      body.fillRoundedRect(-18, -17, 36, 20, 7);
      body.fillStyle(0x94a3b8, 1);
      body.fillCircle(0, -20, 10);
      body.fillStyle(0x1e293b, 1);
      body.fillRect(7, -23, 20, 4);
      display.add(body);
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
      direction: "front",
      visualState: "idle",
      walkFrameIndex: 0,
      walkFrameElapsed: 0,
      firingUntil: 0,
      detectRange: config.detectRange ?? (config.range + 48),
      focusTargetId: null,
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
    this.raid.defenderLosses = {};
    this.raid.summary = null;
    this.raid.startedAt = this.time.now;
    this.raid.phase = "active";
    this.raid.reserves = {
      soldiers: this.raid.army.soldiers,
      tankUnits: Array.isArray(this.raid.army.tankUnits) ? [...this.raid.army.tankUnits] : [],
      helicopters: this.raid.army.helicopters,
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
    if (!unit?.sprite || (unit.type !== "soldier" && unit.type !== "guard")) {
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
      return;
    }

    unit.walkFrameElapsed = Number(unit.walkFrameElapsed ?? 0) + deltaMs;
    if (deltaMs > 0 && unit.walkFrameElapsed >= 180) {
      unit.walkFrameElapsed = 0;
      unit.walkFrameIndex = (Number(unit.walkFrameIndex ?? 0) + 1) % walkTextures.length;
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
        return;
      }

      const target = this.getFocusedUnitTarget(unit, livingAttackers);

      if (!target) {
        return;
      }

      if (unit.anchor && distanceBetween(unit.x, unit.y, target.x, target.y) > 160) {
        this.moveUnitToward(unit, unit.anchor.x, unit.anchor.y, dt);
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
    } else if (type === "tank" && (this.raid.reserves.tankUnits?.length ?? 0) > 0) {
      const tank = this.raid.reserves.tankUnits.shift();
      this.deployAttackerUnit("tank", tile.col + 0.2, tile.row + 0.1, {
        health: tank?.health,
        damage: tank?.damage,
      });
    } else if (type === "helicopter" && (this.raid.reserves.helicopters ?? 0) > 0) {
      this.raid.reserves.helicopters -= 1;
      this.deployAttackerUnit("helicopter", tile.col + 0.2, tile.row - 0.05);
    } else {
      this.raid.selectedDeploymentType = this.getFirstAvailableDeploymentType();
      this.emitRaidState(true);
      return;
    }

    if (
      type === this.raid.selectedDeploymentType
      && ((type === "soldier" && (this.raid.reserves.soldiers ?? 0) <= 0)
      || (type === "tank" && (this.raid.reserves.tankUnits?.length ?? 0) <= 0)
      || (type === "helicopter" && (this.raid.reserves.helicopters ?? 0) <= 0))
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

  deployAttackerUnit(type, col, row, statOverrides = null) {
    const { x, y } = this.gridToWorld(col, row);
    const attacker = this.createUnit(
      type,
      x,
      y,
      `${type}-manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      { statOverrides }
    );
    this.raid.attackers.push(attacker);
    this.createSmokeEffect(x, y + 4, type === "tank" ? 0.5 : 0.36);
  }

  advanceUnit(unit, target, dt) {
    const distance = distanceBetween(unit.x, unit.y, target.x, target.y);
    const config = UNIT_CONFIG[unit.type];

    if (distance <= config.range) {
      if (this.time.now - unit.lastAttackAt >= config.cooldownMs) {
        unit.lastAttackAt = this.time.now;
        this.fireAtTarget(unit, target);
      }
      return;
    }

    this.moveUnitToward(unit, target.x, target.y, dt);
  }

  moveUnitToward(unit, targetX, targetY, dt) {
    const dx = targetX - unit.x;
    const dy = targetY - unit.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const step = Math.min(distance, unit.speed * dt);
    unit.x += (dx / distance) * step;
    unit.y += (dy / distance) * step;
    unit.direction = normalizeDirection(dx, dy);
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
    const color = unit.type === "tank" ? 0xf59e0b : unit.type === "helicopter" ? 0x86efac : 0xe2e8f0;
    const width = unit.type === "tank" ? 4 : 2;
    const speed = unit.type === "tank" ? 170 : 260;
    if (unit.type === "soldier" || unit.type === "guard") {
      unit.firingUntil = this.time.now + 170;
      unit.visualState = "firing";
      this.updateUnitVisual(unit, 0);
    }
    this.spawnProjectile(unit.x, unit.y - (unit.type === "tank" ? 18 : 24), target, speed, color, width, () => {
      if (target.kind) {
        this.damageStructure(target, unit.damage, unit);
      } else {
        this.damageUnit(target, unit.damage, unit);
      }
    });
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

    unit.health = Math.max(0, unit.health - amount);
    if (source?.id && source.id !== unit.id) {
      unit.focusTargetId = source.id;
    }
    this.createFloatingText(`-${Math.round(amount)}`, unit.x, unit.y - 44, "#ffffff");

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
    const remainingAttackers = this.raid.attackers.filter((entry) => !entry.destroyed);
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
    const survivors = {
      soldiers: survivingAttackers.filter((entry) => entry.type === "soldier").length,
      tanks: survivingAttackers.filter((entry) => entry.type === "tank").length,
      helicopters: survivingAttackers.filter((entry) => entry.type === "helicopter").length,
    };

    this.raid.phase = "finished";
    this.raid.summary = {
      outcome,
      reason,
      destructionPercent: this.raid.destructionPercent,
      loot: this.raid.loot,
      remainingTroops: survivingAttackers.length,
      survivors,
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
        soldiers: this.raid.reserves?.soldiers ?? 0,
        tanks: this.raid.reserves?.tankUnits?.length ?? 0,
        helicopters: this.raid.reserves?.helicopters ?? 0,
      },
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
