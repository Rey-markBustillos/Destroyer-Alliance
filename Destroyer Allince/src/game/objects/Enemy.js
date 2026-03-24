import Phaser from "phaser";

export default class Enemy extends Phaser.GameObjects.Ellipse {
  constructor(scene, x, y) {
    super(scene, x, y, 26, 26, 0xef4444);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setAlpha(0);

    this.body.setCollideWorldBounds(true);
    this.health = 50;
    this.maxHealth = 50;
  }

  chase(target, speed = 70) {
    this.scene.physics.moveToObject(this, target, speed);
  }

  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.destroy();
    }
  }
}
