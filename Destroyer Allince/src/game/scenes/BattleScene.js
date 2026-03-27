import Phaser from "phaser";

import Building from "../objects/Building";
import { BUILDING_LIST } from "../utils/buildingTypes";

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
    speed: 52,
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
    damage: 34,
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
  "command-center": 180,
  "wood-machine": 120,
  skyport: 150,
  tower: 85,
  wall: 10,
  storage: 140,
};

const structureSortValue = (entry) => {
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
    this.worldBounds = null;

    this.groundLayer = this.add.layer();
    this.structureLayer = this.add.layer();
    this.unitLayer = this.add.layer();
    this.effectLayer = this.add.layer();
    this.overlayLayer = this.add.layer();

    this.computeBoardMetrics();
    this.drawBoard();
    this.createCamera();
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
      base.setDisplaySize(this.iso.cols * this.iso.tileWidth * 1.5, this.iso.rows * this.iso.tileHeight * 2.9);
      base.setDepth(-30);
      this.groundLayer.add(base);
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
    camera.setBackgroundColor("#3f5a31");
    camera.setBounds(
      this.worldBounds.minX,
      this.worldBounds.minY,
      this.worldBounds.width,
      this.worldBounds.height
    );
    camera.centerOn(this.iso.originX, this.iso.originY + this.iso.rows * this.iso.tileHeight / 2);
    camera.setZoom(INITIAL_ZOOM);
    camera.roundPixels = true;
  }

  clearRaidVisuals() {
    const destroyDisplay = (entry) => {
      entry?.display?.destroy?.();
      entry?.healthBar?.destroy?.();
      entry?.shadow?.destroy?.();
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
      const display = new Building(this, world.x, world.y, buildingType);
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
        kind: "building",
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

      this.overlayLayer.add(structure.healthBar);
      this.raid.structures.push(structure);
    });

    this.raid.structures.sort((left, right) => structureSortValue(left) - structureSortValue(right));
    this.raid.totalStructureHealth = this.raid.structures.reduce((sum, entry) => sum + entry.maxHealth, 0);
    this.centerCameraOnVillage();
    this.updateStructureHealthBars();
  }

  spawnBaseDefenders() {
    const commandCenters = this.raid.structures.filter(
      (entry) => !entry.destroyed && entry.type === "command-center"
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
        return;
      }

      const offset = entry.kind === "tower" ? -76 : entry.kind === "wall" ? -30 : -96;
      this.drawHealthBar(entry.healthBar, entry.x, entry.y + offset, entry.health, entry.maxHealth, {
        fill: entry.kind === "tower" ? 0xf97316 : 0x22c55e,
        back: 0x111827,
      });
    });
  }

  createUnit(type, x, y, id, options = {}) {
    const config = UNIT_CONFIG[type];
    const resolvedHealth = Math.max(1, Number(options?.statOverrides?.health ?? config.maxHealth) || config.maxHealth);
    const resolvedDamage = Math.max(1, Number(options?.statOverrides?.damage ?? config.damage) || config.damage);
    const display = this.add.container(x, y);
    const shadow = this.add.ellipse(0, 6, type === "tank" ? 30 : 20, 10, 0x020617, 0.28);
    display.add(shadow);

    if (type === "soldier" || type === "guard") {
      const texture = type === "guard" ? "soldier-back-walk-1" : "soldier-front-walk-1";
      const sprite = this.add.image(0, 0, texture);
      sprite.setOrigin(0.5, 1);
      sprite.setDisplaySize(20, 30);
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
      detectRange: config.detectRange ?? (config.range + 48),
      focusTargetId: null,
    };

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
    this.spawnAttackWave();
    this.spawnBaseDefenders();
    this.centerCameraOnVillage(560, 1.02);
    this.emitRaidState(true);
  }

  spawnAttackWave() {
    const row = MAP_ROWS - 1.1;
    const tankUnits = Array.isArray(this.raid.army.tankUnits) ? this.raid.army.tankUnits : [];
    const units = [
      ...Array.from({ length: this.raid.army.soldiers }, (_, index) => ({ type: "soldier", id: `soldier-${index}` })),
      ...tankUnits.map((tank, index) => ({
        type: "tank",
        id: tank?.id ?? `tank-${index}`,
        statOverrides: {
          health: tank?.health,
          damage: tank?.damage,
        },
      })),
      ...Array.from({ length: this.raid.army.helicopters }, (_, index) => ({ type: "helicopter", id: `helicopter-${index}` })),
    ];

    if (!units.length) {
      this.finishRaid("defeat", "No troops were available to deploy.");
      return;
    }

    units.forEach((unitConfig, index) => {
      this.time.delayedCall(index * RAID_DEPLOY_INTERVAL_MS, () => {
        if (this.raid.phase !== "active") {
          return;
        }

        const col = 1 + (index % 8) * 0.62;
        const laneOffset = Math.floor(index / 8) * 0.38;
        const { x, y } = this.gridToWorld(col + laneOffset, row + (index % 2) * 0.18);
        const attacker = this.createUnit(
          unitConfig.type,
          x,
          y,
          `${unitConfig.type}-${unitConfig.id}-${Date.now()}`,
          { statOverrides: unitConfig.statOverrides }
        );
        this.raid.attackers.push(attacker);
        this.createSmokeEffect(x, y + 4, 0.45);
        this.emitRaidState(true);
      });
    });
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
    this.updateRaidProgress();
    this.emitRaidState();
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
      if (entry.destroyed || entry.kind !== "tower" || !livingAttackers.length) {
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

      if (distance <= 10) {
        entry.onHit?.();
        this.createExplosion(entry.x, entry.y, entry.color, 0.3);
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
    this.spawnProjectile(unit.x, unit.y - (unit.type === "tank" ? 18 : 24), target, speed, color, width, () => {
      if (target.kind) {
        this.damageStructure(target, unit.damage, unit);
      } else {
        this.damageUnit(target, unit.damage, unit);
      }
    });
    this.flashDisplay(unit.display, color);
  }

  spawnProjectile(x, y, target, speed, color, width, onHit) {
    const display = this.add.circle(x, y, width, color, 0.95);
    display.setDepth(9000);
    this.effectLayer.add(display);
    this.raid.projectiles.push({ x, y, target, speed, color, display, onHit });
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

    structure.health = Math.max(0, structure.health - amount);
    this.createFloatingText(`-${Math.round(amount)}`, structure.x, structure.y - 64, "#fecaca");
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
      ? candidates.find((candidate) => candidate.id === unit.focusTargetId && !candidate.destroyed) ?? null
      : null;

    if (focusedTarget) {
      return focusedTarget;
    }

    return this.getNearestTarget(unit, candidates);
  }

  getAttackerPriorityTarget(unit, defenders, structures) {
    const focusedTarget = unit.focusTargetId
      ? defenders.find((candidate) => candidate.id === unit.focusTargetId && !candidate.destroyed) ?? null
      : null;

    if (focusedTarget) {
      return focusedTarget;
    }

    const detectedDefenders = defenders.filter(
      (candidate) => distanceBetween(unit.x, unit.y, candidate.x, candidate.y) <= unit.detectRange
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

    return this.raid.structures.find((entry) => entry.type === "town-hall")
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

    if (!remainingAttackers.length) {
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
      target: this.raid.target,
      attackersRemaining: this.raid.attackers.filter((entry) => !entry.destroyed).length,
      defendersRemaining: this.raid.defenders.filter((entry) => !entry.destroyed).length
        + this.raid.structures.filter((entry) => !entry.destroyed && entry.kind === "tower").length,
      summary: this.raid.summary,
    });
  }

  getStructureMaxHealth(type, level = 1) {
    const base = {
      "town-hall": 520,
      "command-center": 290,
      "wood-machine": 180,
      skyport: 240,
      "battle-tank": 240,
    }[type] ?? 160;

    return base + Math.max(0, Number(level ?? 1) - 1) * 80;
  }
}
