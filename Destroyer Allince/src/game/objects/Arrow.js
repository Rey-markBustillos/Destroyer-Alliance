import Phaser from "phaser";

export default class Arrow extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, target) {
    super(scene, x, y, null);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.target = target;
    this.damage = 10;
    this.setDisplaySize(8, 4);
    this.setTint(0xffd700); // Gold color

    const angle = Phaser.Math.Angle.Between(x, y, target.x, target.y);
    this.setRotation(angle);
    this.setVelocity(
      Math.cos(angle) * 300,
      Math.sin(angle) * 300
    );
  }

  update() {
    if (this.target && this.active) {
      const distance = Phaser.Math.Distance.Between(
        this.x,
        this.y,
        this.target.x,
        this.target.y
      );

      if (distance < 20) {
        this.hit();
      }
    }

    if (this.y < -10 || this.y > 600 || this.x < -10 || this.x > 1000) {
      this.destroy();
    }
  }

  hit() {
    if (this.target && this.target.active) {
      this.target.health -= this.damage;

      if (this.target.health <= 0) {
        this.target.destroy();
      }
    }

    this.destroy();
  }
}
