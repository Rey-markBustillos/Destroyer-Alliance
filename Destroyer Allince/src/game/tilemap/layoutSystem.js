import { TILEMAP_LAYER_NAMES, TILESET_META } from "./layoutConfig";

const toPropertyMap = (properties = []) =>
  properties.reduce((acc, entry) => {
    acc[entry.name] = entry.value;
    return acc;
  }, {});

const parseObjectLayer = (objectLayer) => {
  if (!objectLayer?.objects) {
    return [];
  }

  return objectLayer.objects.map((objectData) => ({
    id: objectData.id,
    name: objectData.name,
    type: objectData.type,
    x: objectData.x,
    y: objectData.y,
    width: objectData.width || 0,
    height: objectData.height || 0,
    rotation: objectData.rotation || 0,
    properties: toPropertyMap(objectData.properties),
    raw: objectData,
  }));
};

export const preloadLayoutAssets = (scene) => {
  scene.load.image(TILESET_META.key, TILESET_META.imagePath);
  scene.load.tilemapTiledJSON(TILESET_META.mapKey, TILESET_META.mapPath);
};

export const createLayoutFromMap = (scene, mapKey = TILESET_META.mapKey) => {
  const map = scene.make.tilemap({ key: mapKey });
  const tileset = map.addTilesetImage(
    TILESET_META.tilesetName,
    TILESET_META.key,
    TILESET_META.tileWidth,
    TILESET_META.tileHeight,
    TILESET_META.margin,
    TILESET_META.spacing
  );

  if (!tileset) {
    throw new Error(
      `Tileset "${TILESET_META.tilesetName}" could not be created. Check map tileset name and preload keys.`
    );
  }

  const layers = {
    ground: map.createLayer(TILEMAP_LAYER_NAMES.GROUND, tileset, 0, 0),
    props: map.createLayer(TILEMAP_LAYER_NAMES.PROPS, tileset, 0, 0),
    collision: map.createLayer(TILEMAP_LAYER_NAMES.COLLISION, tileset, 0, 0),
    above: map.createLayer(TILEMAP_LAYER_NAMES.ABOVE, tileset, 0, 0),
  };

  // Compute an integer scale so tiles remain whole and the map fills the
  // viewport as closely as possible. Use scene.scale for the current game
  // viewport size; fall back to game config if needed.
  const viewportWidth = (scene.scale && scene.scale.width) || (scene.sys && scene.sys.game && scene.sys.game.config && scene.sys.game.config.width) || 768;
  const viewportHeight = (scene.scale && scene.scale.height) || (scene.sys && scene.sys.game && scene.sys.game.config && scene.sys.game.config.height) || 768;

  // Determine the largest integer upscale that will fit the full map inside
  // the viewport. Ensure a minimum scale of 1.
  const rawScale = Math.min(viewportWidth / map.widthInPixels, viewportHeight / map.heightInPixels);
  const computedScale = Math.max(1, Math.floor(rawScale));

  if (layers.ground) {
    layers.ground.setDepth(0).setScale(computedScale).setCullPadding(2, 2);
  }

  if (layers.props) {
    layers.props.setDepth(10).setScale(computedScale).setCullPadding(2, 2);
  }

  if (layers.collision) {
    layers.collision
      .setDepth(20)
      .setVisible(false)
      .setAlpha(0)
      .setScale(computedScale)
      .setCullPadding(2, 2);
    layers.collision.setCollisionByProperty({ collides: true });
  }

  if (layers.above) {
    layers.above.setDepth(100).setScale(computedScale).setCullPadding(2, 2);
  }

  const parsedObjects = parseObjectLayer(map.getObjectLayer(TILEMAP_LAYER_NAMES.OBJECTS));
  const objectsByType = parsedObjects.reduce((acc, objectData) => {
    if (!acc[objectData.type]) {
      acc[objectData.type] = [];
    }
    acc[objectData.type].push(objectData);
    return acc;
  }, {});

  return {
    map,
    layers,
    tileset,
    parsedObjects,
    objectsByType,
    // Expose the computed sizes so callers (camera, snapping) use the
    // scaled values.
    worldWidth: map.widthInPixels * computedScale,
    worldHeight: map.heightInPixels * computedScale,
    tileWidth: map.tileWidth * computedScale,
    tileHeight: map.tileHeight * computedScale,
    scale: computedScale,
  };
};

export const objectProp = (objectData, key, fallback = undefined) => {
  if (!objectData?.properties) {
    return fallback;
  }
  return key in objectData.properties ? objectData.properties[key] : fallback;
};
