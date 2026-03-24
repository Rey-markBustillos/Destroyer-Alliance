import Phaser from "phaser";

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super("PreloadScene");
  }

  preload() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const barBg = this.add.rectangle(width / 2, height / 2, 320, 24, 0x1f2937);
    barBg.setStrokeStyle(2, 0x334155);

    const bar = this.add.rectangle(width / 2 - 156, height / 2, 8, 14, 0x22c55e);
    bar.setOrigin(0, 0.5);

    this.load.on("progress", (progress) => {
      bar.width = 312 * progress;
    });

    this.load.image("tree", "/assets/tree.png");
    this.load.image("stone", "/assets/stone.png");
    this.load.image("wall", "/assets/wall.png");
    this.load.image("town", "/assets/town.png");
    this.load.image("machine-wood", "/assets/machine-wood.png");
  }

  create() {
    this.scene.start("GameScene");
    this.scene.launch("UIScene");
  }
}
