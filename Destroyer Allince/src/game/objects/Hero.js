import Phaser from "phaser";

export default class Hero extends Phaser.GameObjects.Rectangle {
  constructor(scene, x, y) {
    super(scene, x, y, 28, 28, 0x60a5fa);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setAlpha(0);

    this.body.setCollideWorldBounds(true);
    this.body.setDrag(320, 320);
    this.body.setMaxVelocity(180, 180);
  }

  move(cursorKeys) {
    const speed = 180;

    if (cursorKeys.left.isDown) {
      this.body.setVelocityX(-speed);
    } else if (cursorKeys.right.isDown) {
      this.body.setVelocityX(speed);
    }

    if (cursorKeys.up.isDown) {
      this.body.setVelocityY(-speed);
    } else if (cursorKeys.down.isDown) {
      this.body.setVelocityY(speed);
    }
  }
}
