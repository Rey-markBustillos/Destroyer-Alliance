import Phaser from "phaser";

import BootScene from "./scenes/BootScene";
import PreloadScene from "./scenes/PreloadScene";
import GameScene from "./scenes/GameScene";
import BattleScene from "./scenes/BattleScene";
import UIScene from "./scenes/UIScene";
import { GAME_HEIGHT, GAME_WIDTH } from "./utils/config";
import { GAME_RENDER_CONFIG } from "./tilemap/layoutConfig";
import { applyCanvasQuality, getRenderProfile } from "./utils/renderQuality";
import soundManager from "../services/soundManager";

const phaserConfig = {
	type: Phaser.AUTO,
	width: GAME_WIDTH,
	height: GAME_HEIGHT,
	parent: undefined,
	transparent: true,
	backgroundColor: "rgba(0,0,0,0)",
	antialias: true,
	antialiasGL: true,
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
		mode: Phaser.Scale.RESIZE,
		autoCenter: Phaser.Scale.NO_CENTER,
	},
	autoRound: false,
};

export const createGame = (parentElement, options = {}) => {
	soundManager.preloadBackgroundMusic();
	const renderProfile = getRenderProfile();

	const existingCanvas = parentElement.querySelector("canvas");
	if (existingCanvas) {
		existingCanvas.remove();
	}

	const SelectedScene = options?.mode === "war" ? BattleScene : GameScene;
	const gameScene = new SelectedScene(options);
	const scenes = options?.mode === "war"
		? [BootScene, PreloadScene, gameScene]
		: [BootScene, PreloadScene, gameScene, UIScene];

	const game = new Phaser.Game({
		...phaserConfig,
		antialias: renderProfile.antialias,
		antialiasGL: renderProfile.antialiasGL,
		parent: parentElement,
		resolution: renderProfile.resolution,
		desynchronized: renderProfile.desynchronized,
		fps: {
			target: renderProfile.fpsTarget,
			min: renderProfile.fpsMin,
			forceSetTimeOut: false,
			smoothStep: !renderProfile.lowPerformanceDevice,
		},
		powerPreference: renderProfile.powerPreference,
		scene: scenes,
	});

	applyCanvasQuality(game);
	return game;
};

export const destroyGame = (gameInstance) => {
	if (gameInstance) {
		gameInstance.destroy(true);
	}
};
