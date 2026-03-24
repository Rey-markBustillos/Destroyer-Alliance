export const TILESET_META = {
  key: "tiles",
  mapKey: "level1",
  mapPath: "/assets/maps/level1.json",
  imagePath: "/assets/tiles.png",
  tilesetName: "terrain",
  tileWidth: 22,
  tileHeight: 29,
  margin: 0,
  spacing: 0,
  upscale: 1,
};

export const TILEMAP_LAYER_NAMES = {
  GROUND: "ground",
  PROPS: "props",
  COLLISION: "collision",
  OBJECTS: "objects",
  ABOVE: "above",
};

export const GAME_RENDER_CONFIG = {
  pixelArt: true,
  roundPixels: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
};
