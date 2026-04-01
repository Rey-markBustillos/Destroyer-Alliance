import Phaser from "phaser";
import {
  configureHdSprite,
  createSoftShadow,
  getTextureSourceSize,
} from "../utils/renderQuality";

const darken = (hex, amount = 28) => {
  const color = Phaser.Display.Color.ValueToColor(hex);
  color.darken(amount);
  return color.color;
};

const lighten = (hex, amount = 18) => {
  const color = Phaser.Display.Color.ValueToColor(hex);
  color.lighten(amount);
  return color.color;
};

const BUILDING_TEXTURE_FALLBACKS = ["command-center", "machine-wood", "town"];
const ENERGY_MACHINE_TEXTURE_KEY = "energy-machine-animated";
const ENERGY_MACHINE_ANIM_KEY = "energy-machine-spin";

const getBestTextureKey = (scene, preferredKey, fallbackKeys = BUILDING_TEXTURE_FALLBACKS) => {
  if (preferredKey && scene.textures.exists(preferredKey)) {
    return preferredKey;
  }

  return fallbackKeys.find((key) => scene.textures.exists(key)) ?? null;
};

const drawDiamond = (graphics, centerX, centerY, halfW, halfH, fillColor, strokeColor, alpha = 1) => {
  const diamond = [
    new Phaser.Geom.Point(centerX, centerY - halfH),
    new Phaser.Geom.Point(centerX + halfW, centerY),
    new Phaser.Geom.Point(centerX, centerY + halfH),
    new Phaser.Geom.Point(centerX - halfW, centerY),
  ];

  graphics.fillStyle(fillColor, alpha);
  graphics.fillPoints(diamond, true);
  graphics.lineStyle(2, strokeColor, 0.95);
  graphics.strokePoints([...diamond, diamond[0]], false, false);
};

const createFootprintHitArea = (footprintRows, footprintCols, tileHalfW, tileHalfH) => {
  const diamonds = [];
  const verticalOffset = ((footprintRows + footprintCols - 2) * tileHalfH) / 2;
  const hitHalfW = tileHalfW;
  const hitHalfH = tileHalfH;

  for (let row = 0; row < footprintRows; row += 1) {
    for (let col = 0; col < footprintCols; col += 1) {
      const centerX = (col - row) * tileHalfW;
      const centerY = (col + row) * tileHalfH - verticalOffset;

      diamonds.push(new Phaser.Geom.Polygon([
        new Phaser.Geom.Point(centerX, centerY - hitHalfH),
        new Phaser.Geom.Point(centerX + hitHalfW, centerY),
        new Phaser.Geom.Point(centerX, centerY + hitHalfH),
        new Phaser.Geom.Point(centerX - hitHalfW, centerY),
      ]));
    }
  }

  return {
    diamonds,
    contains(x, y) {
      return diamonds.some((diamond) => Phaser.Geom.Polygon.Contains(diamond, x, y));
    },
  };
};

const getLevelLabelOffsetY = (buildingTypeId, roofY) => {
  switch (buildingTypeId) {
    case "command-center":
      return -6;
    case "skyport":
      return -10;
    case "battle-tank":
      return -2;
    case "air-defense":
      return -8;
    case "tent":
      return -4;
    case "wood-machine":
      return -8;
    case "energy-machine":
      return -8;
    case "town-hall":
      return -82;
    default:
      return roofY + 6;
  }
};

export default class Building extends Phaser.GameObjects.Container {
  constructor(scene, x, y, buildingType, options = {}) {
    super(scene, x, y);
    scene.add.existing(this);
    const { animatePlacement = true } = options;

    this.buildingType = buildingType;
    this.isStructure = true;
    this.resourceLabel = null;
    this.resourceIcon = null;
    this.levelBadge = null;
    this.levelBadgeBackground = null;
    this.levelBadgeGlow = null;
    this.levelLabel = null;
    this.skyportSprite = null;
    this.battleTankSprite = null;
    this.battleHealthLabel = null;
    this.visualContainer = scene.add.container(0, 0);
    this.workingSprite = null;
    this.builderSprite = null;
    this.builderTween = null;
    this.builderFrameEvent = null;
    this.builderFrameIndex = 0;
    this.builderBaseX = 0;
    this.builderBaseY = 0;
    this.spriteShadow = null;
    this.sleepLabel = null;
    this.sleepTween = null;
    this.sleepLoopEvent = null;
    this.level = 1;
    this.isUpgrading = false;
    this.upgradeCompleteAt = null;
    this.footprintRows = buildingType.footprintRows ?? 1;
    this.footprintCols = buildingType.footprintCols ?? 1;
    const footprintWidth = scene.iso.tileWidth * this.footprintCols;
    const footprintHeight = scene.iso.tileHeight * this.footprintRows;
    const tileHalfW = scene.iso.tileWidth / 2;
    const tileHalfH = scene.iso.tileHeight / 2;

    const baseWidth = scene.iso.tileWidth * (1.02 + (this.footprintCols - 1) * 0.78);
    const baseHeight = scene.iso.tileHeight * (0.78 + (this.footprintRows - 1) * 0.42);
    const bodyHeight = buildingType.bodyHeight ?? 54;
    const roofHeight = buildingType.roofHeight ?? 18;
    const labelText = buildingType.label ?? buildingType.name.slice(0, 1).toUpperCase();
    const halfW = baseWidth / 2;
    const halfH = baseHeight / 2;
    const roofY = -bodyHeight;
    const addSpriteShadow = (
      width = footprintWidth * 0.8,
      height = footprintHeight * 0.48,
      yOffset = footprintHeight / 2 + 5
    ) => {
      const shadow = createSoftShadow(scene, {
        x: 0,
        y: yOffset,
        width,
        height,
        alpha: 0.14,
      });
      this.spriteShadow = shadow;
      this.visualContainer.add(shadow);
    };
    const addQualitySprite = ({
      textureKey,
      fallbackKeys = buildingType.fallbackTextureKeys ?? BUILDING_TEXTURE_FALLBACKS,
      x: spriteX = 0,
      y: spriteY = footprintHeight / 2 + 18,
      maxWidth = footprintWidth * 1.1,
      maxHeight = footprintWidth * 1.1,
      crop = null,
      shadowWidth = footprintWidth * 0.82,
      shadowHeight = footprintHeight * 0.52,
      shadowY = footprintHeight / 2 + 5,
    }) => {
      const resolvedTextureKey = getBestTextureKey(scene, textureKey, fallbackKeys);

      if (!resolvedTextureKey) {
        return null;
      }

      addSpriteShadow(shadowWidth, shadowHeight, shadowY);
      const sprite = scene.add.image(spriteX, spriteY, resolvedTextureKey);
      sprite.setOrigin(0.5, 1);
      sprite.setAlpha(0.995);

      if (crop) {
        sprite.setCrop(crop.x, crop.y, crop.width, crop.height);
        configureHdSprite(sprite, {
          scene,
          maxWidth,
          maxHeight,
          sourceWidth: crop.width,
          sourceHeight: crop.height,
        });
      } else {
        const sourceSize = getTextureSourceSize(scene, resolvedTextureKey);
        configureHdSprite(sprite, {
          scene,
          maxWidth,
          maxHeight,
          sourceWidth: sourceSize.width,
          sourceHeight: sourceSize.height,
        });
      }

      this.visualContainer.add(sprite);
      return sprite;
    };
    if (buildingType.id === "town-hall") {
      addQualitySprite({
        textureKey: "town",
        y: 34,
        maxWidth: footprintWidth * 1.2,
        maxHeight: footprintWidth * 1.55,
        crop: { x: 48, y: 22, width: 412, height: 380 },
        shadowWidth: footprintWidth * 0.9,
        shadowHeight: footprintHeight * 0.66,
        shadowY: footprintHeight / 2 + 7,
      });

      if (scene.textures.exists("goldcoin")) {
        this.resourceIcon = scene.add.image(0, -56, "goldcoin");
        this.resourceIcon.setOrigin(0.5, 0.5);
        this.resourceIcon.setDisplaySize(24, 24);
        configureHdSprite(this.resourceIcon, { scene, maxWidth: 24, maxHeight: 24 });
        this.resourceIcon.setVisible(false);
        this.resourceIcon.setInteractive({ useHandCursor: true });
        this.resourceIcon.on("pointerup", (_pointer, _localX, _localY, event) => {
          event.stopPropagation();

          if (!scene.pointerDrag?.moved && this.machineGold > 0) {
            scene.collectTownHallGold?.(this);
          }
        });
        this.visualContainer.add(this.resourceIcon);
      }
    } else if (buildingType.id === "command-center") {
      addQualitySprite({
        textureKey: "command-center",
        y: footprintHeight / 2 + 18,
        maxWidth: footprintWidth * 1.24,
        maxHeight: footprintWidth * 1.28,
        crop: { x: 11, y: 4, width: 124, height: 129 },
        shadowWidth: footprintWidth * 0.76,
        shadowHeight: footprintHeight * 0.5,
      });

      if (scene.textures.exists("goldcoin")) {
        this.resourceIcon = scene.add.image(0, -34, "goldcoin");
        this.resourceIcon.setOrigin(0.5, 0.5);
        this.resourceIcon.setDisplaySize(22, 22);
        configureHdSprite(this.resourceIcon, { scene, maxWidth: 22, maxHeight: 22 });
        this.resourceIcon.setVisible(false);
        this.resourceIcon.setInteractive({ useHandCursor: true });
        this.resourceIcon.on("pointerup", (_pointer, _localX, _localY, event) => {
          event.stopPropagation();

          if (!scene.pointerDrag?.moved && this.machineGold > 0) {
            scene.collectTownHallGold?.(this);
          }
        });
        this.visualContainer.add(this.resourceIcon);
      }
    } else if (buildingType.id === "skyport") {
      const skyportSprite = addQualitySprite({
        textureKey: "skyport-empty",
        fallbackKeys: ["skyport-shop", ...BUILDING_TEXTURE_FALLBACKS],
        y: footprintHeight / 2 + 20,
        maxWidth: footprintWidth * 0.88,
        maxHeight: footprintWidth * 0.88,
        shadowWidth: footprintWidth * 0.84,
        shadowHeight: footprintHeight * 0.52,
      });
      this.skyportSprite = skyportSprite;
    } else if (buildingType.id === "battle-tank") {
      const tankSprite = addQualitySprite({
        textureKey: "tank-owned",
        fallbackKeys: ["tank-shop", ...BUILDING_TEXTURE_FALLBACKS],
        y: footprintHeight / 2 + 28,
        maxWidth: footprintWidth * 1.56,
        maxHeight: footprintWidth * 1.24,
        shadowWidth: footprintWidth * 1.14,
        shadowHeight: footprintHeight * 0.68,
        shadowY: footprintHeight / 2 + 7,
      });
      this.battleTankSprite = tankSprite;
    } else if (buildingType.id === "air-defense") {
      addQualitySprite({
        textureKey: "air-defense",
        y: footprintHeight / 2 + 24,
        maxWidth: footprintWidth * 1.42,
        maxHeight: footprintWidth * 1.38,
        shadowWidth: footprintWidth * 1.02,
        shadowHeight: footprintHeight * 0.62,
        shadowY: footprintHeight / 2 + 7,
      });
    } else if (buildingType.id === "tent") {
      addQualitySprite({
        textureKey: "tent",
        y: footprintHeight / 2 + 18,
        maxWidth: footprintWidth * 1.08,
        maxHeight: footprintWidth * 0.84,
        shadowWidth: footprintWidth * 0.82,
        shadowHeight: footprintHeight * 0.46,
        shadowY: footprintHeight / 2 + 6,
      });
    } else if (buildingType.id === "wood-machine") {
      const machineSprite = addQualitySprite({
        textureKey: "machine-wood",
        y: footprintHeight / 2 + 16,
        maxWidth: footprintWidth * 0.94,
        maxHeight: footprintWidth * 0.68,
        crop: { x: 64, y: 0, width: 513, height: 364 },
      });
      const machineHeight = machineSprite?.displayHeight ?? Math.max(34, footprintWidth * 0.84);

      this.resourceLabel = scene.add.text(0, -machineHeight + 18, "0", {
        fontFamily: "Verdana",
        fontSize: "13px",
        fontStyle: "bold",
        color: "#fde68a",
        stroke: "#1f2937",
        strokeThickness: 4,
        align: "center",
      });
      this.resourceLabel.setOrigin(0.5, 0.5);
      this.visualContainer.add(this.resourceLabel);
    } else if (buildingType.id === "energy-machine") {
      addSpriteShadow(footprintWidth * 0.9, footprintHeight * 0.54, footprintHeight / 2 + 6);

      if (scene.textures.exists(ENERGY_MACHINE_TEXTURE_KEY)) {
        if (!scene.anims.exists(ENERGY_MACHINE_ANIM_KEY)) {
          scene.anims.create({
            key: ENERGY_MACHINE_ANIM_KEY,
            frames: scene.anims.generateFrameNumbers(ENERGY_MACHINE_TEXTURE_KEY, { start: 0, end: 3 }),
            duration: 4200,
            repeat: -1,
            repeatDelay: 80,
          });
        }

        const energySprite = scene.add.sprite(0, footprintHeight / 2 + 22, ENERGY_MACHINE_TEXTURE_KEY, 0);
        energySprite.setOrigin(0.5, 1);
        energySprite.setAlpha(0.995);
        configureHdSprite(energySprite, {
          scene,
          maxWidth: footprintWidth * 0.94,
          maxHeight: footprintWidth * 0.9,
          sourceWidth: 512,
          sourceHeight: 516,
        });
        energySprite.play(ENERGY_MACHINE_ANIM_KEY);
        this.visualContainer.add(energySprite);
      } else {
        addQualitySprite({
          textureKey: "energy-machine",
          y: footprintHeight / 2 + 22,
          maxWidth: footprintWidth * 0.94,
          maxHeight: footprintWidth * 0.9,
          shadowWidth: footprintWidth * 0.9,
          shadowHeight: footprintHeight * 0.54,
          shadowY: footprintHeight / 2 + 6,
        });
      }

      this.resourceLabel = scene.add.text(0, -34, "0/3", {
        fontFamily: "Verdana",
        fontSize: "13px",
        fontStyle: "bold",
        color: "#93c5fd",
        stroke: "#0f172a",
        strokeThickness: 4,
        align: "center",
      });
      this.resourceLabel.setOrigin(0.5, 0.5);
      this.visualContainer.add(this.resourceLabel);
    } else {
      const foundation = scene.add.graphics();

      for (let row = 0; row < this.footprintRows; row += 1) {
        for (let col = 0; col < this.footprintCols; col += 1) {
          const offsetX = (col - row) * tileHalfW;
          const offsetY =
            (col + row) * tileHalfH - ((this.footprintRows + this.footprintCols - 2) * tileHalfH) / 2;
          drawDiamond(
            foundation,
            offsetX,
            offsetY,
            tileHalfW,
            tileHalfH,
            darken(buildingType.color, 8),
            darken(buildingType.color, 28),
            0.92
          );
        }
      }

      this.visualContainer.add(foundation);

      const graphics = scene.add.graphics();
      const roofPoints = [
        new Phaser.Geom.Point(0, roofY - roofHeight),
        new Phaser.Geom.Point(halfW, roofY),
        new Phaser.Geom.Point(0, roofY + roofHeight),
        new Phaser.Geom.Point(-halfW, roofY),
      ];
      const leftWall = [
        new Phaser.Geom.Point(-halfW, roofY),
        new Phaser.Geom.Point(0, roofY + roofHeight),
        new Phaser.Geom.Point(0, 0),
        new Phaser.Geom.Point(-halfW, -halfH),
      ];
      const rightWall = [
        new Phaser.Geom.Point(halfW, roofY),
        new Phaser.Geom.Point(0, roofY + roofHeight),
        new Phaser.Geom.Point(0, 0),
        new Phaser.Geom.Point(halfW, -halfH),
      ];
      const baseDiamond = [
        new Phaser.Geom.Point(0, -halfH),
        new Phaser.Geom.Point(halfW, 0),
        new Phaser.Geom.Point(0, halfH),
        new Phaser.Geom.Point(-halfW, 0),
      ];

      graphics.fillStyle(darken(buildingType.color, 18), 1);
      graphics.fillPoints(baseDiamond, true);
      graphics.fillStyle(darken(buildingType.color, 30), 1);
      graphics.fillPoints(leftWall, true);
      graphics.fillStyle(darken(buildingType.color, 14), 1);
      graphics.fillPoints(rightWall, true);
      graphics.fillStyle(lighten(buildingType.color, 10), 1);
      graphics.fillPoints(roofPoints, true);
      graphics.lineStyle(2, 0xf8fafc, 0.14);
      graphics.strokePoints([...roofPoints, roofPoints[0]], false, false);

      const accent = scene.add.rectangle(0, roofY - 2, baseWidth * 0.32, roofHeight * 0.9, 0xf8fafc, 0.2);
      accent.setAngle(45);

      const label = scene.add.text(0, roofY - roofHeight - 6, labelText, {
        fontFamily: "Verdana",
        fontSize: "16px",
        fontStyle: "bold",
        color: "#f8fafc",
        stroke: "#132018",
        strokeThickness: 4,
      });
      label.setOrigin(0.5, 0.5);

      this.visualContainer.add([graphics, accent, label]);
    }

    this.add(this.visualContainer);

    if (scene.textures.exists("working")) {
      this.workingSprite = scene.add.image(0, footprintHeight / 2 + 8, "working");
      this.workingSprite.setOrigin(0.5, 1);
      this.workingSprite.setDisplaySize(
        Math.max(40, footprintWidth * 0.72),
        Math.max(44, footprintHeight * 1.55)
      );
      this.workingSprite.setVisible(false);
      this.add(this.workingSprite);
    }

    if (scene.textures.exists("builder-frame-1")) {
      this.builderBaseX = -Math.max(16, footprintWidth * 0.24);
      this.builderBaseY = footprintHeight / 2 + 6;
      this.builderSprite = scene.add.image(
        this.builderBaseX,
        this.builderBaseY,
        "builder-frame-1"
      );
      this.builderSprite.setOrigin(0.5, 1);
      this.builderSprite.setDisplaySize(
        Math.max(12, footprintWidth * 0.16),
        Math.max(18, footprintHeight * 0.72)
      );
      this.builderSprite.setVisible(false);
      this.add(this.builderSprite);
    }

    this.levelBadge = scene.add.container(0, getLevelLabelOffsetY(buildingType.id, roofY));
    this.levelBadgeGlow = scene.add.rectangle(0, 0, 46, 13, 0xfde68a, 0.14);
    this.levelBadgeGlow.setAngle(-6);
    this.levelBadgeBackground = scene.add.graphics();
    this.levelLabel = scene.add.text(0, 0, "Lv.1", {
      fontFamily: "Verdana",
      fontSize: "11px",
      fontStyle: "bold",
      color: "#fefce8",
      stroke: "#1f2937",
      strokeThickness: 3,
      align: "center",
    });
    this.levelLabel.setOrigin(0.5, 0.5);
    this.levelBadge.add([this.levelBadgeGlow, this.levelBadgeBackground, this.levelLabel]);
    this.refreshLevelBadge();

    if (buildingType.id === "town-hall") {
      this.levelBadge.setVisible(false);
    }

    this.add(this.levelBadge);

    this.battleHealthLabel = scene.add.text(0, roofY - roofHeight - 24, "", {
      fontFamily: "Verdana",
      fontSize: "10px",
      fontStyle: "bold",
      color: "#fde68a",
      stroke: "#111827",
      strokeThickness: 4,
      align: "center",
    });
    this.battleHealthLabel.setOrigin(0.5, 0.5);
    this.battleHealthLabel.setVisible(false);
    this.add(this.battleHealthLabel);

    this.setSize(baseWidth, bodyHeight + roofHeight + baseHeight);

    const hitArea = createFootprintHitArea(
      this.footprintRows,
      this.footprintCols,
      tileHalfW,
      tileHalfH
    );

    this.setInteractive(hitArea, (area, x, y) => area.contains(x, y));
    this.once("destroy", () => {
      this.builderTween?.remove();
      this.builderTween = null;
      this.builderFrameEvent?.remove(false);
      this.builderFrameEvent = null;
      this.spriteShadow?.destroy();
      this.spriteShadow = null;
      this.sleepTween?.remove();
      this.sleepTween = null;
      this.sleepLoopEvent?.remove(false);
      this.sleepLoopEvent = null;
      this.sleepLabel?.destroy();
      this.sleepLabel = null;
    });

    if (animatePlacement) {
      this.playPlacementAnimation();
    }
  }

  setLevel(level = 1) {
    this.level = Math.max(1, Number(level) || 1);

    if (this.levelLabel) {
      this.levelLabel.setText(`Lv.${this.level}`);
      this.refreshLevelBadge();
    }
  }

  setUpgradeState(isUpgrading = false, upgradeCompleteAt = null) {
    this.isUpgrading = Boolean(isUpgrading);
    this.upgradeCompleteAt = upgradeCompleteAt ? Number(upgradeCompleteAt) : null;

    if (this.visualContainer) {
      this.visualContainer.setVisible(!this.isUpgrading);
    }

    if (this.workingSprite) {
      this.workingSprite.setVisible(this.isUpgrading);
    }

    if (this.builderSprite) {
      this.builderSprite.setVisible(this.isUpgrading);

      if (this.isUpgrading) {
        this.builderTween?.remove();
        this.builderTween = null;
        this.builderFrameEvent?.remove(false);
        this.builderFrameEvent = null;
        this.builderSprite.setPosition(this.builderBaseX, this.builderBaseY);
        this.builderSprite.setAngle(0);
        this.builderFrameIndex = 0;
        this.builderSprite.setTexture("builder-frame-1");
        this.builderFrameEvent = this.scene.time.addEvent({
          delay: 140,
          loop: true,
          callback: () => {
            this.builderFrameIndex = (this.builderFrameIndex + 1) % 4;
            this.builderSprite.setTexture(`builder-frame-${this.builderFrameIndex + 1}`);
          },
        });
      } else {
        this.builderTween?.remove();
        this.builderTween = null;
        this.builderFrameEvent?.remove(false);
        this.builderFrameEvent = null;
        this.builderSprite.setPosition(this.builderBaseX, this.builderBaseY);
        this.builderSprite.setAngle(0);
        this.builderSprite.setTexture("builder-frame-1");
      }
    }

    if (this.levelLabel) {
      this.levelLabel.setColor(this.isUpgrading ? "#fde68a" : "#fef3c7");
      this.levelLabel.setText(
        this.isUpgrading ? `Lv.${this.level} -> Lv.${this.level + 1}` : `Lv.${this.level}`
      );
      this.refreshLevelBadge();
    }
  }

  refreshLevelBadge() {
    if (!this.levelBadgeBackground || !this.levelLabel) {
      return;
    }

    const badgeWidth = Math.max(48, Math.ceil(this.levelLabel.width + 20));
    const badgeHeight = 20;
    this.levelBadgeBackground.clear();
    this.levelBadgeBackground.fillStyle(this.isUpgrading ? 0x5b3b11 : 0x0f172a, this.isUpgrading ? 0.92 : 0.86);
    this.levelBadgeBackground.lineStyle(1.2, this.isUpgrading ? 0xfcd34d : 0x67e8f9, this.isUpgrading ? 0.8 : 0.38);
    this.levelBadgeBackground.fillRoundedRect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight, 8);
    this.levelBadgeBackground.strokeRoundedRect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight, 8);

    if (this.levelBadgeGlow) {
      this.levelBadgeGlow.setDisplaySize(Math.max(26, badgeWidth - 12), 10);
      this.levelBadgeGlow.setFillStyle(this.isUpgrading ? 0xf59e0b : 0x22d3ee, this.isUpgrading ? 0.18 : 0.12);
    }
  }

  setMachineGoldDisplay(machineGold = 0, maxGold = 250) {
    if (this.buildingType?.id === "town-hall" || this.buildingType?.id === "command-center") {
      if (this.resourceIcon) {
        this.resourceIcon.setVisible(machineGold > 0);
      }
      return;
    }

    if (!this.resourceLabel) {
      return;
    }

    this.resourceLabel.setText(
      machineGold >= maxGold ? "Full" : `${machineGold}/${maxGold}`
    );
  }

  setSleepState(isSleeping = false) {
    if (this.buildingType?.id !== "tent") {
      return;
    }

    if (isSleeping) {
      this.startSleepEffect();
      return;
    }

    this.stopSleepEffect();
  }

  setSkyportState(hasChopper = false) {
    this.hasChopper = Boolean(hasChopper);

    if (this.buildingType?.id !== "skyport" || !this.skyportSprite) {
      return;
    }

    const nextTextureKey = getBestTextureKey(
      this.scene,
      this.hasChopper ? "skyport-bought" : "skyport-empty",
      ["skyport-shop", ...BUILDING_TEXTURE_FALLBACKS]
    );

    if (nextTextureKey) {
      this.skyportSprite.setTexture(nextTextureKey);
    }
  }

  setBattleTankState(hasTank = false) {
    this.hasTank = Boolean(hasTank);

    if (this.buildingType?.id !== "battle-tank" || !this.battleTankSprite) {
      return;
    }

    const nextTextureKey = getBestTextureKey(
      this.scene,
      this.hasTank ? "tank-shop" : "tank-owned",
      ["tank-shop", "tank-owned", ...BUILDING_TEXTURE_FALLBACKS]
    );

    if (nextTextureKey) {
      this.battleTankSprite.setTexture(nextTextureKey);
    }
  }

  setBattleHealth(health = null, maxHealth = null) {
    if (!this.battleHealthLabel) {
      return;
    }

    if (!Number.isFinite(Number(health)) || !Number.isFinite(Number(maxHealth))) {
      this.battleHealthLabel.setVisible(false);
      return;
    }

    this.battleHealthLabel.setText(
      `${Math.max(0, Math.round(health))}/${Math.max(0, Math.round(maxHealth))}`
    );
    this.battleHealthLabel.setVisible(true);
  }

  playPlacementAnimation() {
    this.visualContainer.setScale(0.84);
    this.visualContainer.setAlpha(0);
    this.visualContainer.setY(18);
    if (this.spriteShadow) {
      this.spriteShadow.setAlpha(0);
      this.spriteShadow.setScale(0.84, 0.74);
    }

    this.scene.tweens.add({
      targets: this.visualContainer,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      y: 0,
      duration: 240,
      ease: "Back.easeOut",
    });
    if (this.spriteShadow) {
      this.scene.tweens.add({
        targets: this.spriteShadow,
        alpha: 1,
        scaleX: 1,
        scaleY: 0.88,
        duration: 240,
        ease: "Sine.easeOut",
      });
    }
  }

  startSleepEffect() {
    if (this.sleepLoopEvent) {
      return;
    }

    const spawnSleepLabel = () => {
      this.sleepLabel?.destroy();
      this.sleepTween?.remove();

      this.sleepLabel = this.scene.add.text(0, -34, "zzzzz", {
        fontFamily: "Verdana",
        fontSize: "14px",
        fontStyle: "bold",
        color: "#e0f2fe",
        stroke: "#082f49",
        strokeThickness: 4,
      });
      this.sleepLabel.setOrigin(0.5, 0.5);
      this.sleepLabel.setAlpha(0);
      this.add(this.sleepLabel);

      this.sleepTween = this.scene.tweens.add({
        targets: this.sleepLabel,
        y: -56,
        alpha: 1,
        duration: 900,
        ease: "Sine.easeOut",
        yoyo: false,
        onComplete: () => {
          if (!this.active) {
            return;
          }

          this.sleepLabel?.destroy();
          this.sleepLabel = null;
          this.sleepTween = null;
        },
      });
    };

    spawnSleepLabel();
    this.sleepLoopEvent = this.scene.time.addEvent({
      delay: 1300,
      loop: true,
      callback: spawnSleepLabel,
    });
  }

  stopSleepEffect() {
    this.sleepLoopEvent?.remove(false);
    this.sleepLoopEvent = null;
    this.sleepTween?.remove();
    this.sleepTween = null;
    this.sleepLabel?.destroy();
    this.sleepLabel = null;
  }
}
