import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createGame, destroyGame } from "../game/main";
import SpriteAnimator from "../components/SpriteAnimator";
import MobileLandscapePrompt from "../components/MobileLandscapePrompt";
import { RANGER_FRONT_PREVIEW } from "../game/utils/rangerSprites";
import { applyWarResolution, fetchWarTarget, syncGameSnapshot } from "../services/game";
import { getGameSnapshot, saveGameSnapshot } from "../services/gameStorage";
import { getSession, saveSession } from "../services/session";
import soundManager from "../services/soundManager";
import { primeGameRoute } from "../utils/routePreload";

const VEHICLE_LEVEL_STATS = {
  tank: {
    baseHealth: 260,
    healthPerLevel: 120,
    baseDamage: 80,
    damagePerLevel: 18,
  },
  helicopter: {
    baseHealth: 170,
    healthPerLevel: 70,
    baseDamage: 24,
    damagePerLevel: 10,
  },
};

const TANK_SHOTS_PER_DEPLOY = 10;
const HELICOPTER_SHOTS_PER_DEPLOY = 15;

const resolveVehicleStatsForLevel = (type, level = 1) => {
  const profile = VEHICLE_LEVEL_STATS[type];
  const resolvedLevel = Math.max(1, Number(level ?? 1) || 1);

  if (!profile) {
    return { health: 1, damage: 1 };
  }

  return {
    health: profile.baseHealth + ((resolvedLevel - 1) * profile.healthPerLevel),
    damage: profile.baseDamage + ((resolvedLevel - 1) * profile.damagePerLevel),
  };
};

const deriveArmyFromSnapshot = (snapshot) => {
  const buildings = Array.isArray(snapshot?.buildings) ? snapshot.buildings : [];
  const hasTentArmy = buildings.some((building) => building?.type === "tent");
  const soldiers = buildings.reduce(
    (total, building) => total + (
      (building?.type === "tent" || (!hasTentArmy && building?.type === "command-center"))
        ? Math.max(0, Number(building?.soldierCount ?? 0) || 0)
        : 0
    ),
    0
  );
  const rangers = buildings.reduce(
    (total, building) => total + (
      (building?.type === "tent" || (!hasTentArmy && building?.type === "command-center"))
        ? Math.max(0, Number(building?.rangerTalaCount ?? 0) || 0)
        : 0
    ),
    0
  );
  const tankUnits = buildings
    .filter((building) => building?.type === "battle-tank" && building?.hasTank)
    .map((building, index) => {
      const stats = resolveVehicleStatsForLevel("tank", building?.level);
      return {
        id: building?.id ?? `tank-${index}`,
        health: stats.health,
        damage: stats.damage,
        shotsRemaining: Math.max(
          0,
          Math.min(TANK_SHOTS_PER_DEPLOY, Number(building?.tankShotsRemaining ?? TANK_SHOTS_PER_DEPLOY) || TANK_SHOTS_PER_DEPLOY)
        ),
        maxShots: TANK_SHOTS_PER_DEPLOY,
      };
    });
  const helicopterUnits = buildings
    .filter((building) => building?.type === "skyport" && building?.hasChopper)
    .map((building, index) => {
      const stats = resolveVehicleStatsForLevel("helicopter", building?.level);
      return {
        id: building?.id ?? `helicopter-${index}`,
        health: stats.health,
        damage: stats.damage,
        shotsRemaining: Math.max(
          0,
          Math.min(HELICOPTER_SHOTS_PER_DEPLOY, Number(building?.chopperShotsRemaining ?? HELICOPTER_SHOTS_PER_DEPLOY) || HELICOPTER_SHOTS_PER_DEPLOY)
        ),
        maxShots: HELICOPTER_SHOTS_PER_DEPLOY,
      };
    });

  return {
    soldiers,
    rangers,
    energy: Math.max(0, Number(snapshot?.energy ?? 0) || 0),
    tanks: tankUnits.length,
    tankUnits,
    helicopters: helicopterUnits.length,
    helicopterUnits,
  };
};

const getTotalTroops = (army) =>
  Math.max(0, Number(army?.soldiers ?? 0) || 0)
  + Math.max(0, Number(army?.rangers ?? 0) || 0)
  + Math.max(0, Number(army?.tanks ?? 0) || 0)
  + Math.max(0, Number(army?.helicopters ?? 0) || 0);

const getWarPointsEarned = (destructionPercent) => {
  const percent = Math.max(0, Number(destructionPercent ?? 0) || 0);

  if (percent >= 100) {
    return 40;
  }

  if (percent >= 75) {
    return 30;
  }

  if (percent >= 50) {
    return 20;
  }

  if (percent >= 25) {
    return 10;
  }

  return 0;
};

const formatCountdown = (value) => {
  const totalSeconds = Math.max(0, Math.ceil((Number(value ?? 0) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

function DeploymentOptionCard({
  label,
  imageSrc,
  imageAlt,
  spritePreview = null,
  count,
  toneClass,
  isSelected,
  disabled,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mobile-landscape-war-deploy-button flex min-w-[5.2rem] items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 min-[901px]:min-w-28 min-[901px]:gap-2.5 min-[901px]:rounded-2xl min-[901px]:px-3 min-[901px]:py-2.5 ${
        isSelected
          ? `${toneClass} border-transparent text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.18)]`
          : "border-white/10 bg-white/5 text-white hover:bg-white/10"
      }`}
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
        isSelected ? "border-black/10 bg-white/20" : "border-white/10 bg-slate-950/60"
      } min-[901px]:h-10 min-[901px]:w-10`}>
        {spritePreview ? (
          <SpriteAnimator
            sprite={spritePreview.sprite}
            frameWidth={spritePreview.frameWidth}
            frameHeight={spritePreview.frameHeight}
            totalFrames={spritePreview.totalFrames}
            displayWidth={24}
            displayHeight={26}
            chrome={false}
            label={imageAlt}
            className="flex items-center justify-center"
          />
        ) : (
          <img
            src={imageSrc}
            alt={imageAlt}
            className="h-5 w-5 object-contain min-[901px]:h-6 min-[901px]:w-6"
            draggable="false"
          />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-black uppercase tracking-[0.12em] min-[901px]:text-xs min-[901px]:tracking-[0.16em]">
          {label}
        </p>
        <p className={`mt-0.5 text-[11px] font-semibold min-[901px]:text-sm ${
          isSelected ? "text-slate-900/80" : "text-slate-300"
        }`}>
          {count} ready
        </p>
      </div>
    </button>
  );
}

const applyRaidLossesToSnapshot = (snapshot, summary) => {
  if (!snapshot || !summary) {
    return snapshot;
  }

  let nextBuildings = Array.isArray(snapshot.buildings)
    ? snapshot.buildings.map((building) => ({ ...building }))
    : [];
  const survivors = {
    soldiers: Math.max(0, Number(summary?.survivors?.soldiers ?? 0) || 0),
    rangers: Math.max(0, Number(summary?.survivors?.rangers ?? 0) || 0),
    tanks: Math.max(0, Number(summary?.survivors?.tanks ?? 0) || 0),
    helicopters: Math.max(0, Number(summary?.survivors?.helicopters ?? 0) || 0),
  };
  const hasTentArmy = nextBuildings.some((building) => building?.type === "tent");

  let remainingSoldiers = survivors.soldiers;
  let remainingRangers = survivors.rangers;
  nextBuildings.forEach((building) => {
    if (building?.type !== "tent" && !(!hasTentArmy && building?.type === "command-center")) {
      return;
    }

    const currentSoldiers = Math.max(0, Number(building.soldierCount ?? 0) || 0);
    const currentRangers = Math.max(0, Number(building.rangerTalaCount ?? 0) || 0);
    const keptSoldiers = Math.min(currentSoldiers, remainingSoldiers);
    const keptRangers = Math.min(currentRangers, remainingRangers);
    building.soldierCount = keptSoldiers;
    building.rangerTalaCount = keptRangers;
    remainingSoldiers -= keptSoldiers;
    remainingRangers -= keptRangers;
  });

  const survivingTankUnits = new Map(
    (summary?.survivingTankUnits ?? []).map((unit) => [String(unit?.id), unit])
  );
  const survivingHelicopterUnits = new Map(
    (summary?.survivingHelicopterUnits ?? []).map((unit) => [String(unit?.id), unit])
  );

  nextBuildings = nextBuildings.map((building) => {
    if (building?.type === "battle-tank" && building?.hasTank) {
      const unit = survivingTankUnits.get(String(building.id));

      if (!unit) {
        return {
          ...building,
          hasTank: false,
          tankShotsRemaining: 0,
        };
      }

      return {
        ...building,
        hasTank: true,
        tankShotsRemaining: Math.max(
          0,
          Math.min(TANK_SHOTS_PER_DEPLOY, Number(unit?.shotsRemaining ?? 0) || 0)
        ),
      };
    }

    if (building?.type === "skyport" && building?.hasChopper) {
      const unit = survivingHelicopterUnits.get(String(building.id));

      if (!unit) {
        return {
          ...building,
          hasChopper: false,
          chopperShotsRemaining: 0,
        };
      }

      return {
        ...building,
        hasChopper: true,
        chopperShotsRemaining: Math.max(
          0,
          Math.min(HELICOPTER_SHOTS_PER_DEPLOY, Number(unit?.shotsRemaining ?? 0) || 0)
        ),
      };
    }

    return building;
  });

  return {
    ...snapshot,
    buildings: nextBuildings,
  };
};

export default function WarPage() {
  const navigate = useNavigate();
  const emptyReserves = useMemo(() => ({
    energy: 0,
    soldiers: 0,
    rangers: 0,
    tanks: 0,
    helicopters: 0,
  }), []);
  const gameRootRef = useRef(null);
  const gameRef = useRef(null);
  const battleSceneRef = useRef(null);
  const targetRef = useRef(null);
  const armyRef = useRef(null);
  const snapshotRef = useRef(null);
  const previewSignatureRef = useRef("");
  const savedSummaryRef = useRef("");
  const appliedLossSignatureRef = useRef("");
  const appliedWarResolutionRef = useRef("");
  const autoSearchTriggeredRef = useRef(false);

  const session = useMemo(() => getSession(), []);
  const [snapshot, setSnapshot] = useState(() => getGameSnapshot(session));
  const army = useMemo(() => deriveArmyFromSnapshot(snapshot), [snapshot]);

  const [lookupState, setLookupState] = useState("idle");
  const [, setLookupError] = useState("");
  const [target, setTarget] = useState(null);
  const [musicStatus, setMusicStatus] = useState(() => soundManager.getStatus());
  const [musicPanelOpen, setMusicPanelOpen] = useState(false);
  const [raidState, setRaidState] = useState({
    phase: "idle",
    destructionPercent: 0,
    loot: 0,
    energy: 0,
    attackersRemaining: 0,
    defendersRemaining: 0,
    timeRemainingMs: 0,
    reserves: {
      energy: 0,
      soldiers: 0,
      rangers: 0,
      tanks: 0,
      helicopters: 0,
    },
    selectedDeploymentType: "soldier",
    summary: null,
  });

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    const unsubscribe = soundManager.subscribe((status) => {
      setMusicStatus(status);
    });

    soundManager.startBackgroundMusic({
      fadeInDurationMs: 450,
      volume: soundManager.getStatus().volume,
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    void primeGameRoute();
  }, []);

  useEffect(() => {
    armyRef.current = army;
  }, [army]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (!gameRootRef.current) {
      return undefined;
    }

    const game = createGame(gameRootRef.current, { mode: "war" });
    gameRef.current = game;

    const handleSceneReady = () => {
      const scene = game.scene.getScene("GameScene");

      if (!scene) {
        return;
      }

      battleSceneRef.current = scene;

      const handleRaidStateChange = (nextState) => {
        if (nextState?.summary && targetRef.current) {
          const recordSignature = JSON.stringify({
            targetId: targetRef.current.id,
            outcome: nextState.summary.outcome,
            loot: nextState.summary.loot,
            destructionPercent: nextState.summary.destructionPercent,
            remainingTroops: nextState.summary.remainingTroops,
          });

          if (appliedLossSignatureRef.current !== recordSignature) {
            appliedLossSignatureRef.current = recordSignature;
            const nextSnapshot = applyRaidLossesToSnapshot(
              snapshotRef.current ?? { gold: 1200, buildings: [] },
              nextState.summary
            );
            const savedSnapshot = saveGameSnapshot(nextSnapshot, session);
            snapshotRef.current = savedSnapshot;
            setSnapshot(savedSnapshot);

            if (session?.token) {
              syncGameSnapshot(savedSnapshot, session.token).catch((error) => {
                console.error("Unable to save raid troop losses:", error);
              });
            }
          }

          if (
            appliedWarResolutionRef.current !== recordSignature
            && session?.token
          ) {
            appliedWarResolutionRef.current = recordSignature;
            applyWarResolution({
              targetUserId: targetRef.current.id,
              defenderLosses: nextState.summary.defenderLosses,
              loot: nextState.summary.loot,
              destructionPercent: nextState.summary.destructionPercent,
            }, session.token).catch((error) => {
              console.error("Unable to save enemy defender losses:", error);
            }).then((result) => {
              if (!result || typeof result.attackerGold !== "number") {
                return;
              }

              const nextSnapshot = {
                ...(snapshotRef.current ?? { buildings: [] }),
                gold: result.attackerGold,
                energy: snapshotRef.current?.energy ?? 0,
              };
              const savedSnapshot = saveGameSnapshot(nextSnapshot, session);
              snapshotRef.current = savedSnapshot;
              setSnapshot(savedSnapshot);

              saveSession({
                ...(getSession() ?? {}),
                gold: result.attackerGold,
                warPoints: typeof result.warPoints === "number" ? result.warPoints : getSession()?.warPoints,
                rankName: result.rankName ?? getSession()?.rankName,
                rankDescription: result.rankDescription ?? getSession()?.rankDescription,
                nextRankName: result.nextRankName ?? getSession()?.nextRankName,
                nextRankPoints: result.nextRankPoints ?? getSession()?.nextRankPoints,
              });

              setTarget((currentTarget) => {
                if (!currentTarget || currentTarget.id !== targetRef.current?.id) {
                  return currentTarget;
                }

                const defenderLosses = nextState.summary?.defenderLosses ?? {};
                const nextBuildings = Array.isArray(currentTarget.buildings)
                  ? currentTarget.buildings.map((building) => {
                    const hasTentArmy = currentTarget.buildings?.some((entry) => entry?.type === "tent");

                    if (building?.type !== "tent" && !(!hasTentArmy && building?.type === "command-center")) {
                      return building;
                    }

                    const loss = Math.max(
                      0,
                      Math.floor(
                        Number(defenderLosses[String(building.id)] ?? defenderLosses[building.id] ?? 0) || 0
                      )
                    );

                    if (!loss) {
                      return building;
                    }

                    return {
                      ...building,
                      soldierCount: Math.max(
                        0,
                        Number(building.soldierCount ?? 0) - Math.min(
                          Math.max(0, Number(building.soldierCount ?? 0) || 0),
                          loss
                        )
                      ),
                      rangerTalaCount: Math.max(
                        0,
                        Number(building.rangerTalaCount ?? 0) - Math.max(
                          0,
                          loss - Math.max(0, Number(building.soldierCount ?? 0) || 0)
                        )
                      ),
                    };
                  })
                  : [];

                const nextTarget = {
                  ...currentTarget,
                  gold: typeof result.targetGold === "number" ? result.targetGold : currentTarget.gold,
                  loot: typeof result.targetGold === "number"
                    ? Math.max(0, Math.floor(result.targetGold * 0.2))
                    : currentTarget.loot,
                  buildings: nextBuildings,
                };

                targetRef.current = nextTarget;
                return nextTarget;
              });
            });
          }

          savedSummaryRef.current = recordSignature;
        }

        setRaidState(nextState);
      };

      scene.events.on("raid-state-change", handleRaidStateChange);
      scene.previewRaidTarget({
        target: targetRef.current,
        army: armyRef.current,
      });

      gameRef.current.cleanup = () => {
        scene.events.off("raid-state-change", handleRaidStateChange);
        battleSceneRef.current = null;
      };
    };

    game.events.on("game-scene-ready", handleSceneReady);

    return () => {
      game.events.off("game-scene-ready", handleSceneReady);
      if (gameRef.current?.cleanup) {
        gameRef.current.cleanup();
      }
      destroyGame(game);
    };
  }, [session]);

  useEffect(() => {
    if (raidState.phase === "planning" || raidState.phase === "active" || raidState.phase === "finished" || raidState.summary) {
      return;
    }

    const nextSignature = JSON.stringify({
      targetId: target?.id ?? null,
      army,
    });

    if (previewSignatureRef.current === nextSignature) {
      return;
    }

    previewSignatureRef.current = nextSignature;
    battleSceneRef.current?.previewRaidTarget({
      target,
      army,
    });
  }, [target, army, raidState.phase, raidState.summary]);

  const resetRaidPanel = useCallback(() => {
    savedSummaryRef.current = "";
    appliedLossSignatureRef.current = "";
    appliedWarResolutionRef.current = "";
    setRaidState({
      phase: "idle",
      destructionPercent: 0,
      loot: 0,
      energy: 0,
      attackersRemaining: 0,
      defendersRemaining: 0,
      timeRemainingMs: 0,
      reserves: emptyReserves,
      selectedDeploymentType: "soldier",
      summary: null,
    });
  }, [emptyReserves]);

  const resolveTarget = useCallback(async () => {
    const token = session?.token ?? null;
    const currentTotalTroops = getTotalTroops(army);
    const previousTargetId = targetRef.current?.id ?? null;

    if (!token) {
      setLookupState("error");
      setLookupError("Login session missing.");
      return;
    }

    if (currentTotalTroops <= 0) {
      setLookupState("error");
      setLookupError("Train troops first before entering matchmaking.");
      return;
    }

    setLookupState("loading");
    setLookupError("");
    setTarget(null);
    resetRaidPanel();

    try {
      let result = null;

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const candidate = await fetchWarTarget(token);

        if (!candidate) {
          continue;
        }

        result = candidate;

        if (!previousTargetId || candidate.id !== previousTargetId) {
          break;
        }
      }

      if (!result) {
        throw new Error("Unable to find another village or base.");
      }

      setTarget(result);
      setLookupState("ready");
    } catch (error) {
      setTarget(null);
      setLookupState("error");
      setLookupError(error.response?.data?.message || "Unable to find another village or base.");
    }
  }, [session, army, resetRaidPanel]);

  const handleFindMatch = useCallback(async () => {
    await resolveTarget();
  }, [resolveTarget]);

  const handleStartAttack = () => {
    battleSceneRef.current?.startRaidAttack();
  };

  const handleSelectDeploymentType = useCallback((type) => {
    const didSelect = battleSceneRef.current?.setDeploymentType?.(type);

    if (didSelect === false) {
      return;
    }

    setRaidState((current) => ({
      ...current,
      selectedDeploymentType: type,
    }));
  }, []);

  const handleBackToBase = () => {
    void primeGameRoute().finally(() => {
      navigate("/game");
    });
  };

  const handleToggleMusicMute = () => {
    soundManager.toggleMuted();
  };

  const handleToggleMusicPanel = () => {
    setMusicPanelOpen((open) => !open);
  };

  const handleLowerMusicVolume = () => {
    soundManager.stepBackgroundMusicVolume(-0.1, { fadeDurationMs: 150 });
  };

  const handleRaiseMusicVolume = () => {
    soundManager.stepBackgroundMusicVolume(0.1, { fadeDurationMs: 150 });
  };

  const totalTroops = getTotalTroops(army);
  const canAttack = totalTroops > 0 && target && raidState.phase === "ready";
  const canFindMatch = lookupState !== "loading" && raidState.phase !== "planning" && raidState.phase !== "active";
  const summary = raidState.summary;
  const earnedWarPoints = getWarPointsEarned(summary?.destructionPercent);
  const playerName = session?.name || session?.email?.split("@")[0] || "Commander";
  const musicVolumePercent = musicStatus?.volumePercent ?? Math.round((musicStatus?.volume ?? 0) * 100);
  const canLowerMusicVolume = musicVolumePercent > 0;
  const canRaiseMusicVolume = musicVolumePercent < 100;
  const raidTimerLabel = formatCountdown(raidState.timeRemainingMs);
  const showRaidTimer = raidState.phase === "planning" || raidState.phase === "active";
  const attackButtonLabel = raidState.phase === "planning"
    ? "Prep"
    : raidState.phase === "active"
      ? "Attack"
      : "Attack";
  const canChooseDeployment = Boolean(target) && ["ready", "planning", "active"].includes(raidState.phase);
  const deploymentCounts = {
    soldier: raidState.phase === "planning" || raidState.phase === "active"
      ? (raidState.reserves?.soldiers ?? 0)
      : (army.soldiers ?? 0),
    ranger: raidState.phase === "planning" || raidState.phase === "active"
      ? (raidState.reserves?.rangers ?? 0)
      : (army.rangers ?? 0),
    tank: raidState.phase === "planning" || raidState.phase === "active"
      ? (raidState.reserves?.tanks ?? 0)
      : (army.tanks ?? 0),
    helicopter: raidState.phase === "planning" || raidState.phase === "active"
      ? (raidState.reserves?.helicopters ?? 0)
      : (army.helicopters ?? 0),
  };
  const deploymentOptions = [
    {
      type: "soldier",
      label: "Riflemen",
      imageSrc: "/assets/army/front/firing.png",
      imageAlt: "Riflemen",
      count: deploymentCounts.soldier,
      toneClass: "bg-sky-300",
    },
    {
      type: "tank",
      label: "Tank",
      imageSrc: "/assets/tank/tank1.png",
      imageAlt: "Tank",
      count: deploymentCounts.tank,
      toneClass: "bg-amber-300",
    },
    {
      type: "ranger",
      label: "Ranger Tala",
      imageSrc: "/assets/Ranger Tala/front/rangerfront.png",
      imageAlt: "Ranger Tala",
      spritePreview: RANGER_FRONT_PREVIEW,
      count: deploymentCounts.ranger,
      toneClass: "bg-cyan-300",
    },
    {
      type: "helicopter",
      label: "Helicopter",
      imageSrc: "/assets/parkingchopper-Photoroom.png",
      imageAlt: "Helicopter",
      count: deploymentCounts.helicopter,
      toneClass: "bg-emerald-300",
    },
  ];
  const visibleDeploymentOptions = deploymentOptions.filter((option) => option.count > 0);

  useEffect(() => {
    if (!visibleDeploymentOptions.length) {
      return;
    }

    const selectedStillAvailable = visibleDeploymentOptions.some(
      (option) => option.type === raidState.selectedDeploymentType
    );

    if (selectedStillAvailable) {
      return;
    }

    handleSelectDeploymentType(visibleDeploymentOptions[0].type);
  }, [visibleDeploymentOptions, raidState.selectedDeploymentType, handleSelectDeploymentType]);

  useEffect(() => {
    if (autoSearchTriggeredRef.current) {
      return;
    }

    if (!session?.token || totalTroops <= 0) {
      return;
    }

    autoSearchTriggeredRef.current = true;
    queueMicrotask(() => {
      handleFindMatch();
    });
  }, [session, totalTroops, handleFindMatch]);

  return (
    <main className="app-screen-height relative overflow-hidden bg-[radial-gradient(circle_at_top,#2c5c3f_0%,#173126_48%,#08120e_100%)] text-white">
      <div ref={gameRootRef} className="absolute inset-0 h-full w-full overflow-hidden" />
      <MobileLandscapePrompt />

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.32)_0%,rgba(2,6,23,0.04)_22%,rgba(2,6,23,0.04)_78%,rgba(2,6,23,0.36)_100%)]" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-1.5 py-1.5 min-[901px]:px-4 min-[901px]:py-3">
        <div className="flex flex-wrap items-start justify-between gap-1.5 min-[901px]:gap-4">
          <div className="pointer-events-none flex flex-col items-start gap-0.5 min-[901px]:gap-1">
            <p className="mobile-landscape-war-name text-[10px] font-black text-white min-[901px]:text-sm">{playerName}</p>
            <div className="flex items-baseline gap-1.5">
              <p className="mobile-landscape-war-kicker text-[0.38rem] uppercase tracking-[0.14em] text-amber-300/70 min-[901px]:text-[0.52rem]">Loot</p>
              <p className="mobile-landscape-war-value text-[10px] font-black text-amber-200 min-[901px]:text-sm">{raidState.loot ?? 0}</p>
            </div>
            <div className="flex items-baseline gap-1.5">
              <p className="mobile-landscape-war-kicker text-[0.38rem] uppercase tracking-[0.14em] text-sky-300/70 min-[901px]:text-[0.52rem]">Energy</p>
              <p className="mobile-landscape-war-value text-[10px] font-black text-sky-100 min-[901px]:text-sm">{raidState.energy ?? army.energy ?? 0}</p>
            </div>
            <div className="flex items-baseline gap-1.5">
              <p className="mobile-landscape-war-kicker text-[0.38rem] uppercase tracking-[0.14em] text-rose-300/70 min-[901px]:text-[0.52rem]">Damage</p>
              <p className="mobile-landscape-war-value text-[10px] font-black text-rose-200 min-[901px]:text-sm">{raidState.destructionPercent ?? 0}%</p>
            </div>
            {showRaidTimer ? (
              <p className={`mobile-landscape-war-value text-[10px] font-black min-[901px]:text-sm ${
                raidState.phase === "planning" ? "text-amber-200" : "text-cyan-100"
              }`}>
                {raidTimerLabel}
              </p>
            ) : null}
            {target ? (
              <>
                <div className="flex items-baseline gap-1.5">
                  <p className="mobile-landscape-war-kicker text-[0.38rem] uppercase tracking-[0.14em] text-cyan-300/70 min-[901px]:text-[0.52rem]">Enemy</p>
                  <p className="mobile-landscape-war-name text-[10px] font-black text-cyan-100 min-[901px]:text-sm">{target.name}</p>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <p className="mobile-landscape-war-kicker text-[0.38rem] uppercase tracking-[0.14em] text-amber-300/70 min-[901px]:text-[0.52rem]">Lootable</p>
                  <p className="mobile-landscape-war-meta text-[9px] font-semibold text-amber-200 min-[901px]:text-[11px]">{target.loot ?? 0}</p>
                </div>
              </>
            ) : null}
          </div>

          <div className="mobile-landscape-war-actions pointer-events-auto flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950/72 px-1 py-1 shadow-[0_10px_28px_rgba(2,6,23,0.28)] min-[901px]:gap-2 min-[901px]:rounded-[1.1rem] min-[901px]:bg-slate-950/54 min-[901px]:px-2 min-[901px]:py-2 min-[901px]:backdrop-blur">
            <button
              type="button"
              onClick={handleBackToBase}
              className="mobile-landscape-war-button rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-white/10 min-[901px]:rounded-xl min-[901px]:px-3 min-[901px]:py-2 min-[901px]:text-sm"
            >
              Exit Raid
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={handleToggleMusicPanel}
                className="mobile-landscape-war-button rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-violet-100 transition hover:bg-white/10 min-[901px]:rounded-xl min-[901px]:px-3 min-[901px]:py-2 min-[901px]:text-sm"
              >
                Music
              </button>

              {musicPanelOpen ? (
                <div className="mobile-landscape-war-music-popover absolute right-0 top-full z-20 mt-1.5 min-w-38 rounded-xl border border-white/10 bg-slate-950/96 p-2 shadow-[0_14px_36px_rgba(2,6,23,0.35)] min-[901px]:bg-slate-950/90 min-[901px]:backdrop-blur-md">
                  <button
                    type="button"
                    onClick={handleToggleMusicMute}
                    className="mobile-landscape-war-note w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-violet-100 transition hover:bg-white/10"
                  >
                    {musicStatus?.isMuted ? "Unmute" : "Mute"}
                  </button>

                  <div className="mt-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleLowerMusicVolume}
                      disabled={!canLowerMusicVolume}
                      className="mobile-landscape-war-note rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-cyan-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Vol -
                    </button>
                    <button
                      type="button"
                      onClick={handleRaiseMusicVolume}
                      disabled={!canRaiseMusicVolume}
                      className="mobile-landscape-war-note rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-cyan-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Vol +
                    </button>
                  </div>

                  <p className="mobile-landscape-war-note mt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-200">
                    {musicStatus?.isMuted ? "Muted" : `Volume ${musicVolumePercent}%`}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mobile-landscape-war-left-rail pointer-events-none absolute left-0 top-1/2 z-10 -translate-y-1/2 pl-2 min-[901px]:pl-4">
        <div className="mobile-landscape-war-side-card pointer-events-auto flex w-32 flex-col gap-1.5 rounded-[0.95rem] border border-white/10 bg-slate-950/72 p-1.5 shadow-[0_14px_36px_rgba(2,6,23,0.28)] min-[901px]:w-48 min-[901px]:gap-2 min-[901px]:rounded-[1.1rem] min-[901px]:bg-slate-950/52 min-[901px]:p-2.5 min-[901px]:backdrop-blur">
          <button
            type="button"
            onClick={handleFindMatch}
            disabled={!canFindMatch}
            className="mobile-landscape-war-button rounded-lg bg-emerald-400 px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 min-[901px]:rounded-xl min-[901px]:px-3 min-[901px]:py-2.5 min-[901px]:text-xs min-[901px]:tracking-[0.16em]"
          >
            {lookupState === "loading" ? "Searching..." : "Search Another Village"}
          </button>
          <button
            type="button"
            onClick={handleStartAttack}
            disabled={!canAttack}
            className="mobile-landscape-war-button rounded-lg bg-rose-500 px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50 min-[901px]:rounded-xl min-[901px]:px-3 min-[901px]:py-2.5 min-[901px]:text-xs min-[901px]:tracking-[0.16em]"
          >
            {attackButtonLabel}
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-2 pb-2 min-[901px]:px-4 min-[901px]:pb-4">
        <div className="mobile-landscape-war-bottom-bar pointer-events-auto mx-auto max-w-lg rounded-2xl border border-white/10 bg-slate-950/74 px-2.5 py-2 shadow-[0_14px_36px_rgba(2,6,23,0.3)] min-[901px]:max-w-3xl min-[901px]:rounded-[1.2rem] min-[901px]:bg-slate-950/54 min-[901px]:px-4 min-[901px]:py-3 min-[901px]:backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2 min-[901px]:gap-4">
            {canChooseDeployment ? (
              visibleDeploymentOptions.length ? (
                <div className="flex flex-wrap gap-1.5 min-[901px]:gap-2">
                  {visibleDeploymentOptions.map((option) => (
                    <DeploymentOptionCard
                      key={option.type}
                      label={option.label}
                      imageSrc={option.imageSrc}
                      imageAlt={option.imageAlt}
                      spritePreview={option.spritePreview}
                      count={option.count}
                      toneClass={option.toneClass}
                      isSelected={raidState.selectedDeploymentType === option.type}
                      disabled={false}
                      onClick={() => handleSelectDeploymentType(option.type)}
                    />
                  ))}
                </div>
              ) : (
                <p className="mobile-landscape-war-note text-[11px] font-semibold leading-tight text-slate-400 min-[901px]:text-xs">
                  No troops available to deploy.
                </p>
              )
            ) : (
              <p className="mobile-landscape-war-note text-[11px] font-semibold leading-tight text-slate-400 min-[901px]:text-xs">
                Find a target first to choose which unit attacks first.
              </p>
            )}
          </div>
          {raidState.phase === "planning" ? (
            <p className="mobile-landscape-war-note mt-2 text-[11px] font-semibold leading-tight text-amber-200 min-[901px]:mt-3 min-[901px]:text-xs">
              You have 1 minute to inspect the enemy base, or the 2-minute attack timer starts as soon as you deploy the first troop.
            </p>
          ) : null}
          {raidState.phase === "active" ? (
            <p className="mobile-landscape-war-note mt-2 text-[11px] font-semibold leading-tight text-slate-300 min-[901px]:mt-3 min-[901px]:text-xs">
              Tap a unit card to decide what goes first, then place it on the battlefield. Tank uses {TANK_SHOTS_PER_DEPLOY} shots max and Chopper uses {HELICOPTER_SHOTS_PER_DEPLOY} shots max.
            </p>
          ) : null}
        </div>
      </div>

      {summary ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/54 p-6">
          <div className="mobile-landscape-war-summary pointer-events-auto w-full max-w-xl rounded-4xl border border-white/10 bg-slate-950/94 p-6 text-white shadow-[0_24px_90px_rgba(2,6,23,0.55)] min-[901px]:bg-slate-950/90 min-[901px]:backdrop-blur">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">Battle Result</p>
            <h2 className={`mobile-landscape-war-summary-title mt-3 text-4xl font-black ${summary.outcome === "victory" ? "text-emerald-300" : "text-rose-300"}`}>
              {summary.outcome === "victory" ? "Victory" : "You Lose"}
            </h2>
            <p className="mt-2 text-sm text-slate-300">{summary.reason}</p>
            <p className={`mt-3 text-base font-black ${summary.outcome === "victory" ? "text-emerald-200" : "text-rose-200"}`}>
              {summary.outcome === "victory"
                ? `You gained ${earnedWarPoints} War Points and ${summary.loot} loot.`
                : `You earned ${earnedWarPoints} War Points and got ${summary.loot} loot.`}
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Destruction</p>
                <p className="mt-1 text-2xl font-black text-amber-200">{summary.destructionPercent}%</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Loot Gained</p>
                <p className="mt-1 text-2xl font-black text-emerald-200">{summary.loot}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">War Points</p>
                <p className="mt-1 text-2xl font-black text-sky-200">+{earnedWarPoints}</p>
              </div>
            </div>

            <p className="mt-4 text-sm font-semibold text-slate-300">
              Troops Left: <span className="text-sky-200">{summary.remainingTroops}</span>
            </p>
            <p className="mt-1 text-sm font-semibold text-cyan-200">
              Energy Used: {summary.energySpent ?? 0}
            </p>
            <p className="mt-1 text-sm font-semibold text-yellow-200">
              War Points Earned: +{earnedWarPoints}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleBackToBase}
                className="rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-950 transition hover:bg-emerald-300"
              >
                Back to Base
              </button>
              <button
                type="button"
                onClick={handleFindMatch}
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white transition hover:bg-white/10"
              >
                Search Another Base
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
