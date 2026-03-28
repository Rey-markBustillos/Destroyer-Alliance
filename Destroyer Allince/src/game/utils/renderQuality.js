import Phaser from "phaser";

export const MAX_RENDER_DEVICE_PIXEL_RATIO = 3;
export const SHADOW_COLOR = 0x020617;
export const SHADOW_ANGLE = -6;

export const getTextureSourceSize = (scene, textureKey) => {
  const texture = scene?.textures?.get(textureKey);
  const source = texture?.getSourceImage?.();

  return {
    width: Math.max(1, Number(source?.naturalWidth ?? source?.width ?? texture?.source?.[0]?.width ?? 1) || 1),
    height: Math.max(1, Number(source?.naturalHeight ?? source?.height ?? texture?.source?.[0]?.height ?? 1) || 1),
  };
};

export const setTextureFilter = (scene, textureKey, filter = Phaser.Textures.FilterMode.LINEAR) => {
  if (!scene?.textures?.exists(textureKey)) {
    return false;
  }

  scene.textures.get(textureKey).setFilter(filter);
  return true;
};

export const fitDisplaySizePreservingAspect = (
  sprite,
  maxWidth,
  maxHeight,
  sourceWidth = null,
  sourceHeight = null
) => {
  const safeSourceWidth = Math.max(1, Number(sourceWidth ?? sprite.width ?? 1) || 1);
  const safeSourceHeight = Math.max(1, Number(sourceHeight ?? sprite.height ?? 1) || 1);
  const widthScale = maxWidth / safeSourceWidth;
  const heightScale = maxHeight / safeSourceHeight;
  const scale = Math.min(widthScale, heightScale);

  sprite.setDisplaySize(
    Math.round(safeSourceWidth * scale),
    Math.round(safeSourceHeight * scale)
  );
};

export const configureHdSprite = (
  sprite,
  {
    scene = null,
    maxWidth = null,
    maxHeight = null,
    sourceWidth = null,
    sourceHeight = null,
    filter = Phaser.Textures.FilterMode.LINEAR,
  } = {}
) => {
  if (!sprite) {
    return sprite;
  }

  const targetScene = scene ?? sprite.scene;

  if (sprite.texture?.key && targetScene) {
    setTextureFilter(targetScene, sprite.texture.key, filter);
  }

  if (maxWidth && maxHeight) {
    fitDisplaySizePreservingAspect(sprite, maxWidth, maxHeight, sourceWidth, sourceHeight);
  }

  return sprite;
};

export const createSoftShadow = (
  scene,
  {
    x = 0,
    y = 0,
    width = 60,
    height = 24,
    alpha = 0.16,
    angle = SHADOW_ANGLE,
    color = SHADOW_COLOR,
  } = {}
) => {
  const shadow = scene.add.ellipse(x, y, width, height, color, alpha);
  shadow.setAngle(angle);
  shadow.setScale(1, 0.82);
  shadow.setDepth(-1);
  shadow.setBlendMode(Phaser.BlendModes.MULTIPLY);
  return shadow;
};

export const createAmbientWorldLighting = (
  scene,
  layer,
  {
    centerX,
    centerY,
    width,
    height,
    depth = -80,
  }
) => {
  const container = scene.add.container(0, 0);
  container.setDepth(depth);

  const vignette = scene.add.ellipse(centerX, centerY + height * 0.05, width * 1.18, height * 0.92, SHADOW_COLOR, 0.08);
  vignette.setBlendMode(Phaser.BlendModes.MULTIPLY);
  const coolGlow = scene.add.ellipse(centerX - width * 0.12, centerY - height * 0.22, width * 1.02, height * 0.74, 0x93c5fd, 0.05);
  coolGlow.setBlendMode(Phaser.BlendModes.SCREEN);
  const warmGlow = scene.add.ellipse(centerX + width * 0.08, centerY - height * 0.04, width * 0.62, height * 0.44, 0xfde68a, 0.045);
  warmGlow.setBlendMode(Phaser.BlendModes.SCREEN);

  container.add([vignette, coolGlow, warmGlow]);
  layer?.add?.(container);
  return container;
};

export const applyCanvasQuality = (game) => {
  const canvas = game?.canvas;

  if (!canvas) {
    return;
  }

  canvas.style.imageRendering = "auto";
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.transform = "translateZ(0)";
  canvas.style.backfaceVisibility = "hidden";
};
