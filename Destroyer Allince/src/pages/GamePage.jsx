import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import BuildingShop from "../components/BuildingShop";
import { createGame, destroyGame } from "../game/main";
import { getBuildingUpgradeCost } from "../game/utils/buildingTypes";
import {
  addBuilding,
  deleteBuilding,
  fetchBuildings,
  fetchGameState,
  updateBuilding,
  updateGameState,
} from "../services/game";
import {
  getStoredBuildings,
  mergeStoredBuildings,
  removeStoredBuilding,
  upsertStoredBuilding,
} from "../services/buildingStorage";
import {
  saveGameSnapshot,
} from "../services/gameStorage";
import { getStoredGold, saveStoredGold } from "../services/goldStorage";
import { getSession } from "../services/session";

const SOLDIER_OPTIONS = [
  {
    id: "basic-soldier",
    name: "Basic Soldier",
    description: "Starter unit para sa Command Center.",
    wage: 1,
    image: "/assets/army/front/firing.png",
    available: true,
  },
];

export default function GamePage() {
  const navigate = useNavigate();
  const gameRootRef = useRef(null);
  const gameRef = useRef(null);
  const [clock, setClock] = useState(() => Date.now());
  const [gameState, setGameState] = useState({
    gold: 1200,
    buildings: 0,
    totalMachineGold: 0,
    totalMachineCapacity: 0,
    totalSoldiers: 0,
    woodMachines: 0,
    fullWoodMachines: 0,
  });
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedPlacedBuilding, setSelectedPlacedBuilding] = useState(null);
  const [isMoveMode, setIsMoveMode] = useState(false);
  const [shopOpen, setShopOpen] = useState(true);
  const [hireModalOpen, setHireModalOpen] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!gameRootRef.current) {
      return undefined;
    }

    const game = createGame(gameRootRef.current);
    gameRef.current = game;

    const handleSceneReady = async () => {
      const gameScene = game.scene.getScene("GameScene");
      const session = getSession();
      const token = session?.token ?? null;

      if (!gameScene) {
        return;
      }

      const persistCurrentSnapshot = () => {
        saveGameSnapshot(gameScene.getPersistedSnapshot(), session);
      };

      const handleGameStateUpdate = (state) => {
        setGameState(state);
      };

      const handleGoldChanged = async ({ gold }) => {
        saveStoredGold(gold, session);

        if (!token) {
          return;
        }

        try {
          await updateGameState({ gold }, token);
        } catch (error) {
          console.error("Unable to save gold:", error);
        }
      };

      const handleStructureSelectionCleared = () => {
        setSelectedBuilding(null);
        setHireModalOpen(false);
      };

      const handlePlacedBuildingSelected = (building) => {
        setSelectedPlacedBuilding(building);
        setIsMoveMode(false);
        if (building?.type !== "command-center") {
          setHireModalOpen(false);
        }
      };

      const handleStructurePlaced = async ({
        structure,
        type,
        row,
        col,
        level,
        isUpgrading,
        upgradeCompleteAt,
        machineGold,
        lastGeneratedAt,
        maxGold,
        soldierCount,
        lastWagePaidAt,
      }) => {
        upsertStoredBuilding({
          id: structure.persistedId ?? null,
          type,
          x: col,
          y: row,
          level,
          isUpgrading,
          upgradeCompleteAt,
          machineGold,
          lastGeneratedAt,
          soldierCount,
          lastWagePaidAt,
        }, session);
        persistCurrentSnapshot();

        if (!token) {
          return;
        }

        try {
          const savedBuilding = await addBuilding(
            {
              type,
              x: col,
              y: row,
            },
            token
          );

          structure.persistedId = savedBuilding.id ?? null;
          upsertStoredBuilding({
            ...savedBuilding,
            level,
            isUpgrading,
            upgradeCompleteAt,
            machineGold,
            lastGeneratedAt,
            soldierCount,
            lastWagePaidAt,
          }, session);
          persistCurrentSnapshot();
        } catch (error) {
          console.error("Unable to save building:", error);
        }
      };

      const handleStructureMoved = async ({
        structure,
        type,
        previousRow,
        previousCol,
        row,
        col,
        level,
        isUpgrading,
        upgradeCompleteAt,
        machineGold,
        lastGeneratedAt,
        maxGold,
        soldierCount,
        maxSoldiers,
        nextWageAt,
        lastWagePaidAt,
      }) => {
        removeStoredBuilding({
          id: structure.persistedId ?? null,
          type,
          x: previousCol,
          y: previousRow,
        }, session);
        upsertStoredBuilding({
          id: structure.persistedId ?? null,
          type,
          x: col,
          y: row,
          level,
          isUpgrading,
          upgradeCompleteAt,
          machineGold,
          lastGeneratedAt,
          soldierCount,
          lastWagePaidAt,
        }, session);
        persistCurrentSnapshot();

        setSelectedPlacedBuilding({
          id: structure.persistedId ?? null,
          type,
          name: structure.buildingType.name,
          row,
          col,
          level,
          isUpgrading,
          upgradeCompleteAt,
          machineGold,
          maxGold,
          soldierCount,
          maxSoldiers,
          nextWageAt,
        });
        setIsMoveMode(false);

        if (!token || !structure.persistedId) {
          return;
        }

        try {
          await updateBuilding(
            structure.persistedId,
            {
              x: col,
              y: row,
            },
            token
          );
        } catch (error) {
          console.error("Unable to move building:", error);
        }
      };

      const handleStructureResourceUpdated = ({
        id,
        type,
        row,
        col,
        level,
        isUpgrading,
        upgradeCompleteAt,
        machineGold,
        lastGeneratedAt,
        maxGold,
        soldierCount,
        lastWagePaidAt,
      }) => {
        upsertStoredBuilding({
          id: id ?? null,
          type,
          x: col,
          y: row,
          level,
          isUpgrading,
          upgradeCompleteAt,
          machineGold,
          lastGeneratedAt,
          soldierCount,
          lastWagePaidAt,
        }, session);
        persistCurrentSnapshot();

        setSelectedPlacedBuilding((current) => {
          if (!current || current.type !== type || current.row !== row || current.col !== col) {
            return current;
          }

          return {
            ...current,
            level,
            isUpgrading,
            upgradeCompleteAt,
            machineGold,
            maxGold,
            soldierCount,
            nextWageAt: current.nextWageAt,
            maxSoldiers: current.maxSoldiers,
          };
        });
      };

      const handleStructureSold = async ({ id, type, row, col }) => {
        removeStoredBuilding({ id, type, x: col, y: row }, session);
        persistCurrentSnapshot();
        setSelectedPlacedBuilding(null);
        setIsMoveMode(false);
        setHireModalOpen(false);

        if (!token || !id) {
          return;
        }

        try {
          await deleteBuilding(id, token);
        } catch (error) {
          console.error("Unable to delete building:", error);
        }
      };

      const handleStructureUpgradeStarted = async ({
        structure,
        id,
        type,
        row,
        col,
        level,
        isUpgrading,
        upgradeCompleteAt,
        machineGold,
        lastGeneratedAt,
        maxGold,
        soldierCount,
        lastWagePaidAt,
      }) => {
        upsertStoredBuilding({
          id: id ?? structure?.persistedId ?? null,
          type,
          x: col,
          y: row,
          level,
          isUpgrading,
          upgradeCompleteAt,
          machineGold,
          lastGeneratedAt,
          soldierCount,
          lastWagePaidAt,
        }, session);
        persistCurrentSnapshot();

        setSelectedPlacedBuilding((current) => {
          if (!current || current.type !== type || current.row !== row || current.col !== col) {
            return current;
          }

          return {
            ...current,
            level,
            isUpgrading,
            upgradeCompleteAt,
            machineGold,
            maxGold,
            soldierCount,
            nextWageAt: current.nextWageAt,
            maxSoldiers: current.maxSoldiers,
          };
        });

        if (!token || !id) {
          return;
        }

        try {
          await updateBuilding(
            id,
            {
              level,
              isUpgrading,
              upgradeCompleteAt: new Date(upgradeCompleteAt).toISOString(),
            },
            token
          );
        } catch (error) {
          console.error("Unable to start building upgrade:", error);
        }
      };

      const handleStructureUpgradeCompleted = async ({
        structure,
        id,
        type,
        row,
        col,
        level,
        isUpgrading,
        upgradeCompleteAt,
        machineGold,
        lastGeneratedAt,
        maxGold,
        soldierCount,
        lastWagePaidAt,
      }) => {
        upsertStoredBuilding({
          id: id ?? structure?.persistedId ?? null,
          type,
          x: col,
          y: row,
          level,
          isUpgrading,
          upgradeCompleteAt,
          machineGold,
          lastGeneratedAt,
          soldierCount,
          lastWagePaidAt,
        }, session);
        persistCurrentSnapshot();

        setSelectedPlacedBuilding((current) => {
          if (!current || current.type !== type || current.row !== row || current.col !== col) {
            return current;
          }

          return {
            ...current,
            level,
            isUpgrading,
            upgradeCompleteAt,
            machineGold,
            maxGold,
            soldierCount,
            nextWageAt: current.nextWageAt,
            maxSoldiers: current.maxSoldiers,
          };
        });

        if (!token || !id) {
          return;
        }

        try {
          await updateBuilding(
            id,
            {
              level,
              isUpgrading,
              upgradeCompleteAt: null,
            },
            token
          );
        } catch (error) {
          console.error("Unable to finish building upgrade:", error);
        }
      };

      const handleStructureUpgradeCancelled = async ({
        structure,
        id,
        type,
        row,
        col,
        level,
        isUpgrading,
        upgradeCompleteAt,
        machineGold,
        lastGeneratedAt,
        maxGold,
        soldierCount,
        lastWagePaidAt,
      }) => {
        upsertStoredBuilding({
          id: id ?? structure?.persistedId ?? null,
          type,
          x: col,
          y: row,
          level,
          isUpgrading,
          upgradeCompleteAt,
          machineGold,
          lastGeneratedAt,
          soldierCount,
          lastWagePaidAt,
        }, session);
        persistCurrentSnapshot();

        setSelectedPlacedBuilding((current) => {
          if (!current || current.type !== type || current.row !== row || current.col !== col) {
            return current;
          }

          return {
            ...current,
            level,
            isUpgrading,
            upgradeCompleteAt,
            machineGold,
            maxGold,
            soldierCount,
            nextWageAt: current.nextWageAt,
            maxSoldiers: current.maxSoldiers,
          };
        });

        if (!token || !id) {
          return;
        }

        try {
          await updateBuilding(
            id,
            {
              level,
              isUpgrading,
              upgradeCompleteAt: null,
            },
            token
          );
        } catch (error) {
          console.error("Unable to cancel building upgrade:", error);
        }
      };

      const handleStructureArmyUpdated = ({
        id,
        type,
        row,
        col,
        level,
        isUpgrading,
        upgradeCompleteAt,
        machineGold,
        lastGeneratedAt,
        maxGold,
        soldierCount,
        lastWagePaidAt,
        maxSoldiers,
        nextWageAt,
      }) => {
        upsertStoredBuilding({
          id: id ?? null,
          type,
          x: col,
          y: row,
          level,
          isUpgrading,
          upgradeCompleteAt,
          machineGold,
          lastGeneratedAt,
          soldierCount,
          lastWagePaidAt,
        }, session);
        persistCurrentSnapshot();

        setSelectedPlacedBuilding((current) => {
          if (!current || current.type !== type || current.row !== row || current.col !== col) {
            return current;
          }

          return {
            ...current,
            level,
            isUpgrading,
            upgradeCompleteAt,
            machineGold,
            maxGold,
            soldierCount,
            maxSoldiers,
            nextWageAt,
          };
        });
      };

      gameScene.events.on("game-state-update", handleGameStateUpdate);
      gameScene.events.on("gold-changed", handleGoldChanged);
      gameScene.events.on("structure-selection-cleared", handleStructureSelectionCleared);
      gameScene.events.on("placed-building-selected", handlePlacedBuildingSelected);
      gameScene.events.on("structure-placed", handleStructurePlaced);
      gameScene.events.on("structure-moved", handleStructureMoved);
      gameScene.events.on("structure-resource-updated", handleStructureResourceUpdated);
      gameScene.events.on("structure-sold", handleStructureSold);
      gameScene.events.on("structure-upgrade-started", handleStructureUpgradeStarted);
      gameScene.events.on("structure-upgrade-completed", handleStructureUpgradeCompleted);
      gameScene.events.on("structure-upgrade-cancelled", handleStructureUpgradeCancelled);
      gameScene.events.on("structure-army-updated", handleStructureArmyUpdated);

      const handlePageHide = () => {
        persistCurrentSnapshot();
      };

      const loadInitialState = async () => {
        try {
          const localBuildings = getStoredBuildings(session);
          const localGold = getStoredGold(session);
          let resolvedGold = localGold ?? 1200;
          let resolvedBuildings = localBuildings;

          if (token) {
            const [savedGameState, savedBuildings] = await Promise.all([
              fetchGameState(token),
              fetchBuildings(token),
            ]);
            const serverGold = savedGameState.gold ?? 1200;
            resolvedGold =
              localGold !== null ? Math.max(localGold, serverGold) : serverGold;
            resolvedBuildings = mergeStoredBuildings(savedBuildings, session);

            if (resolvedGold !== serverGold) {
              await updateGameState({ gold: resolvedGold }, token);
            }
          }

          gameScene.initializeFromSnapshot({
            gold: resolvedGold,
            buildings: resolvedBuildings,
          });
          saveStoredGold(resolvedGold, session);
          persistCurrentSnapshot();
        } catch (error) {
          console.error("Unable to load saved game state:", error);
          gameScene.initializeFromSnapshot({
            gold: getStoredGold(session) ?? 1200,
            buildings: getStoredBuildings(session),
          });
          persistCurrentSnapshot();
        }
      };

      const handleVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          persistCurrentSnapshot();
        }
      };

      await loadInitialState();
      window.addEventListener("beforeunload", handlePageHide);
      window.addEventListener("pagehide", handlePageHide);
      document.addEventListener("visibilitychange", handleVisibilityChange);

      gameRef.current.cleanup = () => {
        persistCurrentSnapshot();
        window.removeEventListener("beforeunload", handlePageHide);
        window.removeEventListener("pagehide", handlePageHide);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        gameScene.events.off("game-state-update", handleGameStateUpdate);
        gameScene.events.off("gold-changed", handleGoldChanged);
        gameScene.events.off(
          "structure-selection-cleared",
          handleStructureSelectionCleared
        );
        gameScene.events.off("placed-building-selected", handlePlacedBuildingSelected);
        gameScene.events.off("structure-placed", handleStructurePlaced);
        gameScene.events.off("structure-moved", handleStructureMoved);
        gameScene.events.off("structure-resource-updated", handleStructureResourceUpdated);
        gameScene.events.off("structure-sold", handleStructureSold);
        gameScene.events.off("structure-upgrade-started", handleStructureUpgradeStarted);
        gameScene.events.off("structure-upgrade-completed", handleStructureUpgradeCompleted);
        gameScene.events.off("structure-upgrade-cancelled", handleStructureUpgradeCancelled);
        gameScene.events.off("structure-army-updated", handleStructureArmyUpdated);
      };
    };

    game.events.on("ready", handleSceneReady);

    return () => {
      game.events.off("ready", handleSceneReady);
      if (gameRef.current?.cleanup) {
        gameRef.current.cleanup();
      }
      destroyGame(game);
    };
  }, []);

  const handleSelectBuilding = (building) => {
    setSelectedBuilding(building);
    setSelectedPlacedBuilding(null);
    setIsMoveMode(false);
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.setSelectedBuilding(building);
  };

  const handleMoveBuilding = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");

    if (!selectedPlacedBuilding || !gameScene) {
      return;
    }

    setSelectedBuilding(null);
    setIsMoveMode(true);
    setHireModalOpen(false);
    gameScene.startMovingSelectedBuilding();
  };

  const handleSellBuilding = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.sellSelectedBuilding();
  };

  const handleCollectGold = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.collectSelectedBuildingGold();
  };

  const handleUpgradeBuilding = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.startUpgradeSelectedBuilding();
  };

  const handleCancelUpgrade = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.cancelUpgradeSelectedBuilding();
  };

  const handleHireSoldier = () => {
    setHireModalOpen(true);
  };

  const handleConfirmHireSoldier = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.hireSoldierAtSelectedBuilding();
    setHireModalOpen(false);
  };

  const handleStartWar = () => {
    navigate("/war");
  };

  const upgradeRemainingMs = selectedPlacedBuilding?.upgradeCompleteAt
    ? Math.max(0, Number(selectedPlacedBuilding.upgradeCompleteAt) - clock)
    : 0;
  const upgradeMinutes = Math.floor(upgradeRemainingMs / 60000);
  const upgradeSeconds = Math.floor((upgradeRemainingMs % 60000) / 1000);
  const upgradeCost = selectedPlacedBuilding
    ? getBuildingUpgradeCost(selectedPlacedBuilding.type)
    : 0;
  const canUpgrade = selectedPlacedBuilding
    && !selectedPlacedBuilding.isUpgrading
    && (selectedPlacedBuilding.level ?? 1) < 2
    && gameState.gold >= upgradeCost;
  const wageRemainingMs = selectedPlacedBuilding?.nextWageAt
    ? Math.max(0, Number(selectedPlacedBuilding.nextWageAt) - clock)
    : 0;
  const wageHours = Math.floor(wageRemainingMs / 3600000);
  const wageMinutes = Math.floor((wageRemainingMs % 3600000) / 60000);
  const canHireSoldier = selectedPlacedBuilding?.type === "command-center"
    && (selectedPlacedBuilding.soldierCount ?? 0) < (selectedPlacedBuilding.maxSoldiers ?? 0);
  const availableSoldierOption = SOLDIER_OPTIONS.find((option) => option.available);
  const canStartWar = gameState.totalSoldiers > 0;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#b7d7a8_0%,#9ec58c_45%,#86b174_100%)] text-slate-950">
      <section className="relative h-screen w-full overflow-hidden bg-[radial-gradient(circle_at_30%_30%,#9fd37f_0%,#86bd69_38%,#73ab58_100%)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4 sm:p-5">
          <div className="pointer-events-auto flex flex-wrap gap-3">
            <div className="px-1 py-1">
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-800/75">
                Gold
              </p>
              <p className="mt-1 text-3xl font-bold text-emerald-950">
                {gameState.gold}
              </p>
            </div>

            {gameState.woodMachines > 0 ? (
              <div className="px-1 py-1">
                <p className="text-xs uppercase tracking-[0.3em] text-amber-800/75">
                  Wood Machine
                </p>
                <p className="mt-1 text-lg font-bold text-amber-950">
                  {gameState.fullWoodMachines > 0
                    ? `${gameState.fullWoodMachines} full na siya`
                    : `${gameState.totalMachineGold}/${
                        gameState.totalMachineCapacity
                      }`}
                </p>
              </div>
            ) : null}
          </div>

          <button
            onClick={() => setShopOpen((open) => !open)}
            className="pointer-events-auto rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white shadow-[0_10px_30px_rgba(2,6,23,0.28)] transition hover:bg-slate-800"
          >
            {shopOpen ? "Hide Shop" : "Open Shop"}
          </button>
        </div>

        <div ref={gameRootRef} className="h-full w-full overflow-hidden" />

        {selectedPlacedBuilding ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-28 z-10 flex justify-center px-4">
            <div className="pointer-events-auto flex items-center gap-3 rounded-3xl border border-white/15 bg-slate-950/90 px-4 py-3 text-white shadow-[0_20px_50px_rgba(2,6,23,0.45)] backdrop-blur">
              <div className="pr-2">
                <p className="text-[0.68rem] uppercase tracking-[0.28em] text-amber-300/75">
                  Selected
                </p>
                <p className="text-base font-black">{selectedPlacedBuilding.name}</p>
                <p className="text-xs text-slate-400">
                  {isMoveMode ? "Choose a new tile to replace this building." : "Choose an action."}
                </p>
                <p className="mt-1 text-xs font-semibold text-sky-300">
                  Level {selectedPlacedBuilding.level ?? 1}
                </p>
                {selectedPlacedBuilding.isUpgrading ? (
                  <p className="mt-1 text-xs font-semibold text-amber-300">
                    Upgrading... {upgradeMinutes}:{String(upgradeSeconds).padStart(2, "0")}
                  </p>
                ) : (selectedPlacedBuilding.level ?? 1) < 2 ? (
                  <p className="mt-1 text-xs font-semibold text-emerald-300">
                    Upgrade Cost: {upgradeCost} gold
                  </p>
                ) : null}
                {selectedPlacedBuilding.type === "wood-machine" ? (
                  <p className="mt-1 text-xs font-semibold text-amber-300">
                    {selectedPlacedBuilding.machineGold ?? 0}/
                    {selectedPlacedBuilding.maxGold ?? 250} gold
                  </p>
                ) : null}
                {selectedPlacedBuilding.type === "command-center" ? (
                  <>
                    <p className="mt-1 text-xs font-semibold text-amber-300">
                      Soldiers: {selectedPlacedBuilding.soldierCount ?? 0}/
                      {selectedPlacedBuilding.maxSoldiers ?? 50}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-emerald-300">
                      Wage: 1 gold bawat sundalo / 24 hrs
                    </p>
                    {(selectedPlacedBuilding.soldierCount ?? 0) > 0 ? (
                      <p className="mt-1 text-xs font-semibold text-sky-300">
                        Next wage in {wageHours}h {String(wageMinutes).padStart(2, "0")}m
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>

              <button
                type="button"
                onClick={handleMoveBuilding}
                className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400"
              >
                Move
              </button>

              <button
                type="button"
                onClick={handleUpgradeBuilding}
                disabled={!canUpgrade}
                className="rounded-2xl bg-sky-500 px-4 py-3 text-sm font-bold text-sky-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {selectedPlacedBuilding.isUpgrading
                  ? "Upgrading"
                  : (selectedPlacedBuilding.level ?? 1) >= 2
                    ? "Max Level"
                    : `Upgrade (${upgradeCost})`}
              </button>

              {selectedPlacedBuilding.isUpgrading ? (
                <button
                  type="button"
                  onClick={handleCancelUpgrade}
                  className="rounded-2xl bg-slate-200 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-white"
                >
                  Cancel Upgrade
                </button>
              ) : null}

              {selectedPlacedBuilding.type === "wood-machine" ? (
                <button
                  type="button"
                  onClick={handleCollectGold}
                  disabled={(selectedPlacedBuilding.machineGold ?? 0) <= 0 || selectedPlacedBuilding.isUpgrading}
                  className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Collect Gold
                </button>
              ) : null}

              {selectedPlacedBuilding.type === "command-center" ? (
                <button
                  type="button"
                  onClick={handleHireSoldier}
                  disabled={!canHireSoldier}
                  className="rounded-2xl bg-violet-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {canHireSoldier ? "Hire Soldier" : "Max Soldiers"}
                </button>
              ) : null}

              <button
                type="button"
                onClick={handleSellBuilding}
                className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-rose-500"
              >
                Sell
              </button>
            </div>
          </div>
        ) : null}

        <div className="pointer-events-none absolute bottom-8 left-4 z-10 sm:bottom-10 sm:left-5">
          <button
            type="button"
            onClick={handleStartWar}
            disabled={!canStartWar}
            className="pointer-events-auto rounded-2xl bg-rose-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-[0_16px_36px_rgba(190,24,93,0.35)] transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start War
          </button>
        </div>

        {hireModalOpen && selectedPlacedBuilding?.type === "command-center" ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/55 px-4">
            <div className="w-full max-w-[17.5rem] rounded-[1.5rem] border border-white/10 bg-slate-950/95 p-2.5 text-white shadow-[0_24px_80px_rgba(2,6,23,0.55)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.3em] text-amber-300/70">
                    Command Center
                  </p>
                  <h3 className="mt-1 text-lg font-black">Hire Soldier</h3>
                  <p className="mt-2 text-xs text-slate-400">
                    Pumili ng soldier na gusto mong i-hire. Isang option pa lang ang available sa ngayon.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setHireModalOpen(false)}
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <div className="mt-2.5 grid gap-2">
                {SOLDIER_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={option.available ? handleConfirmHireSoldier : undefined}
                    disabled={!option.available || !canHireSoldier}
                    className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-2 text-left transition hover:border-emerald-300 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="flex h-14 items-center justify-center rounded-xl bg-slate-900/70 p-1.5">
                      {option.image ? (
                        <img
                          src={option.image}
                          alt={option.name}
                          className="h-full w-full object-contain"
                          draggable="false"
                        />
                      ) : (
                        <span className="text-lg font-black text-emerald-200">SOLDIER</span>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-bold text-white">{option.name}</p>
                    <p className="mt-1 text-xs text-slate-300">{option.description}</p>
                    <p className="mt-2 text-xs font-semibold text-amber-300">
                      Wage: {option.wage} gold / 24 hrs
                    </p>
                    <p className="mt-1 text-xs font-semibold text-sky-300">
                      {selectedPlacedBuilding.soldierCount ?? 0}/{selectedPlacedBuilding.maxSoldiers ?? 50} hired
                    </p>
                  </button>
                ))}
              </div>

              {!canHireSoldier ? (
                <p className="mt-4 text-sm font-semibold text-rose-300">
                  Max soldiers reached na para sa Command Center na ito.
                </p>
              ) : availableSoldierOption ? null : (
                <p className="mt-4 text-sm font-semibold text-amber-300">
                  Wala pang available soldier option sa ngayon.
                </p>
              )}
            </div>
          </div>
        ) : null}

        {shopOpen ? (
          <div className="absolute inset-x-0 bottom-0 z-10 p-3 sm:p-4">
            <BuildingShop
              gold={gameState.gold}
              onSelectBuilding={handleSelectBuilding}
              selectedBuilding={selectedBuilding}
              onClose={() => setShopOpen(false)}
            />
          </div>
        ) : null}
      </section>
    </main>
  );
}
