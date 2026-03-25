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
    this.load.image("command-center", "/assets/command center.png");
    this.load.image("goldcoin", "/assets/goldcoin.png");
    this.load.image("working", "/assets/working.png");
    this.load.image("builder-frame-1", "/assets/builders/frame1.png");
    this.load.image("builder-frame-2", "/assets/builders/frame2.png");
    this.load.image("builder-frame-3", "/assets/builders/frame3.png");
    this.load.image("builder-frame-4", "/assets/builders/frame4.png");
    this.load.image("soldier-front-walk-1", "/assets/army/front/walk.png");
    this.load.image("soldier-front-walk-2", "/assets/army/front/walk2.png");
    this.load.image("soldier-front-firing", "/assets/army/front/firing.png");
    this.load.image("soldier-back-walk-1", "/assets/army/back/backamry.png");
    this.load.image("soldier-back-walk-2", "/assets/army/back/backarmy2.png");
    this.load.image("soldier-back-firing", "/assets/army/back/firing.png");
    this.load.image("soldier-left-walk-1", "/assets/army/left/walk1.png");
    this.load.image("soldier-left-walk-2", "/assets/army/left/walk2.png");
    this.load.image("soldier-left-firing", "/assets/army/left/firing.png");
    this.load.image("soldier-right-walk-1", "/assets/army/right/walk1.png");
    this.load.image("soldier-right-walk-2", "/assets/army/right/walk2.png");
    this.load.image("soldier-right-firing", "/assets/army/right/firing.png");
  }

  create() {
    this.scene.start("GameScene");
    this.scene.launch("UIScene");
  }
}
