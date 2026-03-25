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
const SOLDIER_WAGE_INTERVAL_MS = 86400000;
const SOLDIER_WAGE_PER_UNIT = 1;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  create() {
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
    this.startResourceProduction();
    this.updateHoverAtScreenPoint(
      this.scale.width / 2,
      this.scale.height / 2
    );
    this.emitGameState();
    this.game.events.emit("ready");
  }

  createWorldLayers() {
    this.groundLayer = this.add.layer();
    this.decorLayer = this.add.layer();
    this.structureLayer = this.add.layer();
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

  canPlaceFootprint(row, col, buildingType) {
    const footprint = this.getFootprint(buildingType);
    return (
      row >= 0 &&
      col >= 0 &&
      row + footprint.rows - 1 < this.iso.rows &&
      col + footprint.cols - 1 < this.iso.cols
    );
  }

  getTileColor(row, col) {
    return (row + col) % 2 === 0 ? 0x90c96f : 0x7db65f;
  }

  getTileStroke(row, col) {
    return (row + col) % 2 === 0 ? 0x55823f : 0x4f783b;
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
    for (let row = 0; row < this.iso.rows; row += 1) {
      for (let col = 0; col < this.iso.cols; col += 1) {
        const { x, y } = this.gridToWorld(col, row);
        const tile = this.add.graphics();
        const top = this.createDiamondPoints(x, y);

        const topColor = this.getTileColor(row, col);
        tile.fillStyle(topColor, 1);
        tile.fillPoints(top, true);
        tile.lineStyle(2, this.getTileStroke(row, col), 0.95);
        tile.strokePoints([...top, top[0]], false, false);
        tile.setDepth(row + col);
        this.groundLayer.add(tile);
      }
    }
  }

  drawForestRing() {
    if (!this.textures.exists("tree")) {
      return;
    }

    const occupiedDecor = new Set();
    const treeRows = [-10, -9, -8, -7, -6, -5, -4, this.iso.rows + 3, this.iso.rows + 4, this.iso.rows + 5, this.iso.rows + 6, this.iso.rows + 7, this.iso.rows + 8, this.iso.rows + 9];
    const treeCols = [-10, -9, -8, -7, -6, -5, -4, this.iso.cols + 3, this.iso.cols + 4, this.iso.cols + 5, this.iso.cols + 6, this.iso.cols + 7, this.iso.cols + 8, this.iso.cols + 9];
    const minCol = -10;
    const maxCol = this.iso.cols + 9;
    const minRow = -10;
    const maxRow = this.iso.rows + 9;

    const addDecor = (row, col, type = "tree") => {
      const decorKey = `${row},${col}`;

      if (occupiedDecor.has(decorKey)) {
        return;
      }

      occupiedDecor.add(decorKey);

      const { x, y } = this.gridToWorld(col, row);
      const seed = Math.abs((row * 31) + (col * 17));

      if (type === "stone" && this.textures.exists("stone")) {
        const stone = this.add.image(
          x + ((seed % 5) - 2) * 8,
          y + this.iso.tileHeight + 16 + ((seed % 7) - 3) * 4,
          "stone"
        );

        stone.setOrigin(0.5, 1);
        stone.setDisplaySize(42 + (seed % 3) * 8, 28 + (seed % 2) * 6);
        stone.setAlpha(0.92);
        stone.setDepth(120 + row + col);
        this.decorLayer.add(stone);
        return;
      }

      const width = 66 + (seed % 3) * 8;
      const height = 74 + (seed % 4) * 6;
      const xOffset = ((seed % 5) - 2) * 5;
      const yOffset = ((seed % 7) - 3) * 4;
      const tree = this.add.image(
        x + xOffset,
        y + this.iso.tileHeight + 42 + yOffset,
        "tree"
      );

      tree.setOrigin(0.5, 1);
      tree.setDisplaySize(width, height);
      tree.setAlpha(0.95);
      tree.setDepth(170 + row + col);
      this.decorLayer.add(tree);
    };

    treeRows.forEach((row) => {
      for (let col = minCol; col <= maxCol; col += 1) {
        addDecor(row, col, "tree");

        if ((col + row) % 2 === 0) {
          addDecor(row + (row < 0 ? 1 : -1), col, "stone");
        }
      }
    });

    treeCols.forEach((col) => {
      for (let row = minRow; row <= maxRow; row += 1) {
        addDecor(row, col, "tree");

        if ((col + row) % 3 === 0) {
          addDecor(row, col + (col < 0 ? 1 : -1), "stone");
        }
      }
    });
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
    camera.setBackgroundColor("#84b966");
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
        this.updateCommandCenterWages();
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
    building.setLevel(Number(resourceState.level ?? 1));
    building.setUpgradeState(
      Boolean(resourceState.isUpgrading),
      resourceState.upgradeCompleteAt ?? null
    );
    building.setMachineGoldDisplay(
      building.machineGold,
      this.getBuildingMaxGold(building)
    );
    building.setDepth(300 + row + col + footprint.rows + footprint.cols);
    building.on("pointerup", (pointer, _localX, _localY, event) => {
      event.stopPropagation();

      if (!this.pointerDrag.moved) {
        this.selectPlacedBuilding(building);
      }
    });
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
        },
      });
    });
  }

  clearPlacedBuildings() {
    this.clearPlacedBuildingSelection();
    this.placementIndicator.clear();
    this.soldierUnits.forEach((unit) => unit.destroy());
    this.soldierUnits = [];
    this.placedBuildings.forEach((building) => building.destroy());
    this.placedBuildings = [];
    this.occupiedTiles.clear();
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

    return Number(building?.lastWagePaidAt ?? Date.now()) + SOLDIER_WAGE_INTERVAL_MS;
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
      nextWageAt: this.getNextCommandCenterWageAt(building),
    };
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

  updateCommandCenterWages() {
    const now = Date.now();

    this.placedBuildings.forEach((building) => {
      if (!this.isCommandCenter(building) || (building.soldierCount ?? 0) <= 0) {
        return;
      }

      const lastWagePaidAt = Number(building.lastWagePaidAt ?? now);
      const elapsed = now - lastWagePaidAt;
      const wageCycles = Math.floor(elapsed / SOLDIER_WAGE_INTERVAL_MS);

      if (wageCycles <= 0) {
        return;
      }

      const totalWage = (building.soldierCount ?? 0) * SOLDIER_WAGE_PER_UNIT * wageCycles;
      building.lastWagePaidAt = lastWagePaidAt + wageCycles * SOLDIER_WAGE_INTERVAL_MS;
      this.setGoldState(Math.max(0, this.gold - totalWage));

      this.events.emit("structure-army-updated", {
        structure: building,
        id: building.persistedId,
        type: building.buildingType.id,
        row: building.row,
        col: building.col,
        ...this.getBuildingPersistenceState(building),
        totalWage,
      });

      if (this.selectedPlacedBuilding === building) {
        this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));
      }
    });
  }

}
