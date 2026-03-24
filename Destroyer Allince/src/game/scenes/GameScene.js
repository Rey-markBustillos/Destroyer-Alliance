import Phaser from "phaser";

import Building from "../objects/Building";
import { BUILDING_LIST } from "../utils/buildingTypes";

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const MAP_ROWS = 12;
const MAP_COLS = 12;
const STARTING_GOLD = 1200;
const INITIAL_ZOOM = 1.2;
const MIN_ZOOM = INITIAL_ZOOM;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.1;

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
    this.gold = STARTING_GOLD;
    this.placedBuildings = [];
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
        || this.isTileOccupied(tile.row, tile.col, this.selectedBuildingType);
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

  isTileOccupied(row, col, buildingType = null) {
    const footprint = this.getFootprint(buildingType);

    for (let rowOffset = 0; rowOffset < footprint.rows; rowOffset += 1) {
      for (let colOffset = 0; colOffset < footprint.cols; colOffset += 1) {
        if (this.occupiedTiles.has(this.getTileKey(row + rowOffset, col + colOffset))) {
          return true;
        }
      }
    }

    return false;
  }

  handleTileClick(worldX, worldY) {
    if (!this.selectedBuildingType) {
      return;
    }

    const tile = this.getNearestTile(worldX, worldY);
    if (
      !tile ||
      !this.canPlaceFootprint(tile.row, tile.col, this.selectedBuildingType) ||
      this.isTileOccupied(tile.row, tile.col, this.selectedBuildingType)
    ) {
      this.updateHoverAtWorldPoint(worldX, worldY);
      return;
    }

    this.placeBuilding(tile.row, tile.col, this.selectedBuildingType);
    this.selectedBuildingType = null;
    this.events.emit("structure-selection-cleared");
    this.updateHoverAtWorldPoint(worldX, worldY);
  }

  placeBuilding(row, col, buildingType, persistedId = null) {
    const footprint = this.getFootprint(buildingType);
    const { x, y } = this.gridToWorld(
      col + (footprint.cols - 1) / 2,
      row + (footprint.rows - 1) / 2
    );
    const building = new Building(this, x, y, buildingType);

    building.row = row;
    building.col = col;
    building.persistedId = persistedId;
    building.setDepth(300 + row + col + footprint.rows + footprint.cols);
    this.structureLayer.add(building);
    this.placedBuildings.push(building);

    for (let rowOffset = 0; rowOffset < footprint.rows; rowOffset += 1) {
      for (let colOffset = 0; colOffset < footprint.cols; colOffset += 1) {
        this.occupiedTiles.set(
          this.getTileKey(row + rowOffset, col + colOffset),
          building
        );
      }
    }

    this.gold = Math.max(0, this.gold - (buildingType.cost ?? 0));
    this.emitGameState();
    this.events.emit("structure-placed", {
      structure: building,
      type: buildingType.id,
      row,
      col,
    });
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

      this.placeBuilding(row, col, buildingType, entry.id ?? null);
    });
  }

  setSelectedBuilding(buildingType) {
    this.selectedBuildingType = buildingType;

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
    this.events.emit("game-state-update", {
      gold: this.gold,
      buildings: this.placedBuildings.length,
    });
  }
}
