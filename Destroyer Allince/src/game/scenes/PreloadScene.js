import Phaser from "phaser";
import soundManager from "../../services/soundManager";

const HD_TEXTURE_KEYS = [
  "town",
  "base",
  "machine-wood",
  "command-center",
  "skyport-shop",
  "skyport-empty",
  "skyport-bought",
  "tank-shop",
  "tank-owned",
  "tank-attack-1",
  "tank-attack-2",
  "air-defense",
  "tent",
  "goldcoin",
  "working",
  "builder-frame-1",
  "builder-frame-2",
  "builder-frame-3",
  "builder-frame-4",
  "soldier-front-walk-1",
  "soldier-front-walk-2",
  "soldier-front-firing",
  "soldier-back-walk-1",
  "soldier-back-walk-2",
  "soldier-back-firing",
  "soldier-left-walk-1",
  "soldier-left-walk-2",
  "soldier-left-firing",
  "soldier-right-walk-1",
  "soldier-right-walk-2",
  "soldier-right-firing",
];

const TEXTURE_FALLBACKS = {
  "skyport-empty": ["skyport-shop", "command-center", "town"],
  "skyport-bought": ["skyport-shop", "command-center", "town"],
  "tank-owned": ["tank-shop", "command-center", "machine-wood"],
  "tank-shop": ["tank-owned", "command-center", "machine-wood"],
  "tank-attack-1": ["tank-owned", "tank-shop", "command-center", "machine-wood"],
  "tank-attack-2": ["tank-attack-1", "tank-owned", "tank-shop", "command-center", "machine-wood"],
  "air-defense": ["command-center", "town"],
  tent: ["machine-wood", "town"],
  "machine-wood": ["command-center", "town"],
  "command-center": ["town", "machine-wood"],
};

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super("PreloadScene");
    this.failedAssetKeys = new Set();
  }

  preload() {
    soundManager.preloadBackgroundMusic();
    soundManager.startBackgroundMusic({
      fadeInDurationMs: 1600,
      volume: soundManager.getStatus().volume,
    });

    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const barBg = this.add.rectangle(width / 2, height / 2, 320, 24, 0x1f2937);
    barBg.setStrokeStyle(2, 0x334155);

    const bar = this.add.rectangle(width / 2 - 156, height / 2, 8, 14, 0x22c55e);
    bar.setOrigin(0, 0.5);

    this.load.on("progress", (progress) => {
      bar.width = 312 * progress;
    });

    this.load.on("loaderror", (file) => {
      if (!file?.key || this.failedAssetKeys.has(file.key)) {
        return;
      }

      this.failedAssetKeys.add(file.key);
      console.warn(`High-quality asset failed to load: ${file.key}`);
    });

    this.load.on("complete", () => {
      Object.entries(TEXTURE_FALLBACKS).forEach(([key, fallbackKeys]) => {
        if (this.textures.exists(key)) {
          return;
        }

        const fallbackKey = fallbackKeys.find((candidate) => this.textures.exists(candidate));
        const source = fallbackKey ? this.textures.get(fallbackKey)?.getSourceImage?.() : null;

        if (source && !this.textures.exists(key)) {
          this.textures.addImage(key, source);
        }
      });

      HD_TEXTURE_KEYS.forEach((key) => {
        if (this.textures.exists(key)) {
          this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
        }
      });
    });

    this.load.image("town", "/assets/town.png");
    this.load.image("base", "/assets/newmap.png");
    this.load.image("machine-wood", "/assets/machine-wood.png");
    this.load.image("command-center", "/assets/command center.png");
    this.load.image("skyport-shop", "/assets/chopper/skychop.png");
    this.load.image("skyport-empty", "/assets/chopper/skychop.png");
    this.load.image("skyport-bought", "/assets/chopper/skychop2.png");
    this.load.image("tank-shop", "/assets/tank/tank1.png");
    this.load.image("tank-owned", "/assets/tank/tank2.png");
    this.load.image("tank-attack-1", "/assets/tank/tankattack1.png");
    this.load.image("tank-attack-2", "/assets/tank/tankattack2.png");
    this.load.image("air-defense", "/assets/airdef.png");
    this.load.image("tent", "/assets/tent.png");
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

    if (this.game.scene.keys?.UIScene) {
      this.scene.launch("UIScene");
    }
  }
}
