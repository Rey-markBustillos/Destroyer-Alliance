import Phaser from "phaser";

const SOLDIER_SPEED = 0.08;

const getDirectionFromDelta = (dx, dy) => {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }

  return dy >= 0 ? "front" : "back";
};

const WALK_TEXTURES = {
  front: ["soldier-front-walk-1", "soldier-front-walk-2"],
  back: ["soldier-back-walk-1", "soldier-back-walk-2"],
  left: ["soldier-left-walk-1", "soldier-left-walk-2"],
  right: ["soldier-right-walk-1", "soldier-right-walk-2"],
};

const FIRING_TEXTURES = {
  front: "soldier-front-firing",
  back: "soldier-back-firing",
  left: "soldier-left-firing",
  right: "soldier-right-firing",
};

export default class SoldierUnit extends Phaser.GameObjects.Container {
  constructor(scene, commandCenter, index = 0) {
    super(scene, 0, 0);
    scene.add.existing(this);

    this.commandCenter = commandCenter;
    this.unitIndex = index;
    this.currentDirection = "front";
    this.behaviorEvent = null;
    this.frameEvent = null;
    this.moveTween = null;
    this.walkFrameIndex = 0;
    this.hungryLabel = null;

    this.sprite = scene.add.image(0, 0, WALK_TEXTURES.front[0]);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setDisplaySize(14, 22);
    this.add(this.sprite);

    this.hungryLabel = scene.add.text(0, -26, "Gutom na ako", {
      fontFamily: "Verdana",
      fontSize: "8px",
      fontStyle: "bold",
      color: "#fee2e2",
      stroke: "#450a0a",
      strokeThickness: 3,
      align: "center",
    });
    this.hungryLabel.setOrigin(0.5, 0.5);
    this.hungryLabel.setVisible(false);
    this.add(this.hungryLabel);

    this.assignCommandCenter(commandCenter, index);

    this.once("destroy", () => {
      this.behaviorEvent?.remove(false);
      this.frameEvent?.remove(false);
      this.moveTween?.remove();
      this.hungryLabel?.destroy();
      this.behaviorEvent = null;
      this.frameEvent = null;
      this.moveTween = null;
      this.hungryLabel = null;
    });
  }

  assignCommandCenter(commandCenter, index = this.unitIndex) {
    this.commandCenter = commandCenter;
    this.unitIndex = index;

    const homePoint = this.scene.getSoldierHomePoint(commandCenter, this.unitIndex);
    this.setPosition(homePoint.x, homePoint.y);
    this.setDepth(320 + commandCenter.row + commandCenter.col + 2);
    this.setHungryState(this.scene.isCommandCenterHungry?.(commandCenter) ?? false);
    this.playIdle("front");
    this.queueNextAction(300 + index * 120);
  }

  queueNextAction(delay = Phaser.Math.Between(400, 1100)) {
    this.behaviorEvent?.remove(false);
    this.behaviorEvent = this.scene.time.addEvent({
      delay,
      callback: () => this.decideNextAction(),
    });
  }

  decideNextAction() {
    if (!this.active || !this.commandCenter?.active) {
      return;
    }

    const enemy = this.scene.getNearestEnemyTarget?.(this) ?? null;

    if (enemy) {
      const direction = getDirectionFromDelta(enemy.x - this.x, enemy.y - this.y);
      this.playFiring(direction);
      this.queueNextAction(500);
      return;
    }

    const patrolPoint = this.scene.getRandomSoldierPatrolPoint(this.commandCenter, this.unitIndex);

    if (!patrolPoint) {
      this.playIdle(this.currentDirection);
      this.queueNextAction(700);
      return;
    }

    this.moveToPoint(patrolPoint);
  }

  moveToPoint(point) {
    this.moveTween?.remove();

    const dx = point.x - this.x;
    const dy = point.y - this.y;
    const distance = Phaser.Math.Distance.Between(this.x, this.y, point.x, point.y);
    const direction = getDirectionFromDelta(dx, dy);
    const duration = Math.max(300, Math.round(distance / SOLDIER_SPEED));

    this.playWalk(direction);
    this.moveTween = this.scene.tweens.add({
      targets: this,
      x: point.x,
      y: point.y,
      duration,
      ease: "Linear",
      onComplete: () => {
        this.moveTween = null;
        this.playIdle(direction);
        this.queueNextAction();
      },
    });
  }

  playIdle(direction = this.currentDirection) {
    this.stopFrameAnimation();
    this.currentDirection = direction;
    this.sprite.setTexture(WALK_TEXTURES[direction][0]);
  }

  playWalk(direction = this.currentDirection) {
    this.stopFrameAnimation();
    this.currentDirection = direction;
    this.walkFrameIndex = 0;
    this.sprite.setTexture(WALK_TEXTURES[direction][0]);
    this.frameEvent = this.scene.time.addEvent({
      delay: 180,
      loop: true,
      callback: () => {
        this.walkFrameIndex = (this.walkFrameIndex + 1) % WALK_TEXTURES[this.currentDirection].length;
        this.sprite.setTexture(WALK_TEXTURES[this.currentDirection][this.walkFrameIndex]);
      },
    });
  }

  playFiring(direction = this.currentDirection) {
    this.stopFrameAnimation();
    this.currentDirection = direction;
    this.sprite.setTexture(FIRING_TEXTURES[direction]);
  }

  stopFrameAnimation() {
    this.frameEvent?.remove(false);
    this.frameEvent = null;
  }

  setHungryState(isHungry = false) {
    this.hungryLabel?.setVisible(Boolean(isHungry));
  }
}
