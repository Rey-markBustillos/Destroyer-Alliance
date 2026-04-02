import Phaser from "phaser";
import soundManager from "../../services/soundManager";

const HD_TEXTURE_KEYS = [
  "town",
  "base",
  "machine-wood",
  "energy-machine",
  "energy-machine-animated",
  "command-center",
  "skyport-shop",
  "skyport-empty",
  "skyport-bought",
  "tank-shop",
  "tank-owned",
  "tank-attack-down",
  "tank-attack-down-left",
  "tank-attack-down-right",
  "tank-attack-left",
  "tank-attack-right",
  "tank-attack-up",
  "tank-attack-up-left",
  "tank-attack-up-right",
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
  "ranger-front-walk-1",
  "ranger-front-walk-2",
  "ranger-front-firing",
  "ranger-back-walk-1",
  "ranger-back-walk-2",
  "ranger-back-firing",
  "ranger-left-walk-1",
  "ranger-left-walk-2",
  "ranger-left-firing",
  "ranger-right-walk-1",
  "ranger-right-walk-2",
  "ranger-right-firing",
];

const TEXTURE_FALLBACKS = {
  "skyport-empty": ["skyport-shop", "command-center", "town"],
  "skyport-bought": ["skyport-shop", "command-center", "town"],
  "tank-owned": ["tank-shop", "command-center", "machine-wood"],
  "tank-shop": ["tank-owned", "command-center", "machine-wood"],
  "tank-attack-down": ["tank-owned", "tank-shop", "command-center", "machine-wood"],
  "tank-attack-down-left": ["tank-attack-down", "tank-owned", "tank-shop", "command-center"],
  "tank-attack-down-right": ["tank-attack-down", "tank-owned", "tank-shop", "command-center"],
  "tank-attack-left": ["tank-attack-down-left", "tank-owned", "tank-shop", "command-center"],
  "tank-attack-right": ["tank-attack-down-right", "tank-owned", "tank-shop", "command-center"],
  "tank-attack-up": ["tank-attack-down", "tank-owned", "tank-shop", "command-center"],
  "tank-attack-up-left": ["tank-attack-left", "tank-owned", "tank-shop", "command-center"],
  "tank-attack-up-right": ["tank-attack-right", "tank-owned", "tank-shop", "command-center"],
  "air-defense": ["command-center", "town"],
  tent: ["machine-wood", "town"],
  "energy-machine": ["machine-wood", "command-center", "town"],
  "machine-wood": ["command-center", "town"],
  "command-center": ["town", "machine-wood"],
  "ranger-front-walk-1": ["soldier-front-walk-1"],
  "ranger-front-walk-2": ["ranger-front-walk-1", "soldier-front-walk-2"],
  "ranger-front-firing": ["ranger-front-walk-1", "soldier-front-firing"],
  "ranger-back-walk-1": ["soldier-back-walk-1"],
  "ranger-back-walk-2": ["ranger-back-walk-1", "soldier-back-walk-2"],
  "ranger-back-firing": ["ranger-back-walk-1", "soldier-back-firing"],
  "ranger-left-walk-1": ["soldier-left-walk-1"],
  "ranger-left-walk-2": ["ranger-left-walk-1", "soldier-left-walk-2"],
  "ranger-left-firing": ["ranger-left-walk-1", "soldier-left-firing"],
  "ranger-right-walk-1": ["soldier-right-walk-1"],
  "ranger-right-walk-2": ["ranger-right-walk-1", "soldier-right-walk-2"],
  "ranger-right-firing": ["ranger-right-walk-1", "soldier-right-firing"],
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
    this.load.image("energy-machine", "/assets/energymachine.png");
    this.load.spritesheet("energy-machine-animated", "/assets/energymachine.png", {
      frameWidth: 512,
      frameHeight: 516,
    });
    this.load.image("command-center", "/assets/command center.png");
    this.load.image("skyport-shop", "/assets/chopper/skychop.png");
    this.load.image("skyport-empty", "/assets/chopper/skychop.png");
    this.load.image("skyport-bought", "/assets/chopper/skychop2.png");
    this.load.image("tank-shop", "/assets/tank/tank1.png");
    this.load.image("tank-owned", "/assets/tank/tank2.png");
    this.load.image("tank-attack-down", "/assets/tank/Attack/down.png");
    this.load.image("tank-attack-down-left", "/assets/tank/Attack/down-left.png");
    this.load.image("tank-attack-down-right", "/assets/tank/Attack/down-right.png");
    this.load.image("tank-attack-left", "/assets/tank/Attack/left.png");
    this.load.image("tank-attack-right", "/assets/tank/Attack/right.png");
    this.load.image("tank-attack-up", "/assets/tank/Attack/up.png");
    this.load.image("tank-attack-up-left", "/assets/tank/Attack/up-left.png");
    this.load.image("tank-attack-up-right", "/assets/tank/Attack/up-right.png");
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
    this.load.image("ranger-front-walk-1", "/assets/Ranger Tala/front/rangerfront.png");
    this.load.image("ranger-front-walk-2", "/assets/Ranger Tala/front/rangerfront.png");
    this.load.image("ranger-front-firing", "/assets/Ranger Tala/front/rangerfront.png");
    this.load.image("ranger-back-walk-1", "/assets/Ranger Tala/back/rangerback.png");
    this.load.image("ranger-back-walk-2", "/assets/Ranger Tala/back/rangerback.png");
    this.load.image("ranger-back-firing", "/assets/Ranger Tala/back/backfire.png");
    this.load.image("ranger-left-walk-1", "/assets/Ranger Tala/left/rangerleft.png");
    this.load.image("ranger-left-walk-2", "/assets/Ranger Tala/left/rangerleft.png");
    this.load.image("ranger-left-firing", "/assets/Ranger Tala/left/leftfire.png");
    this.load.image("ranger-right-walk-1", "/assets/Ranger Tala/right/rangerright.png");
    this.load.image("ranger-right-walk-2", "/assets/Ranger Tala/right/rangerright.png");
    this.load.image("ranger-right-firing", "/assets/Ranger Tala/right/rightfire.png");
  }

  create() {
    this.scene.start("GameScene");

    if (this.game.scene.keys?.UIScene) {
      this.scene.launch("UIScene");
    }
  }
}
