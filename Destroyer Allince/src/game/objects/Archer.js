import Phaser from "phaser";
import Building from "./Building";
import Arrow from "./Arrow";

export default class Archer extends Building {
  constructor(scene, x, y, buildingType) {
    super(scene, x, y, buildingType);

    this.range = 150;
    this.fireRate = 1000; // milliseconds
    this.lastFireTime = 0;
    this.target = null;

    this.rangeCircle = scene.add.circle(x, y, this.range);
    this.rangeCircle.setStrokeStyle(2, 0xffd700, 0.3);
    this.rangeCircle.setFillStyle(0xffd700, 0.1);
    this.rangeCircle.setVisible(false);
  }

  shootAt(target) {
    const now = Date.now();

    if (now - this.lastFireTime > this.fireRate && target && target.active) {
      const arrow = new Arrow(this.scene, this.x, this.y, target);
      this.scene.add.existing(arrow);
      this.scene.physics.add.existing(arrow);

      this.lastFireTime = now;

      return arrow;
    }

    return null;
  }

  findTarget(enemies) {
    if (!enemies || enemies.length === 0) {
      return null;
    }

    let closestEnemy = null;
    let closestDistance = this.range;

    enemies.forEach((enemy) => {
      if (enemy && enemy.active) {
        const distance = Phaser.Math.Distance.Between(
          this.x,
          this.y,
          enemy.x,
          enemy.y
        );

        if (distance < closestDistance) {
          closestDistance = distance;
          closestEnemy = enemy;
        }
      }
    });

    return closestEnemy;
  }

  update() {
    // Update range circle position to follow archer
    this.rangeCircle.setPosition(this.x, this.y);
  }

  destroy() {
    this.rangeCircle.destroy();
    super.destroy();
  }
}
