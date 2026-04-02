const createTextureRef = (key, frame = null) => (
  frame == null
    ? key
    : { key, frame }
);

export const getTextureRefKey = (textureRef) => (
  typeof textureRef === "string"
    ? textureRef
    : textureRef?.key ?? null
);

export const getTextureRefFrame = (textureRef) => (
  typeof textureRef === "string"
    ? null
    : textureRef?.frame ?? null
);

export const RANGER_SPRITE_SHEETS = {
  front: {
    key: "ranger-front-sheet",
    path: "/assets/Ranger Tala/front/rangerfront.png",
    frameWidth: 256,
    frameHeight: 283,
    frameCount: 4,
  },
  back: {
    key: "ranger-back-sheet",
    path: "/assets/Ranger Tala/back/rangerback.png",
    frameWidth: 258,
    frameHeight: 249,
    frameCount: 2,
  },
  left: {
    key: "ranger-left-sheet",
    path: "/assets/Ranger Tala/left/rangerleft.png",
    frameWidth: 211,
    frameHeight: 276,
    frameCount: 3,
  },
  right: {
    key: "ranger-right-sheet",
    path: "/assets/Ranger Tala/right/rangerright.png",
    frameWidth: 232,
    frameHeight: 241,
    frameCount: 3,
  },
};

export const RANGER_FIRE_TEXTURES = {
  back: {
    key: "ranger-back-firing",
    path: "/assets/Ranger Tala/back/backfire.png",
  },
  left: {
    key: "ranger-left-firing",
    path: "/assets/Ranger Tala/left/leftfire.png",
  },
  right: {
    key: "ranger-right-firing",
    path: "/assets/Ranger Tala/right/rightfire.png",
  },
};

export const RANGER_WALK_TEXTURES = {
  front: Array.from({ length: RANGER_SPRITE_SHEETS.front.frameCount }, (_, frame) =>
    createTextureRef(RANGER_SPRITE_SHEETS.front.key, frame)
  ),
  back: Array.from({ length: RANGER_SPRITE_SHEETS.back.frameCount }, (_, frame) =>
    createTextureRef(RANGER_SPRITE_SHEETS.back.key, frame)
  ),
  left: Array.from({ length: RANGER_SPRITE_SHEETS.left.frameCount }, (_, frame) =>
    createTextureRef(RANGER_SPRITE_SHEETS.left.key, frame)
  ),
  right: Array.from({ length: RANGER_SPRITE_SHEETS.right.frameCount }, (_, frame) =>
    createTextureRef(RANGER_SPRITE_SHEETS.right.key, frame)
  ),
};

export const RANGER_FIRING_TEXTURES = {
  front: createTextureRef(
    RANGER_SPRITE_SHEETS.front.key,
    RANGER_SPRITE_SHEETS.front.frameCount - 1
  ),
  back: RANGER_FIRE_TEXTURES.back.key,
  left: RANGER_FIRE_TEXTURES.left.key,
  right: RANGER_FIRE_TEXTURES.right.key,
};

export const RANGER_RENDER_TEXTURE_KEYS = [
  RANGER_SPRITE_SHEETS.front.key,
  RANGER_SPRITE_SHEETS.back.key,
  RANGER_SPRITE_SHEETS.left.key,
  RANGER_SPRITE_SHEETS.right.key,
  RANGER_FIRE_TEXTURES.back.key,
  RANGER_FIRE_TEXTURES.left.key,
  RANGER_FIRE_TEXTURES.right.key,
];

export const RANGER_FRONT_PREVIEW = {
  sprite: RANGER_SPRITE_SHEETS.front.path,
  frameWidth: RANGER_SPRITE_SHEETS.front.frameWidth,
  frameHeight: RANGER_SPRITE_SHEETS.front.frameHeight,
  totalFrames: RANGER_SPRITE_SHEETS.front.frameCount,
};
