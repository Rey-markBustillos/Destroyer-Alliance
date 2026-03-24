import { useEffect, useRef, useState } from "react";

import BuildingShop from "../components/BuildingShop";
import { createGame, destroyGame } from "../game/main";

export default function GamePage() {
  const gameRootRef = useRef(null);
  const gameRef = useRef(null);
  const [gameState, setGameState] = useState({ gold: 1200, buildings: 0 });
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [shopOpen, setShopOpen] = useState(true);

  useEffect(() => {
    if (!gameRootRef.current) {
      return undefined;
    }

    const game = createGame(gameRootRef.current);
    gameRef.current = game;

    const handleSceneReady = () => {
      const gameScene = game.scene.getScene("GameScene");

      if (!gameScene) {
        return;
      }

      const handleGameStateUpdate = (state) => {
        setGameState(state);
      };

      const handleStructureSelectionCleared = () => {
        setSelectedBuilding(null);
      };

      gameScene.events.on("game-state-update", handleGameStateUpdate);
      gameScene.events.on("structure-selection-cleared", handleStructureSelectionCleared);

      gameRef.current.cleanup = () => {
        gameScene.events.off("game-state-update", handleGameStateUpdate);
        gameScene.events.off(
          "structure-selection-cleared",
          handleStructureSelectionCleared
        );
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
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.setSelectedBuilding(building);
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
          </div>

          <button
            onClick={() => setShopOpen((open) => !open)}
            className="pointer-events-auto rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white shadow-[0_10px_30px_rgba(2,6,23,0.28)] transition hover:bg-slate-800"
          >
            {shopOpen ? "Hide Builder" : "Open Builder"}
          </button>
        </div>

        <div ref={gameRootRef} className="h-full w-full overflow-hidden" />

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
