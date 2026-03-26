import Phaser from "phaser";

import BootScene from "./scenes/BootScene";
import PreloadScene from "./scenes/PreloadScene";
import GameScene from "./scenes/GameScene";
import BattleScene from "./scenes/BattleScene";
import UIScene from "./scenes/UIScene";
import { GAME_HEIGHT, GAME_WIDTH } from "./utils/config";
import { GAME_RENDER_CONFIG } from "./tilemap/layoutConfig";

const phaserConfig = {
	type: Phaser.AUTO,
	width: GAME_WIDTH,
	height: GAME_HEIGHT,
	parent: undefined,
	backgroundColor: "#020617",
	antialias: false,
	antialiasGL: false,
	pixelArt: GAME_RENDER_CONFIG.pixelArt,
	roundPixels: GAME_RENDER_CONFIG.roundPixels,
	resolution: GAME_RENDER_CONFIG.resolution,
	physics: {
		default: "arcade",
		arcade: {
			gravity: { y: 0 },
			debug: false,
		},
	},
	scale: {
		mode: Phaser.Scale.FIT,
		autoCenter: Phaser.Scale.CENTER_BOTH,
	},
};

export const createGame = (parentElement, options = {}) => {
	const existingCanvas = parentElement.querySelector("canvas");
	if (existingCanvas) {
		existingCanvas.remove();
	}

	const SelectedScene = options?.mode === "war" ? BattleScene : GameScene;
	const gameScene = new SelectedScene(options);
	const scenes = options?.mode === "war"
		? [BootScene, PreloadScene, gameScene]
		: [BootScene, PreloadScene, gameScene, UIScene];

	return new Phaser.Game({
		...phaserConfig,
		parent: parentElement,
		scene: scenes,
	});
};

export const destroyGame = (gameInstance) => {
	if (gameInstance) {
		gameInstance.destroy(true);
	}
};
