import Phaser from "phaser";

export default class UIScene extends Phaser.Scene {
  constructor() {
    super("UIScene");
  }

  create() {
    this.add
      .text(16, 14, "Isometric Builder Demo", {
        fontFamily: "Verdana",
        fontSize: "18px",
        fontStyle: "bold",
        color: "#0f172a",
      })
      .setScrollFactor(0);

    this.add
      .text(16, 40, "Drag to pan  |  Mouse wheel to zoom  |  Select a structure from the builder tray", {
        fontFamily: "Verdana",
        fontSize: "13px",
        color: "#334155",
      })
      .setScrollFactor(0);
  }
}
