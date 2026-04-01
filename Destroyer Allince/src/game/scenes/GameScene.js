import Phaser from "phaser";

import Building from "../objects/Building";
import SoldierUnit from "../objects/SoldierUnit";
import { BUILDING_LIST, getBuildingUpgradeCost } from "../utils/buildingTypes";
import {
  configureHdSprite,
  createAmbientWorldLighting,
  getTextureSourceSize,
} from "../utils/renderQuality";

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const MAP_ROWS = 15;
const MAP_COLS = 15;
const STARTING_GOLD = 1200;
const MIN_ZOOM_FLOOR = 0.55;
const MAX_ZOOM = 2.2;
const ZOOM_STEP = 0.1;
const CAMERA_EDGE_SCROLL_MARGIN = 56;
const CAMERA_EDGE_SCROLL_SPEED = 720;
const CAMERA_INERTIA_DAMPING = 10;
const CAMERA_SCROLL_LERP = 14;
const CAMERA_ZOOM_LERP = 12;
const CAMERA_FOCUS_SCROLL_LERP = 6;
const CAMERA_FOCUS_ZOOM_LERP = 5;
const CAMERA_FOCUS_TRANSITION_MS = 420;
const CAMERA_FOCUS_OFFSET_Y = TILE_HEIGHT * 0.18;
const CAMERA_FIT_PADDING = 0;
const MAP_COVER_BLEED = 96;
const CAMERA_SCROLL_SAFE_INSET_LEFT = 0;
const CAMERA_SCROLL_SAFE_INSET_RIGHT = 72;
const CAMERA_EXTRA_LEFT_SCROLL = 84;
const CAMERA_SCROLL_SAFE_INSET_TOP = 40;
const CAMERA_SCROLL_SAFE_INSET_BOTTOM = 120;
const CAMERA_COVER_ZOOM_GUARD = 1.035;
const WOOD_MACHINE_TICK_MS = 180000;
const ENERGY_MACHINE_TICK_MS = 180000;
const WOOD_MACHINE_GOLD_PER_TICK = 10;
const ENERGY_MACHINE_PER_TICK = 1;
const WOOD_MACHINE_MAX_GOLD = 250;
const ENERGY_MACHINE_MAX_STORAGE = 3;
const TOWN_HALL_GOLD_PER_TICK = 100;
const TOWN_HALL_MAX_GOLD = 500;
const WOOD_MACHINE_LEVEL_TWO_GOLD_PER_TICK = 20;
const BUILDING_UPGRADE_DURATION_MS = 1800000;
const BUILDING_MAX_LEVEL = 2;
const WOOD_MACHINE_BASE_LIMIT = 4;
const WOOD_MACHINE_LIMIT_PER_TOWN_HALL_LEVEL = 2;
const ENERGY_MACHINE_BASE_LIMIT = 1;
const ENERGY_MACHINE_LIMIT_PER_TOWN_HALL_LEVEL = 1;
const TENT_BASE_LIMIT = 4;
const TENT_LIMIT_PER_TOWN_HALL_LEVEL = 4;
const COMMAND_CENTER_BASE_SOLDIER_LIMIT = 5;
const COMMAND_CENTER_SOLDIER_LIMIT_PER_LEVEL = 5;
const SOLDIER_HUNGER_WARNING_MS = 18000000;
const SOLDIER_STARVATION_MS = 86400000;
const SOLDIER_RECRUIT_COST_PER_UNIT = 2;
const SOLDIER_FEED_COST_PER_UNIT = 1;
const SKYPORT_CHOPPER_COST = 5000;
const SKYPORT_CHOPPER_LEVEL_TWO_COST = 3500;
const SKYPORT_CHOPPER_SELL_VALUE = 4000;
const BATTLE_TANK_PURCHASE_COST = 5000;
const TANK_RECHARGE_ENERGY_COST = 2;
const HELICOPTER_RECHARGE_ENERGY_COST = 3;
const TANK_MAX_SHOTS = 10;
const HELICOPTER_MAX_SHOTS = 15;
const TANK_BASE_HEALTH = 260;
const TANK_HEALTH_PER_LEVEL = 120;
const TANK_BASE_DAMAGE = 80;
const TANK_DAMAGE_PER_LEVEL = 18;
const BUILDING_SELECTION_DEBUG = false;
const CAMERA_WORLD_PADDING = 64;
const BUILDABLE_GRASS_MASK = Array.from({ length: MAP_ROWS }, (_, row) => (
  row === 0 || row === MAP_ROWS - 1
    ? [3, MAP_COLS - 4]
    : row === 1 || row === MAP_ROWS - 2
      ? [1, MAP_COLS - 2]
      : [0, MAP_COLS - 1]
));

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

const clampStoredShots = (value, maxShots, hasVehicle = true) => {
  if (!hasVehicle) {
    return 0;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return maxShots;
  }

  return Math.max(0, Math.min(maxShots, Math.floor(parsed)));
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

const getCameraSafeBounds = (scene) => {
  const fallbackWidth = Math.max(1, 16 * TILE_WIDTH);
  const fallbackHeight = Math.max(1, 16 * TILE_HEIGHT);
  const activeBounds = scene?.cameraFitBounds ?? scene?.worldBounds ?? {
    minX: 0,
    maxX: fallbackWidth,
    minY: 0,
    maxY: fallbackHeight,
    width: fallbackWidth,
    height: fallbackHeight,
  };

  return {
    minX: activeBounds.minX + CAMERA_SCROLL_SAFE_INSET_LEFT,
    maxX: activeBounds.maxX - CAMERA_SCROLL_SAFE_INSET_RIGHT,
    minY: activeBounds.minY + CAMERA_SCROLL_SAFE_INSET_TOP,
    maxY: activeBounds.maxY - CAMERA_SCROLL_SAFE_INSET_BOTTOM,
    width: Math.max(1, activeBounds.width - CAMERA_SCROLL_SAFE_INSET_LEFT - CAMERA_SCROLL_SAFE_INSET_RIGHT),
    height: Math.max(1, activeBounds.height - CAMERA_SCROLL_SAFE_INSET_TOP - CAMERA_SCROLL_SAFE_INSET_BOTTOM),
  };
};

const getSixteenBySixteenViewZoom = (scene) => {
  const viewportWidth = Number(scene?.scale?.width ?? 1280) || 1280;
  const viewportHeight = Number(scene?.scale?.height ?? 720) || 720;
  const visibleGridWidth = Math.max(1, 16 * TILE_WIDTH);
  const visibleGridHeight = Math.max(1, 16 * TILE_HEIGHT);
  const safeBounds = getCameraSafeBounds(scene);
  const fitBoundsWidth = Math.max(1, Number(safeBounds.width ?? visibleGridWidth) || visibleGridWidth);
  const fitBoundsHeight = Math.max(1, Number(safeBounds.height ?? visibleGridHeight) || visibleGridHeight);
  const safeViewportWidth = Math.max(1, viewportWidth - (CAMERA_FIT_PADDING * 2));
  const safeViewportHeight = Math.max(1, viewportHeight - (CAMERA_FIT_PADDING * 2));
  const requestedWidthZoom = safeViewportWidth / visibleGridWidth;
  const requestedHeightZoom = safeViewportHeight / visibleGridHeight;
  const requestedZoom = Math.min(requestedWidthZoom, requestedHeightZoom);
  const mapCoverZoom = Math.max(
    safeViewportWidth / fitBoundsWidth,
    safeViewportHeight / fitBoundsHeight
  );
  const resolvedZoom = Math.max(requestedZoom, mapCoverZoom * CAMERA_COVER_ZOOM_GUARD);

  return Phaser.Math.Clamp(resolvedZoom, MIN_ZOOM_FLOOR, MAX_ZOOM);
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
      rows: Math.max(1, Number(this.runtimeOptions?.gridRows ?? MAP_ROWS) || MAP_ROWS),
      cols: Math.max(1, Number(this.runtimeOptions?.gridCols ?? MAP_COLS) || MAP_COLS),
    };

    this.selectedBuildingType = null;
    this.selectedPlacedBuilding = null;
    this.movingBuilding = null;
    this.gold = STARTING_GOLD;
    this.energy = 0;
    this.placedBuildings = [];
    this.soldierUnits = [];
    this.enemyUnits = [];
    this.grid = [];
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
      lastScrollX: 0,
      lastScrollY: 0,
    };
    this.cameraController = {
      defaultZoom: 1,
      minZoom: 1,
      maxZoom: MAX_ZOOM,
      targetZoom: 1,
      targetScrollX: 0,
      targetScrollY: 0,
      velocityX: 0,
      velocityY: 0,
      focusTarget: null,
      lastPointerX: this.scale.width / 2,
      lastPointerY: this.scale.height / 2,
    };

    this.createWorldLayers();
    this.initializePlacementGrid();
    this.computeBoardMetrics();
    this.drawBoard();
    this.drawForestRing();
    this.createHoverIndicator();
    this.createPlacementIndicator();
    this.createCamera();
    this.scale.on("resize", this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.handleResize, this);
    });
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

  handleResize() {
    if (!this.groundLayer || !this.structureLayer) {
      return;
    }

    this.computeBoardMetrics();
    this.refreshBoardVisuals();
    this.repositionPlacedBuildings();
    this.repositionWarDeployments();
    this.refreshCameraMetrics({ centerCamera: true });

    if (this.selectedPlacedBuilding) {
      this.focusCameraOnBuilding(this.selectedPlacedBuilding, { snap: true });
    }

    if (this.hoverTile) {
      const hoverPoint = this.gridToWorld(this.hoverTile.col, this.hoverTile.row);
      this.updateHoverAtWorldPoint(hoverPoint.x, hoverPoint.y);
    } else {
      this.hoverIndicator?.clear();
      this.placementIndicator?.clear();
    }
  }

  createWorldLayers() {
    this.groundLayer = this.add.layer();
    this.decorLayer = this.add.layer();
    this.ambientLayer = this.add.layer();
    this.structureLayer = this.add.layer();
    this.warUnitLayer = this.add.layer();
    this.overlayLayer = this.add.layer();
    this.groundLayer.setDepth(-40);
    this.decorLayer.setDepth(-20);
    this.ambientLayer.setDepth(-10);
    this.structureLayer.setDepth(20);
    this.warUnitLayer.setDepth(24);
    this.overlayLayer.setDepth(40);
  }

  initializePlacementGrid() {
    this.grid = Array.from(
      { length: this.iso.rows },
      () => Array.from({ length: this.iso.cols }, () => null)
    );
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
    const worldMinY = Math.min(...centeredCorners.map(({ y }) => y - halfH)) - CAMERA_WORLD_PADDING;
    const worldMaxY = Math.max(...centeredCorners.map(({ y }) => y + halfH)) + CAMERA_WORLD_PADDING;

    this.worldBounds = {
      minX: worldMinX - CAMERA_WORLD_PADDING,
      maxX: worldMaxX + CAMERA_WORLD_PADDING,
      minY: worldMinY,
      maxY: worldMaxY,
      width: worldMaxX - worldMinX + (CAMERA_WORLD_PADDING * 2),
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
    const x = Math.floor(
      (localX / (this.iso.tileWidth / 2) + localY / (this.iso.tileHeight / 2)) / 2
    );
    const y = Math.floor(
      (localY / (this.iso.tileHeight / 2) - localX / (this.iso.tileWidth / 2)) / 2
    );

    return {
      row: y,
      col: x,
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

  getTownHallLevel() {
    return this.getCommandCenter()?.level ?? 1;
  }

  getWoodMachineLimit() {
    return WOOD_MACHINE_BASE_LIMIT
      + (Math.max(1, this.getTownHallLevel()) - 1) * WOOD_MACHINE_LIMIT_PER_TOWN_HALL_LEVEL;
  }

  getEnergyMachineLimit() {
    return ENERGY_MACHINE_BASE_LIMIT
      + (Math.max(1, this.getTownHallLevel()) - 1) * ENERGY_MACHINE_LIMIT_PER_TOWN_HALL_LEVEL;
  }

  getTentLimit() {
    return TENT_BASE_LIMIT
      + (Math.max(1, this.getTownHallLevel()) - 1) * TENT_LIMIT_PER_TOWN_HALL_LEVEL;
  }

  getCommandCenterLimit() {
    return 1;
  }

  getSkyportLimit() {
    return this.getTownHallLevel() >= 2 ? 1 : 0;
  }

  getBattleTankLimit() {
    return this.getTownHallLevel() >= 2 ? 1 : 0;
  }

  getAirDefenseLimit() {
    return this.getTownHallLevel() >= 2 ? 1 : 0;
  }

  canAddBuildingType(buildingType, movingBuilding = null) {
    const typeId = buildingType?.id ?? buildingType?.buildingType?.id ?? buildingType;

    if (!typeId || movingBuilding) {
      return true;
    }

    if (typeId === "wood-machine") {
      const woodMachineCount = this.placedBuildings.filter((building) => this.isWoodMachine(building)).length;
      return woodMachineCount < this.getWoodMachineLimit();
    }

    if (typeId === "energy-machine") {
      const energyMachineCount = this.placedBuildings.filter((building) => this.isEnergyMachine(building)).length;
      return energyMachineCount < this.getEnergyMachineLimit();
    }

    if (typeId === "command-center") {
      const commandCenterCount = this.placedBuildings.filter((building) => this.isCommandCenter(building)).length;
      return commandCenterCount < this.getCommandCenterLimit();
    }

    if (typeId === "tent") {
      const tentCount = this.placedBuildings.filter((building) => building.buildingType?.id === "tent").length;
      return tentCount < this.getTentLimit();
    }

    if (typeId === "skyport") {
      const skyportCount = this.placedBuildings.filter((building) => this.isSkyport(building)).length;
      return skyportCount < this.getSkyportLimit();
    }

    if (typeId === "battle-tank") {
      const battleTankCount = this.placedBuildings.filter((building) => this.isBattleTank(building)).length;
      return battleTankCount < this.getBattleTankLimit();
    }

    if (typeId === "air-defense") {
      const airDefenseCount = this.placedBuildings.filter(
        (building) => building.buildingType?.id === "air-defense"
      ).length;
      return airDefenseCount < this.getAirDefenseLimit();
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

  isPointInsideTileDiamond(worldX, worldY, row, col) {
    if (!this.isInsideGrid(row, col)) {
      return false;
    }

    const { x, y } = this.gridToWorld(col, row);
    const diamond = new Phaser.Geom.Polygon(this.createDiamondPoints(x, y));

    return Phaser.Geom.Polygon.Contains(diamond, worldX, worldY);
  }

  getTileDistanceScore(worldX, worldY, row, col) {
    const { x, y } = this.gridToWorld(col, row);
    const halfW = this.iso.tileWidth / 2;
    const halfH = this.iso.tileHeight / 2;

    return Math.abs(worldX - x) / halfW + Math.abs(worldY - y) / halfH;
  }

  drawBoard() {
    if (this.textures.exists("base")) {
      this.cameraFitMode = "cover";
      const boardCenter = this.gridToWorld(
        (this.iso.cols - 1) / 2,
        (this.iso.rows - 1) / 2
      );
      const mapCenterY = boardCenter.y + this.iso.tileHeight * 0.85;
      const mapTextureSize = getTextureSourceSize(this, "base");
      const village = this.add.image(
        boardCenter.x,
        mapCenterY,
        "base"
      );

      village.setOrigin(0.5, 0.5);
      const coverScale = Math.max(
        (this.scale.width + MAP_COVER_BLEED) / Math.max(1, mapTextureSize.width),
        (this.scale.height + MAP_COVER_BLEED) / Math.max(1, mapTextureSize.height)
      );
      configureHdSprite(village, {
        scene: this,
        sourceWidth: mapTextureSize.width,
        sourceHeight: mapTextureSize.height,
      });
      village.setDisplaySize(
        Math.max(1, Math.round(mapTextureSize.width * coverScale)),
        Math.max(1, Math.round(mapTextureSize.height * coverScale))
      );
      village.setTint(0xf8fafc);
      village.setDepth(-50);
      this.groundLayer.add(village);
      this.cameraFitBounds = {
        minX: village.x - village.displayWidth / 2,
        maxX: village.x + village.displayWidth / 2,
        minY: village.y - village.displayHeight / 2,
        maxY: village.y + village.displayHeight / 2,
        width: village.displayWidth,
        height: village.displayHeight,
      };
      this.worldBounds = {
        minX: village.x - village.displayWidth / 2 - CAMERA_WORLD_PADDING,
        maxX: village.x + village.displayWidth / 2 + CAMERA_WORLD_PADDING,
        minY: village.y - village.displayHeight / 2 - CAMERA_WORLD_PADDING,
        maxY: village.y + village.displayHeight / 2 + CAMERA_WORLD_PADDING,
        width: village.displayWidth + (CAMERA_WORLD_PADDING * 2),
        height: village.displayHeight + (CAMERA_WORLD_PADDING * 2),
      };
      createAmbientWorldLighting(this, this.ambientLayer, {
        centerX: boardCenter.x,
        centerY: mapCenterY,
        width: this.iso.cols * this.iso.tileWidth * 1.6,
        height: this.iso.rows * this.iso.tileHeight * 2.9,
      });
      return;
    }

    this.cameraFitMode = "contain";
    this.cameraFitBounds = {
      minX: this.worldBounds.minX + CAMERA_WORLD_PADDING,
      maxX: this.worldBounds.maxX - CAMERA_WORLD_PADDING,
      minY: this.worldBounds.minY + CAMERA_WORLD_PADDING,
      maxY: this.worldBounds.maxY - CAMERA_WORLD_PADDING,
      width: Math.max(1, this.worldBounds.width - (CAMERA_WORLD_PADDING * 2)),
      height: Math.max(1, this.worldBounds.height - (CAMERA_WORLD_PADDING * 2)),
    };

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

  refreshBoardVisuals() {
    this.groundLayer?.removeAll(true);
    this.ambientLayer?.removeAll(true);
    this.drawBoard();
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
    camera.setBackgroundColor("rgba(2, 6, 23, 0)");
    camera.roundPixels = false;
    this.refreshCameraMetrics({ centerCamera: true, snapZoom: true });
  }

  repositionPlacedBuildings() {
    this.placedBuildings.forEach((building) => {
      const footprint = this.getFootprint(building.buildingType);
      const { x, y } = this.gridToWorld(
        building.col + (footprint.cols - 1) / 2,
        building.row + (footprint.rows - 1) / 2
      );

      building.setPosition(x, y);
      building.setDepth(300 + building.row + building.col + footprint.rows + footprint.cols);

      if (this.isTent(building)) {
        this.syncCommandCenterSoldiers(building);
      }
    });
  }

  repositionWarDeployments() {
    this.warDeployments?.forEach((sprite) => {
      const row = Number(sprite.deploymentRow ?? 0);
      const col = Number(sprite.deploymentCol ?? 0);
      const position = this.gridToWorld(col, row);
      sprite.setPosition(position.x, position.y);
      sprite.setDepth(460 + row + col);
    });
  }

  getCameraState() {
    const camera = this.cameras.main;

    return {
      scrollX: Number(camera.scrollX ?? 0),
      scrollY: Number(camera.scrollY ?? 0),
      zoom: Number(camera.zoom ?? this.cameraController.defaultZoom),
    };
  }

  applyCameraState(cameraState = null) {
    if (!cameraState) {
      return;
    }

    const camera = this.cameras.main;
    const minZoom = this.getMinCameraZoom();
    const zoom = Phaser.Math.Clamp(
      Number(cameraState?.zoom ?? getSixteenBySixteenViewZoom(this)) || getSixteenBySixteenViewZoom(this),
      minZoom,
      this.cameraController.maxZoom
    );

    camera.setZoom(zoom);
    const clampedScroll = this.clampCameraScroll(
      Number(cameraState.scrollX ?? camera.scrollX) || camera.scrollX,
      Number(cameraState.scrollY ?? camera.scrollY) || camera.scrollY,
      zoom
    );
    camera.scrollX = clampedScroll.scrollX;
    camera.scrollY = clampedScroll.scrollY;
    this.cameraController.targetZoom = zoom;
    this.cameraController.targetScrollX = clampedScroll.scrollX;
    this.cameraController.targetScrollY = clampedScroll.scrollY;
    this.cameraController.velocityX = 0;
    this.cameraController.velocityY = 0;
    this.cameraController.focusTarget = null;
  }

  startResourceProduction() {
    this.resourceTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        this.updateTownHallProduction();
        this.updateWoodMachineProduction();
        this.updateEnergyMachineProduction();
        this.updateBuildingUpgrades();
        this.updateCommandCenterHunger();
      },
    });
  }

  bindInput() {
    this.input.setTopOnly(true);

    this.input.on("pointermove", (pointer) => {
      this.cameraController.lastPointerX = pointer.x;
      this.cameraController.lastPointerY = pointer.y;

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
      this.pointerDrag.lastScrollX = this.cameras.main.scrollX;
      this.pointerDrag.lastScrollY = this.cameras.main.scrollY;
      this.cameraController.velocityX = 0;
      this.cameraController.velocityY = 0;
      this.cameraController.focusTarget = null;
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

        if (!this.selectedBuildingType && !this.movingBuilding) {
          const clickedBuilding = this.getTopBuildingAtWorldPoint(pointer.worldX, pointer.worldY);

          if (clickedBuilding) {
            this.selectPlacedBuilding(clickedBuilding);
            return;
          }
        }

        this.handleTileClick(pointer.worldX, pointer.worldY);
      }
    });

    this.input.on("wheel", (pointer, _objects, _deltaX, deltaY) => {
      const direction = deltaY > 0 ? -1 : 1;
      const nextZoom = Phaser.Math.Clamp(
        this.cameraController.targetZoom + direction * ZOOM_STEP,
        this.getMinCameraZoom(),
        this.cameraController.maxZoom
      );
      this.cameraController.lastPointerX = pointer.x;
      this.cameraController.lastPointerY = pointer.y;
      this.cameraController.focusTarget = null;
      this.setCameraZoomTarget(nextZoom, pointer.x, pointer.y, { snap: true });
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
    const nextScrollX =
      this.pointerDrag.cameraScrollX - (pointer.x - this.pointerDrag.startX) / camera.zoom;
    const nextScrollY =
      this.pointerDrag.cameraScrollY - (pointer.y - this.pointerDrag.startY) / camera.zoom;
    const clampedScroll = this.clampCameraScroll(nextScrollX, nextScrollY, camera.zoom);
    const deltaSeconds = Math.max(0.001, (this.game.loop.delta || 16) / 1000);

    this.cameraController.targetScrollX = clampedScroll.scrollX;
    this.cameraController.targetScrollY = clampedScroll.scrollY;
    this.cameraController.velocityX =
      (clampedScroll.scrollX - this.pointerDrag.lastScrollX) / deltaSeconds;
    this.cameraController.velocityY =
      (clampedScroll.scrollY - this.pointerDrag.lastScrollY) / deltaSeconds;

    this.pointerDrag.lastScrollX = clampedScroll.scrollX;
    this.pointerDrag.lastScrollY = clampedScroll.scrollY;
    camera.scrollX = clampedScroll.scrollX;
    camera.scrollY = clampedScroll.scrollY;
  }

  update(_time, delta) {
    this.updateCameraController(delta);
  }

  refreshCameraMetrics(options = {}) {
    const { centerCamera = false, snapZoom = false } = options;
    const camera = this.cameras.main;
    const defaultZoom = getSixteenBySixteenViewZoom(this);

    this.cameraController.defaultZoom = defaultZoom;
    this.cameraController.minZoom = defaultZoom;
    this.cameraController.maxZoom = MAX_ZOOM;
    this.cameraController.targetZoom = Phaser.Math.Clamp(
      Number(this.cameraController.targetZoom ?? defaultZoom) || defaultZoom,
      this.cameraController.minZoom,
      this.cameraController.maxZoom
    );

    camera.setBounds(
      this.worldBounds.minX,
      this.worldBounds.minY,
      this.worldBounds.width,
      this.worldBounds.height
    );

    if (centerCamera) {
      const centerTarget = this.getCameraCenterWorld();
      const centeredScroll = this.getScrollForWorldPoint(
        centerTarget.x,
        centerTarget.y,
        this.cameraController.targetZoom
      );
      this.cameraController.targetScrollX = centeredScroll.scrollX;
      this.cameraController.targetScrollY = centeredScroll.scrollY;
    }

    if (snapZoom) {
      camera.setZoom(this.cameraController.targetZoom);
    }

    const nextScroll = this.clampCameraScroll(
      Number.isFinite(this.cameraController.targetScrollX) ? this.cameraController.targetScrollX : camera.scrollX,
      Number.isFinite(this.cameraController.targetScrollY) ? this.cameraController.targetScrollY : camera.scrollY,
      this.cameraController.targetZoom
    );

    this.cameraController.targetScrollX = nextScroll.scrollX;
    this.cameraController.targetScrollY = nextScroll.scrollY;

    if (centerCamera || snapZoom) {
      camera.setScroll(nextScroll.scrollX, nextScroll.scrollY);
    }
  }

  getMinCameraZoom() {
    return this.cameraController?.minZoom ?? getSixteenBySixteenViewZoom(this);
  }

  getCameraScrollBounds(zoom = this.cameraController.targetZoom) {
    const viewportWidth = this.scale.width / zoom;
    const viewportHeight = this.scale.height / zoom;
    const insetBounds = getCameraSafeBounds(this);
    let minScrollX = insetBounds.minX - CAMERA_EXTRA_LEFT_SCROLL;
    let maxScrollX = insetBounds.maxX - viewportWidth;
    let minScrollY = insetBounds.minY;
    let maxScrollY = insetBounds.maxY - viewportHeight;

    if (maxScrollX < minScrollX) {
      const centeredX = insetBounds.minX + (insetBounds.width - viewportWidth) / 2;
      minScrollX = centeredX;
      maxScrollX = centeredX;
    }

    if (maxScrollY < minScrollY) {
      const centeredY = insetBounds.minY + (insetBounds.height - viewportHeight) / 2;
      minScrollY = centeredY;
      maxScrollY = centeredY;
    }

    return {
      minScrollX,
      maxScrollX,
      minScrollY,
      maxScrollY,
    };
  }

  clampCameraScroll(scrollX, scrollY, zoom = this.cameraController.targetZoom) {
    const bounds = this.getCameraScrollBounds(zoom);

    return {
      scrollX: Phaser.Math.Clamp(scrollX, bounds.minScrollX, bounds.maxScrollX),
      scrollY: Phaser.Math.Clamp(scrollY, bounds.minScrollY, bounds.maxScrollY),
    };
  }

  getScrollForWorldPoint(worldX, worldY, zoom = this.cameraController.targetZoom, screenX = null, screenY = null) {
    const anchorX = screenX ?? (this.scale.width / 2);
    const anchorY = screenY ?? (this.scale.height / 2);

    return this.clampCameraScroll(
      worldX - (anchorX / zoom),
      worldY - (anchorY / zoom),
      zoom
    );
  }

  getGridCenterWorld() {
    return this.gridToWorld(
      (this.iso.cols - 1) / 2,
      (this.iso.rows - 1) / 2
    );
  }

  getCameraCenterWorld() {
    if (this.cameraFitBounds) {
      return {
        x: this.cameraFitBounds.minX + (this.cameraFitBounds.width / 2),
        y: this.cameraFitBounds.minY + (this.cameraFitBounds.height / 2),
      };
    }

    return this.getGridCenterWorld();
  }

  getBuildingFocusWorldPoint(building) {
    if (!building) {
      return this.getCameraCenterWorld();
    }

    const footprint = this.getFootprint(building.buildingType);
    return this.gridToWorld(
      building.col + (footprint.cols - 1) / 2,
      building.row + (footprint.rows - 1) / 2
    );
  }

  getWorldPointForCameraState(screenX, screenY, scrollX, scrollY, zoom) {
    return {
      x: scrollX + (screenX / zoom),
      y: scrollY + (screenY / zoom),
    };
  }

  setCameraZoomTarget(nextZoom, screenX = null, screenY = null, options = {}) {
    const camera = this.cameras.main;
    const { snap = false } = options;
    const zoom = Phaser.Math.Clamp(nextZoom, this.getMinCameraZoom(), this.cameraController.maxZoom);
    const anchorX = screenX ?? this.scale.width / 2;
    const anchorY = screenY ?? this.scale.height / 2;
    const baseZoom = Number(this.cameraController.targetZoom ?? camera.zoom) || camera.zoom;
    const baseScrollX = Number.isFinite(this.cameraController.targetScrollX)
      ? this.cameraController.targetScrollX
      : camera.scrollX;
    const baseScrollY = Number.isFinite(this.cameraController.targetScrollY)
      ? this.cameraController.targetScrollY
      : camera.scrollY;
    const pointerWorld = this.getWorldPointForCameraState(
      anchorX,
      anchorY,
      baseScrollX,
      baseScrollY,
      baseZoom
    );
    const nextScroll = this.getScrollForWorldPoint(pointerWorld.x, pointerWorld.y, zoom, anchorX, anchorY);

    this.cameraController.targetZoom = zoom;
    this.cameraController.targetScrollX = nextScroll.scrollX;
    this.cameraController.targetScrollY = nextScroll.scrollY;

    if (snap) {
      camera.setZoom(zoom);
      camera.setScroll(nextScroll.scrollX, nextScroll.scrollY);
      this.cameraController.velocityX = 0;
      this.cameraController.velocityY = 0;
    }
  }

  getEdgeScrollVelocity() {
    if (!this.pointerDrag?.active) {
      return { x: 0, y: 0 };
    }

    const { lastPointerX, lastPointerY } = this.cameraController;

    if (
      lastPointerX < 0
      || lastPointerY < 0
      || lastPointerX > this.scale.width
      || lastPointerY > this.scale.height
    ) {
      return { x: 0, y: 0 };
    }

    const leftAmount = Phaser.Math.Clamp((CAMERA_EDGE_SCROLL_MARGIN - lastPointerX) / CAMERA_EDGE_SCROLL_MARGIN, 0, 1);
    const rightAmount = Phaser.Math.Clamp((lastPointerX - (this.scale.width - CAMERA_EDGE_SCROLL_MARGIN)) / CAMERA_EDGE_SCROLL_MARGIN, 0, 1);
    const topAmount = Phaser.Math.Clamp((CAMERA_EDGE_SCROLL_MARGIN - lastPointerY) / CAMERA_EDGE_SCROLL_MARGIN, 0, 1);
    const bottomAmount = Phaser.Math.Clamp((lastPointerY - (this.scale.height - CAMERA_EDGE_SCROLL_MARGIN)) / CAMERA_EDGE_SCROLL_MARGIN, 0, 1);
    const zoomFactor = 1 / Math.max(this.cameras.main.zoom, 0.001);

    return {
      x: (rightAmount - leftAmount) * CAMERA_EDGE_SCROLL_SPEED * zoomFactor,
      y: (bottomAmount - topAmount) * CAMERA_EDGE_SCROLL_SPEED * zoomFactor,
    };
  }

  updateCameraController(delta) {
    const camera = this.cameras.main;

    if (!camera || !this.cameraController) {
      return;
    }

    const deltaMs = Math.max(1, Math.min(80, Number(delta) || 16));
    const isFocusTransition = Boolean(this.cameraController.focusTarget) && !this.pointerDrag.active;
    const deltaSeconds = Math.max(0.001, Math.min(0.05, (delta || 16) / 1000));
    const zoomLerpSpeed = isFocusTransition ? CAMERA_FOCUS_ZOOM_LERP : CAMERA_ZOOM_LERP;
    const scrollLerpSpeed = isFocusTransition ? CAMERA_FOCUS_SCROLL_LERP : CAMERA_SCROLL_LERP;
    const zoomLerp = 1 - Math.exp(-zoomLerpSpeed * deltaSeconds);
    const scrollLerp = 1 - Math.exp(-scrollLerpSpeed * deltaSeconds);
    const damping = Math.exp(-CAMERA_INERTIA_DAMPING * deltaSeconds);

    this.cameraController.targetZoom = Phaser.Math.Clamp(
      this.cameraController.targetZoom,
      this.getMinCameraZoom(),
      this.cameraController.maxZoom
    );

    if (this.cameraController.focusTarget && !this.pointerDrag.active) {
      const focusTarget = this.cameraController.focusTarget;
      this.cameraController.targetZoom = Phaser.Math.Clamp(
        focusTarget.zoom ?? this.cameraController.defaultZoom,
        this.getMinCameraZoom(),
        this.cameraController.maxZoom
      );

      const focusedScroll = this.getScrollForWorldPoint(
        focusTarget.x,
        focusTarget.y,
        this.cameraController.targetZoom
      );

      const transitionDurationMs = Math.max(
        0,
        Number(focusTarget.transitionDurationMs ?? 0) || 0
      );

      if (transitionDurationMs > 0) {
        focusTarget.transitionElapsedMs = Math.min(
          transitionDurationMs,
          (Number(focusTarget.transitionElapsedMs ?? 0) || 0) + deltaMs
        );
        const transitionT = Phaser.Math.Clamp(
          focusTarget.transitionElapsedMs / transitionDurationMs,
          0,
          1
        );
        const easedT = Phaser.Math.Easing.Sine.InOut(transitionT);
        const interpolatedZoom = Phaser.Math.Linear(
          Number(focusTarget.startZoom ?? camera.zoom) || camera.zoom,
          this.cameraController.targetZoom,
          easedT
        );
        const interpolatedScrollX = Phaser.Math.Linear(
          Number(focusTarget.startScrollX ?? camera.scrollX) || camera.scrollX,
          focusedScroll.scrollX,
          easedT
        );
        const interpolatedScrollY = Phaser.Math.Linear(
          Number(focusTarget.startScrollY ?? camera.scrollY) || camera.scrollY,
          focusedScroll.scrollY,
          easedT
        );
        const clampedInterpolated = this.clampCameraScroll(
          interpolatedScrollX,
          interpolatedScrollY,
          interpolatedZoom
        );

        this.cameraController.targetZoom = interpolatedZoom;
        this.cameraController.targetScrollX = clampedInterpolated.scrollX;
        this.cameraController.targetScrollY = clampedInterpolated.scrollY;
        this.cameraController.velocityX = 0;
        this.cameraController.velocityY = 0;

        camera.setZoom(interpolatedZoom);
        camera.scrollX = clampedInterpolated.scrollX;
        camera.scrollY = clampedInterpolated.scrollY;

        if (transitionT >= 1) {
          focusTarget.transitionDurationMs = 0;
          focusTarget.transitionElapsedMs = 0;
          focusTarget.startZoom = this.cameraController.targetZoom;
          focusTarget.startScrollX = this.cameraController.targetScrollX;
          focusTarget.startScrollY = this.cameraController.targetScrollY;
        }

        return;
      }

      this.cameraController.targetScrollX = focusedScroll.scrollX;
      this.cameraController.targetScrollY = focusedScroll.scrollY;
      this.cameraController.velocityX = 0;
      this.cameraController.velocityY = 0;
    } else if (!this.pointerDrag.active) {
      const edgeVelocity = this.getEdgeScrollVelocity();

      if (edgeVelocity.x !== 0 || edgeVelocity.y !== 0) {
        this.cameraController.focusTarget = null;
        this.cameraController.velocityX = edgeVelocity.x;
        this.cameraController.velocityY = edgeVelocity.y;
      }

      this.cameraController.targetScrollX += this.cameraController.velocityX * deltaSeconds;
      this.cameraController.targetScrollY += this.cameraController.velocityY * deltaSeconds;
      this.cameraController.velocityX *= damping;
      this.cameraController.velocityY *= damping;

      if (Math.abs(this.cameraController.velocityX) < 4) {
        this.cameraController.velocityX = 0;
      }

      if (Math.abs(this.cameraController.velocityY) < 4) {
        this.cameraController.velocityY = 0;
      }
    }

    const clampedTarget = this.clampCameraScroll(
      this.cameraController.targetScrollX,
      this.cameraController.targetScrollY,
      this.cameraController.targetZoom
    );

    this.cameraController.targetScrollX = clampedTarget.scrollX;
    this.cameraController.targetScrollY = clampedTarget.scrollY;

    camera.setZoom(Phaser.Math.Linear(camera.zoom, this.cameraController.targetZoom, zoomLerp));
    camera.scrollX = Phaser.Math.Linear(camera.scrollX, this.cameraController.targetScrollX, scrollLerp);
    camera.scrollY = Phaser.Math.Linear(camera.scrollY, this.cameraController.targetScrollY, scrollLerp);

    const clampedCamera = this.clampCameraScroll(camera.scrollX, camera.scrollY, camera.zoom);
    camera.scrollX = clampedCamera.scrollX;
    camera.scrollY = clampedCamera.scrollY;
  }

  focusCameraOnBuilding(building, options = {}) {
    if (!building) {
      return;
    }

    const { snap = false } = options;
    const focusPoint = this.getBuildingFocusWorldPoint(building);
    const camera = this.cameras.main;
    const transitionDurationMs = snap
      ? 0
      : Math.max(
        0,
        Number(options.transitionDurationMs ?? CAMERA_FOCUS_TRANSITION_MS) || CAMERA_FOCUS_TRANSITION_MS
      );
    const currentZoomTarget = Phaser.Math.Clamp(
      Number(this.cameraController.targetZoom ?? this.cameras.main.zoom ?? this.cameraController.defaultZoom)
        || this.cameraController.defaultZoom,
      this.getMinCameraZoom(),
      this.cameraController.maxZoom
    );
    const targetZoom = Phaser.Math.Clamp(
      Math.max(currentZoomTarget, this.cameraController.defaultZoom + 0.08),
      this.getMinCameraZoom(),
      this.cameraController.maxZoom
    );

    const currentZoom = Phaser.Math.Clamp(
      Number(camera.zoom ?? currentZoomTarget) || currentZoomTarget,
      this.getMinCameraZoom(),
      this.cameraController.maxZoom
    );
    const currentScroll = this.clampCameraScroll(
      Number(camera.scrollX ?? this.cameraController.targetScrollX) || this.cameraController.targetScrollX,
      Number(camera.scrollY ?? this.cameraController.targetScrollY) || this.cameraController.targetScrollY,
      currentZoom
    );

    this.cameraController.focusTarget = {
      x: focusPoint.x,
      y: focusPoint.y - CAMERA_FOCUS_OFFSET_Y,
      zoom: targetZoom,
      startZoom: currentZoom,
      startScrollX: currentScroll.scrollX,
      startScrollY: currentScroll.scrollY,
      transitionDurationMs,
      transitionElapsedMs: 0,
    };
    this.cameraController.velocityX = 0;
    this.cameraController.velocityY = 0;

    if (snap) {
      this.cameraController.targetZoom = targetZoom;
      const focusedScroll = this.getScrollForWorldPoint(
        this.cameraController.focusTarget.x,
        this.cameraController.focusTarget.y,
        targetZoom
      );
      this.cameraController.targetScrollX = focusedScroll.scrollX;
      this.cameraController.targetScrollY = focusedScroll.scrollY;
      this.cameras.main.setZoom(targetZoom);
      this.cameras.main.setScroll(focusedScroll.scrollX, focusedScroll.scrollY);
    }
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
        || !this.canAddBuildingType(this.selectedBuildingType, this.movingBuilding)
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
    const baseTile = this.worldToGrid(worldX, worldY);
    const candidates = [];

    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
        const row = baseTile.row + rowOffset;
        const col = baseTile.col + colOffset;

        if (!this.isInsideGrid(row, col)) {
          continue;
        }

        candidates.push({
          row,
          col,
          containsPoint: this.isPointInsideTileDiamond(worldX, worldY, row, col),
          distanceScore: this.getTileDistanceScore(worldX, worldY, row, col),
        });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((left, right) => {
      if (left.containsPoint !== right.containsPoint) {
        return left.containsPoint ? -1 : 1;
      }

      if (left.distanceScore !== right.distanceScore) {
        return left.distanceScore - right.distanceScore;
      }

      return (left.row + left.col) - (right.row + right.col);
    });

    const bestTile = candidates[0];

    return {
      row: bestTile.row,
      col: bestTile.col,
    };
  }

  getBuildingsOccupyingTile(row, col) {
    return this.placedBuildings.filter((building) => {
      if (!building?.active || building.visible === false) {
        return false;
      }

      const footprint = this.getFootprint(building.buildingType);

      return (
        row >= building.row
        && row < building.row + footprint.rows
        && col >= building.col
        && col < building.col + footprint.cols
      );
    });
  }

  isPointInsideBuildingSelectionBounds(building, worldX, worldY) {
    if (!building) {
      return false;
    }

    const footprint = this.getFootprint(building.buildingType);
    const hitWidth = this.iso.tileWidth * footprint.cols;
    const hitHeight = this.iso.tileHeight * footprint.rows;
    const minX = building.x - hitWidth / 2;
    const maxX = building.x + hitWidth / 2;
    const minY = building.y - hitHeight;
    const maxY = building.y + this.iso.tileHeight * 0.35;

    return worldX >= minX && worldX <= maxX && worldY >= minY && worldY <= maxY;
  }

  getTopBuildingAtWorldPoint(worldX, worldY) {
    const tile = this.getNearestTile(worldX, worldY);

    if (!tile) {
      return null;
    }

    const candidates = this.getBuildingsOccupyingTile(tile.row, tile.col)
      .sort((left, right) => {
        const depthDelta = (right.depth ?? (right.col + right.row)) - (left.depth ?? (left.col + left.row));

        if (depthDelta !== 0) {
          return depthDelta;
        }

        return Phaser.Math.Distance.Between(worldX, worldY, left.x, left.y)
          - Phaser.Math.Distance.Between(worldX, worldY, right.x, right.y);
      });

    if (candidates.length === 0) {
      return null;
    }

    const boundedCandidate = candidates.find((building) =>
      this.isPointInsideBuildingSelectionBounds(building, worldX, worldY)
    );
    const selectedBuilding = boundedCandidate ?? candidates[0];

    if (BUILDING_SELECTION_DEBUG) {
      console.debug("Building selection", {
        gridRow: tile.row,
        gridCol: tile.col,
        selectedBuildingId: selectedBuilding?.persistedId ?? null,
        selectedBuildingType: selectedBuilding?.buildingType?.id ?? null,
      });
    }

    return selectedBuilding;
  }

  isTileOccupied(row, col, buildingType = null, ignoredBuilding = null) {
    const footprint = this.getFootprint(buildingType);

    for (let rowOffset = 0; rowOffset < footprint.rows; rowOffset += 1) {
      for (let colOffset = 0; colOffset < footprint.cols; colOffset += 1) {
        const occupiedBuilding = this.grid?.[row + rowOffset]?.[col + colOffset]
          ?? this.occupiedTiles.get(this.getTileKey(row + rowOffset, col + colOffset));

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
      !this.canAddBuildingType(this.selectedBuildingType, this.movingBuilding) ||
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
      ignoreBuildLimit = false,
      animatePlacement = true,
    } = options;

    if (!ignoreBuildLimit && !this.canAddBuildingType(buildingType)) {
      return null;
    }

    const footprint = this.getFootprint(buildingType);
    const { x, y } = this.gridToWorld(
      col + (footprint.cols - 1) / 2,
      row + (footprint.rows - 1) / 2
    );
    const building = new Building(this, x, y, buildingType, {
      animatePlacement,
    });

    building.row = row;
    building.col = col;
    building.persistedId = persistedId;
    building.machineGold = Number(resourceState.machineGold ?? 0);
    building.lastGeneratedAt = Number(resourceState.lastGeneratedAt ?? Date.now());
    building.soldierCount = Math.max(0, Number(resourceState.soldierCount ?? 0) || 0);
    building.isSleeping = Boolean(resourceState.isSleeping ?? false);
    building.lastWagePaidAt = Number(resourceState.lastWagePaidAt ?? Date.now());
    building.lastFedAt = Number(resourceState.lastFedAt ?? Date.now());
    building.hasChopper = Boolean(resourceState.hasChopper ?? false);
    building.hasTank = Boolean(resourceState.hasTank ?? false);
    building.tankShotsRemaining = clampStoredShots(
      resourceState.tankShotsRemaining,
      TANK_MAX_SHOTS,
      building.hasTank
    );
    building.chopperShotsRemaining = clampStoredShots(
      resourceState.chopperShotsRemaining,
      HELICOPTER_MAX_SHOTS,
      building.hasChopper
    );
    building.setLevel(Number(resourceState.level ?? 1));
    building.setUpgradeState(
      Boolean(resourceState.isUpgrading),
      resourceState.upgradeCompleteAt ?? null
    );
    building.setSkyportState?.(building.hasChopper);
    building.setBattleTankState?.(building.hasTank);
    building.setSleepState?.(building.isSleeping);
    building.setMachineGoldDisplay(
      building.machineGold,
      this.getBuildingMaxGold(building)
    );
    building.setDepth(300 + row + col + footprint.rows + footprint.cols);

    if (this.isWarMode) {
      building.disableInteractive();
    }

    this.structureLayer.add(building);
    this.placedBuildings.push(building);

    if (this.isTent(building)) {
      this.syncCommandCenterSoldiers(building);
    }

    this.setBuildingTiles(building, true);

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

    return building;
  }

  loadPersistedBuildings(buildings = []) {
    const hasSavedCommandCenter = buildings.some((entry) => {
      const typeId = String(entry?.type ?? "");
      return typeId === "command-center";
    });

    buildings.forEach((entry) => {
      const row = Number(entry.row ?? entry.y ?? 0);
      const col = Number(entry.col ?? entry.x ?? 0);
      const normalizedTypeId = entry?.type === "town-hall"
        ? (hasSavedCommandCenter ? null : "command-center")
        : entry?.type;
      const buildingType =
        normalizedTypeId == null
          ? null
          : typeof normalizedTypeId === "string"
            ? BUILDING_LIST.find((item) => item.id === normalizedTypeId)
            : normalizedTypeId;

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
        ignoreBuildLimit: true,
        animatePlacement: false,
        resourceState: {
          level: entry.level ?? 1,
          isUpgrading: entry.isUpgrading ?? false,
          upgradeCompleteAt: entry.upgradeCompleteAt ?? null,
          machineGold: entry.machineGold ?? 0,
          lastGeneratedAt: entry.lastGeneratedAt ?? Date.now(),
          soldierCount: entry.soldierCount ?? 0,
          isSleeping: entry.isSleeping ?? false,
          lastWagePaidAt: entry.lastWagePaidAt ?? Date.now(),
          lastFedAt: entry.lastFedAt ?? Date.now(),
          hasChopper: entry.hasChopper ?? false,
          hasTank: entry.hasTank ?? false,
          tankShotsRemaining: entry.tankShotsRemaining,
          chopperShotsRemaining: entry.chopperShotsRemaining,
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
    this.initializePlacementGrid();
    this.occupiedTiles?.clear();
  }

  getTownHall() {
    return this.getCommandCenter();
  }

  getCommandCenter() {
    return this.placedBuildings.find((building) => this.isCommandCenter(building)) ?? null;
  }

  ensureTownHall(options = {}) {
    return this.ensureCommandCenter(options);
  }

  ensureCommandCenter(options = {}) {
    const { emitPlacedEvent = false } = options;
    const existingCommandCenter = this.getCommandCenter();

    if (existingCommandCenter) {
      return existingCommandCenter;
    }

    const commandCenterType = BUILDING_LIST.find((item) => item.id === "command-center");

    if (!commandCenterType) {
      return null;
    }

    const fallbackSpots = [
      { row: 4, col: 7 },
      { row: 6, col: 7 },
      { row: 7, col: 4 },
      { row: 3, col: 7 },
      { row: 7, col: 6 },
    ];

    const targetSpot = fallbackSpots.find(
      ({ row, col }) =>
        this.canPlaceFootprint(row, col, commandCenterType)
        && !this.isTileOccupied(row, col, commandCenterType)
    );

    if (!targetSpot) {
      return null;
    }

    this.placeBuilding(targetSpot.row, targetSpot.col, commandCenterType, {
      deductCost: false,
      emitPlacedEvent,
      ignoreBuildLimit: true,
    });

    return this.getCommandCenter();
  }

  ensureTent(options = {}) {
    const { emitPlacedEvent = false } = options;
    const existingTent = this.placedBuildings.find((building) => this.isTent(building));

    if (existingTent) {
      return existingTent;
    }

    const tentType = BUILDING_LIST.find((item) => item.id === "tent");

    if (!tentType) {
      return null;
    }

    const fallbackSpots = [
      { row: 6, col: 9 },
      { row: 7, col: 8 },
      { row: 5, col: 9 },
      { row: 8, col: 7 },
    ];

    const targetSpot = fallbackSpots.find(
      ({ row, col }) =>
        this.canPlaceFootprint(row, col, tentType)
        && !this.isTileOccupied(row, col, tentType)
    );

    if (!targetSpot) {
      return null;
    }

    return this.placeBuilding(targetSpot.row, targetSpot.col, tentType, {
      deductCost: false,
      emitPlacedEvent,
      ignoreBuildLimit: true,
    });
  }

  ensureWoodMachine(options = {}) {
    const { emitPlacedEvent = false } = options;
    const existingWoodMachine = this.placedBuildings.find((building) => this.isWoodMachine(building));

    if (existingWoodMachine) {
      return existingWoodMachine;
    }

    const woodMachineType = BUILDING_LIST.find((item) => item.id === "wood-machine");

    if (!woodMachineType) {
      return null;
    }

    const fallbackSpots = [
      { row: 6, col: 5 },
      { row: 7, col: 5 },
      { row: 5, col: 5 },
      { row: 8, col: 5 },
    ];

    const targetSpot = fallbackSpots.find(
      ({ row, col }) =>
        this.canPlaceFootprint(row, col, woodMachineType)
        && !this.isTileOccupied(row, col, woodMachineType)
    );

    if (!targetSpot) {
      return null;
    }

    return this.placeBuilding(targetSpot.row, targetSpot.col, woodMachineType, {
      deductCost: false,
      emitPlacedEvent,
      ignoreBuildLimit: true,
    });
  }

  initializeFromSnapshot({
    gold = this.gold,
    energy = this.energy,
    buildings = [],
    camera = null,
  } = {}) {
    this.clearPlacedBuildings();
    this.setGoldState(gold, { emitChangeEvent: false });
    this.setEnergyState(energy, { emitChangeEvent: false });
    this.loadPersistedBuildings(buildings);
    this.ensureTownHall({ emitPlacedEvent: false });
    this.ensureCommandCenter({ emitPlacedEvent: false });
    this.ensureTent({ emitPlacedEvent: false });
    this.ensureWoodMachine({ emitPlacedEvent: false });
    this.applyCameraState(camera);
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
        configureHdSprite(sprite, {
          scene: this,
          maxWidth: 18,
          maxHeight: 28,
        });
        sprite.deploymentRow = Number(deployment.row ?? 0);
        sprite.deploymentCol = Number(deployment.col ?? 0);
        sprite.setDepth(460 + Number(deployment.row ?? 0) + Number(deployment.col ?? 0));
        this.warUnitLayer.add(sprite);
        this.warDeployments.set(deploymentId, sprite);
        return;
      }

      existingSprite.setPosition(position.x, position.y);
      existingSprite.setTexture(textureKey);
      configureHdSprite(existingSprite, {
        scene: this,
        maxWidth: 18,
        maxHeight: 28,
      });
      existingSprite.deploymentRow = Number(deployment.row ?? 0);
      existingSprite.deploymentCol = Number(deployment.col ?? 0);
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
      energy: this.energy,
      camera: this.getCameraState(),
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
        isSleeping: building.isSleeping ?? false,
        lastWagePaidAt: building.lastWagePaidAt ?? Date.now(),
        lastFedAt: building.lastFedAt ?? Date.now(),
        hasChopper: building.hasChopper ?? false,
        hasTank: building.hasTank ?? false,
        tankShotsRemaining: this.isBattleTank(building)
          ? clampStoredShots(building.tankShotsRemaining, TANK_MAX_SHOTS, building.hasTank)
          : 0,
        chopperShotsRemaining: this.isSkyport(building)
          ? clampStoredShots(building.chopperShotsRemaining, HELICOPTER_MAX_SHOTS, building.hasChopper)
          : 0,
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
    const energyMachines = this.placedBuildings.filter((building) =>
      this.isEnergyMachine(building)
    );
    const fullWoodMachines = woodMachines.filter(
      (building) => (building.machineGold ?? 0) >= this.getBuildingMaxGold(building)
    ).length;
    const tents = this.placedBuildings.filter((building) => building.buildingType?.id === "tent").length;
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
    const totalTanks = this.placedBuildings.filter((building) =>
      this.isBattleTank(building) && building.hasTank
    ).length;
    const battleTankBuildings = this.placedBuildings.filter((building) =>
      this.isBattleTank(building)
    ).length;
    const commandCenters = this.placedBuildings.filter((building) =>
      this.isCommandCenter(building)
    ).length;
    const totalHelicopters = this.placedBuildings.filter((building) =>
      this.isSkyport(building) && building.hasChopper
    ).length;
    const skyports = this.placedBuildings.filter((building) =>
      this.isSkyport(building)
    ).length;
    const airDefenseBuildings = this.placedBuildings.filter((building) =>
      building.buildingType?.id === "air-defense"
    ).length;

    this.events.emit("game-state-update", {
      gold: this.gold,
      energy: this.energy,
      buildings: this.placedBuildings.length,
      totalMachineGold,
      totalMachineCapacity,
      totalSoldiers,
      totalTanks,
      totalHelicopters,
      totalArmyUnits: totalSoldiers + totalTanks + totalHelicopters,
      commandCenters,
      commandCenterLimit: this.getCommandCenterLimit(),
      battleTankBuildings,
      battleTankLimit: this.getBattleTankLimit(),
      skyports,
      skyportLimit: this.getSkyportLimit(),
      airDefenseBuildings,
      airDefenseLimit: this.getAirDefenseLimit(),
      woodMachines: woodMachines.length,
      energyMachines: energyMachines.length,
      tents,
      fullWoodMachines,
      townHallLevel: this.getTownHallLevel(),
      townHallCount: this.getTownHall() ? 1 : 0,
      woodMachineLimit: this.getWoodMachineLimit(),
      energyMachineLimit: this.getEnergyMachineLimit(),
      tentLimit: this.getTentLimit(),
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

  setEnergyState(nextEnergy, options = {}) {
    const { emitChangeEvent = true } = options;
    this.energy = Math.max(0, Math.floor(nextEnergy));
    this.emitGameState();

    if (emitChangeEvent) {
      this.events.emit("energy-changed", {
        energy: this.energy,
      });
    }
  }

  setBuildingTiles(building, register = true) {
    const footprint = this.getFootprint(building.buildingType);

    for (let rowOffset = 0; rowOffset < footprint.rows; rowOffset += 1) {
      for (let colOffset = 0; colOffset < footprint.cols; colOffset += 1) {
        const targetRow = building.row + rowOffset;
        const targetCol = building.col + colOffset;
        const tileKey = this.getTileKey(targetRow, targetCol);

        if (register) {
          if (this.grid?.[targetRow]) {
            this.grid[targetRow][targetCol] = building;
          }
          this.occupiedTiles.set(tileKey, building);
        } else {
          if (this.grid?.[targetRow]?.[targetCol] === building) {
            this.grid[targetRow][targetCol] = null;
          }

          if (this.occupiedTiles.get(tileKey) === building) {
            this.occupiedTiles.delete(tileKey);
          }
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

  isTent(buildingOrType) {
    const typeId = typeof buildingOrType === "string"
      ? buildingOrType
      : buildingOrType?.buildingType?.id ?? buildingOrType?.id;

    return typeId === "tent";
  }

  isTownHall(buildingOrType) {
    const typeId = typeof buildingOrType === "string"
      ? buildingOrType
      : buildingOrType?.buildingType?.id ?? buildingOrType?.id;

    return typeId === "town-hall" || typeId === "command-center";
  }

  isBattleTank(buildingOrType) {
    const typeId = typeof buildingOrType === "string"
      ? buildingOrType
      : buildingOrType?.buildingType?.id ?? buildingOrType?.id;

    return typeId === "battle-tank";
  }

  getCommandCenterSoldierLimit(building) {
    if (!this.isTent(building)) {
      return 0;
    }

    const level = Math.max(1, Number(building?.level ?? 1) || 1);
    return COMMAND_CENTER_BASE_SOLDIER_LIMIT + ((level - 1) * COMMAND_CENTER_SOLDIER_LIMIT_PER_LEVEL);
  }

  getBuildingUpgradeCap(building) {
    if (!building) {
      return 0;
    }

    if (this.isTownHall(building)) {
      return BUILDING_MAX_LEVEL;
    }

    return Math.min(BUILDING_MAX_LEVEL, this.getTownHallLevel());
  }

  getNextCommandCenterWageAt(building) {
    if (!this.isTent(building) || (building?.soldierCount ?? 0) <= 0) {
      return null;
    }

    return Number(building?.lastFedAt ?? Date.now()) + SOLDIER_STARVATION_MS;
  }

  isCommandCenterHungry(building) {
    if (!this.isTent(building) || (building?.soldierCount ?? 0) <= 0) {
      return false;
    }

    const lastFedAt = Number(building?.lastFedAt ?? Date.now());
    return Date.now() - lastFedAt >= SOLDIER_HUNGER_WARNING_MS;
  }

  getSoldiersForCommandCenter(commandCenter) {
    return this.soldierUnits.filter((unit) => unit.commandCenter === commandCenter);
  }

  getTentBuildings() {
    return this.placedBuildings.filter((building) => this.isTent(building));
  }

  getTotalTentSoldiers() {
    return this.getTentBuildings().reduce(
      (total, building) => total + Math.max(0, Number(building?.soldierCount ?? 0) || 0),
      0
    );
  }

  getTotalTentCapacity() {
    return this.getTentBuildings().reduce(
      (total, building) => total + this.getCommandCenterSoldierLimit(building),
      0
    );
  }

  areAllTentSoldiersSleeping() {
    const occupiedTents = this.getTentBuildings().filter((building) => (building?.soldierCount ?? 0) > 0);

    if (occupiedTents.length === 0) {
      return false;
    }

    return occupiedTents.every((building) => building.isSleeping === true);
  }

  isAnyTentHungry() {
    return this.getTentBuildings().some((building) => this.isCommandCenterHungry(building));
  }

  getNextTentWageAt() {
    const wageTimes = this.getTentBuildings()
      .map((building) => this.getNextCommandCenterWageAt(building))
      .filter((value) => Number.isFinite(value));

    if (!wageTimes.length) {
      return null;
    }

    return Math.min(...wageTimes);
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
        const occupied = this.grid?.[row]?.[col]
          ?? this.occupiedTiles.get(this.getTileKey(row, col));
        return !occupied || occupied === commandCenter;
      });

    if (candidates.length === 0) {
      return this.getSoldierHomePoint(commandCenter, index);
    }

    const choice = Phaser.Utils.Array.GetRandom(candidates);
    return this.gridToWorld(choice.col, choice.row);
  }

  syncCommandCenterSoldiers(commandCenter) {
    if (!this.isTent(commandCenter)) {
      return;
    }

    const desiredCount = Math.max(0, Number(commandCenter.soldierCount ?? 0) || 0);
    const visibleCount = commandCenter.isSleeping ? 0 : desiredCount;
    const currentUnits = this.getSoldiersForCommandCenter(commandCenter);

    while (currentUnits.length > visibleCount) {
      const unit = currentUnits.pop();
      this.soldierUnits = this.soldierUnits.filter((entry) => entry !== unit);
      unit?.destroy();
    }

    while (currentUnits.length < visibleCount) {
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
    const maxHp = this.getStructureMaxHealth(building);
    const currentHp = Math.max(
      0,
      Number(building.currentHealth ?? building.health ?? maxHp) || maxHp
    );
    const isMainBase = this.isCommandCenter(building);
    const soldierCount = isMainBase
      ? this.getTotalTentSoldiers()
      : (building.soldierCount ?? 0);
    const maxSoldiers = isMainBase
      ? this.getTotalTentCapacity()
      : this.getCommandCenterSoldierLimit(building);
    const isSleeping = isMainBase
      ? this.areAllTentSoldiersSleeping()
      : Boolean(building.isSleeping ?? false);
    const nextWageAt = isMainBase
      ? this.getNextTentWageAt()
      : this.getNextCommandCenterWageAt(building);
    const isHungry = isMainBase
      ? this.isAnyTentHungry()
      : this.isCommandCenterHungry(building);
    const tankShotsRemaining = this.isBattleTank(building)
      ? clampStoredShots(building.tankShotsRemaining, TANK_MAX_SHOTS, building.hasTank)
      : 0;
    const chopperShotsRemaining = this.isSkyport(building)
      ? clampStoredShots(building.chopperShotsRemaining, HELICOPTER_MAX_SHOTS, building.hasChopper)
      : 0;

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
      soldierCount,
      isSleeping,
      maxSoldiers,
      nextWageAt,
      isHungry,
      hasTank: building.hasTank ?? false,
      tankCost: this.isBattleTank(building) ? BATTLE_TANK_PURCHASE_COST : 0,
      tankRechargeCost: this.isBattleTank(building) ? TANK_RECHARGE_ENERGY_COST : 0,
      tankShotsRemaining,
      tankMaxShots: this.isBattleTank(building) ? TANK_MAX_SHOTS : 0,
      tankChargePercent: this.isBattleTank(building) && TANK_MAX_SHOTS > 0
        ? Math.round((tankShotsRemaining / TANK_MAX_SHOTS) * 100)
        : 0,
      tankHealth: this.isBattleTank(building) ? this.getBattleTankStats(building).health : 0,
      tankDamage: this.isBattleTank(building) ? this.getBattleTankStats(building).damage : 0,
      hasChopper: building.hasChopper ?? false,
      chopperCost: this.getSkyportChopperCost(building),
      chopperRechargeCost: this.isSkyport(building) ? HELICOPTER_RECHARGE_ENERGY_COST : 0,
      chopperShotsRemaining,
      chopperMaxShots: this.isSkyport(building) ? HELICOPTER_MAX_SHOTS : 0,
      chopperChargePercent: this.isSkyport(building) && HELICOPTER_MAX_SHOTS > 0
        ? Math.round((chopperShotsRemaining / HELICOPTER_MAX_SHOTS) * 100)
        : 0,
      chopperSellValue: this.isSkyport(building) ? SKYPORT_CHOPPER_SELL_VALUE : 0,
      currentHp,
      maxHp,
      hpPercent: maxHp > 0 ? Math.round((currentHp / maxHp) * 100) : 0,
    };
  }

  getBuildingPersistenceState(building) {
    const tankShotsRemaining = this.isBattleTank(building)
      ? clampStoredShots(building.tankShotsRemaining, TANK_MAX_SHOTS, building.hasTank)
      : 0;
    const chopperShotsRemaining = this.isSkyport(building)
      ? clampStoredShots(building.chopperShotsRemaining, HELICOPTER_MAX_SHOTS, building.hasChopper)
      : 0;

    return {
      level: building.level ?? 1,
      isUpgrading: building.isUpgrading ?? false,
      upgradeCompleteAt: building.upgradeCompleteAt ?? null,
      machineGold: building.machineGold ?? 0,
      maxGold: this.getBuildingMaxGold(building),
      lastGeneratedAt: building.lastGeneratedAt ?? Date.now(),
      soldierCount: building.soldierCount ?? 0,
      isSleeping: building.isSleeping ?? false,
      maxSoldiers: this.getCommandCenterSoldierLimit(building),
      lastWagePaidAt: building.lastWagePaidAt ?? Date.now(),
      lastFedAt: building.lastFedAt ?? Date.now(),
      nextWageAt: this.getNextCommandCenterWageAt(building),
      isHungry: this.isCommandCenterHungry(building),
      hasTank: building.hasTank ?? false,
      tankCost: this.isBattleTank(building) ? BATTLE_TANK_PURCHASE_COST : 0,
      tankRechargeCost: this.isBattleTank(building) ? TANK_RECHARGE_ENERGY_COST : 0,
      tankShotsRemaining,
      tankMaxShots: this.isBattleTank(building) ? TANK_MAX_SHOTS : 0,
      tankChargePercent: this.isBattleTank(building) && TANK_MAX_SHOTS > 0
        ? Math.round((tankShotsRemaining / TANK_MAX_SHOTS) * 100)
        : 0,
      tankHealth: this.isBattleTank(building) ? this.getBattleTankStats(building).health : 0,
      tankDamage: this.isBattleTank(building) ? this.getBattleTankStats(building).damage : 0,
      hasChopper: building.hasChopper ?? false,
      chopperCost: this.getSkyportChopperCost(building),
      chopperRechargeCost: this.isSkyport(building) ? HELICOPTER_RECHARGE_ENERGY_COST : 0,
      chopperShotsRemaining,
      chopperMaxShots: this.isSkyport(building) ? HELICOPTER_MAX_SHOTS : 0,
      chopperChargePercent: this.isSkyport(building) && HELICOPTER_MAX_SHOTS > 0
        ? Math.round((chopperShotsRemaining / HELICOPTER_MAX_SHOTS) * 100)
        : 0,
      chopperSellValue: this.isSkyport(building) ? SKYPORT_CHOPPER_SELL_VALUE : 0,
    };
  }

  getBattleTankStats(building) {
    const level = Math.max(1, Number(building?.level ?? 1) || 1);

    return {
      health: TANK_BASE_HEALTH + ((level - 1) * TANK_HEALTH_PER_LEVEL),
      damage: TANK_BASE_DAMAGE + ((level - 1) * TANK_DAMAGE_PER_LEVEL),
    };
  }

  getStructureMaxHealth(building) {
    const type = building?.buildingType?.id ?? building?.type;
    const level = Math.max(1, Number(building?.level ?? 1) || 1);
    const base = {
      "town-hall": 520,
      "command-center": 520,
      "wood-machine": 180,
      skyport: 240,
      "battle-tank": 240,
      "air-defense": 260,
      tent: 290,
    }[type] ?? 160;

    return base + ((level - 1) * 80);
  }

  findPlacedBuilding(target = null) {
    if (!target) {
      return null;
    }

    return this.placedBuildings.find((building) => {
      if (target.id != null && building.persistedId != null && String(building.persistedId) === String(target.id)) {
        return true;
      }

      return (
        (target.type == null || building.buildingType?.id === target.type)
        && Number(building.row) === Number(target.row)
        && Number(building.col) === Number(target.col)
      );
    }) ?? null;
  }

  buyTankAtSelectedBuilding() {
    if (!this.selectedPlacedBuilding || !this.isBattleTank(this.selectedPlacedBuilding)) {
      return;
    }

    const building = this.selectedPlacedBuilding;

    if (building.hasTank || this.gold < BATTLE_TANK_PURCHASE_COST) {
      return;
    }

    building.hasTank = true;
    building.tankShotsRemaining = TANK_MAX_SHOTS;
    building.setBattleTankState?.(true);
    this.setGoldState(this.gold - BATTLE_TANK_PURCHASE_COST);

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
    building.chopperShotsRemaining = HELICOPTER_MAX_SHOTS;
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
    building.chopperShotsRemaining = 0;
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

  hireSoldierAtSelectedBuilding(targetBuilding = null) {
    const building = this.findPlacedBuilding(targetBuilding) ?? this.selectedPlacedBuilding;

    if (!building || !this.isTent(building)) {
      return null;
    }

    this.selectedPlacedBuilding = building;
    const currentSoldiers = building.soldierCount ?? 0;
    const maxSoldiers = this.getCommandCenterSoldierLimit(building);

    if (currentSoldiers >= maxSoldiers) {
      return this.getPlacedBuildingSelectionPayload(building);
    }

    if (this.gold < SOLDIER_RECRUIT_COST_PER_UNIT) {
      return this.getPlacedBuildingSelectionPayload(building);
    }

    const now = Date.now();
    this.setGoldState(this.gold - SOLDIER_RECRUIT_COST_PER_UNIT);
    building.soldierCount = currentSoldiers + 1;
    building.isSleeping = false;
    building.lastWagePaidAt = now;
    building.lastFedAt = now;
    building.setSleepState?.(false);
    this.syncCommandCenterSoldiers(building);

    this.events.emit("structure-army-updated", {
      structure: building,
      id: building.persistedId,
      type: building.buildingType.id,
      row: building.row,
      col: building.col,
      ...this.getBuildingPersistenceState(building),
    });
    const payload = this.getPlacedBuildingSelectionPayload(building);
    this.events.emit("placed-building-selected", payload);
    return payload;
  }

  recruitSoldierAcrossTents() {
    if (!this.selectedPlacedBuilding || !this.isCommandCenter(this.selectedPlacedBuilding)) {
      return null;
    }

    const targetTent = this.getTentBuildings()
      .filter((building) => (building.soldierCount ?? 0) < this.getCommandCenterSoldierLimit(building))
      .sort((left, right) => (left.row + left.col) - (right.row + right.col))[0];

    if (!targetTent) {
      return this.getPlacedBuildingSelectionPayload(this.selectedPlacedBuilding);
    }

    if (this.gold < SOLDIER_RECRUIT_COST_PER_UNIT) {
      return this.getPlacedBuildingSelectionPayload(this.selectedPlacedBuilding);
    }

    const now = Date.now();
    this.setGoldState(this.gold - SOLDIER_RECRUIT_COST_PER_UNIT);
    targetTent.soldierCount = Math.max(0, Number(targetTent.soldierCount ?? 0) || 0) + 1;
    targetTent.isSleeping = false;
    targetTent.lastWagePaidAt = now;
    targetTent.lastFedAt = now;
    targetTent.setSleepState?.(false);
    this.syncCommandCenterSoldiers(targetTent);

    this.events.emit("structure-army-updated", {
      structure: targetTent,
      id: targetTent.persistedId,
      type: targetTent.buildingType.id,
      row: targetTent.row,
      col: targetTent.col,
      ...this.getBuildingPersistenceState(targetTent),
    });

    const payload = this.getPlacedBuildingSelectionPayload(this.selectedPlacedBuilding);
    this.events.emit("placed-building-selected", payload);
    return payload;
  }

  feedSelectedCommandCenterSoldiers() {
    if (!this.selectedPlacedBuilding || !this.isTent(this.selectedPlacedBuilding)) {
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
    if (!this.selectedPlacedBuilding || !this.isTent(this.selectedPlacedBuilding)) {
      return;
    }

    const building = this.selectedPlacedBuilding;
    const currentSoldiers = Math.max(0, Number(building.soldierCount ?? 0) || 0);
    const removeCount = Math.max(0, Math.floor(Number(count) || 0));

    if (currentSoldiers <= 0 || removeCount <= 0) {
      return;
    }

    building.soldierCount = Math.max(0, currentSoldiers - removeCount);
    if (building.soldierCount <= 0) {
      building.isSleeping = false;
      building.setSleepState?.(false);
    }
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

  feedAllTentSoldiers() {
    if (!this.selectedPlacedBuilding || !this.isCommandCenter(this.selectedPlacedBuilding)) {
      return;
    }

    const tents = this.getTentBuildings().filter((building) => (building.soldierCount ?? 0) > 0);
    const totalSoldiers = tents.reduce(
      (total, building) => total + Math.max(0, Number(building.soldierCount ?? 0) || 0),
      0
    );
    const totalFeedCost = totalSoldiers * SOLDIER_FEED_COST_PER_UNIT;

    if (totalSoldiers <= 0 || this.gold < totalFeedCost) {
      return;
    }

    const now = Date.now();
    tents.forEach((tent) => {
      tent.lastFedAt = now;
      this.syncCommandCenterSoldiers(tent);
      this.events.emit("structure-army-updated", {
        structure: tent,
        id: tent.persistedId,
        type: tent.buildingType.id,
        row: tent.row,
        col: tent.col,
        ...this.getBuildingPersistenceState(tent),
      });
    });

    this.setGoldState(this.gold - totalFeedCost);
    this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(this.selectedPlacedBuilding));
  }

  toggleSelectedCommandCenterSleep() {
    if (!this.selectedPlacedBuilding || !this.isTent(this.selectedPlacedBuilding)) {
      return;
    }

    const building = this.selectedPlacedBuilding;

    if ((building.soldierCount ?? 0) <= 0) {
      building.isSleeping = false;
    } else {
      building.isSleeping = !building.isSleeping;
    }

    building.setSleepState?.(building.isSleeping);
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

  toggleAllTentSleep() {
    if (!this.selectedPlacedBuilding || !this.isCommandCenter(this.selectedPlacedBuilding)) {
      return;
    }

    const shouldSleep = !this.areAllTentSoldiersSleeping();

    this.getTentBuildings().forEach((tent) => {
      if ((tent.soldierCount ?? 0) <= 0) {
        tent.isSleeping = false;
      } else {
        tent.isSleeping = shouldSleep;
      }

      tent.setSleepState?.(tent.isSleeping);
      this.syncCommandCenterSoldiers(tent);
      this.events.emit("structure-army-updated", {
        structure: tent,
        id: tent.persistedId,
        type: tent.buildingType.id,
        row: tent.row,
        col: tent.col,
        ...this.getBuildingPersistenceState(tent),
      });
    });

    this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(this.selectedPlacedBuilding));
  }

  selectPlacedBuilding(building) {
    this.selectedPlacedBuilding = building;
    this.selectedBuildingType = null;
    this.movingBuilding = null;
    this.events.emit("structure-selection-cleared");
    this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));
    // Keep selection focus smooth (no hard snap) so zoom/pan eases into the building.
    this.focusCameraOnBuilding(building);
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
    this.cameraController.focusTarget = null;
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
    this.selectedPlacedBuilding = null;
    this.cameraController.focusTarget = null;
    this.events.emit("placed-building-selected", null);
    this.events.emit("structure-selection-cleared");
    this.events.emit("placed-building-moving", {
      id: this.movingBuilding.persistedId,
      type: this.movingBuilding.buildingType.id,
      name: this.movingBuilding.buildingType.name,
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
    if (this.isTent(building)) {
      this.syncCommandCenterSoldiers(building);
    }
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
    this.focusCameraOnBuilding(building);

  }

  handleWarTileClick(worldX, worldY) {
    const tile = this.getNearestTile(worldX, worldY);

    if (!tile || tile.row < this.iso.rows - 2) {
      return;
    }

    const occupiedBuilding = this.grid?.[tile.row]?.[tile.col]
      ?? this.occupiedTiles.get(this.getTileKey(tile.row, tile.col));

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

    if (this.isCommandCenter(building)) {
      return;
    }

    if (this.isTent(building)) {
      this.removeCommandCenterSoldiers(building);
    }
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

  rechargeTankAtSelectedBuilding() {
    if (!this.selectedPlacedBuilding || !this.isBattleTank(this.selectedPlacedBuilding)) {
      return;
    }

    const building = this.selectedPlacedBuilding;
    const tankShotsRemaining = clampStoredShots(
      building.tankShotsRemaining,
      TANK_MAX_SHOTS,
      building.hasTank
    );

    if (
      !building.hasTank
      || tankShotsRemaining >= TANK_MAX_SHOTS
      || this.energy < TANK_RECHARGE_ENERGY_COST
    ) {
      return;
    }

    building.tankShotsRemaining = TANK_MAX_SHOTS;
    this.setEnergyState(this.energy - TANK_RECHARGE_ENERGY_COST);

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

  rechargeChopperAtSelectedBuilding() {
    if (!this.selectedPlacedBuilding || !this.isSkyport(this.selectedPlacedBuilding)) {
      return;
    }

    const building = this.selectedPlacedBuilding;
    const chopperShotsRemaining = clampStoredShots(
      building.chopperShotsRemaining,
      HELICOPTER_MAX_SHOTS,
      building.hasChopper
    );

    if (
      !building.hasChopper
      || chopperShotsRemaining >= HELICOPTER_MAX_SHOTS
      || this.energy < HELICOPTER_RECHARGE_ENERGY_COST
    ) {
      return;
    }

    building.chopperShotsRemaining = HELICOPTER_MAX_SHOTS;
    this.setEnergyState(this.energy - HELICOPTER_RECHARGE_ENERGY_COST);

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

  collectSelectedBuildingEnergy() {
    if (!this.selectedPlacedBuilding || !this.isEnergyMachine(this.selectedPlacedBuilding)) {
      return;
    }

    const building = this.selectedPlacedBuilding;
    const collectedEnergy = Number(building.machineGold ?? 0);

    if (collectedEnergy <= 0) {
      return;
    }

    building.machineGold = 0;
    building.lastGeneratedAt = Date.now();
    building.setMachineGoldDisplay(0, this.getBuildingMaxGold(building));
    this.setEnergyState(this.energy + collectedEnergy);
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

  collectAllWoodMachineGold() {
    const woodMachines = this.placedBuildings.filter((building) => this.isWoodMachine(building));

    if (woodMachines.length === 0) {
      return;
    }

    let collectedGold = 0;
    const now = Date.now();

    woodMachines.forEach((building) => {
      const buildingGold = Number(building.machineGold ?? 0);

      if (buildingGold <= 0) {
        return;
      }

      collectedGold += buildingGold;
      building.machineGold = 0;
      building.lastGeneratedAt = now;
      building.setMachineGoldDisplay(0, this.getBuildingMaxGold(building));
      this.events.emit("structure-resource-updated", {
        structure: building,
        id: building.persistedId,
        type: building.buildingType.id,
        row: building.row,
        col: building.col,
        ...this.getBuildingPersistenceState(building),
        isFull: false,
      });
    });

    if (collectedGold <= 0) {
      return;
    }

    this.setGoldState(this.gold + collectedGold);

    if (this.selectedPlacedBuilding && this.isWoodMachine(this.selectedPlacedBuilding)) {
      this.events.emit(
        "placed-building-selected",
        this.getPlacedBuildingSelectionPayload(this.selectedPlacedBuilding)
      );
    }
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
    const upgradeCap = this.getBuildingUpgradeCap(building);

    if (
      (building.level ?? 1) >= upgradeCap ||
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

  isEnergyMachine(buildingOrType) {
    const typeId = typeof buildingOrType === "string"
      ? buildingOrType
      : buildingOrType?.buildingType?.id ?? buildingOrType?.id;

    return typeId === "energy-machine";
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

    if (this.isEnergyMachine(building)) {
      return ENERGY_MACHINE_MAX_STORAGE;
    }

    if (this.isTownHall(building)) {
      return (building?.level ?? 1) >= 2
        ? TOWN_HALL_MAX_GOLD * 2
        : TOWN_HALL_MAX_GOLD;
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

  updateEnergyMachineProduction() {
    const now = Date.now();

    this.placedBuildings.forEach((building) => {
      if (!this.isEnergyMachine(building) || building.isUpgrading) {
        return;
      }

      const maxEnergy = this.getBuildingMaxGold(building);

      if ((building.machineGold ?? 0) >= maxEnergy) {
        return;
      }

      const lastGeneratedAt = Number(building.lastGeneratedAt ?? now);
      const elapsed = now - lastGeneratedAt;
      const earnedTicks = Math.floor(elapsed / ENERGY_MACHINE_TICK_MS);

      if (earnedTicks <= 0) {
        return;
      }

      building.machineGold = Math.min(
        maxEnergy,
        (building.machineGold ?? 0) + earnedTicks * ENERGY_MACHINE_PER_TICK
      );
      building.lastGeneratedAt = lastGeneratedAt + earnedTicks * ENERGY_MACHINE_TICK_MS;
      building.setMachineGoldDisplay(building.machineGold, maxEnergy);

      this.events.emit("structure-resource-updated", {
        structure: building,
        id: building.persistedId,
        type: building.buildingType.id,
        row: building.row,
        col: building.col,
        ...this.getBuildingPersistenceState(building),
        isFull: building.machineGold >= maxEnergy,
      });

      if (this.selectedPlacedBuilding === building) {
        this.events.emit("placed-building-selected", this.getPlacedBuildingSelectionPayload(building));
      }
    });
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
      if (!this.isTent(building) || (building.soldierCount ?? 0) <= 0) {
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
