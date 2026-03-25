import Phaser from "phaser";

import Building from "../objects/Building";
import SoldierUnit from "../objects/SoldierUnit";
import { BUILDING_LIST, getBuildingUpgradeCost } from "../utils/buildingTypes";

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const MAP_ROWS = 12;
const MAP_COLS = 12;
const STARTING_GOLD = 1200;
const INITIAL_ZOOM = 1.2;
const MIN_ZOOM = INITIAL_ZOOM;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.1;
const WOOD_MACHINE_TICK_MS = 180000;
const WOOD_MACHINE_GOLD_PER_TICK = 10;
const WOOD_MACHINE_MAX_GOLD = 250;
const TOWN_HALL_GOLD_PER_TICK = 100;
const TOWN_HALL_MAX_GOLD = 500;
const WOOD_MACHINE_LEVEL_TWO_GOLD_PER_TICK = 20;
const BUILDING_UPGRADE_DURATION_MS = 1800000;
const BUILDING_MAX_LEVEL = 2;
const COMMAND_CENTER_SOLDIER_LIMIT = 50;
const SOLDIER_HUNGER_WARNING_MS = 18000000;
const SOLDIER_STARVATION_MS = 86400000;
const SOLDIER_FEED_COST_PER_UNIT = 1;
const SKYPORT_CHOPPER_COST = 5000;
const SKYPORT_CHOPPER_LEVEL_TWO_COST = 3500;
const SKYPORT_CHOPPER_SELL_VALUE = 4000;
const BUILDABLE_GRASS_MASK = [
  [0, 9],
  [0, 9],
  [0, 9],
  [0, 8],
  [0, 8],
  [0, 8],
  [0, 7],
  [0, 7],
  [0, 7],
  [0, 6],
  [0, 6],
  [0, 5],
];

const WAR_SOLDIER_TEXTURES = {
  front: ["soldier-front-walk-1", "soldier-front-walk-2"],
  back: ["soldier-back-walk-1", "soldier-back-walk-2"],
  left: ["soldier-left-walk-1", "soldier-left-walk-2"],
  right: ["soldier-right-walk-1", "soldier-right-walk-2"],
};

const WAR_FIRING_TEXTURES = {
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

const lightenColor = (hex, amount = 16) => {
  const color = Phaser.Display.Color.ValueToColor(hex);
  color.lighten(amount);
  return color.color;
};

export default class GameScene extends Phaser.Scene {
  constructor(runtimeOptions = {}) {
    super("GameScene");
    this.runtimeOptions = runtimeOptions;
  }

  create() {
    this.mode = this.runtimeOptions?.mode ?? "village";
    this.isWarMode = this.mode === "war";
    this.iso = {
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      rows: MAP_ROWS,
      cols: MAP_COLS,
    };

    this.selectedBuildingType = null;
    this.selectedPlacedBuilding = null;
    this.movingBuilding = null;
    this.gold = STARTING_GOLD;
    this.placedBuildings = [];
    this.soldierUnits = [];
    this.enemyUnits = [];
    this.occupiedTiles = new Map();
    this.warDeployments = new Map();
    this.warState = {
      roomId: null,
      status: "idle",
      selfUserId: null,
      targetUserId: null,
      targetSignature: "",
    };
    this.pointerDrag = {
      active: false,
      moved: false,
      startX: 0,
      startY: 0,
      cameraScrollX: 0,
      cameraScrollY: 0,
    };

    this.createWorldLayers();
    this.computeBoardMetrics();
    this.drawBoard();
    this.drawForestRing();
    this.createHoverIndicator();
    this.createPlacementIndicator();
    this.createCamera();
    this.bindInput();
    if (!this.isWarMode) {
      this.startResourceProduction();
    }
    this.updateHoverAtScreenPoint(
      this.scale.width / 2,
      this.scale.height / 2
    );
    this.emitGameState();
    this.game.events.emit("game-scene-ready");
  }

  createWorldLayers() {
    this.groundLayer = this.add.layer();
    this.decorLayer = this.add.layer();
    this.structureLayer = this.add.layer();
    this.warUnitLayer = this.add.layer();
    this.overlayLayer = this.add.layer();
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
    this.iso.originY =
      this.scale.height / 2 - (minY + boardHeight / 2) + this.iso.tileHeight / 2;

    const centeredCorners = [
      this.gridToWorld(0, 0),
      this.gridToWorld(this.iso.cols - 1, 0),
      this.gridToWorld(0, this.iso.rows - 1),
      this.gridToWorld(this.iso.cols - 1, this.iso.rows - 1),
    ];

    const worldMinX = Math.min(...centeredCorners.map(({ x }) => x - halfW));
    const worldMaxX = Math.max(...centeredCorners.map(({ x }) => x + halfW));
    const worldMinY = Math.min(...centeredCorners.map(({ y }) => y - halfH)) - 320;
    const worldMaxY = Math.max(...centeredCorners.map(({ y }) => y + halfH)) + 320;

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
    const x = (localX / (this.iso.tileWidth / 2) + localY / (this.iso.tileHeight / 2)) / 2;
    const y = (localY / (this.iso.tileHeight / 2) - localX / (this.iso.tileWidth / 2)) / 2;

    return {
      row: Math.round(y),
      col: Math.round(x),
    };
  }

  getTileKey(row, col) {
    return `${row},${col}`;
  }

  getFootprint(buildingType) {
    return {
      rows: buildingType?.footprintRows ?? 1,
      cols: buildingType?.footprintCols ?? 1,
    };
  }

  isInsideGrid(row, col) {
    return row >= 0 && row < this.iso.rows && col >= 0 && col < this.iso.cols;
  }

  isBuildableGrassTile(row, col) {
    if (!this.isInsideGrid(row, col)) {
      return false;
    }

    const range = BUILDABLE_GRASS_MASK[row];

    if (!range) {
      return false;
    }

    const [minCol, maxCol] = range;
    return col >= minCol && col <= maxCol;
  }

  canPlaceFootprint(row, col, buildingType) {
    const footprint = this.getFootprint(buildingType);

    if (
      row < 0 ||
      col < 0 ||
      row + footprint.rows - 1 >= this.iso.rows ||
      col + footprint.cols - 1 >= this.iso.cols
    ) {
      return false;
    }

    for (let rowOffset = 0; rowOffset < footprint.rows; rowOffset += 1) {
      for (let colOffset = 0; colOffset < footprint.cols; colOffset += 1) {
        if (!this.isBuildableGrassTile(row + rowOffset, col + colOffset)) {
          return false;
        }
      }
    }

    return true;
  }

  getTileColor(row, col) {
    const seed = Math.abs((row * 47) + (col * 29) + ((row - col) * 13));
    const grassPalette = [
      0x6e9652,
      0x769d57,
      0x7ea45d,
      0x6a8d4e,
      0x86aa64,
      0x73934d,
    ];

    return grassPalette[seed % grassPalette.length];
  }

  getTileStroke(row, col) {
    return darkenColor(this.getTileColor(row, col), 26);
  }

  getTileAccentColor(row, col) {
    return lightenColor(this.getTileColor(row, col), 14);
  }

  getTileShadowColor(row, col) {
    return darkenColor(this.getTileColor(row, col), 42);
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

  createTilePatchPoints(centerX, centerY, widthScale = 0.34, heightScale = 0.24) {
    const halfW = this.iso.tileWidth * widthScale;
    const halfH = this.iso.tileHeight * heightScale;

    return [
      new Phaser.Geom.Point(centerX, centerY - halfH),
      new Phaser.Geom.Point(centerX + halfW, centerY),
      new Phaser.Geom.Point(centerX, centerY + halfH),
      new Phaser.Geom.Point(centerX - halfW, centerY),
    ];
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

  drawBoard() {
    if (this.textures.exists("base")) {
      const boardCenter = this.gridToWorld(
        (this.iso.cols - 1) / 2,
        (this.iso.rows - 1) / 2
      );
      const village = this.add.image(
        boardCenter.x,
        boardCenter.y + this.iso.tileHeight * 2.2,
        "base"
      );

      village.setOrigin(0.5, 0.5);
      village.setDisplaySize(
        this.iso.cols * this.iso.tileWidth * 1.45,
        this.iso.rows * this.iso.tileHeight * 2.8
      );
      village.setDepth(-50);
      this.groundLayer.add(village);
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
        const edgeColor = this.getTileStroke(row, col);
        const seed = Math.abs((row * 53) + (col * 37) + ((row + col) * 11));
        const patchOffsetX = ((seed % 7) - 3) * 3;
        const patchOffsetY = ((Math.floor(seed / 7) % 5) - 2) * 2;
        const patch = this.createTilePatchPoints(
          x + patchOffsetX,
          y - 1 + patchOffsetY,
          0.18 + (seed % 3) * 0.05,
          0.12 + (seed % 2) * 0.05
        );
        const patchColor =
          seed % 5 === 0
            ? darkenColor(topColor, 12)
            : seed % 3 === 0
              ? lightenColor(topColor, 10)
              : null;

        tile.fillStyle(this.getTileShadowColor(row, col), 0.95);
        tile.fillPoints(leftFace, true);
        tile.fillStyle(darkenColor(topColor, 26), 0.98);
        tile.fillPoints(rightFace, true);
        tile.fillStyle(topColor, 1);
        tile.fillPoints(top, true);

        if (patchColor) {
          tile.fillStyle(patchColor, 0.24);
          tile.fillPoints(patch, true);
        }

        tile.lineStyle(2, edgeColor, 0.8);
        tile.strokePoints([...top, top[0]], false, false);
        tile.lineStyle(1, this.getTileAccentColor(row, col), 0.32);
        tile.strokePoints(
          [top[0], new Phaser.Geom.Point(x + this.iso.tileWidth / 2 - 8, y)],
          false,
          false
        );
        tile.setDepth(row + col);
        this.groundLayer.add(tile);
      }
    }
  }

  drawForestRing() {
    return;
  }

  createHoverIndicator() {
    this.hoverIndicator = this.add.graphics();
    this.hoverIndicator.setDepth(999);
    this.overlayLayer.add(this.hoverIndicator);
    this.hoverTile = null;
  }

  createPlacementIndicator() {
    this.placementIndicator = this.add.graphics();
    this.placementIndicator.setDepth(1000);
    this.overlayLayer.add(this.placementIndicator);
  }

  createCamera() {
    const camera = this.cameras.main;
    camera.setBackgroundColor("#44553a");
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

  startResourceProduction() {
    this.resourceTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        this.updateTownHallProduction();
        this.updateWoodMachineProduction();
        this.updateBuildingUpgrades();
        this.updateCommandCenterHunger();
      },
    });
  }

  bindInput() {
    this.input.on("pointermove", (pointer) => {
      if (pointer.isDown) {
        this.handleCameraDrag(pointer);
      }

      this.updateHoverAtWorldPoint(pointer.worldX, pointer.worldY);
    });

    this.input.on("pointerdown", (pointer) => {
      this.pointerDrag.active = true;
      this.pointerDrag.moved = false;
      this.pointerDrag.startX = pointer.x;
      this.pointerDrag.startY = pointer.y;
      this.pointerDrag.cameraScrollX = this.cameras.main.scrollX;
      this.pointerDrag.cameraScrollY = this.cameras.main.scrollY;
      this.updateHoverAtWorldPoint(pointer.worldX, pointer.worldY);
    });

    this.input.on("pointerup", (pointer) => {
      const wasDrag = this.pointerDrag.moved;
      this.pointerDrag.active = false;

      if (!wasDrag) {
        if (this.isWarMode) {
          this.handleWarTileClick(pointer.worldX, pointer.worldY);
          return;
        }

        this.handleTileClick(pointer.worldX, pointer.worldY);
      }
    });

    this.input.on("wheel", (_pointer, _objects, _deltaX, deltaY) => {
      const camera = this.cameras.main;
      const direction = deltaY > 0 ? -1 : 1;
      const nextZoom = Phaser.Math.Clamp(
        camera.zoom + direction * ZOOM_STEP,
        MIN_ZOOM,
        MAX_ZOOM
      );
      camera.zoomTo(nextZoom, 120);
    });

  }

  handleCameraDrag(pointer) {
    if (!this.pointerDrag.active) {
      return;
    }

    const dragDistance = Phaser.Math.Distance.Between(
      this.pointerDrag.startX,
      this.pointerDrag.startY,
      pointer.x,
      pointer.y
    );

    if (dragDistance < 6 && !this.pointerDrag.moved) {
      return;
    }

    this.pointerDrag.moved = true;

    const camera = this.cameras.main;
    camera.scrollX =
      this.pointerDrag.cameraScrollX - (pointer.x - this.pointerDrag.startX) / camera.zoom;
    camera.scrollY =
      this.pointerDrag.cameraScrollY - (pointer.y - this.pointerDrag.startY) / camera.zoom;
  }

  updateHoverAtScreenPoint(screenX, screenY) {
    const camera = this.cameras.main;
    const worldPoint = camera.getWorldPoint(screenX, screenY);
    this.updateHoverAtWorldPoint(worldPoint.x, worldPoint.y);
  }

  updateHoverAtWorldPoint(worldX, worldY) {
    const tile = this.getNearestTile(worldX, worldY);

    if (!tile) {
      this.hoverTile = null;
      this.hoverIndicator.clear();
      this.placementIndicator.clear();
      return;
    }

    this.hoverTile = tile;
    this.drawTileOverlay(this.hoverIndicator, tile, 0xf8fafc, 0.18, 0xffffff, 2);

    if (this.selectedBuildingType) {
      const blocked = !this.canPlaceFootprint(tile.row, tile.col, this.selectedBuildingType)
        || this.isTileOccupied(
          tile.row,
          tile.col,
          this.selectedBuildingType,
          this.movingBuilding
        );
      this.drawTileOverlay(
        this.placementIndicator,
        { ...tile, buildingType: this.selectedBuildingType },
        blocked ? 0xef4444 : 0x22c55e,
        0.24,
        blocked ? 0xfca5a5 : 0xbbf7d0,
        2
      );
    } else {
      this.placementIndicator.clear();
    }
  }

  drawTileOverlay(graphics, tile, fillColor, fillAlpha, strokeColor, strokeWidth) {
    graphics.clear();
    const footprint = this.getFootprint(tile.buildingType ?? { footprintRows: 1, footprintCols: 1 });

    for (let rowOffset = 0; rowOffset < footprint.rows; rowOffset += 1) {
      for (let colOffset = 0; colOffset < footprint.cols; colOffset += 1) {
        const { x, y } = this.gridToWorld(tile.col + colOffset, tile.row + rowOffset);
        const diamond = this.createDiamondPoints(x, y);

        graphics.fillStyle(fillColor, fillAlpha);
        graphics.fillPoints(diamond, true);
        graphics.lineStyle(strokeWidth, strokeColor, 1);
        graphics.strokePoints([...diamond, diamond[0]], false, false);
      }
    }
  }

  getNearestTile(worldX, worldY) {
    const { row, col } = this.worldToGrid(worldX, worldY);

    if (!this.isInsideGrid(row, col)) {
      return null;
    }

    return { row, col };
  }

  isTileOccupied(row, col, buildingType = null, ignoredBuilding = null) {
    const footprint = this.getFootprint(buildingType);

    for (let rowOffset = 0; rowOffset < footprint.rows; rowOffset += 1) {
      for (let colOffset = 0; colOffset < footprint.cols; colOffset += 1) {
        const occupiedBuilding = this.occupiedTiles.get(
          this.getTileKey(row + rowOffset, col + colOffset)
        );

        if (occupiedBuilding && occupiedBuilding !== ignoredBuilding) {
          return true;
        }
      }
    }

    return false;
  }

  handleTileClick(worldX, worldY) {
    if (!this.selectedBuildingType) {
      this.clearPlacedBuildingSelection();
      return;
    }

    const tile = this.getNearestTile(worldX, worldY);
    if (
      !tile ||
      !this.canPlaceFootprint(tile.row, tile.col, this.selectedBuildingType) ||
      this.isTileOccupied(
        tile.row,
        tile.col,
        this.selectedBuildingType,
        this.movingBuilding
      )
    ) {
      this.updateHoverAtWorldPoint(worldX, worldY);
      return;
    }

    if (this.movingBuilding) {
      this.moveBuilding(this.movingBuilding, tile.row, tile.col);
    } else {
      this.placeBuilding(tile.row, tile.col, this.selectedBuildingType);
    }

    this.selectedBuildingType = null;
    this.movingBuilding = null;
    this.events.emit("structure-selection-cleared");
    this.updateHoverAtWorldPoint(worldX, worldY);
  }

  placeBuilding(row, col, buildingType, options = {}) {
    const {
      persistedId = null,
      deductCost = true,
      emitPlacedEvent = true,
      resourceState = {},
    } = options;
    const footprint = this.getFootprint(buildingType);
    const { x, y } = this.gridToWorld(
      col + (footprint.cols - 1) / 2,
      row + (footprint.rows - 1) / 2
    );
    const building = new Building(this, x, y, buildingType);

    building.row = row;
    building.col = col;
    building.persistedId = persistedId;
    building.machineGold = Number(resourceState.machineGold ?? 0);
    building.lastGeneratedAt = Number(resourceState.lastGeneratedAt ?? Date.now());
    building.soldierCount = Math.max(0, Number(resourceState.soldierCount ?? 0) || 0);
    building.lastWagePaidAt = Number(resourceState.lastWagePaidAt ?? Date.now());
    building.lastFedAt = Number(resourceState.lastFedAt ?? Date.now());
    building.hasChopper = Boolean(resourceState.hasChopper ?? false);
    building.setLevel(Number(resourceState.level ?? 1));
    building.setUpgradeState(
      Boolean(resourceState.isUpgrading),
      resourceState.upgradeCompleteAt ?? null
    );
    building.setSkyportState?.(building.hasChopper);
    building.setMachineGoldDisplay(
      building.machineGold,
      this.getBuildingMaxGold(building)
    );
    building.setDepth(300 + row + col + footprint.rows + footprint.cols);

    if (!this.isWarMode) {
      building.on("pointerup", (pointer, _localX, _localY, event) => {
        event.stopPropagation();

        if (!this.pointerDrag.moved) {
          this.selectPlacedBuilding(building);
        }
      });
    } else {
      building.disableInteractive();
    }

    this.structureLayer.add(building);
    this.placedBuildings.push(building);

    if (this.isCommandCenter(building)) {
      this.syncCommandCenterSoldiers(building);
    }

    for (let rowOffset = 0; rowOffset < footprint.rows; rowOffset += 1) {
      for (let colOffset = 0; colOffset < footprint.cols; colOffset += 1) {
        this.occupiedTiles.set(
          this.getTileKey(row + rowOffset, col + colOffset),
          building
        );
      }
    }

    if (deductCost) {
      this.setGoldState(this.gold - (buildingType.cost ?? 0));
    } else {
      this.emitGameState();
    }
    if (emitPlacedEvent) {
      this.events.emit("structure-placed", {
        structure: building,
        type: buildingType.id,
        row,
        col,
        ...this.getBuildingPersistenceState(building),
      });
    }
  }

  loadPersistedBuildings(buildings = []) {
    buildings.forEach((entry) => {
      const row = Number(entry.row ?? entry.y ?? 0);
      const col = Number(entry.col ?? entry.x ?? 0);
      const buildingType =
        typeof entry.type === "string"
          ? BUILDING_LIST.find((item) => item.id === entry.type)
          : entry.type;

      if (
        !this.canPlaceFootprint(row, col, buildingType) ||
        this.isTileOccupied(row, col, buildingType)
      ) {
        return;
      }

      if (!buildingType) {
        return;
      }

      this.placeBuilding(row, col, buildingType, {
        persistedId: entry.id ?? null,
        deductCost: false,
        emitPlacedEvent: false,
        resourceState: {
          level: entry.level ?? 1,
          isUpgrading: entry.isUpgrading ?? false,
          upgradeCompleteAt: entry.upgradeCompleteAt ?? null,
          machineGold: entry.machineGold ?? 0,
          lastGeneratedAt: entry.lastGeneratedAt ?? Date.now(),
          soldierCount: entry.soldierCount ?? 0,
          lastWagePaidAt: entry.lastWagePaidAt ?? Date.now(),
          lastFedAt: entry.lastFedAt ?? Date.now(),
          hasChopper: entry.hasChopper ?? false,
        },
      });
    });
  }

  clearPlacedBuildings() {
    this.clearPlacedBuildingSelection();
    this.placementIndicator?.clear();
    this.soldierUnits?.forEach((unit) => unit.destroy());
    this.soldierUnits = [];
    this.clearWarDeployments();
    this.placedBuildings?.forEach((building) => building.destroy());
    this.placedBuildings = [];
    this.occupiedTiles?.clear();
  }

  getTownHall() {
    return this.placedBuildings.find((building) => this.isTownHall(building)) ?? null;
  }

  ensureTownHall(options = {}) {
    const { emitPlacedEvent = false } = options;
    const existingTownHall = this.getTownHall();

    if (existingTownHall) {
      return existingTownHall;
    }

    const townHallType = BUILDING_LIST.find((item) => item.id === "town-hall");

    if (!townHallType) {
      return null;
    }

    const defaultRow = 4;
    const defaultCol = 4;

    if (
      !this.canPlaceFootprint(defaultRow, defaultCol, townHallType) ||
      this.isTileOccupied(defaultRow, defaultCol, townHallType)
    ) {
      return null;
    }

    this.placeBuilding(defaultRow, defaultCol, townHallType, {
      deductCost: false,
      emitPlacedEvent,
    });

    return this.getTownHall();
  }

  initializeFromSnapshot({ gold = this.gold, buildings = [] } = {}) {
    this.clearPlacedBuildings();
    this.setGoldState(gold, { emitChangeEvent: false });
    this.loadPersistedBuildings(buildings);
    this.ensureTownHall({ emitPlacedEvent: false });
    this.emitGameState();
  }

  initializeWarVillage({
    roomId = null,
    selfUserId = null,
    targetUserId = null,
    buildings = [],
    structures = [],
  } = {}) {
    const normalizedBuildings = Array.isArray(buildings) && buildings.length > 0
      ? buildings
      : (structures ?? []).map((structure) => ({
        id: structure.sourceId ?? structure.id ?? null,
        type: structure.type,
        x: structure.col,
        y: structure.row,
        level: structure.level ?? 1,
      }));
    const targetSignature = JSON.stringify(
      normalizedBuildings.map((building) => ({
        id: building.id ?? null,
        type: building.type,
        x: Number(building.x ?? building.col ?? 0),
        y: Number(building.y ?? building.row ?? 0),
        level: Number(building.level ?? 1),
      }))
    );

    if (this.warState.targetSignature !== targetSignature) {
      this.clearPlacedBuildings();
      this.loadPersistedBuildings(normalizedBuildings);
      this.ensureTownHall({ emitPlacedEvent: false });
      this.warState.targetSignature = targetSignature;
    }

    this.warState.roomId = roomId;
    this.warState.selfUserId = selfUserId;
    this.warState.targetUserId = targetUserId;
    this.syncWarStructureHealth(structures);
  }

  syncWarStructureHealth(structures = []) {
    const structureMap = new Map();

    structures.forEach((structure) => {
      const key = structure.sourceId ?? `${structure.type}:${structure.row}:${structure.col}`;
      structureMap.set(key, structure);
    });

    this.placedBuildings.forEach((building) => {
      const key = building.persistedId ?? `${building.buildingType.id}:${building.row}:${building.col}`;
      const structure = structureMap.get(key);

      if (!structure) {
        building.setVisible(false);
        building.setBattleHealth(null, null);
        return;
      }

      const isAlive = Number(structure.health ?? 0) > 0;
      building.setVisible(isAlive);
      building.setBattleHealth(structure.health, structure.maxHealth ?? structure.health);
    });
  }

  clearWarDeployments() {
    this.warDeployments?.forEach((sprite) => sprite.destroy());
    this.warDeployments?.clear();
  }

  syncWarDeployments(deployments = []) {
    const seenIds = new Set();

    deployments.forEach((deployment) => {
      const deploymentId = String(deployment.id);
      seenIds.add(deploymentId);
      const textureKey = deployment.state === "firing"
        ? WAR_FIRING_TEXTURES[deployment.direction] ?? WAR_FIRING_TEXTURES.front
        : (WAR_SOLDIER_TEXTURES[deployment.direction] ?? WAR_SOLDIER_TEXTURES.front)[
          Number(deployment.frameIndex ?? 0) % 2
        ];
      const position = this.gridToWorld(Number(deployment.col ?? 0), Number(deployment.row ?? 0));
      const existingSprite = this.warDeployments.get(deploymentId);

      if (!existingSprite) {
        const sprite = this.add.image(position.x, position.y, textureKey);
        sprite.setOrigin(0.5, 1);
        sprite.setDisplaySize(18, 28);
        sprite.setDepth(460 + Number(deployment.row ?? 0) + Number(deployment.col ?? 0));
        this.warUnitLayer.add(sprite);
        this.warDeployments.set(deploymentId, sprite);
        return;
      }

      existingSprite.setPosition(position.x, position.y);
      existingSprite.setTexture(textureKey);
      existingSprite.setDepth(460 + Number(deployment.row ?? 0) + Number(deployment.col ?? 0));
    });

    Array.from(this.warDeployments.entries()).forEach(([deploymentId, sprite]) => {
      if (seenIds.has(deploymentId)) {
        return;
      }

      sprite.destroy();
      this.warDeployments.delete(deploymentId);
    });
  }

  applyWarBattleState({
    roomId = null,
    selfUserId = null,
    targetUserId = null,
    targetBuildings = [],
    targetStructures = [],
    selfDeployments = [],
    status = "active",
  } = {}) {
    this.warState.status = status;
    this.initializeWarVillage({
      roomId,
      selfUserId,
      targetUserId,
      buildings: targetBuildings,
      structures: targetStructures,
    });
    this.syncWarDeployments(selfDeployments);
  }

  getPersistedSnapshot() {
    return {
      gold: this.gold,
      buildings: this.placedBuildings.map((building) => ({
        id: building.persistedId ?? null,
        type: building.buildingType.id,
        x: building.col,
        y: building.row,
        level: building.level ?? 1,
        isUpgrading: building.isUpgrading ?? false,
        upgradeCompleteAt: building.upgradeCompleteAt ?? null,
        machineGold: building.machineGold ?? 0,
        lastGeneratedAt: building.lastGeneratedAt ?? Date.now(),
        soldierCount: building.soldierCount ?? 0,
        lastWagePaidAt: building.lastWagePaidAt ?? Date.now(),
        lastFedAt: building.lastFedAt ?? Date.now(),
        hasChopper: building.hasChopper ?? false,
      })),
    };
  }

  setSelectedBuilding(buildingType) {
    this.selectedBuildingType = buildingType;
    this.movingBuilding = null;
    this.clearPlacedBuildingSelection();

    if (!buildingType) {
      this.placementIndicator.clear();
      return;
    }

    if (this.hoverTile) {
      this.updateHoverAtWorldPoint(
        this.gridToWorld(this.hoverTile.col, this.hoverTile.row).x,
        this.gridToWorld(this.hoverTile.col, this.hoverTile.row).y
      );
    }
  }

  emitGameState() {
    const woodMachines = this.placedBuildings.filter((building) =>
      this.isWoodMachine(building)
    );
    const fullWoodMachines = woodMachines.filter(
      (building) => (building.machineGold ?? 0) >= this.getBuildingMaxGold(building)
    ).length;
    const totalMachineGold = woodMachines.reduce(
      (total, building) => total + (building.machineGold ?? 0),
      0
    );
    const totalMachineCapacity = woodMachines.reduce(
      (total, building) => total + this.getBuildingMaxGold(building),
      0
    );
    const totalSoldiers = this.placedBuildings.reduce(
      (total, building) => total + (building.soldierCount ?? 0),
      0
    );

    this.events.emit("game-state-update", {
      gold: this.gold,
      buildings: this.placedBuildings.length,
      totalMachineGold,
      totalMachineCapacity,
      totalSoldiers,
      woodMachines: woodMachines.length,
      fullWoodMachines,
    });
  }

  setGoldState(nextGold, options = {}) {
    const { emitChangeEvent = true } = options;
    this.gold = Math.max(0, Math.floor(nextGold));
    this.emitGameState();

    if (emitChangeEvent) {
      this.events.emit("gold-changed", {
        gold: this.gold,
      });
    }
  }

  setBuildingTiles(building, register = true) {
    const footprint = this.getFootprint(building.buildingType);

    for (let rowOffset = 0; rowOffset < footprint.rows; rowOffset += 1) {
      for (let colOffset = 0; colOffset < footprint.cols; colOffset += 1) {
        const tileKey = this.getTileKey(building.row + rowOffset, building.col + colOffset);

        if (register) {
          this.occupiedTiles.set(tileKey, building);
        } else if (this.occupiedTiles.get(tileKey) === building) {
          this.occupiedTiles.delete(tileKey);
        }
      }
    }
  }

  isCommandCenter(buildingOrType) {
    const typeId = typeof buildingOrType === "string"
      ? buildingOrType
      : buildingOrType?.buildingType?.id ?? buildingOrType?.id;

    return typeId === "command-center";
  }

  isTownHall(buildingOrType) {
    const typeId = typeof buildingOrType === "string"
      ? buildingOrType
      : buildingOrType?.buildingType?.id ?? buildingOrType?.id;

    return typeId === "town-hall";
  }

  getCommandCenterSoldierLimit(building) {
    return this.isCommandCenter(building) ? COMMAND_CENTER_SOLDIER_LIMIT : 0;
  }

  getNextCommandCenterWageAt(building) {
    if (!this.isCommandCenter(building) || (building?.soldierCount ?? 0) <= 0) {
      return null;
    }

    return Number(building?.lastFedAt ?? Date.now()) + SOLDIER_STARVATION_MS;
  }

  isCommandCenterHungry(building) {
    if (!this.isCommandCenter(building) || (building?.soldierCount ?? 0) <= 0) {
      return false;
    }

    const lastFedAt = Number(building?.lastFedAt ?? Date.now());
    return Date.now() - lastFedAt >= SOLDIER_HUNGER_WARNING_MS;
  }

  getSoldiersForCommandCenter(commandCenter) {
    return this.soldierUnits.filter((unit) => unit.commandCenter === commandCenter);
  }

  getSoldierHomePoint(commandCenter, index = 0) {
    const offsets = [
      { row: 1, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: -1 },
      { row: 2, col: 0 },
      { row: 0, col: 2 },
      { row: 2, col: 1 },
    ];
    const offset = offsets[index % offsets.length];
    const row = Phaser.Math.Clamp(commandCenter.row + offset.row, 0, this.iso.rows - 1);
    const col = Phaser.Math.Clamp(commandCenter.col + offset.col, 0, this.iso.cols - 1);

    return this.gridToWorld(col, row);
  }

  getRandomSoldierPatrolPoint(commandCenter, index = 0) {
    const patrolOffsets = [
      { row: 1, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: -1, col: 1 },
      { row: 1, col: -1 },
    ];
    const candidates = patrolOffsets
      .map((offset) => ({
        row: commandCenter.row + offset.row,
        col: commandCenter.col + offset.col,
      }))
      .filter(({ row, col }) => this.isInsideGrid(row, col))
      .filter(({ row, col }) => {
        const occupied = this.occupiedTiles.get(this.getTileKey(row, col));
        return !occupied || occupied === commandCenter;
      });

    if (candidates.length === 0) {
      return this.getSoldierHomePoint(commandCenter, index);
    }

    const choice = Phaser.Utils.Array.GetRandom(candidates);
    return this.gridToWorld(choice.col, choice.row);
  }

  syncCommandCenterSoldiers(commandCenter) {
    if (!this.isCommandCenter(commandCenter)) {
      return;
    }

    const desiredCount = Math.max(0, Number(commandCenter.soldierCount ?? 0) || 0);
    const currentUnits = this.getSoldiersForCommandCenter(commandCenter);

    while (currentUnits.length > desiredCount) {
      const unit = currentUnits.pop();
      this.soldierUnits = this.soldierUnits.filter((entry) => entry !== unit);
      unit?.destroy();
    }

    while (currentUnits.length < desiredCount) {
      const unit = new SoldierUnit(this, commandCenter, currentUnits.length);
      this.structureLayer.add(unit);
      this.soldierUnits.push(unit);
      currentUnits.push(unit);
    }

    currentUnits.forEach((unit, index) => {
      unit.assignCommandCenter(commandCenter, index);
    });
  }

  removeCommandCenterSoldiers(commandCenter) {
    const currentUnits = this.getSoldiersForCommandCenter(commandCenter);
    currentUnits.forEach((unit) => unit.destroy());
    this.soldierUnits = this.soldierUnits.filter((unit) => unit.commandCenter !== commandCenter);
  }

  getNearestEnemyTarget(unit) {
    const activeEnemies = (this.enemyUnits ?? []).filter((enemy) => enemy?.active);

    if (activeEnemies.length === 0) {
      return null;
    }

    let nearestEnemy = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    activeEnemies.forEach((enemy) => {
      const distance = Phaser.Math.Distance.Between(unit.x, unit.y, enemy.x, enemy.y);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestEnemy = enemy;
      }
    });

    return nearestEnemy;
  }

  getPlacedBuildingSelectionPayload(building) {
    return {
      id: building.persistedId,
      type: building.buildingType.id,
      name: building.buildingType.name,
      row: building.row,
      col: building.col,
      level: building.level ?? 1,
      isUpgrading: building.isUpgrading ?? false,
      upgradeCompleteAt: building.upgradeCompleteAt ?? null,
      machineGold: building.machineGold ?? 0,
      maxGold: this.getBuildingMaxGold(building),
      soldierCount: building.soldierCount ?? 0,
      maxSoldiers: this.getCommandCenterSoldierLimit(building),
      nextWageAt: this.getNextCommandCenterWageAt(building),
      isHungry: this.isCommandCenterHungry(building),
      hasChopper: building.hasChopper ?? false,
      chopperCost: this.getSkyportChopperCost(building),
      chopperSellValue: this.isSkyport(building) ? SKYPORT_CHOPPER_SELL_VALUE : 0,
    };
  }

  getBuildingPersistenceState(building) {
    return {
      level: building.level ?? 1,
      isUpgrading: building.isUpgrading ?? false,
      upgradeCompleteAt: building.upgradeCompleteAt ?? null,
      machineGold: building.machineGold ?? 0,
      maxGold: this.getBuildingMaxGold(building),
      lastGeneratedAt: building.lastGeneratedAt ?? Date.now(),
      soldierCount: building.soldierCount ?? 0,
      maxSoldiers: this.getCommandCenterSoldierLimit(building),
      lastWagePaidAt: building.lastWagePaidAt ?? Date.now(),
      lastFedAt: building.lastFedAt ?? Date.now(),
      nextWageAt: this.getNextCommandCenterWageAt(building),
      isHungry: this.isCommandCenterHungry(building),
      hasChopper: building.hasChopper ?? false,
      chopperCost: this.getSkyportChopperCost(building),
      chopperSellValue: this.isSkyport(building) ? SKYPORT_CHOPPER_SELL_VALUE : 0,
    };
  }

  isSkyport(buildingOrType) {
    const typeId = typeof buildingOrType === "string"
      ? buildingOrType
      : buildingOrType?.buildingType?.id ?? buildingOrType?.id;

    return typeId === "skyport";
  }

  getSkyportChopperCost(building) {
    if (!this.isSkyport(building)) {
      return 0;
    }

    return (building?.level ?? 1) >= 2
      ? SKYPORT_CHOPPER_LEVEL_TWO_COST
      : SKYPORT_CHOPPER_COST;
  }

  buyChopperAtSelectedBuilding() {
    if (!this.selectedPlacedBuilding || !this.isSkyport(this.selectedPlacedBuilding)) {
      return;
    }

    const building = this.selectedPlacedBuilding;
    const chopperCost = this.getSkyportChopperCost(building);

    if (building.hasChopper || this.gold < chopperCost) {
      return;
    }

    building.hasChopper = true;
    building.setSkyportState?.(true);
    this.setGoldState(this.gold - chopperCost);

    this.events.emit("structure-resource-updated", {
      structure: building,
      id: building.persistedId,
      type: building.buildingType.id,
      row: building.row,
      col: building.col,
      ...this.getBuildingPersistenceState(building),
    });
    this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));
  }

  sellChopperAtSelectedBuilding() {
    if (!this.selectedPlacedBuilding || !this.isSkyport(this.selectedPlacedBuilding)) {
      return;
    }

    const building = this.selectedPlacedBuilding;

    if (!building.hasChopper) {
      return;
    }

    building.hasChopper = false;
    building.setSkyportState?.(false);
    this.setGoldState(this.gold + SKYPORT_CHOPPER_SELL_VALUE);

    this.events.emit("structure-resource-updated", {
      structure: building,
      id: building.persistedId,
      type: building.buildingType.id,
      row: building.row,
      col: building.col,
      ...this.getBuildingPersistenceState(building),
    });
    this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));
  }

  hireSoldierAtSelectedBuilding() {
    if (!this.selectedPlacedBuilding || !this.isCommandCenter(this.selectedPlacedBuilding)) {
      return;
    }

    const building = this.selectedPlacedBuilding;
    const currentSoldiers = building.soldierCount ?? 0;
    const maxSoldiers = this.getCommandCenterSoldierLimit(building);

    if (currentSoldiers >= maxSoldiers) {
      return;
    }

    building.soldierCount = currentSoldiers + 1;
    building.lastWagePaidAt = Number(building.lastWagePaidAt ?? Date.now());
    building.lastFedAt = Number(building.lastFedAt ?? Date.now());
    this.syncCommandCenterSoldiers(building);

    this.events.emit("structure-army-updated", {
      structure: building,
      id: building.persistedId,
      type: building.buildingType.id,
      row: building.row,
      col: building.col,
      ...this.getBuildingPersistenceState(building),
    });
    this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));
  }

  feedSelectedCommandCenterSoldiers() {
    if (!this.selectedPlacedBuilding || !this.isCommandCenter(this.selectedPlacedBuilding)) {
      return;
    }

    const building = this.selectedPlacedBuilding;
    const soldierCount = Math.max(0, Number(building.soldierCount ?? 0) || 0);
    const totalFeedCost = soldierCount * SOLDIER_FEED_COST_PER_UNIT;

    if (soldierCount <= 0 || this.gold < totalFeedCost) {
      return;
    }

    building.lastFedAt = Date.now();
    this.setGoldState(this.gold - totalFeedCost);
    this.syncCommandCenterSoldiers(building);

    this.events.emit("structure-army-updated", {
      structure: building,
      id: building.persistedId,
      type: building.buildingType.id,
      row: building.row,
      col: building.col,
      ...this.getBuildingPersistenceState(building),
    });
    this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));
  }

  removeSoldiersAtSelectedBuilding(count = 1) {
    if (!this.selectedPlacedBuilding || !this.isCommandCenter(this.selectedPlacedBuilding)) {
      return;
    }

    const building = this.selectedPlacedBuilding;
    const currentSoldiers = Math.max(0, Number(building.soldierCount ?? 0) || 0);
    const removeCount = Math.max(0, Math.floor(Number(count) || 0));

    if (currentSoldiers <= 0 || removeCount <= 0) {
      return;
    }

    building.soldierCount = Math.max(0, currentSoldiers - removeCount);
    this.syncCommandCenterSoldiers(building);

    this.events.emit("structure-army-updated", {
      structure: building,
      id: building.persistedId,
      type: building.buildingType.id,
      row: building.row,
      col: building.col,
      ...this.getBuildingPersistenceState(building),
    });
    this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));
  }

  selectPlacedBuilding(building) {
    this.selectedPlacedBuilding = building;
    this.selectedBuildingType = null;
    this.movingBuilding = null;
    this.events.emit("structure-selection-cleared");
    this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));
    this.drawTileOverlay(
      this.placementIndicator,
      { row: building.row, col: building.col, buildingType: building.buildingType },
      0xf59e0b,
      0.28,
      0xfde68a,
      2
    );
  }

  clearPlacedBuildingSelection() {
    if (!this.selectedPlacedBuilding && !this.movingBuilding) {
      return;
    }

    this.selectedPlacedBuilding = null;
    this.movingBuilding = null;
    this.events.emit("placed-building-selected", null);

    if (!this.selectedBuildingType) {
      this.placementIndicator.clear();
    }
  }

  startMovingSelectedBuilding() {
    if (!this.selectedPlacedBuilding) {
      return;
    }

    this.movingBuilding = this.selectedPlacedBuilding;
    this.selectedBuildingType = this.selectedPlacedBuilding.buildingType;
    this.events.emit("placed-building-moving", {
      id: this.selectedPlacedBuilding.persistedId,
      type: this.selectedPlacedBuilding.buildingType.id,
      name: this.selectedPlacedBuilding.buildingType.name,
    });

    if (this.hoverTile) {
      this.updateHoverAtWorldPoint(
        this.gridToWorld(this.hoverTile.col, this.hoverTile.row).x,
        this.gridToWorld(this.hoverTile.col, this.hoverTile.row).y
      );
    }
  }

  moveBuilding(building, row, col) {
    const previousRow = building.row;
    const previousCol = building.col;
    this.setBuildingTiles(building, false);

    const footprint = this.getFootprint(building.buildingType);
    const { x, y } = this.gridToWorld(
      col + (footprint.cols - 1) / 2,
      row + (footprint.rows - 1) / 2
    );

    building.row = row;
    building.col = col;
    building.x = x;
    building.y = y;
    building.setDepth(300 + row + col + footprint.rows + footprint.cols);
    this.setBuildingTiles(building, true);
    this.selectedPlacedBuilding = building;
    this.syncCommandCenterSoldiers(building);
    this.events.emit("structure-moved", {
      structure: building,
      type: building.buildingType.id,
      previousRow,
      previousCol,
      row,
      col,
      ...this.getBuildingPersistenceState(building),
    });
    this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));

  }

  handleWarTileClick(worldX, worldY) {
    const tile = this.getNearestTile(worldX, worldY);

    if (!tile || tile.row < this.iso.rows - 2) {
      return;
    }

    const occupiedBuilding = this.occupiedTiles.get(this.getTileKey(tile.row, tile.col));

    if (occupiedBuilding) {
      return;
    }

    this.events.emit("war-deploy-request", {
      row: tile.row,
      col: tile.col,
    });
  }

  sellSelectedBuilding() {
    if (!this.selectedPlacedBuilding) {
      return;
    }

    const building = this.selectedPlacedBuilding;
    this.removeCommandCenterSoldiers(building);
    this.setBuildingTiles(building, false);
    this.placedBuildings = this.placedBuildings.filter((entry) => entry !== building);
    building.destroy();
    this.setGoldState(this.gold + Math.floor((building.buildingType.cost ?? 0) * 0.5));
    this.selectedPlacedBuilding = null;
    this.movingBuilding = null;
    this.selectedBuildingType = null;
    this.placementIndicator.clear();
    this.events.emit("placed-building-selected", null);
    this.events.emit("structure-sold", {
      structure: building,
      id: building.persistedId,
      type: building.buildingType.id,
      row: building.row,
      col: building.col,
      ...this.getBuildingPersistenceState(building),
    });
  }

  collectSelectedBuildingGold() {
    if (!this.selectedPlacedBuilding || !this.isWoodMachine(this.selectedPlacedBuilding)) {
      return;
    }

    const building = this.selectedPlacedBuilding;
    const collectedGold = Number(building.machineGold ?? 0);

    if (collectedGold <= 0) {
      return;
    }

    building.machineGold = 0;
    building.lastGeneratedAt = Date.now();
    building.setMachineGoldDisplay(0, this.getBuildingMaxGold(building));
    this.setGoldState(this.gold + collectedGold);
    this.events.emit("structure-resource-updated", {
      structure: building,
      id: building.persistedId,
      type: building.buildingType.id,
      row: building.row,
      col: building.col,
      ...this.getBuildingPersistenceState(building),
      isFull: false,
    });
    this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));
  }

  collectTownHallGold(building) {
    if (!this.isTownHall(building)) {
      return;
    }

    const collectedGold = Number(building.machineGold ?? 0);

    if (collectedGold <= 0) {
      return;
    }

    building.machineGold = 0;
    building.lastGeneratedAt = Date.now();
    building.setMachineGoldDisplay(building.machineGold);
    this.setGoldState(this.gold + collectedGold);

    this.events.emit("structure-resource-updated", {
      structure: building,
      id: building.persistedId,
      type: building.buildingType.id,
      row: building.row,
      col: building.col,
      ...this.getBuildingPersistenceState(building),
      isFull: false,
    });

    if (this.selectedPlacedBuilding === building) {
      this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));
    }
  }

  startUpgradeSelectedBuilding() {
    if (!this.selectedPlacedBuilding) {
      return;
    }

    const building = this.selectedPlacedBuilding;
    const upgradeCost = getBuildingUpgradeCost(building.buildingType);

    if (
      (building.level ?? 1) >= BUILDING_MAX_LEVEL ||
      building.isUpgrading ||
      this.gold < upgradeCost
    ) {
      return;
    }

    this.setGoldState(this.gold - upgradeCost);
    building.isUpgrading = true;
    building.upgradeCompleteAt = Date.now() + BUILDING_UPGRADE_DURATION_MS;
    building.setUpgradeState(true, building.upgradeCompleteAt);

    this.events.emit("structure-upgrade-started", {
      structure: building,
      id: building.persistedId,
      type: building.buildingType.id,
      row: building.row,
      col: building.col,
      ...this.getBuildingPersistenceState(building),
    });
    this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));
  }

  cancelUpgradeSelectedBuilding() {
    if (!this.selectedPlacedBuilding) {
      return;
    }

    const building = this.selectedPlacedBuilding;

    if (!building.isUpgrading) {
      return;
    }

    building.isUpgrading = false;
    building.upgradeCompleteAt = null;
    building.setUpgradeState(false, null);

    this.events.emit("structure-upgrade-cancelled", {
      structure: building,
      id: building.persistedId,
      type: building.buildingType.id,
      row: building.row,
      col: building.col,
      ...this.getBuildingPersistenceState(building),
    });
    this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));
  }

  isWoodMachine(buildingOrType) {
    const typeId = typeof buildingOrType === "string"
      ? buildingOrType
      : buildingOrType?.buildingType?.id ?? buildingOrType?.id;

    return typeId === "wood-machine";
  }

  getBuildingGoldPerTick(building) {
    if (this.isWoodMachine(building)) {
      return (building?.level ?? 1) >= 2
        ? WOOD_MACHINE_GOLD_PER_TICK * 2
        : WOOD_MACHINE_GOLD_PER_TICK;
    }

    if (this.isTownHall(building)) {
      return (building?.level ?? 1) >= 2
        ? TOWN_HALL_GOLD_PER_TICK * 2
        : TOWN_HALL_GOLD_PER_TICK;
    }

    return 0;
  }

  getBuildingMaxGold(building) {
    if (this.isWoodMachine(building)) {
      return (building?.level ?? 1) >= 2
        ? WOOD_MACHINE_MAX_GOLD * 2
        : WOOD_MACHINE_MAX_GOLD;
    }

    if (this.isTownHall(building)) {
      return (building?.level ?? 1) >= 2
        ? TOWN_HALL_MAX_GOLD * 2
        : TOWN_HALL_MAX_GOLD;
    }

    if (this.isCommandCenter(building)) {
      return 0;
    }

    return 0;
  }

  updateTownHallProduction() {
    const now = Date.now();

    this.placedBuildings.forEach((building) => {
      if (!this.isTownHall(building) || building.isUpgrading) {
        return;
      }

      const maxGold = this.getBuildingMaxGold(building);
      const goldPerTick = this.getBuildingGoldPerTick(building);

      if ((building.machineGold ?? 0) >= maxGold) {
        return;
      }

      const lastGeneratedAt = Number(building.lastGeneratedAt ?? now);
      const elapsed = now - lastGeneratedAt;
      const earnedTicks = Math.floor(elapsed / WOOD_MACHINE_TICK_MS);

      if (earnedTicks <= 0) {
        return;
      }

      building.machineGold = Math.min(
        maxGold,
        (building.machineGold ?? 0) + earnedTicks * goldPerTick
      );
      building.lastGeneratedAt = lastGeneratedAt + earnedTicks * WOOD_MACHINE_TICK_MS;
      building.setMachineGoldDisplay(building.machineGold, maxGold);

      this.events.emit("structure-resource-updated", {
        structure: building,
        id: building.persistedId,
        type: building.buildingType.id,
        row: building.row,
        col: building.col,
        ...this.getBuildingPersistenceState(building),
        isFull: false,
      });

      if (this.selectedPlacedBuilding === building) {
        this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));
      }
    });
  }

  updateWoodMachineProduction() {
    const now = Date.now();
    let hasChanges = false;

    this.placedBuildings.forEach((building) => {
      if (!this.isWoodMachine(building)) {
        return;
      }

      if (building.isUpgrading) {
        return;
      }

      const maxGold = this.getBuildingMaxGold(building);
      const goldPerTick = this.getBuildingGoldPerTick(building);

      if ((building.machineGold ?? 0) >= maxGold) {
        return;
      }

      const lastGeneratedAt = Number(building.lastGeneratedAt ?? now);
      const elapsed = now - lastGeneratedAt;
      const earnedTicks = Math.floor(elapsed / WOOD_MACHINE_TICK_MS);

      if (earnedTicks <= 0) {
        return;
      }

      building.machineGold = Math.min(
        maxGold,
        (building.machineGold ?? 0) + earnedTicks * goldPerTick
      );
      building.lastGeneratedAt = lastGeneratedAt + earnedTicks * WOOD_MACHINE_TICK_MS;
      building.setMachineGoldDisplay(building.machineGold, maxGold);
      hasChanges = true;

      this.events.emit("structure-resource-updated", {
        structure: building,
        id: building.persistedId,
        type: building.buildingType.id,
        row: building.row,
        col: building.col,
        ...this.getBuildingPersistenceState(building),
        isFull: building.machineGold >= maxGold,
      });

      if (this.selectedPlacedBuilding === building) {
        this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));
      }
    });

    if (hasChanges) {
      this.emitGameState();
    }
  }

  updateBuildingUpgrades() {
    const now = Date.now();

    this.placedBuildings.forEach((building) => {
      if (!building.isUpgrading || !building.upgradeCompleteAt) {
        return;
      }

      if (now < Number(building.upgradeCompleteAt)) {
        return;
      }

      building.isUpgrading = false;
      building.upgradeCompleteAt = null;
      building.setLevel(Math.min(BUILDING_MAX_LEVEL, (building.level ?? 1) + 1));
      building.setUpgradeState(false, null);
      building.machineGold = Math.min(
        building.machineGold ?? 0,
        this.getBuildingMaxGold(building)
      );
      building.setMachineGoldDisplay(
        building.machineGold ?? 0,
        this.getBuildingMaxGold(building)
      );

      this.events.emit("structure-upgrade-completed", {
        structure: building,
        id: building.persistedId,
        type: building.buildingType.id,
        row: building.row,
        col: building.col,
        ...this.getBuildingPersistenceState(building),
      });

      if (this.selectedPlacedBuilding === building) {
        this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));
      }
    });
  }

  updateCommandCenterHunger() {
    const now = Date.now();

    this.placedBuildings.forEach((building) => {
      if (!this.isCommandCenter(building) || (building.soldierCount ?? 0) <= 0) {
        return;
      }

      const lastFedAt = Number(building.lastFedAt ?? now);
      const elapsed = now - lastFedAt;

      if (elapsed < SOLDIER_STARVATION_MS) {
        this.getSoldiersForCommandCenter(building).forEach((unit) => {
          unit.setHungryState?.(this.isCommandCenterHungry(building));
        });
        return;
      }

      building.soldierCount = 0;
      building.lastFedAt = now;
      this.syncCommandCenterSoldiers(building);

      this.events.emit("structure-army-updated", {
        structure: building,
        id: building.persistedId,
        type: building.buildingType.id,
        row: building.row,
        col: building.col,
        ...this.getBuildingPersistenceState(building),
      });

      if (this.selectedPlacedBuilding === building) {
        this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));
      }
    });
  }

}
