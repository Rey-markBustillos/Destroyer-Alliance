import Phaser from "phaser";

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

  for (let row = 0; row < footprintRows; row += 1) {
    for (let col = 0; col < footprintCols; col += 1) {
      const centerX = (col - row) * tileHalfW;
      const centerY = (col + row) * tileHalfH - verticalOffset;

      diamonds.push(new Phaser.Geom.Polygon([
        new Phaser.Geom.Point(centerX, centerY - tileHalfH),
        new Phaser.Geom.Point(centerX + tileHalfW, centerY),
        new Phaser.Geom.Point(centerX, centerY + tileHalfH),
        new Phaser.Geom.Point(centerX - tileHalfW, centerY),
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

export default class Building extends Phaser.GameObjects.Container {
  constructor(scene, x, y, buildingType) {
    super(scene, x, y);
    scene.add.existing(this);

    this.buildingType = buildingType;
    this.isStructure = true;
    this.resourceLabel = null;
    this.resourceIcon = null;
    this.levelLabel = null;
    this.skyportSprite = null;
    this.battleHealthLabel = null;
    this.visualContainer = scene.add.container(0, 0);
    this.workingSprite = null;
    this.builderSprite = null;
    this.builderTween = null;
    this.builderFrameEvent = null;
    this.builderFrameIndex = 0;
    this.builderBaseX = 0;
    this.builderBaseY = 0;
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
    if (buildingType.id === "town-hall" && scene.textures.exists("town")) {
      const cropX = 48;
      const cropY = 22;
      const cropWidth = 412;
      const cropHeight = 380;
      const townWidth = footprintWidth * 1.2;
      const townHeight = townWidth * (cropHeight / cropWidth);
      const townSprite = scene.add.image(0, 12, "town");

      townSprite.setOrigin(0.5, 1);
      townSprite.setCrop(cropX, cropY, cropWidth, cropHeight);
      townSprite.setDisplaySize(townWidth, townHeight);
      this.visualContainer.add(townSprite);

      if (scene.textures.exists("goldcoin")) {
        this.resourceIcon = scene.add.image(0, -56, "goldcoin");
        this.resourceIcon.setOrigin(0.5, 0.5);
        this.resourceIcon.setDisplaySize(24, 24);
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
    } else if (buildingType.id === "command-center" && scene.textures.exists("command-center")) {
      const cropX = 11;
      const cropY = 4;
      const cropWidth = 124;
      const cropHeight = 129;
      const commandCenterWidth = footprintWidth * 1.24;
      const commandCenterHeight = commandCenterWidth * (cropHeight / cropWidth);
      const commandCenterSprite = scene.add.image(0, footprintHeight / 2 + 4, "command-center");

      commandCenterSprite.setOrigin(0.5, 1);
      commandCenterSprite.setCrop(cropX, cropY, cropWidth, cropHeight);
      commandCenterSprite.setDisplaySize(commandCenterWidth, commandCenterHeight);
      this.visualContainer.add(commandCenterSprite);
    } else if (
      buildingType.id === "skyport"
      && scene.textures.exists("skyport-empty")
      && scene.textures.exists("skyport-bought")
    ) {
      const skyportWidth = footprintWidth * 0.82;
      const skyportHeight = skyportWidth;
      const skyportSprite = scene.add.image(0, footprintHeight / 2 + 8, "skyport-empty");

      skyportSprite.setOrigin(0.5, 1);
      skyportSprite.setDisplaySize(skyportWidth, skyportHeight);
      this.skyportSprite = skyportSprite;
      this.visualContainer.add(skyportSprite);
    } else if (buildingType.id === "wood-machine" && scene.textures.exists("machine-wood")) {
      const cropX = 64;
      const cropY = 0;
      const cropWidth = 513;
      const cropHeight = 364;
      const machineWidth = footprintWidth * 1.18;
      const machineHeight = machineWidth * (cropHeight / cropWidth);
      const machineSprite = scene.add.image(0, footprintHeight / 2 + 6, "machine-wood");

      machineSprite.setOrigin(0.5, 1);
      machineSprite.setCrop(cropX, cropY, cropWidth, cropHeight);
      machineSprite.setDisplaySize(machineWidth, machineHeight);
      this.visualContainer.add(machineSprite);

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

    this.levelLabel = scene.add.text(0, roofY - 8, "Lv.1", {
      fontFamily: "Verdana",
      fontSize: "12px",
      fontStyle: "bold",
      color: "#fef3c7",
      stroke: "#422006",
      strokeThickness: 4,
      align: "center",
    });
    this.levelLabel.setOrigin(0.5, 0.5);

    if (buildingType.id === "command-center") {
      this.levelLabel.setY(-14);
    }

    if (buildingType.id === "town-hall") {
      this.levelLabel.setY(-82);
      this.levelLabel.setVisible(false);
    }

    this.add(this.levelLabel);

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
    });
  }

  setLevel(level = 1) {
    this.level = Math.max(1, Number(level) || 1);

    if (this.levelLabel) {
      this.levelLabel.setText(`Lv.${this.level}`);
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
    }
  }

  setMachineGoldDisplay(machineGold = 0, maxGold = 250) {
    if (this.buildingType?.id === "town-hall") {
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

  setSkyportState(hasChopper = false) {
    this.hasChopper = Boolean(hasChopper);

    if (this.buildingType?.id !== "skyport" || !this.skyportSprite) {
      return;
    }

    this.skyportSprite.setTexture(this.hasChopper ? "skyport-bought" : "skyport-empty");
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
}
