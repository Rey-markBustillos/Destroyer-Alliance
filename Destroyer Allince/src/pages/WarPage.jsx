import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { destroyGame, createGame } from "../game/main";
import { createBattleSocket } from "../services/battleSocket";
import { getStoredBuildings } from "../services/buildingStorage";
import { getGameSnapshot } from "../services/gameStorage";
import { getSession } from "../services/session";

export default function WarPage() {
  const navigate = useNavigate();
  const gameRootRef = useRef(null);
  const gameRef = useRef(null);
  const gameSceneRef = useRef(null);
  const socketRef = useRef(null);
  const battleStateRef = useRef(null);
  const [searchState, setSearchState] = useState("searching");
  const [battleState, setBattleState] = useState(null);
  const [roomMeta, setRoomMeta] = useState(null);
  const [socketError, setSocketError] = useState("");
  const [battleResult, setBattleResult] = useState(null);

  const fallbackTotalSoldiers = useMemo(() => {
    const session = getSession();
    const buildings = getStoredBuildings(session);

    return buildings.reduce(
      (total, building) => total + Math.max(0, Number(building?.soldierCount ?? 0) || 0),
      0
    );
  }, []);

  useEffect(() => {
    battleStateRef.current = battleState;
  }, [battleState]);

  useEffect(() => {
    if (!gameRootRef.current) {
      return undefined;
    }

    const game = createGame(gameRootRef.current, { mode: "war" });
    gameRef.current = game;

    const handleSceneReady = () => {
      const gameScene = game.scene.getScene("GameScene");

      if (!gameScene) {
        return;
      }

      gameSceneRef.current = gameScene;

      const handleWarDeployRequest = ({ row, col }) => {
        const session = getSession();
        const selfUserId = Number(session?.id ?? 0);
        const currentBattleState = battleStateRef.current;
        const players = currentBattleState?.players ?? [];
        const selfPlayer = players.find((player) => Number(player.userId) === selfUserId) ?? null;
        const availableToDrop = Math.max(0, Number(selfPlayer?.availableSoldiers ?? fallbackTotalSoldiers));

        if (currentBattleState?.status !== "active" || availableToDrop <= 0) {
          return;
        }

        socketRef.current?.emit("battle:deploy", { row, col });
      };

      gameScene.events.on("war-deploy-request", handleWarDeployRequest);

      gameRef.current.cleanup = () => {
        gameScene.events.off("war-deploy-request", handleWarDeployRequest);
        gameSceneRef.current = null;
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
  }, [fallbackTotalSoldiers]);

  useEffect(() => {
    const session = getSession();
    const token = session?.token ?? null;
    const snapshot = getGameSnapshot(session);
    const totalSoldiers = (snapshot?.buildings ?? []).reduce(
      (total, building) =>
        total + (building?.type === "command-center" ? Math.max(0, Number(building?.soldierCount ?? 0) || 0) : 0),
      0
    );

    if (!token) {
      setSearchState("empty");
      setSocketError("Walang login token.");
      return undefined;
    }

    if (totalSoldiers <= 0) {
      setSearchState("empty");
      setSocketError("Kailangan may soldiers ka muna bago mag 1v1.");
      return undefined;
    }

    const socket = createBattleSocket(token);
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketError("");
      setSearchState("searching");
      socket.emit("queue:join", {
        gold: snapshot?.gold ?? 0,
        buildings: snapshot?.buildings ?? [],
      });
    });

    socket.on("queue:waiting", () => {
      setBattleResult(null);
      setSearchState("searching");
    });

    socket.on("match:found", (payload) => {
      setRoomMeta(payload);
      setSearchState("found");
    });

    socket.on("battle:state", (payload) => {
      setBattleState(payload);
      setRoomMeta((current) => current ?? { roomId: payload.roomId });

      if (payload?.status === "active") {
        setSearchState("found");
      }

      if (payload?.status === "finished") {
        setSearchState("ended");
      }
    });

    socket.on("battle:end", (payload) => {
      setBattleResult(payload);
      setSearchState("ended");
    });

    socket.on("battle:error", (payload) => {
      setSocketError(payload?.message ?? "Battle error");
    });

    socket.on("connect_error", (error) => {
      setSocketError(error?.message ?? "Socket connection failed");
      setSearchState("empty");
    });

    return () => {
      socket.emit("battle:leave");
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const gameScene = gameSceneRef.current;
    const session = getSession();
    const selfUserId = Number(session?.id ?? 0);

    if (!gameScene || !battleState) {
      return;
    }

    const players = battleState.players ?? [];
    const selfPlayer = players.find((player) => Number(player.userId) === selfUserId) ?? null;
    const targetPlayer = players.find((player) => Number(player.userId) !== selfUserId) ?? null;

    if (!targetPlayer) {
      return;
    }

    gameScene.applyWarBattleState({
      roomId: battleState.roomId,
      selfUserId,
      targetUserId: targetPlayer.userId,
      targetBuildings: targetPlayer.buildings ?? [],
      targetStructures: targetPlayer.structures ?? [],
      selfDeployments: selfPlayer?.deployments ?? [],
      status: battleState.status,
    });
  }, [battleState]);

  const session = getSession();
  const selfUserId = Number(session?.id ?? 0);
  const players = battleState?.players ?? [];
  const selfPlayer = players.find((player) => Number(player.userId) === selfUserId) ?? null;
  const target = players.find((player) => Number(player.userId) !== selfUserId) ?? null;
  const totalSoldiers = Math.max(0, Number(selfPlayer?.totalSoldiers ?? fallbackTotalSoldiers));
  const availableToDrop = Math.max(0, Number(selfPlayer?.availableSoldiers ?? fallbackTotalSoldiers));
  const deployedSoldiers = Math.max(0, Number(selfPlayer?.deployments?.length ?? 0));
  const opponentDeployed = Math.max(0, Number(target?.deployments?.length ?? 0));
  const selfTownHall = (selfPlayer?.structures ?? []).find((structure) => structure.type === "town-hall") ?? null;
  const enemyTownHall = (target?.structures ?? []).find((structure) => structure.type === "town-hall") ?? null;
  const battleWon =
    battleState?.status === "finished"
    && Number(battleResult?.winnerUserId ?? battleState?.winnerUserId) === selfUserId;
  const battleLost =
    battleState?.status === "finished"
    && battleState?.winnerUserId
    && Number(battleState.winnerUserId) !== selfUserId;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#4f7b38_0%,#2d4721_55%,#182413_100%)] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.32em] text-rose-300/80">
              War Mode
            </p>
            <h1 className="mt-1 text-2xl font-black">Enemy Base</h1>
          </div>

          <button
            type="button"
            onClick={() => navigate("/game")}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Back to Village
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-[2rem] border border-white/10 bg-slate-950/82 p-4 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-300/75">
              Army Status
            </p>
            <p className="mt-3 text-3xl font-black">{totalSoldiers}</p>
            <p className="mt-1 text-sm text-slate-300">Total hired soldiers</p>

            <div className="mt-5 rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-4">
              <p className="text-sm font-bold text-emerald-200">Attack</p>
              <p className="mt-2 text-xs text-slate-300">
                Nasa tunay ka nang layout ng kalaban. Mag-click sa bottom grass area ng map para mag-drop ng soldiers.
              </p>
              <p className="mt-3 text-sm font-semibold text-amber-300">
                Ready to drop: {availableToDrop}
              </p>
              <p className="mt-1 text-sm font-semibold text-sky-300">
                Already deployed: {deployedSoldiers}
              </p>
              <p className="mt-1 text-sm font-semibold text-rose-300">
                Enemy deployed: {opponentDeployed}
              </p>
            </div>

            {searchState === "searching" ? (
              <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-bold text-white">Searching for enemy...</p>
                <p className="mt-2 text-xs text-slate-400">
                  Hahanapan ka ng ibang live account na puwede mong i-attack.
                </p>
              </div>
            ) : target ? (
              <div className="mt-5 rounded-3xl border border-rose-400/20 bg-rose-500/10 p-4">
                <p className="text-lg font-black text-white">{target.name}</p>
                <p className="mt-2 text-xs font-semibold text-amber-300">
                  Town Hall Lv.{enemyTownHall?.level ?? 1}
                </p>
                <p className="mt-1 text-xs text-slate-300">
                  Defense: {(target.structures ?? []).filter((structure) => structure.health > 0).length} structures
                </p>
                <p className="mt-1 text-xs text-emerald-300">
                  Room: {roomMeta?.roomId ?? battleState?.roomId ?? "-"}
                </p>
              </div>
            ) : null}

            {selfTownHall ? (
              <div className="mt-5 rounded-3xl border border-sky-400/20 bg-sky-500/10 p-4">
                <p className="text-sm font-bold text-sky-100">Your Town Hall</p>
                <p className="mt-2 text-xs text-slate-200">
                  HP: {Math.max(0, Math.round(selfTownHall.health))}/
                  {Math.max(0, Math.round(selfTownHall.maxHealth ?? selfTownHall.health))}
                </p>
              </div>
            ) : null}

            {enemyTownHall ? (
              <div className="mt-5 rounded-3xl border border-amber-400/20 bg-amber-500/10 p-4">
                <p className="text-sm font-bold text-amber-100">Enemy Town Hall</p>
                <p className="mt-2 text-xs text-slate-200">
                  HP: {Math.max(0, Math.round(enemyTownHall.health))}/
                  {Math.max(0, Math.round(enemyTownHall.maxHealth ?? enemyTownHall.health))}
                </p>
              </div>
            ) : null}

            {battleWon ? (
              <div className="mt-5 rounded-3xl border border-emerald-400/25 bg-emerald-500/15 p-4">
                <p className="text-sm font-black text-emerald-200">Panalo ka sa 1v1</p>
                <p className="mt-2 text-xs text-slate-200">
                  Nasira ng soldiers mo ang town hall ng kalaban.
                </p>
              </div>
            ) : null}

            {battleLost ? (
              <div className="mt-5 rounded-3xl border border-rose-400/25 bg-rose-500/15 p-4">
                <p className="text-sm font-black text-rose-100">Natalo ka sa 1v1</p>
                <p className="mt-2 text-xs text-slate-200">
                  Nauna nilang sirain ang town hall mo.
                </p>
              </div>
            ) : null}

            {searchState === "empty" || socketError ? (
              <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-bold text-white">Battle unavailable</p>
                <p className="mt-2 text-xs text-slate-400">
                  {socketError || "Walang ibang account na puwedeng kalaban sa ngayon."}
                </p>
              </div>
            ) : null}
          </aside>

          <section className="rounded-[2rem] border border-white/10 bg-slate-950/35 p-4 shadow-[0_24px_80px_rgba(2,6,23,0.25)]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-emerald-200/80">
                  Enemy Village
                </p>
                <p className="mt-1 text-sm font-semibold text-white/85">
                  Ito na mismo ang base ng kalaban. Click sa ibabang part ng map para mag-attack.
                </p>
              </div>
              <p className="text-xs font-semibold text-emerald-100/70">
                Bottom grass = deploy zone
              </p>
            </div>

            <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/20">
              <div ref={gameRootRef} className="h-[72vh] min-h-[520px] w-full overflow-hidden" />
            </div>

            {battleState?.status === "finished" ? (
              <div className="mt-4 rounded-3xl border border-white/10 bg-slate-950/70 p-4 text-sm text-white">
                {battleWon
                  ? "Tapos na ang laban. Panalo ka."
                  : battleLost
                    ? "Tapos na ang laban. Panalo ang kalaban."
                    : "Tapos na ang laban."}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
