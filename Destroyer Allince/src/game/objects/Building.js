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

export default class Building extends Phaser.GameObjects.Container {
  constructor(scene, x, y, buildingType) {
    super(scene, x, y);
    scene.add.existing(this);

    this.buildingType = buildingType;
    this.isStructure = true;
    this.footprintRows = buildingType.footprintRows ?? 1;
    this.footprintCols = buildingType.footprintCols ?? 1;
    const footprintWidth = scene.iso.tileWidth * this.footprintCols;
    const footprintHeight = scene.iso.tileHeight * this.footprintRows;
    const tileHalfW = scene.iso.tileWidth / 2;
    const tileHalfH = scene.iso.tileHeight / 2;
    const footprintCenterYOffset =
      ((this.footprintRows + this.footprintCols - 2) * tileHalfH) / 2;

    const baseWidth = scene.iso.tileWidth * (0.84 + (this.footprintCols - 1) * 0.62);
    const baseHeight = scene.iso.tileHeight * (0.62 + (this.footprintRows - 1) * 0.3);
    const bodyHeight = buildingType.bodyHeight ?? 54;
    const roofHeight = buildingType.roofHeight ?? 18;
    const labelText = buildingType.label ?? buildingType.name.slice(0, 1).toUpperCase();
    const halfW = baseWidth / 2;
    const halfH = baseHeight / 2;
    const roofY = -bodyHeight;
    const foundation = scene.add.graphics();

    for (let row = 0; row < this.footprintRows; row += 1) {
      for (let col = 0; col < this.footprintCols; col += 1) {
        const offsetX = (col - row) * tileHalfW;
        const offsetY = (col + row) * tileHalfH - ((this.footprintRows + this.footprintCols - 2) * tileHalfH) / 2;
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

    this.add(foundation);

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

    this.add([graphics, accent, label]);
    this.setSize(baseWidth, bodyHeight + roofHeight + baseHeight);

    const interactiveWidth = footprintWidth;
    const interactiveHeight = bodyHeight + roofHeight + footprintHeight;
    this.setInteractive(
      new Phaser.Geom.Rectangle(
        -interactiveWidth / 2,
        roofY - roofHeight,
        interactiveWidth,
        interactiveHeight
      ),
      Phaser.Geom.Rectangle.Contains
    );
  }
}
