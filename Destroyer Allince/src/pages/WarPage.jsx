import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createGame, destroyGame } from "../game/main";
import { applyWarResolution, fetchWarTarget, syncGameSnapshot } from "../services/game";
import { getBattleRecords, saveBattleRecord } from "../services/battleRecordStorage";
import { getGameSnapshot, saveGameSnapshot } from "../services/gameStorage";
import { getSession } from "../services/session";

const deriveArmyFromSnapshot = (snapshot) => {
  const buildings = Array.isArray(snapshot?.buildings) ? snapshot.buildings : [];
  const soldiers = buildings.reduce(
    (total, building) => total + (building?.type === "command-center" ? Math.max(0, Number(building?.soldierCount ?? 0) || 0) : 0),
    0
  );
  const tankUnits = buildings
    .filter((building) => building?.type === "battle-tank" && building?.hasTank)
    .map((building, index) => ({
      id: building?.id ?? `tank-${index}`,
      health: 260 + ((Math.max(1, Number(building?.level ?? 1) || 1) - 1) * 120),
      damage: 34 + ((Math.max(1, Number(building?.level ?? 1) || 1) - 1) * 18),
    }));
  const helicopters = buildings.filter((building) => building?.type === "skyport" && building?.hasChopper).length;

  return {
    soldiers,
    tanks: tankUnits.length,
    tankUnits,
    helicopters,
  };
};

const getTotalTroops = (army) =>
  Math.max(0, Number(army?.soldiers ?? 0) || 0)
  + Math.max(0, Number(army?.tanks ?? 0) || 0)
  + Math.max(0, Number(army?.helicopters ?? 0) || 0);

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

  let remainingSoldiers = survivors.soldiers;
  nextBuildings.forEach((building) => {
    if (building?.type !== "command-center") {
      return;
    }

    const currentCount = Math.max(0, Number(building.soldierCount ?? 0) || 0);
    const keptSoldiers = Math.min(currentCount, remainingSoldiers);
    building.soldierCount = keptSoldiers;
    remainingSoldiers -= keptSoldiers;
  });

  let remainingHelicopters = survivors.helicopters;
  nextBuildings.forEach((building) => {
    if (building?.type !== "skyport") {
      return;
    }

    const hasChopper = Boolean(building.hasChopper);
    if (!hasChopper) {
      building.hasChopper = false;
      return;
    }

    if (remainingHelicopters > 0) {
      building.hasChopper = true;
      remainingHelicopters -= 1;
      return;
    }

    building.hasChopper = false;
  });

  let remainingTanks = survivors.tanks;
  nextBuildings = nextBuildings.map((building) => {
    if (building?.type !== "battle-tank" || !building?.hasTank) {
      return building;
    }

    if (remainingTanks > 0) {
      remainingTanks -= 1;
      return building;
    }

    return {
      ...building,
      hasTank: false,
    };
  });

  return {
    ...snapshot,
    buildings: nextBuildings,
  };
};

export default function WarPage() {
  const navigate = useNavigate();
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
  const [raidState, setRaidState] = useState({
    phase: "idle",
    destructionPercent: 0,
    loot: 0,
    attackersRemaining: 0,
    defendersRemaining: 0,
    summary: null,
  });

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

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
            }, session.token).catch((error) => {
              console.error("Unable to save enemy defender losses:", error);
            }).then((result) => {
              if (!result || typeof result.attackerGold !== "number") {
                return;
              }

              const nextSnapshot = {
                ...(snapshotRef.current ?? { buildings: [] }),
                gold: result.attackerGold,
              };
              const savedSnapshot = saveGameSnapshot(nextSnapshot, session);
              snapshotRef.current = savedSnapshot;
              setSnapshot(savedSnapshot);

              setTarget((currentTarget) => {
                if (!currentTarget || currentTarget.id !== targetRef.current?.id) {
                  return currentTarget;
                }

                const defenderLosses = nextState.summary?.defenderLosses ?? {};
                const nextBuildings = Array.isArray(currentTarget.buildings)
                  ? currentTarget.buildings.map((building) => {
                    if (building?.type !== "command-center") {
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
  }, [target, army]);

  const resetRaidPanel = () => {
    savedSummaryRef.current = "";
    appliedLossSignatureRef.current = "";
    appliedWarResolutionRef.current = "";
    setRaidState({
      phase: "idle",
      destructionPercent: 0,
      loot: 0,
      attackersRemaining: 0,
      defendersRemaining: 0,
      summary: null,
    });
  };

  const resolveTarget = useCallback(async (playerId = "") => {
    const token = session?.token ?? null;
    const currentTotalTroops = getTotalTroops(army);

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
      const result = await fetchWarTarget(token, playerId);
      setTarget(result);
      setLookupState("ready");
    } catch (error) {
      setTarget(null);
      setLookupState("error");
      setLookupError(error.response?.data?.message || "Unable to find an enemy base.");
    }
  }, [session, army]);

  const handleFindMatch = useCallback(async () => {
    await resolveTarget("");
  }, [resolveTarget]);

  const handleStartAttack = () => {
    battleSceneRef.current?.startRaidAttack();
  };

  const handleBackToBase = () => {
    navigate("/game");
  };

  const totalTroops = getTotalTroops(army);
  const canAttack = totalTroops > 0 && target && raidState.phase === "ready";
  const canFindMatch = lookupState !== "loading" && raidState.phase !== "active";
  const summary = raidState.summary;
  const playerName = session?.name || session?.email?.split("@")[0] || "Commander";
  const playerId = session?.playerId || (session?.id ? `PLYR-${String(session.id).padStart(6, "0")}` : "UNKNOWN");

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
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#2c5c3f_0%,#173126_48%,#08120e_100%)] text-white">
      <div ref={gameRootRef} className="absolute inset-0 h-full w-full overflow-hidden" />

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.32)_0%,rgba(2,6,23,0.04)_22%,rgba(2,6,23,0.04)_78%,rgba(2,6,23,0.36)_100%)]" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-[1.2rem] border border-white/10 bg-slate-950/54 px-3 py-2 shadow-[0_14px_36px_rgba(2,6,23,0.3)] backdrop-blur">
            <div className="min-w-[8rem]">
              <p className="text-[0.65rem] uppercase tracking-[0.3em] text-emerald-300/70">Player</p>
              <p className="mt-1 text-base font-black text-white">{playerName}</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{playerId}</p>
            </div>
            <div className="h-10 w-px bg-white/10" />
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/70">Loot Gained</p>
              <p className="mt-1 text-xl font-black text-amber-200">{raidState.loot ?? 0}</p>
            </div>
            <div className="h-10 w-px bg-white/10" />
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.3em] text-rose-300/70">Destruction</p>
              <p className="mt-1 text-xl font-black text-rose-200">{raidState.destructionPercent ?? 0}%</p>
            </div>
            {target ? (
              <>
                <div className="h-10 w-px bg-white/10" />
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.3em] text-cyan-300/70">Enemy</p>
                  <p className="mt-1 text-base font-black text-cyan-100">{target.name}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{target.playerId}</p>
                </div>
              </>
            ) : null}
          </div>

          <div className="pointer-events-auto flex items-center gap-2 rounded-[1.1rem] border border-white/10 bg-slate-950/54 px-2 py-2 shadow-[0_14px_36px_rgba(2,6,23,0.3)] backdrop-blur">
            <button
              type="button"
              onClick={handleBackToBase}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Exit Raid
            </button>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute left-0 top-1/2 z-10 -translate-y-1/2 pl-3 sm:pl-4">
        <div className="pointer-events-auto flex w-[12rem] flex-col gap-2 rounded-[1.1rem] border border-white/10 bg-slate-950/52 p-2.5 shadow-[0_14px_36px_rgba(2,6,23,0.28)] backdrop-blur">
          <button
            type="button"
            onClick={handleFindMatch}
            disabled={!canFindMatch}
            className="rounded-xl bg-emerald-400 px-3 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {lookupState === "loading" ? "Searching..." : "Find Match"}
          </button>
          <button
            type="button"
            onClick={handleStartAttack}
            disabled={!canAttack}
            className="rounded-xl bg-rose-500 px-3 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Attack
          </button>
          <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Status</p>
            <p className="mt-1 text-sm font-black text-white">
              {raidState.phase === "active"
                ? "Assault in progress"
                : raidState.phase === "ready"
                  ? "Enemy base locked"
                  : raidState.phase === "finished"
                    ? "Raid complete"
                    : lookupState === "loading"
                      ? "Searching enemy"
                      : "Waiting for orders"}
            </p>
            {lookupError ? <p className="mt-1 text-[11px] text-rose-300">{lookupError}</p> : null}
          </div>
          {target ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Enemy</p>
              <p className="mt-1 text-base font-black text-white">{target.name}</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">{target.playerId}</p>
              <p className="mt-1 text-[11px] text-slate-300">HQ Lv.{target.townHallLevel ?? 1}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="pointer-events-none absolute right-0 top-1/2 z-10 -translate-y-1/2 pr-3 sm:pr-4">
        <div className="pointer-events-auto flex w-[11rem] flex-col gap-2 rounded-[1.1rem] border border-white/10 bg-slate-950/52 p-2.5 shadow-[0_14px_36px_rgba(2,6,23,0.28)] backdrop-blur">
          <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Structures</p>
            <p className="mt-1 text-2xl font-black text-rose-200">{raidState.defendersRemaining ?? 0}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Troops Left</p>
            <p className="mt-1 text-2xl font-black text-sky-200">{raidState.attackersRemaining ?? 0}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Destruction</p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-900">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#fb7185_0%,#f59e0b_48%,#facc15_100%)] transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, raidState.destructionPercent ?? 0))}%` }}
              />
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
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

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="pointer-events-auto mx-auto max-w-3xl rounded-[1.2rem] border border-white/10 bg-slate-950/54 px-4 py-3 shadow-[0_14px_36px_rgba(2,6,23,0.3)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-3">
              <div className="min-w-[6.5rem] rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-sky-200/70">Riflemen</p>
                <p className="mt-1 text-xl font-black text-sky-100">{army.soldiers}</p>
              </div>
              <div className="min-w-[6.5rem] rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/70">Tanks</p>
                <p className="mt-1 text-xl font-black text-amber-100">{army.tanks}</p>
              </div>
              <div className="min-w-[6.5rem] rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-200/70">Helicopters</p>
                <p className="mt-1 text-xl font-black text-emerald-100">{army.helicopters}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {summary ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/54 p-6">
          <div className="pointer-events-auto w-full max-w-xl rounded-[2rem] border border-white/10 bg-slate-950/90 p-6 text-white shadow-[0_24px_90px_rgba(2,6,23,0.55)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">Battle Result</p>
            <h2 className={`mt-3 text-4xl font-black ${summary.outcome === "victory" ? "text-emerald-300" : "text-rose-300"}`}>
              {summary.outcome === "victory" ? "Victory" : "Defeat"}
            </h2>
            <p className="mt-2 text-sm text-slate-300">{summary.reason}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Destruction</p>
                <p className="mt-1 text-2xl font-black text-amber-200">{summary.destructionPercent}%</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Loot</p>
                <p className="mt-1 text-2xl font-black text-emerald-200">{summary.loot}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Troops Left</p>
                <p className="mt-1 text-2xl font-black text-sky-200">{summary.remainingTroops}</p>
              </div>
            </div>

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
                Find Another Match
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
