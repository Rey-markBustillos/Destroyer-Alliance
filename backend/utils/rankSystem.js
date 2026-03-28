export const RANK_TIERS = [
  { name: "Recruit", points: 0, description: "Starting player" },
  { name: "Soldier", points: 100, description: "Basic combat ready" },
  { name: "Sergeant", points: 300, description: "Trained fighter" },
  { name: "Lieutenant", points: 700, description: "Tactical leader" },
  { name: "Captain", points: 1500, description: "Strong commander" },
  { name: "Major", points: 3000, description: "Advanced strategist" },
  { name: "Colonel", points: 6000, description: "Elite officer" },
  { name: "General", points: 10000, description: "High command" },
  { name: "Destroyer Commander", points: 15000, description: "Legendary status" },
  { name: "Supreme Destroyer", points: 25000, description: "Top 1% player" },
];

export const getRankTier = (warPoints = 0) => {
  const normalizedPoints = Math.max(0, Math.floor(Number(warPoints) || 0));

  return [...RANK_TIERS]
    .reverse()
    .find((tier) => normalizedPoints >= tier.points)
    ?? RANK_TIERS[0];
};

export const getRankName = (warPoints = 0) => getRankTier(warPoints).name;

export const getWarPointReward = (destructionPercent = 0) => {
  const normalizedDestruction = Math.max(0, Math.floor(Number(destructionPercent) || 0));

  if (normalizedDestruction >= 100) {
    return 40;
  }

  if (normalizedDestruction >= 75) {
    return 30;
  }

  if (normalizedDestruction >= 50) {
    return 20;
  }

  if (normalizedDestruction >= 25) {
    return 10;
  }

  return 0;
};

export const buildRankPayload = (warPoints = 0) => {
  const normalizedPoints = Math.max(0, Math.floor(Number(warPoints) || 0));
  const currentTier = getRankTier(normalizedPoints);
  const nextTierIndex = RANK_TIERS.findIndex((tier) => tier.name === currentTier.name) + 1;
  const nextTier = RANK_TIERS[nextTierIndex] ?? null;

  return {
    warPoints: normalizedPoints,
    rankName: currentTier.name,
    rankDescription: currentTier.description,
    nextRankName: nextTier?.name ?? currentTier.name,
    nextRankPoints: nextTier?.points ?? currentTier.points,
  };
};
