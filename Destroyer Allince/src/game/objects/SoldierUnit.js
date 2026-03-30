import Phaser from "phaser";
import { configureHdSprite, createSoftShadow } from "../utils/renderQuality";

const SOLDIER_SPEED = 0.024;
const SOLDIER_WALK_FRAME_MS = 130;
const SOLDIER_IDLE_AFTER_MOVE_MIN_MS = 120;
const SOLDIER_IDLE_AFTER_MOVE_MAX_MS = 260;
const SOLDIER_BEHAVIOR_DELAY_MIN_MS = 220;
const SOLDIER_BEHAVIOR_DELAY_MAX_MS = 700;
const SOLDIER_WALK_BOB_HEIGHT = 1.6;
const SOLDIER_WALK_BOB_DURATION_MS = 130;

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
    this.walkBobTween = null;
    this.walkFrameIndex = 0;
    this.hungryLabel = null;
    this.shadow = createSoftShadow(scene, {
      x: 0,
      y: 7,
      width: 18,
      height: 8,
      alpha: 0.14,
    });
    this.add(this.shadow);

    this.sprite = scene.add.image(0, 0, WALK_TEXTURES.front[0]);
    this.sprite.setOrigin(0.5, 1);
    configureHdSprite(this.sprite, {
      scene,
      maxWidth: 20,
      maxHeight: 30,
    });
    this.add(this.sprite);

    this.hungryLabel = scene.add.text(0, -34, "Gutom na ako", {
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
      this.walkBobTween?.remove();
      this.shadow?.destroy();
      this.hungryLabel?.destroy();
      this.behaviorEvent = null;
      this.frameEvent = null;
      this.moveTween = null;
      this.walkBobTween = null;
      this.shadow = null;
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

  queueNextAction(delay = Phaser.Math.Between(SOLDIER_BEHAVIOR_DELAY_MIN_MS, SOLDIER_BEHAVIOR_DELAY_MAX_MS)) {
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
      this.queueNextAction(360);
      return;
    }

    const patrolPoint = this.scene.getRandomSoldierPatrolPoint(this.commandCenter, this.unitIndex);

    if (!patrolPoint) {
      this.playIdle(this.currentDirection);
      this.queueNextAction(360);
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

    if (distance < 2) {
      this.playIdle(direction);
      this.queueNextAction(Phaser.Math.Between(90, 180));
      return;
    }

    const duration = Math.max(300, Math.round(distance / SOLDIER_SPEED));

    this.playWalk(direction);
    this.moveTween = this.scene.tweens.add({
      targets: this,
      x: point.x,
      y: point.y,
      duration,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        const { row, col } = this.scene.worldToGrid(this.x, this.y);
        this.setDepth(320 + row + col + 2);
      },
      onComplete: () => {
        this.moveTween = null;
        this.playIdle(direction);
        this.queueNextAction(
          Phaser.Math.Between(SOLDIER_IDLE_AFTER_MOVE_MIN_MS, SOLDIER_IDLE_AFTER_MOVE_MAX_MS)
        );
      },
    });
  }

  playIdle(direction = this.currentDirection) {
    this.stopFrameAnimation();
    this.stopWalkBob();
    this.currentDirection = direction;
    this.sprite.setTexture(WALK_TEXTURES[direction][0]);
    configureHdSprite(this.sprite, { scene: this.scene, maxWidth: 20, maxHeight: 30 });
  }

  playWalk(direction = this.currentDirection) {
    this.stopFrameAnimation();
    this.currentDirection = direction;
    this.walkFrameIndex = 0;
    this.sprite.setTexture(WALK_TEXTURES[direction][0]);
    configureHdSprite(this.sprite, { scene: this.scene, maxWidth: 20, maxHeight: 30 });
    this.startWalkBob();
    this.frameEvent = this.scene.time.addEvent({
      delay: SOLDIER_WALK_FRAME_MS,
      loop: true,
      callback: () => {
        this.walkFrameIndex = (this.walkFrameIndex + 1) % WALK_TEXTURES[this.currentDirection].length;
        this.sprite.setTexture(WALK_TEXTURES[this.currentDirection][this.walkFrameIndex]);
        configureHdSprite(this.sprite, { scene: this.scene, maxWidth: 20, maxHeight: 30 });
      },
    });
  }

  playFiring(direction = this.currentDirection) {
    this.stopFrameAnimation();
    this.stopWalkBob();
    this.currentDirection = direction;
    this.sprite.setTexture(FIRING_TEXTURES[direction]);
    configureHdSprite(this.sprite, { scene: this.scene, maxWidth: 20, maxHeight: 30 });
  }

  startWalkBob() {
    this.walkBobTween?.remove();
    this.walkBobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -SOLDIER_WALK_BOB_HEIGHT,
      duration: SOLDIER_WALK_BOB_DURATION_MS,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  stopWalkBob() {
    this.walkBobTween?.remove();
    this.walkBobTween = null;
    this.sprite.setY(0);
  }

  stopFrameAnimation() {
    this.frameEvent?.remove(false);
    this.frameEvent = null;
  }

  setHungryState(isHungry = false) {
    this.hungryLabel?.setVisible(Boolean(isHungry));
  }
}
