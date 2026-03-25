import Phaser from "phaser";

const VILLAGER_STYLES = {
  boy: {
    shirt: 0x3b82f6,
    accent: 0x1d4ed8,
    hair: 0x3f2b1d,
  },
  girl: {
    shirt: 0xec4899,
    accent: 0xbe185d,
    hair: 0x5b2c83,
  },
};

export default class TownVillager extends Phaser.GameObjects.Container {
  constructor(scene, x, y, variant = "boy", label = "") {
    super(scene, x, y);
    scene.add.existing(this);

    this.variant = variant;
    this.label = label;
    this.walkTween = null;

    const style = VILLAGER_STYLES[variant] ?? VILLAGER_STYLES.boy;
    const shadow = scene.add.ellipse(0, 2, 16, 8, 0x0f172a, 0.2);
    const body = scene.add.rectangle(0, -9, 12, 16, style.shirt, 1);
    const head = scene.add.circle(0, -22, 7, 0xf2c9a0, 1);
    const hair = scene.add.ellipse(0, -26, 13, 8, style.hair, 1);
    const legLeft = scene.add.rectangle(-3, 2, 3, 10, style.accent, 1);
    const legRight = scene.add.rectangle(3, 2, 3, 10, style.accent, 1);

    this.add([shadow, hair, head, body, legLeft, legRight]);

    if (variant === "girl") {
      const skirt = scene.add.triangle(0, -2, -7, -1, 7, -1, 0, 8, style.accent, 1);
      const ponytail = scene.add.circle(6, -21, 3, style.hair, 1);
      this.add([skirt, ponytail]);
    }

    if (label) {
      const text = scene.add.text(0, -37, label, {
        fontFamily: "Verdana",
        fontSize: "9px",
        fontStyle: "bold",
        color: "#f8fafc",
        stroke: "#0f172a",
        strokeThickness: 3,
      });
      text.setOrigin(0.5, 0.5);
      this.add(text);
    }

    this.setSize(20, 42);
    this.setAlpha(0);
  }

  clearMotion() {
    this.walkTween?.remove();
    this.walkTween = null;
  }

  moveTo(targetX, targetY, duration = 1200, onComplete) {
    this.walkTween?.remove();
    this.setScaleX(targetX >= this.x ? 1 : -1);

    this.walkTween = this.scene.tweens.add({
      targets: this,
      x: targetX,
      y: targetY,
      duration,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        const { row } = this.scene.worldToGrid(this.x, this.y);
        this.setDepth(500 + row);
      },
      onComplete: () => {
        this.walkTween = null;
        onComplete?.();
      },
    });
  }

  destroy(fromScene) {
    this.clearMotion();
    super.destroy(fromScene);
  }
}
