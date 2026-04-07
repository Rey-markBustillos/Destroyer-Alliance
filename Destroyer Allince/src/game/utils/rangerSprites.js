const createTextureRef = (key, frame = null) => (
  frame == null
    ? key
    : { key, frame }
);

const createFrameTexture = (key, path) => ({ key, path });

const createWalkFrames = (direction, fileNames) => (
  fileNames.map((fileName, index) => createFrameTexture(
    `ranger-${direction}-walk-${index + 1}`,
    `/assets/Ranger Tala/${direction}/${fileName}`
  ))
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

export const RANGER_WALK_FRAME_TEXTURES = {
  front: createWalkFrames("front", [
    "rangerfront1.png",
    "rangerfront2.png",
    "rangerfront3.png",
    "rangerfront4.png",
  ]),
  back: createWalkFrames("back", [
    "rangerback1.png",
    "rangerback2.png",
    "rangerback3.png",
  ]),
  left: createWalkFrames("right", [
    "rangerright1.png",
    "rangerright2.png",
  ]),
  right: createWalkFrames("left", [
    "rangerleft1.png",
    "rangerleft2.png",
  ]),
};

export const RANGER_FIRE_TEXTURES = {
  back: createFrameTexture("ranger-back-firing", "/assets/Ranger Tala/back/backfire.png"),
  left: createFrameTexture("ranger-left-firing", "/assets/Ranger Tala/right/rightfire.png"),
  right: createFrameTexture("ranger-right-firing", "/assets/Ranger Tala/left/leftfire.png"),
};

export const RANGER_WALK_TEXTURES = Object.fromEntries(
  Object.entries(RANGER_WALK_FRAME_TEXTURES).map(([direction, textures]) => [
    direction,
    textures.map((texture) => createTextureRef(texture.key)),
  ])
);

export const RANGER_FIRING_TEXTURES = {
  front: createTextureRef(
    RANGER_WALK_FRAME_TEXTURES.front[RANGER_WALK_FRAME_TEXTURES.front.length - 1]?.key
      ?? RANGER_WALK_FRAME_TEXTURES.front[0]?.key
      ?? "soldier-front-firing"
  ),
  back: createTextureRef(RANGER_FIRE_TEXTURES.back.key),
  left: createTextureRef(RANGER_FIRE_TEXTURES.left.key),
  right: createTextureRef(RANGER_FIRE_TEXTURES.right.key),
};

export const RANGER_RENDER_TEXTURE_KEYS = [
  ...Object.values(RANGER_WALK_FRAME_TEXTURES).flat().map((texture) => texture.key),
  ...Object.values(RANGER_FIRE_TEXTURES).map((texture) => texture.key),
];

export const RANGER_FRONT_PREVIEW = {
  frames: RANGER_WALK_FRAME_TEXTURES.front.map((texture) => texture.path),
};
