import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createGame, destroyGame } from "../game/main";
import MobileLandscapePrompt from "../components/MobileLandscapePrompt";
import { applyWarResolution, fetchWarTarget, syncGameSnapshot } from "../services/game";
import { getBattleRecords, saveBattleRecord } from "../services/battleRecordStorage";
import { getGameSnapshot, saveGameSnapshot } from "../services/gameStorage";
import { getSession, saveSession } from "../services/session";
import soundManager from "../services/soundManager";

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
    energy: Math.max(0, Number(snapshot?.energy ?? 0) || 0),
    tanks: tankUnits.length,
    tankUnits,
    helicopters: helicopterUnits.length,
    helicopterUnits,
  };
};

const getTotalTroops = (army) =>
  Math.max(0, Number(army?.soldiers ?? 0) || 0)
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

const applyRaidLossesToSnapshot = (snapshot, summary) => {
  if (!snapshot || !summary) {
    return snapshot;
  }

  let nextBuildings = Array.isArray(snapshot.buildings)
    ? snapshot.buildings.map((building) => ({ ...building }))
    : [];
  const survivors = {
    soldiers: Math.max(0, Number(summary?.survivors?.soldiers ?? 0) || 0),
    tanks: Math.max(0, Number(summary?.survivors?.tanks ?? 0) || 0),
    helicopters: Math.max(0, Number(summary?.survivors?.helicopters ?? 0) || 0),
  };
  const hasTentArmy = nextBuildings.some((building) => building?.type === "tent");

  let remainingSoldiers = survivors.soldiers;
  nextBuildings.forEach((building) => {
    if (building?.type !== "tent" && !(!hasTentArmy && building?.type === "command-center")) {
      return;
    }

    const currentCount = Math.max(0, Number(building.soldierCount ?? 0) || 0);
    const keptSoldiers = Math.min(currentCount, remainingSoldiers);
    building.soldierCount = keptSoldiers;
    remainingSoldiers -= keptSoldiers;
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
  const [lookupError, setLookupError] = useState("");
  const [target, setTarget] = useState(null);
  const [battleRecords, setBattleRecords] = useState(() => getBattleRecords(session));
  const [musicStatus, setMusicStatus] = useState(() => soundManager.getStatus());
  const [musicPanelOpen, setMusicPanelOpen] = useState(false);
  const [raidState, setRaidState] = useState({
    phase: "idle",
    destructionPercent: 0,
    loot: 0,
    energy: 0,
    attackersRemaining: 0,
    defendersRemaining: 0,
    reserves: {
      energy: 0,
      soldiers: 0,
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
                      soldierCount: Math.max(0, Number(building.soldierCount ?? 0) - loss),
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

          if (savedSummaryRef.current !== recordSignature) {
            savedSummaryRef.current = recordSignature;
            setBattleRecords(saveBattleRecord({
              targetId: targetRef.current.id,
              targetName: targetRef.current.name,
              targetPlayerId: targetRef.current.playerId,
              outcome: nextState.summary.outcome,
              loot: nextState.summary.loot,
              destructionPercent: nextState.summary.destructionPercent,
              remainingTroops: nextState.summary.remainingTroops,
            }, session));
          }
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
    if (raidState.phase === "active" || raidState.phase === "finished" || raidState.summary) {
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

  const handleSelectDeploymentType = (type) => {
    const didSelect = battleSceneRef.current?.setDeploymentType?.(type);

    if (didSelect === false) {
      return;
    }

    setRaidState((current) => ({
      ...current,
      selectedDeploymentType: type,
    }));
  };

  const handleBackToBase = () => {
    navigate("/game");
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
  const availableTankCount = raidState.reserves?.tanks ?? army.tanks ?? 0;
  const availableHelicopterCount = raidState.reserves?.helicopters ?? army.helicopters ?? 0;
  const canDeployTank = availableTankCount > 0;
  const canDeployHelicopter = availableHelicopterCount > 0;
  const canAttack = totalTroops > 0 && target && raidState.phase === "ready";
  const canFindMatch = lookupState !== "loading" && raidState.phase !== "active";
  const summary = raidState.summary;
  const earnedWarPoints = getWarPointsEarned(summary?.destructionPercent);
  const playerName = session?.name || session?.email?.split("@")[0] || "Commander";
  const playerId = session?.playerId || (session?.id ? `PLYR-${String(session.id).padStart(6, "0")}` : "UNKNOWN");
  const musicVolumePercent = musicStatus?.volumePercent ?? Math.round((musicStatus?.volume ?? 0) * 100);
  const canLowerMusicVolume = musicVolumePercent > 0;
  const canRaiseMusicVolume = musicVolumePercent < 100;

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

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-2 py-2 min-[901px]:px-4 min-[901px]:py-3">
        <div className="flex flex-wrap items-start justify-between gap-2 min-[901px]:gap-4">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-[1rem] border border-white/10 bg-slate-950/54 px-2.5 py-1.5 shadow-[0_14px_36px_rgba(2,6,23,0.3)] backdrop-blur min-[901px]:gap-3 min-[901px]:rounded-[1.2rem] min-[901px]:px-3 min-[901px]:py-2">
            <div className="min-w-[5.5rem] min-[901px]:min-w-[8rem]">
              <p className="text-[0.55rem] uppercase tracking-[0.24em] text-emerald-300/70 min-[901px]:text-[0.65rem] min-[901px]:tracking-[0.3em]">Player</p>
              <p className="mt-0.5 text-[13px] font-black text-white min-[901px]:mt-1 min-[901px]:text-base">{playerName}</p>
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400 min-[901px]:text-[11px] min-[901px]:tracking-[0.16em]">{playerId}</p>
            </div>
            <div className="h-8 w-px bg-white/10 min-[901px]:h-10" />
            <div>
              <p className="text-[0.55rem] uppercase tracking-[0.24em] text-amber-300/70 min-[901px]:text-[0.65rem] min-[901px]:tracking-[0.3em]">Loot Gained</p>
              <p className="mt-0.5 text-base font-black text-amber-200 min-[901px]:mt-1 min-[901px]:text-xl">{raidState.loot ?? 0}</p>
            </div>
            <div className="h-8 w-px bg-white/10 min-[901px]:h-10" />
            <div>
              <p className="text-[0.55rem] uppercase tracking-[0.24em] text-sky-300/70 min-[901px]:text-[0.65rem] min-[901px]:tracking-[0.3em]">Energy</p>
              <p className="mt-0.5 text-base font-black text-sky-100 min-[901px]:mt-1 min-[901px]:text-xl">{raidState.energy ?? army.energy ?? 0}</p>
            </div>
            <div className="h-8 w-px bg-white/10 min-[901px]:h-10" />
            <div>
              <p className="text-[0.55rem] uppercase tracking-[0.24em] text-rose-300/70 min-[901px]:text-[0.65rem] min-[901px]:tracking-[0.3em]">Destruction</p>
              <p className="mt-0.5 text-base font-black text-rose-200 min-[901px]:mt-1 min-[901px]:text-xl">{raidState.destructionPercent ?? 0}%</p>
            </div>
            {target ? (
              <>
                <div className="h-8 w-px bg-white/10 min-[901px]:h-10" />
                <div>
                  <p className="text-[0.55rem] uppercase tracking-[0.24em] text-cyan-300/70 min-[901px]:text-[0.65rem] min-[901px]:tracking-[0.3em]">Enemy</p>
                  <p className="mt-0.5 text-[13px] font-black text-cyan-100 min-[901px]:mt-1 min-[901px]:text-base">{target.name}</p>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400 min-[901px]:text-[11px] min-[901px]:tracking-[0.16em]">{target.playerId}</p>
                  <p className="mt-0.5 text-[9px] font-semibold text-amber-200 min-[901px]:mt-1 min-[901px]:text-[11px]">Lootable: {target.loot ?? 0}</p>
                </div>
              </>
            ) : null}
          </div>

          <div className="pointer-events-auto flex items-center gap-1.5 rounded-[1rem] border border-white/10 bg-slate-950/54 px-1.5 py-1.5 shadow-[0_14px_36px_rgba(2,6,23,0.3)] backdrop-blur min-[901px]:gap-2 min-[901px]:rounded-[1.1rem] min-[901px]:px-2 min-[901px]:py-2">
            <button
              type="button"
              onClick={handleBackToBase}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/10 min-[901px]:rounded-xl min-[901px]:px-3 min-[901px]:py-2 min-[901px]:text-sm"
            >
              Exit Raid
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={handleToggleMusicPanel}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-violet-100 transition hover:bg-white/10 min-[901px]:rounded-xl min-[901px]:px-3 min-[901px]:py-2 min-[901px]:text-sm"
              >
                Music
              </button>

              {musicPanelOpen ? (
                <div className="absolute right-0 top-full z-20 mt-1.5 min-w-[9.5rem] rounded-xl border border-white/10 bg-slate-950/90 p-2 shadow-[0_14px_36px_rgba(2,6,23,0.35)] backdrop-blur-md">
                  <button
                    type="button"
                    onClick={handleToggleMusicMute}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-violet-100 transition hover:bg-white/10"
                  >
                    {musicStatus?.isMuted ? "Unmute" : "Mute"}
                  </button>

                  <div className="mt-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleLowerMusicVolume}
                      disabled={!canLowerMusicVolume}
                      className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-cyan-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Vol -
                    </button>
                    <button
                      type="button"
                      onClick={handleRaiseMusicVolume}
                      disabled={!canRaiseMusicVolume}
                      className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-cyan-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Vol +
                    </button>
                  </div>

                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-200">
                    {musicStatus?.isMuted ? "Muted" : `Volume ${musicVolumePercent}%`}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute left-0 top-1/2 z-10 -translate-y-1/2 pl-2 min-[901px]:pl-4">
        <div className="pointer-events-auto flex w-[8rem] flex-col gap-1.5 rounded-[0.95rem] border border-white/10 bg-slate-950/52 p-1.5 shadow-[0_14px_36px_rgba(2,6,23,0.28)] backdrop-blur min-[901px]:w-[12rem] min-[901px]:gap-2 min-[901px]:rounded-[1.1rem] min-[901px]:p-2.5">
          <button
            type="button"
            onClick={handleFindMatch}
            disabled={!canFindMatch}
            className="rounded-lg bg-emerald-400 px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 min-[901px]:rounded-xl min-[901px]:px-3 min-[901px]:py-2.5 min-[901px]:text-xs min-[901px]:tracking-[0.16em]"
          >
            {lookupState === "loading" ? "Searching..." : "Search Another Village"}
          </button>
          <button
            type="button"
            onClick={handleStartAttack}
            disabled={!canAttack}
            className="rounded-lg bg-rose-500 px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50 min-[901px]:rounded-xl min-[901px]:px-3 min-[901px]:py-2.5 min-[901px]:text-xs min-[901px]:tracking-[0.16em]"
          >
            Attack
          </button>
          <div className="rounded-lg border border-white/10 bg-white/5 p-2 min-[901px]:rounded-xl min-[901px]:p-2.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 min-[901px]:text-[11px] min-[901px]:tracking-[0.18em]">Status</p>
            <p className="mt-1 text-[12px] font-black leading-tight text-white min-[901px]:text-sm">
              {raidState.phase === "active"
                ? "Deploy units on the battlefield"
                : raidState.phase === "ready"
                  ? "Village located"
                  : raidState.phase === "finished"
                    ? "Raid complete"
                    : lookupState === "loading"
                      ? "Searching village or base"
                      : "Waiting for orders"}
            </p>
            {lookupError ? <p className="mt-1 text-[10px] leading-tight text-rose-300 min-[901px]:text-[11px]">{lookupError}</p> : null}
          </div>
          {target ? (
            <div className="hidden rounded-xl border border-white/10 bg-white/5 p-2.5 min-[901px]:block">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Enemy</p>
              <p className="mt-1 text-base font-black text-white">{target.name}</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">{target.playerId}</p>
              <p className="mt-1 text-[11px] text-slate-300">HQ Lv.{target.townHallLevel ?? 1}</p>
              <p className="mt-1 text-[11px] font-semibold text-emerald-300">Available Loot: {target.loot ?? 0}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="pointer-events-none absolute right-0 top-1/2 z-10 -translate-y-1/2 pr-2 min-[901px]:pr-4">
        <div className="pointer-events-auto flex w-[7.25rem] flex-col gap-1.5 rounded-[0.95rem] border border-white/10 bg-slate-950/52 p-1.5 shadow-[0_14px_36px_rgba(2,6,23,0.28)] backdrop-blur min-[901px]:w-[11rem] min-[901px]:gap-2 min-[901px]:rounded-[1.1rem] min-[901px]:p-2.5">
          <div className="rounded-lg border border-white/10 bg-white/5 p-2 min-[901px]:rounded-xl min-[901px]:p-2.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 min-[901px]:text-[11px] min-[901px]:tracking-[0.18em]">Structures</p>
            <p className="mt-1 text-xl font-black text-rose-200 min-[901px]:text-2xl">{raidState.defendersRemaining ?? 0}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-2 min-[901px]:rounded-xl min-[901px]:p-2.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 min-[901px]:text-[11px] min-[901px]:tracking-[0.18em]">Troops Left</p>
            <p className="mt-1 text-xl font-black text-sky-200 min-[901px]:text-2xl">{raidState.attackersRemaining ?? 0}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-2 min-[901px]:rounded-xl min-[901px]:p-2.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 min-[901px]:text-[11px] min-[901px]:tracking-[0.18em]">Destruction</p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-900 min-[901px]:mt-2 min-[901px]:h-2.5">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#fb7185_0%,#f59e0b_48%,#facc15_100%)] transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, raidState.destructionPercent ?? 0))}%` }}
              />
            </div>
          </div>
          <div className="hidden rounded-xl border border-white/10 bg-white/5 p-2.5 min-[901px]:block">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Records</p>
            <div className="mt-2 max-h-40 space-y-2 overflow-y-auto pr-1">
              {battleRecords.length > 0 ? battleRecords.map((record) => (
                <div
                  key={record.id}
                  className="rounded-lg border border-white/10 bg-slate-900/50 px-2.5 py-2"
                >
                  <p className={`text-xs font-bold ${record.outcome === "victory" ? "text-emerald-300" : "text-rose-300"}`}>
                    {record.outcome === "victory" ? "Win" : "Lose"} vs {record.targetName}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">{record.targetPlayerId}</p>
                  <p className="mt-1 text-[10px] text-slate-300">
                    Loot {record.loot} • {record.destructionPercent}% destruction
                  </p>
                </div>
              )) : (
                <p className="text-[11px] text-slate-400">No battle records yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-2 pb-2 min-[901px]:px-4 min-[901px]:pb-4">
        <div className="pointer-events-auto mx-auto max-w-[32rem] rounded-[1rem] border border-white/10 bg-slate-950/54 px-2.5 py-2 shadow-[0_14px_36px_rgba(2,6,23,0.3)] backdrop-blur min-[901px]:max-w-3xl min-[901px]:rounded-[1.2rem] min-[901px]:px-4 min-[901px]:py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 min-[901px]:gap-4">
            <div className="flex flex-wrap gap-1.5 min-[901px]:gap-3">
              <div className="min-w-[4.8rem] rounded-lg border border-sky-400/20 bg-sky-500/10 px-2 py-1.5 min-[901px]:min-w-[6.5rem] min-[901px]:rounded-xl min-[901px]:px-3 min-[901px]:py-2.5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-sky-200/70 min-[901px]:text-[11px] min-[901px]:tracking-[0.18em]">Riflemen</p>
                <p className="mt-0.5 text-base font-black text-sky-100 min-[901px]:mt-1 min-[901px]:text-xl">{army.soldiers}</p>
              </div>
              <div className="min-w-[4.8rem] rounded-lg border border-amber-400/20 bg-amber-500/10 px-2 py-1.5 min-[901px]:min-w-[6.5rem] min-[901px]:rounded-xl min-[901px]:px-3 min-[901px]:py-2.5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-amber-200/70 min-[901px]:text-[11px] min-[901px]:tracking-[0.18em]">Tanks</p>
                <p className="mt-0.5 text-base font-black text-amber-100 min-[901px]:mt-1 min-[901px]:text-xl">{army.tanks}</p>
              </div>
              <div className="min-w-[4.8rem] rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-2 py-1.5 min-[901px]:min-w-[6.5rem] min-[901px]:rounded-xl min-[901px]:px-3 min-[901px]:py-2.5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-200/70 min-[901px]:text-[11px] min-[901px]:tracking-[0.18em]">Helicopters</p>
                <p className="mt-0.5 text-base font-black text-emerald-100 min-[901px]:mt-1 min-[901px]:text-xl">{army.helicopters}</p>
              </div>
              <div className="min-w-[4.8rem] rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-2 py-1.5 min-[901px]:min-w-[6.5rem] min-[901px]:rounded-xl min-[901px]:px-3 min-[901px]:py-2.5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-200/70 min-[901px]:text-[11px] min-[901px]:tracking-[0.18em]">Energy</p>
                <p className="mt-0.5 text-base font-black text-cyan-100 min-[901px]:mt-1 min-[901px]:text-xl">{raidState.energy ?? army.energy ?? 0}</p>
              </div>
            </div>

            {raidState.phase === "active" ? (
              <div className="flex flex-wrap justify-end gap-1.5 min-[901px]:gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectDeploymentType("soldier")}
                  disabled={(raidState.reserves?.soldiers ?? 0) <= 0}
                  className={`rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-40 min-[901px]:rounded-xl min-[901px]:px-3 min-[901px]:py-2 min-[901px]:text-xs min-[901px]:tracking-[0.16em] ${
                    raidState.selectedDeploymentType === "soldier"
                      ? "bg-sky-300 text-slate-950"
                      : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                  }`}
                >
                  Soldier ({raidState.reserves?.soldiers ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectDeploymentType("tank")}
                  disabled={!canDeployTank}
                  className={`rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-40 min-[901px]:rounded-xl min-[901px]:px-3 min-[901px]:py-2 min-[901px]:text-xs min-[901px]:tracking-[0.16em] ${
                    raidState.selectedDeploymentType === "tank"
                      ? "bg-amber-300 text-slate-950"
                      : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                  }`}
                >
                  Tank ({raidState.reserves?.tanks ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectDeploymentType("helicopter")}
                  disabled={!canDeployHelicopter}
                  className={`rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-40 min-[901px]:rounded-xl min-[901px]:px-3 min-[901px]:py-2 min-[901px]:text-xs min-[901px]:tracking-[0.16em] ${
                    raidState.selectedDeploymentType === "helicopter"
                      ? "bg-emerald-300 text-slate-950"
                      : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                  }`}
                >
                  Chopper ({raidState.reserves?.helicopters ?? 0})
                </button>
              </div>
            ) : null}
          </div>
          {raidState.phase === "active" ? (
            <p className="mt-2 text-[11px] font-semibold leading-tight text-slate-300 min-[901px]:mt-3 min-[901px]:text-xs">
              Tank uses stored charge with {TANK_SHOTS_PER_DEPLOY} shots max. Chopper uses stored charge with {HELICOPTER_SHOTS_PER_DEPLOY} shots max.
            </p>
          ) : null}
        </div>
      </div>

      {summary ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/54 p-6">
          <div className="pointer-events-auto w-full max-w-xl rounded-[2rem] border border-white/10 bg-slate-950/90 p-6 text-white shadow-[0_24px_90px_rgba(2,6,23,0.55)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">Battle Result</p>
            <h2 className={`mt-3 text-4xl font-black ${summary.outcome === "victory" ? "text-emerald-300" : "text-rose-300"}`}>
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
