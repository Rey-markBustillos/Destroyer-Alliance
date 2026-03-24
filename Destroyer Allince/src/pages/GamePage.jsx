import { useEffect, useRef, useState } from "react";

import BuildingShop from "../components/BuildingShop";
import { createGame, destroyGame } from "../game/main";
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
import { getStoredGold, saveStoredGold } from "../services/goldStorage";
import { getToken } from "../services/session";

export default function GamePage() {
  const gameRootRef = useRef(null);
  const gameRef = useRef(null);
  const [gameState, setGameState] = useState({
    gold: 1200,
    buildings: 0,
    totalMachineGold: 0,
    woodMachines: 0,
    fullWoodMachines: 0,
  });
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedPlacedBuilding, setSelectedPlacedBuilding] = useState(null);
  const [isMoveMode, setIsMoveMode] = useState(false);
  const [shopOpen, setShopOpen] = useState(true);

  useEffect(() => {
    if (!gameRootRef.current) {
      return undefined;
    }

    const game = createGame(gameRootRef.current);
    gameRef.current = game;

    const handleSceneReady = async () => {
      const gameScene = game.scene.getScene("GameScene");
      const token = getToken();

      if (!gameScene) {
        return;
      }

      const handleGameStateUpdate = (state) => {
        setGameState(state);
      };

      const handleGoldChanged = async ({ gold }) => {
        saveStoredGold(gold);

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
      };

      const handlePlacedBuildingSelected = (building) => {
        setSelectedPlacedBuilding(building);
        setIsMoveMode(false);
      };

      const handleStructurePlaced = async ({
        structure,
        type,
        row,
        col,
        machineGold,
        lastGeneratedAt,
      }) => {
        upsertStoredBuilding({
          id: structure.persistedId ?? null,
          type,
          x: col,
          y: row,
          machineGold,
          lastGeneratedAt,
        });

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
            machineGold,
            lastGeneratedAt,
          });
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
        machineGold,
        lastGeneratedAt,
      }) => {
        removeStoredBuilding({
          id: structure.persistedId ?? null,
          type,
          x: previousCol,
          y: previousRow,
        });
        upsertStoredBuilding({
          id: structure.persistedId ?? null,
          type,
          x: col,
          y: row,
          machineGold,
          lastGeneratedAt,
        });

        setSelectedPlacedBuilding({
          id: structure.persistedId ?? null,
          type,
          name: structure.buildingType.name,
          row,
          col,
          machineGold,
          maxGold: 250,
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
        machineGold,
        lastGeneratedAt,
      }) => {
        upsertStoredBuilding({
          id: id ?? null,
          type,
          x: col,
          y: row,
          machineGold,
          lastGeneratedAt,
        });

        setSelectedPlacedBuilding((current) => {
          if (!current || current.type !== type || current.row !== row || current.col !== col) {
            return current;
          }

          return {
            ...current,
            machineGold,
            maxGold: 250,
          };
        });
      };

      const handleStructureSold = async ({ id, type, row, col }) => {
        removeStoredBuilding({ id, type, x: col, y: row });
        setSelectedPlacedBuilding(null);
        setIsMoveMode(false);

        if (!token || !id) {
          return;
        }

        try {
          await deleteBuilding(id, token);
        } catch (error) {
          console.error("Unable to delete building:", error);
        }
      };

      gameScene.events.on("game-state-update", handleGameStateUpdate);
      gameScene.events.on("gold-changed", handleGoldChanged);
      gameScene.events.on("structure-selection-cleared", handleStructureSelectionCleared);
      gameScene.events.on("placed-building-selected", handlePlacedBuildingSelected);
      gameScene.events.on("structure-placed", handleStructurePlaced);
      gameScene.events.on("structure-moved", handleStructureMoved);
      gameScene.events.on("structure-resource-updated", handleStructureResourceUpdated);
      gameScene.events.on("structure-sold", handleStructureSold);

      const localBuildings = getStoredBuildings();
      const localGold = getStoredGold();

      if (localGold !== null) {
        gameScene.setGoldState(localGold, { emitChangeEvent: false });
      }

      if (localBuildings.length > 0) {
        gameScene.loadPersistedBuildings(localBuildings);
      }

      if (token) {
        try {
          const savedGameState = await fetchGameState(token);
          const serverGold = savedGameState.gold ?? 1200;
          const resolvedGold =
            localGold !== null ? Math.max(localGold, serverGold) : serverGold;

          gameScene.setGoldState(resolvedGold, { emitChangeEvent: false });
          saveStoredGold(resolvedGold);

          if (resolvedGold !== serverGold) {
            await updateGameState({ gold: resolvedGold }, token);
          }

          const savedBuildings = await fetchBuildings(token);
          const mergedBuildings = mergeStoredBuildings(savedBuildings);
          gameScene.loadPersistedBuildings(mergedBuildings);
        } catch (error) {
          console.error("Unable to load saved game state:", error);
        }
      }

      gameRef.current.cleanup = () => {
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
                        gameState.woodMachines * 250
                      }`}
                </p>
              </div>
            ) : null}
          </div>

          <button
            onClick={() => setShopOpen((open) => !open)}
            className="pointer-events-auto rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white shadow-[0_10px_30px_rgba(2,6,23,0.28)] transition hover:bg-slate-800"
          >
            {shopOpen ? "Hide Builder" : "Open Builder"}
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
                {selectedPlacedBuilding.type === "wood-machine" ? (
                  <p className="mt-1 text-xs font-semibold text-amber-300">
                    {selectedPlacedBuilding.machineGold ?? 0}/
                    {selectedPlacedBuilding.maxGold ?? 250} gold
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={handleMoveBuilding}
                className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400"
              >
                Move
              </button>

              {selectedPlacedBuilding.type === "wood-machine" ? (
                <button
                  type="button"
                  onClick={handleCollectGold}
                  disabled={(selectedPlacedBuilding.machineGold ?? 0) <= 0}
                  className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Collect Gold
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
