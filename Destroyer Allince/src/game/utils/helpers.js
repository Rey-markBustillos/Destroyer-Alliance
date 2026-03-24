export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const gridToWorld = (gridX, gridY, tileSize) => ({
  x: gridX * tileSize + tileSize / 2,
  y: gridY * tileSize + tileSize / 2,
});
