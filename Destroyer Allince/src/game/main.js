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
	transparent: false,
	backgroundColor: "#8c8169",
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
	audio: {
		noAudio: true,
	},
	scale: {
		mode: Phaser.Scale.RESIZE,
		autoCenter: Phaser.Scale.NO_CENTER,
	},
	autoRound: false,
};

const buildGameConfig = (parentElement, scenes, renderProfile, rendererType) => ({
	...phaserConfig,
	type: rendererType,
	antialias: rendererType === Phaser.CANVAS ? false : renderProfile.antialias,
	antialiasGL: rendererType === Phaser.CANVAS ? false : renderProfile.antialiasGL,
	parent: parentElement,
	resolution: rendererType === Phaser.CANVAS ? 1 : renderProfile.resolution,
	desynchronized: rendererType === Phaser.CANVAS ? false : renderProfile.desynchronized,
	fps: {
		target: renderProfile.fpsTarget,
		min: renderProfile.fpsMin,
		forceSetTimeOut: false,
		smoothStep: !renderProfile.lowPerformanceDevice,
	},
	powerPreference: renderProfile.powerPreference,
	scene: scenes,
	render: {
		antialias: rendererType === Phaser.CANVAS ? false : renderProfile.antialias,
		pixelArt: GAME_RENDER_CONFIG.pixelArt,
		powerPreference: renderProfile.powerPreference,
		transparent: false,
	},
});

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

	const preferredRenderer = renderProfile.preferredRenderer ?? Phaser.AUTO;

	try {
		const game = new Phaser.Game(
			buildGameConfig(parentElement, scenes, renderProfile, preferredRenderer)
		);
		applyCanvasQuality(game);
		return game;
	} catch (error) {
		if (preferredRenderer === Phaser.CANVAS) {
			throw error;
		}

		console.warn("Phaser WebGL boot failed. Falling back to Canvas renderer.", error);
		const fallbackGame = new Phaser.Game(
			buildGameConfig(parentElement, scenes, renderProfile, Phaser.CANVAS)
		);
		applyCanvasQuality(fallbackGame);
		return fallbackGame;
	}
};

export const destroyGame = (gameInstance) => {
	if (gameInstance) {
		gameInstance.destroy(true);
	}
};
