import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";

import BuildingShop from "../components/BuildingShop";
import { createGame, destroyGame } from "../game/main";
import { getBuildingUpgradeCost } from "../game/utils/buildingTypes";
import {
  fetchGameSnapshot,
  syncGameSnapshot,
} from "../services/game";
import {
  getGameSnapshot as getLocalGameSnapshot,
  saveGameSnapshot,
} from "../services/gameStorage";
import { getSession } from "../services/session";

const shouldPreferLocalSnapshot = (localSnapshot, serverSnapshot) => {
  const localBuildings = Array.isArray(localSnapshot?.buildings) ? localSnapshot.buildings : [];
  const serverBuildings = Array.isArray(serverSnapshot?.buildings) ? serverSnapshot.buildings : [];

  if (!localBuildings.length || localSnapshot?.serverSyncedAt) {
    return false;
  }

  if (!serverBuildings.length) {
    return true;
  }

  return false;
};

const formatCompactNumber = (value) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    Math.max(0, Number(value ?? 0) || 0)
  );

function HudMetric({ label, value, tone = "emerald" }) {
  const toneClass = {
    emerald: "text-emerald-50 border-emerald-300/20 bg-[linear-gradient(180deg,rgba(16,185,129,0.22)_0%,rgba(15,23,42,0.34)_100%)]",
    amber: "text-amber-50 border-amber-300/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.22)_0%,rgba(15,23,42,0.34)_100%)]",
    sky: "text-sky-50 border-sky-300/20 bg-[linear-gradient(180deg,rgba(56,189,248,0.22)_0%,rgba(15,23,42,0.34)_100%)]",
    rose: "text-rose-50 border-rose-300/20 bg-[linear-gradient(180deg,rgba(251,113,133,0.22)_0%,rgba(15,23,42,0.34)_100%)]",
  }[tone];

  return (
    <div className={`min-w-0 rounded-[0.8rem] border px-2 py-1.5 backdrop-blur-md ${toneClass}`}>
      <p className="text-[0.5rem] uppercase tracking-[0.18em] text-white/70">{label}</p>
      <p className="mt-0.5 text-[0.95rem] font-black tracking-tight">{value}</p>
    </div>
  );
}

function CommandButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-[0.16em] transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export default function GamePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const gameRootRef = useRef(null);
  const gameRef = useRef(null);
  const activeSession = getSession();
  const [clock, setClock] = useState(() => Date.now());
  const [gameState, setGameState] = useState({
    gold: 1200,
    buildings: 0,
    totalMachineGold: 0,
    totalMachineCapacity: 0,
    totalSoldiers: 0,
    totalTanks: 0,
    totalHelicopters: 0,
    totalArmyUnits: 0,
    commandCenters: 0,
    commandCenterLimit: 2,
    battleTankBuildings: 0,
    battleTankLimit: 1,
    skyports: 0,
    skyportLimit: 1,
    woodMachines: 0,
    fullWoodMachines: 0,
    townHallLevel: 1,
    townHallCount: 1,
    woodMachineLimit: 4,
  });
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedPlacedBuilding, setSelectedPlacedBuilding] = useState(null);
  const [isMoveMode, setIsMoveMode] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [hireModalOpen, setHireModalOpen] = useState(false);
  const [removeSoldierCount, setRemoveSoldierCount] = useState("1");

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

      let syncTimeoutId = null;
      let syncInFlight = false;
      let syncQueuedWhileSaving = false;

      const persistCurrentSnapshot = (metadata = {}) => {
        return saveGameSnapshot(
          {
            ...gameScene.getPersistedSnapshot(),
            ...metadata,
          },
          session
        );
      };

      const queueSnapshotSync = () => {
        if (!token) {
          return;
        }

        if (syncTimeoutId) {
          window.clearTimeout(syncTimeoutId);
        }

        syncTimeoutId = window.setTimeout(async () => {
          syncTimeoutId = null;

          if (syncInFlight) {
            syncQueuedWhileSaving = true;
            return;
          }

          syncInFlight = true;

          try {
            const snapshot = gameScene.getPersistedSnapshot();
            const savedSnapshot = await syncGameSnapshot(snapshot, token);
            saveGameSnapshot({
              ...savedSnapshot,
              camera: snapshot.camera ?? null,
              serverSyncedAt: Date.now(),
            }, session);
          } catch (error) {
            console.error("Unable to sync game snapshot:", error);
          } finally {
            syncInFlight = false;

            if (syncQueuedWhileSaving) {
              syncQueuedWhileSaving = false;
              queueSnapshotSync();
            }
          }
        }, 400);
      };

      const persistAndSyncSnapshot = () => {
        persistCurrentSnapshot();
        queueSnapshotSync();
      };

      const handleGameStateUpdate = (state) => {
        setGameState(state);
      };

      const handleGoldChanged = () => {
        persistAndSyncSnapshot();
      };

      const handleStructureSelectionCleared = () => {
        setSelectedBuilding(null);
        setHireModalOpen(false);
        setRemoveSoldierCount("1");
      };

      const handlePlacedBuildingSelected = (building) => {
        setSelectedPlacedBuilding(building);
        setIsMoveMode(false);
        setRemoveSoldierCount("1");
        if (building?.type !== "command-center") {
          setHireModalOpen(false);
        }
      };

      const handleStructurePlaced = () => {
        persistAndSyncSnapshot();
      };

      const handleStructureMoved = ({
        structure,
        type,
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
        hasChopper,
        hasTank,
        tankCost,
        tankHealth,
        tankDamage,
      }) => {
        persistAndSyncSnapshot();

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
          hasChopper,
          hasTank,
          tankCost,
          tankHealth,
          tankDamage,
        });
        setIsMoveMode(false);
      };

      const handleStructureResourceUpdated = ({
        type,
        row,
        col,
        level,
        isUpgrading,
        upgradeCompleteAt,
        machineGold,
        maxGold,
        soldierCount,
        hasChopper,
        hasTank,
        tankCost,
        tankHealth,
        tankDamage,
      }) => {
        persistAndSyncSnapshot();

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
            hasChopper,
            hasTank,
            tankCost,
            tankHealth,
            tankDamage,
          };
        });
      };

      const handleStructureSold = () => {
        persistAndSyncSnapshot();
        setSelectedPlacedBuilding(null);
        setIsMoveMode(false);
        setHireModalOpen(false);
      };

      const handleStructureUpgradeStarted = ({
        type,
        row,
        col,
        level,
        isUpgrading,
        upgradeCompleteAt,
        machineGold,
        maxGold,
        soldierCount,
        hasChopper,
        hasTank,
        tankCost,
        tankHealth,
        tankDamage,
      }) => {
        persistAndSyncSnapshot();

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
            hasChopper,
            hasTank,
            tankCost,
            tankHealth,
            tankDamage,
          };
        });
      };

      const handleStructureUpgradeCompleted = ({
        type,
        row,
        col,
        level,
        isUpgrading,
        upgradeCompleteAt,
        machineGold,
        maxGold,
        soldierCount,
        hasChopper,
        hasTank,
        tankCost,
        tankHealth,
        tankDamage,
      }) => {
        persistAndSyncSnapshot();

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
            hasChopper,
            hasTank,
            tankCost,
            tankHealth,
            tankDamage,
          };
        });
      };

      const handleStructureUpgradeCancelled = ({
        type,
        row,
        col,
        level,
        isUpgrading,
        upgradeCompleteAt,
        machineGold,
        maxGold,
        soldierCount,
        hasChopper,
        hasTank,
        tankCost,
        tankHealth,
        tankDamage,
      }) => {
        persistAndSyncSnapshot();

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
            hasChopper,
            hasTank,
            tankCost,
            tankHealth,
            tankDamage,
          };
        });
      };

      const handleStructureArmyUpdated = ({
        type,
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
        hasChopper,
        hasTank,
        tankCost,
        tankHealth,
        tankDamage,
      }) => {
        persistAndSyncSnapshot();

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
            hasChopper,
            hasTank,
            tankCost,
            tankHealth,
            tankDamage,
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
          const localSnapshot = getLocalGameSnapshot(session) ?? {
            gold: 1200,
            buildings: [],
          };
          let resolvedSnapshot = localSnapshot;
          let shouldSyncResolvedSnapshot = false;
          let shouldMarkServerAuthority = false;

          if (token) {
            const serverSnapshot = await fetchGameSnapshot(token);

            if (shouldPreferLocalSnapshot(localSnapshot, serverSnapshot)) {
              resolvedSnapshot = localSnapshot;
              shouldSyncResolvedSnapshot = true;
            } else {
              resolvedSnapshot = serverSnapshot;
              shouldMarkServerAuthority = true;
            }
          }

          if (localSnapshot?.camera && !resolvedSnapshot?.camera) {
            resolvedSnapshot = {
              ...resolvedSnapshot,
              camera: localSnapshot.camera,
            };
          }

          gameScene.initializeFromSnapshot(resolvedSnapshot);
          const initializedSnapshot = persistCurrentSnapshot(
            shouldMarkServerAuthority ? { serverSyncedAt: Date.now() } : {}
          );

          if (
            token
            && (
              shouldSyncResolvedSnapshot
              || JSON.stringify(initializedSnapshot) !== JSON.stringify(resolvedSnapshot)
            )
          ) {
            queueSnapshotSync();
          }
        } catch (error) {
          console.error("Unable to load saved game state:", error);
          gameScene.initializeFromSnapshot(getLocalGameSnapshot(session) ?? {
            gold: 1200,
            buildings: [],
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
        if (syncTimeoutId) {
          window.clearTimeout(syncTimeoutId);
        }
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

    game.events.on("game-scene-ready", handleSceneReady);

    return () => {
      game.events.off("game-scene-ready", handleSceneReady);
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
  };

  const handleRemoveSoldiers = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    const count = Math.max(1, Math.floor(Number(removeSoldierCount) || 1));

    gameScene?.removeSoldiersAtSelectedBuilding(count);
    setRemoveSoldierCount("1");
  };

  const handleFeedSoldiers = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.feedSelectedCommandCenterSoldiers();
  };

  const handleBuyChopper = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.buyChopperAtSelectedBuilding();
  };

  const handleBuyTank = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.buyTankAtSelectedBuilding();
  };

  const handleSellChopper = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.sellChopperAtSelectedBuilding();
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
  const upgradeCap = selectedPlacedBuilding?.type === "town-hall"
    ? 2
    : Math.min(2, gameState.townHallLevel ?? 1);
  const blockedByTownHall = selectedPlacedBuilding
    && selectedPlacedBuilding.type !== "town-hall"
    && (selectedPlacedBuilding.level ?? 1) >= upgradeCap;
  const canUpgrade = selectedPlacedBuilding
    && !selectedPlacedBuilding.isUpgrading
    && (selectedPlacedBuilding.level ?? 1) < upgradeCap
    && gameState.gold >= upgradeCost;
  const wageRemainingMs = selectedPlacedBuilding?.nextWageAt
    ? Math.max(0, Number(selectedPlacedBuilding.nextWageAt) - clock)
    : 0;
  const wageHours = Math.floor(wageRemainingMs / 3600000);
  const wageMinutes = Math.floor((wageRemainingMs % 3600000) / 60000);
  const canHireSoldier = selectedPlacedBuilding?.type === "command-center"
    && (selectedPlacedBuilding.soldierCount ?? 0) < (selectedPlacedBuilding.maxSoldiers ?? 0);
  const parsedRemoveSoldierCount = Math.max(1, Math.floor(Number(removeSoldierCount) || 1));
  const canRemoveSoldier = selectedPlacedBuilding?.type === "command-center"
    && (selectedPlacedBuilding.soldierCount ?? 0) > 0;
  const feedCost = (selectedPlacedBuilding?.soldierCount ?? 0) * 1;
  const canFeedSoldiers = selectedPlacedBuilding?.type === "command-center"
    && (selectedPlacedBuilding.soldierCount ?? 0) > 0
    && gameState.gold >= feedCost;
  const canBuyChopper = selectedPlacedBuilding?.type === "skyport"
    && !selectedPlacedBuilding.hasChopper
    && gameState.gold >= (selectedPlacedBuilding.chopperCost ?? 0);
  const canSellChopper = selectedPlacedBuilding?.type === "skyport"
    && selectedPlacedBuilding.hasChopper;
  const canBuyTank = selectedPlacedBuilding?.type === "battle-tank"
    && !selectedPlacedBuilding.hasTank
    && gameState.gold >= (selectedPlacedBuilding.tankCost ?? 0);
  const tankGoldShortfall = selectedPlacedBuilding?.type === "battle-tank"
    ? Math.max(0, (selectedPlacedBuilding.tankCost ?? 0) - gameState.gold)
    : 0;
  const canStartWar = (gameState.totalArmyUnits ?? 0) > 0;
  const profileName = activeSession?.name || activeSession?.email?.split("@")[0] || "Commander";
  const profileId = activeSession?.playerId
    || (activeSession?.id ? `PLYR-${String(activeSession.id).padStart(6, "0")}` : "-");

  return (
    <main className="font-black-ops min-h-screen bg-[radial-gradient(circle_at_top,#c4ddb4_0%,#92bc7a_42%,#6f9d58_100%)] text-slate-950">
      <section className="relative h-screen w-full overflow-hidden bg-[radial-gradient(circle_at_30%_30%,#9fd37f_0%,#86bd69_38%,#73ab58_100%)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.2),transparent_26%),linear-gradient(180deg,rgba(10,25,18,0.04)_0%,rgba(10,25,18,0.14)_100%)]" />

        <motion.div
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 sm:p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="pointer-events-auto flex w-[7.2rem] flex-col gap-1">
              <div className="rounded-[0.8rem] border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.56)_0%,rgba(15,23,42,0.38)_100%)] px-2 py-1.5 text-white backdrop-blur-sm">
                <p className="text-[0.5rem] uppercase tracking-[0.24em] text-emerald-300/75">Base</p>
                <p className="mt-1 text-[0.82rem] font-black leading-tight text-white">{profileName}</p>
                <p className="mt-0.5 text-[0.46rem] uppercase tracking-[0.08em] text-slate-100/90">{profileId}</p>
              </div>

              <HudMetric label="Gold" value={formatCompactNumber(gameState.gold)} tone="emerald" />
              <HudMetric label="Troops" value={formatCompactNumber(gameState.totalArmyUnits ?? 0)} tone="sky" />
              <HudMetric label="Town Hall" value={`Lv ${gameState.townHallLevel ?? 1}`} tone="amber" />

              {gameState.woodMachines > 0 ? (
                <HudMetric
                  label="Wood Machine"
                  value={
                    gameState.fullWoodMachines > 0
                      ? `${gameState.fullWoodMachines} Full`
                      : `${gameState.totalMachineGold}/${gameState.totalMachineCapacity}`
                  }
                  tone="rose"
                />
              ) : null}
            </div>

            <div className="pointer-events-auto flex items-center gap-1.5">
              <CommandButton
                onClick={() => navigate("/profile", { state: { backgroundLocation: location } })}
                className="border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.52)_0%,rgba(15,23,42,0.3)_100%)] px-2.5 py-1.5 text-[10px] text-sky-50 backdrop-blur-sm hover:bg-[linear-gradient(180deg,rgba(15,23,42,0.68)_0%,rgba(15,23,42,0.42)_100%)]"
              >
                Profile
              </CommandButton>
              <CommandButton
                onClick={() => setShopOpen((open) => !open)}
                className="border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.52)_0%,rgba(15,23,42,0.3)_100%)] px-2.5 py-1.5 text-[10px] text-white backdrop-blur-sm hover:bg-[linear-gradient(180deg,rgba(15,23,42,0.68)_0%,rgba(15,23,42,0.42)_100%)]"
              >
                {shopOpen ? "Hide Shop" : "Open Shop"}
              </CommandButton>
            </div>
          </div>
        </motion.div>

        <div ref={gameRootRef} className="h-full w-full overflow-hidden" />

        <AnimatePresence>
        {selectedPlacedBuilding ? (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-none absolute inset-x-0 bottom-14 z-10 flex justify-center px-4"
          >
            <div className="pointer-events-auto flex max-w-[82vw] flex-wrap items-center justify-center gap-2 rounded-[1.4rem] border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.82)_0%,rgba(15,23,42,0.68)_100%)] px-3 py-3 text-white shadow-[0_20px_60px_rgba(2,6,23,0.28)] backdrop-blur-xl">
              <div className="min-w-[9.5rem] max-w-[11rem] pr-1">
                <p className="text-[0.68rem] uppercase tracking-[0.28em] text-amber-300/75">Selected</p>
                <p className="mt-1 text-base font-black text-white">{selectedPlacedBuilding.name}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {isMoveMode ? "Choose a new tile to replace this building." : "Choose an action."}
                </p>
                <p className="mt-2 inline-flex rounded-full border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold text-sky-200">
                  Level {selectedPlacedBuilding.level ?? 1}
                </p>
                {selectedPlacedBuilding.isUpgrading ? (
                  <p className="mt-1 text-[11px] font-semibold text-amber-300">
                    Upgrading... {upgradeMinutes}:{String(upgradeSeconds).padStart(2, "0")}
                  </p>
                ) : (selectedPlacedBuilding.level ?? 1) < upgradeCap ? (
                  <p className="mt-1 text-[11px] font-semibold text-emerald-300">
                    Upgrade Cost: {upgradeCost} gold
                  </p>
                ) : blockedByTownHall ? (
                  <p className="mt-1 text-[11px] font-semibold text-rose-300">
                    Upgrade Town Hall to level {Math.min(2, (selectedPlacedBuilding.level ?? 1) + 1)} first
                  </p>
                ) : null}
                {selectedPlacedBuilding.type === "wood-machine" ? (
                  <p className="mt-1 text-[11px] font-semibold text-amber-300">
                    {selectedPlacedBuilding.machineGold ?? 0}/
                    {selectedPlacedBuilding.maxGold ?? 250} gold
                  </p>
                ) : null}
                {selectedPlacedBuilding.type === "command-center" ? (
                  <>
                    <p className="mt-1 text-[11px] font-semibold text-amber-300">
                      Soldiers: {selectedPlacedBuilding.soldierCount ?? 0}/
                      {selectedPlacedBuilding.maxSoldiers ?? 15}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-emerald-300">
                      Kain cost: {feedCost} gold
                    </p>
                    {(selectedPlacedBuilding.soldierCount ?? 0) > 0 ? (
                      <p className={`mt-1 text-[11px] font-semibold ${
                        selectedPlacedBuilding.isHungry ? "text-rose-300" : "text-sky-300"
                      }`}>
                        {selectedPlacedBuilding.isHungry
                          ? "Gutom na sila"
                          : `May food pa for ${wageHours}h ${String(wageMinutes).padStart(2, "0")}m`}
                      </p>
                    ) : null}
                  </>
                ) : null}
                {selectedPlacedBuilding.type === "battle-tank" ? (
                  <>
                    <p className="mt-1 text-[11px] font-semibold text-amber-300">
                      {selectedPlacedBuilding.hasTank
                        ? "Tank ready for battle"
                        : `Buy Tank: ${selectedPlacedBuilding.tankCost ?? 5000} gold`}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-200">
                      Tank HP {selectedPlacedBuilding.tankHealth ?? 0} • Damage {selectedPlacedBuilding.tankDamage ?? 0}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-emerald-300">
                      {selectedPlacedBuilding.hasTank
                        ? "Upgrade para lumakas ang HP at damage"
                        : "Building pa lang ito. Kailangan mo pang bumili ng actual tank."}
                    </p>
                    {!selectedPlacedBuilding.hasTank ? (
                      <p className={`mt-1 text-[11px] font-semibold ${
                        tankGoldShortfall > 0 ? "text-rose-300" : "text-cyan-300"
                      }`}>
                        {tankGoldShortfall > 0
                          ? `Kulang ka ng ${tankGoldShortfall} gold para makabili ng tank.`
                          : "Pwede mo nang bilhin ang actual tank para sa laban."}
                      </p>
                    ) : null}
                  </>
                ) : null}
                {selectedPlacedBuilding.type === "skyport" ? (
                  <p className="mt-1 text-[11px] font-semibold text-amber-300">
                    {selectedPlacedBuilding.hasChopper
                      ? "Chopper ready"
                      : `Buy Chopper: ${selectedPlacedBuilding.chopperCost ?? 0} gold`}
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={handleMoveBuilding}
                className="rounded-2xl bg-amber-400 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-300"
              >
                Move
              </button>

              <button
                type="button"
                onClick={handleUpgradeBuilding}
                disabled={!canUpgrade}
                className="rounded-2xl bg-sky-400 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-950 transition hover:-translate-y-0.5 hover:bg-sky-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
              >
                {selectedPlacedBuilding.isUpgrading
                  ? "Upgrading"
                  : blockedByTownHall
                    ? "Town Hall Locked"
                    : (selectedPlacedBuilding.level ?? 1) >= upgradeCap
                    ? "Max Level"
                    : `Upgrade (${upgradeCost})`}
              </button>

              {selectedPlacedBuilding.isUpgrading ? (
                <button
                  type="button"
                  onClick={handleCancelUpgrade}
                  className="rounded-2xl bg-slate-200 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Cancel Upgrade
                </button>
              ) : null}

              {selectedPlacedBuilding.type === "wood-machine" ? (
                <button
                  type="button"
                  onClick={handleCollectGold}
                  disabled={(selectedPlacedBuilding.machineGold ?? 0) <= 0 || selectedPlacedBuilding.isUpgrading}
                  className="rounded-2xl bg-emerald-400 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-950 transition hover:-translate-y-0.5 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                >
                  Collect Gold
                </button>
              ) : null}

              {selectedPlacedBuilding.type === "command-center" ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleHireSoldier}
                    disabled={!canHireSoldier}
                    className="rounded-2xl bg-violet-500 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition hover:-translate-y-0.5 hover:bg-violet-400 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                  >
                    {canHireSoldier ? "Hire Soldier" : "Max Soldiers"}
                  </button>

                  <input
                    type="number"
                    min="1"
                    max={Math.max(1, selectedPlacedBuilding.soldierCount ?? 1)}
                    value={removeSoldierCount}
                    onChange={(event) => setRemoveSoldierCount(event.target.value)}
                    className="w-14 rounded-2xl border border-white/10 bg-slate-900/80 px-2 py-2.5 text-center text-[11px] font-bold text-white outline-none transition focus:border-rose-400"
                  />

                  <button
                    type="button"
                    onClick={handleRemoveSoldiers}
                    disabled={
                      !canRemoveSoldier
                      || parsedRemoveSoldierCount > (selectedPlacedBuilding.soldierCount ?? 0)
                    }
                    className="rounded-2xl bg-rose-500 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition hover:-translate-y-0.5 hover:bg-rose-400 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                  >
                    Remove
                  </button>

                  <button
                    type="button"
                    onClick={handleFeedSoldiers}
                    disabled={!canFeedSoldiers}
                    className="rounded-2xl bg-emerald-400 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                  >
                    Kain Na
                  </button>
                </div>
              ) : null}

              {selectedPlacedBuilding.type === "battle-tank" ? (
                <button
                  type="button"
                  onClick={handleBuyTank}
                  disabled={!canBuyTank}
                  className="rounded-2xl bg-cyan-400 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                >
                  {selectedPlacedBuilding.hasTank
                    ? "Tank Ready"
                    : tankGoldShortfall > 0
                      ? `Need ${tankGoldShortfall} More`
                      : `Buy Tank (${selectedPlacedBuilding.tankCost ?? 5000})`}
                </button>
              ) : null}

              {selectedPlacedBuilding.type === "skyport" ? (
                selectedPlacedBuilding.hasChopper ? (
                  <button
                    type="button"
                    onClick={handleSellChopper}
                    disabled={!canSellChopper}
                    className="rounded-2xl bg-orange-400 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-orange-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                  >
                    Sell Chopper
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleBuyChopper}
                    disabled={!canBuyChopper}
                    className="rounded-2xl bg-cyan-400 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                  >
                    Buy Chopper
                  </button>
                )
              ) : null}

              <button
                type="button"
                onClick={handleSellBuilding}
                className="rounded-2xl bg-rose-600 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition hover:-translate-y-0.5 hover:bg-rose-500"
              >
                Sell
              </button>
            </div>
          </motion.div>
        ) : null}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.12 }}
          className="pointer-events-none absolute bottom-8 left-4 z-10 sm:bottom-10 sm:left-5"
        >
          <button
            type="button"
            onClick={handleStartWar}
            disabled={!canStartWar}
            className="pointer-events-auto rounded-[1.35rem] border border-rose-300/20 bg-[linear-gradient(135deg,rgba(225,29,72,0.92)_0%,rgba(244,63,94,0.9)_100%)] px-6 py-4 text-sm font-black uppercase tracking-[0.24em] text-white shadow-[0_22px_40px_rgba(190,24,93,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_26px_50px_rgba(190,24,93,0.36)] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
          >
            Start War
          </button>
        </motion.div>

        {hireModalOpen && selectedPlacedBuilding?.type === "command-center" ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[3px]">
            <div className="w-full max-w-[18.5rem] rounded-[1.4rem] border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.82)_0%,rgba(15,23,42,0.68)_100%)] p-3 text-white shadow-[0_20px_60px_rgba(2,6,23,0.28)] backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.3em] text-amber-300/70">
                    Command Center
                  </p>
                  <h3 className="mt-1 text-lg font-black">Unit Shop</h3>
                  <p className="mt-2 text-xs text-slate-400">
                    Dito ka bibili ng soldiers para sa selected Command Center.
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
                <button
                  type="button"
                  onClick={handleConfirmHireSoldier}
                  disabled={!canHireSoldier}
                  className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-2 text-left transition hover:border-emerald-300 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex h-14 items-center justify-center rounded-xl bg-slate-900/70 p-1.5">
                    <img
                      src="/assets/army/front/firing.png"
                      alt="Basic Soldier"
                      className="h-full w-full object-contain"
                      draggable="false"
                    />
                  </div>
                  <p className="mt-2 text-sm font-bold text-white">Basic Soldier</p>
                  <p className="mt-1 text-xs text-slate-300">Starter unit para sa Command Center.</p>
                  <p className="mt-2 text-xs font-semibold text-amber-300">
                    Wage: 1 gold / 24 hrs
                  </p>
                  <p className="mt-1 text-xs font-semibold text-sky-300">
                    {selectedPlacedBuilding.soldierCount ?? 0}/{selectedPlacedBuilding.maxSoldiers ?? 15} hired
                  </p>
                </button>
              </div>

              {!canHireSoldier && (
                <p className="mt-4 text-sm font-semibold text-rose-300">
                  Max soldiers reached na para sa Command Center na ito.
                </p>
              )}
            </div>
          </div>
        ) : null}

        {shopOpen ? (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            className="absolute inset-x-0 bottom-0 z-10 p-3 sm:p-4"
          >
            <BuildingShop
              gold={gameState.gold}
              townHallCount={gameState.townHallCount}
              townHallLevel={gameState.townHallLevel}
              woodMachineCount={gameState.woodMachines}
              woodMachineLimit={gameState.woodMachineLimit}
              commandCenterCount={gameState.commandCenters}
              commandCenterLimit={gameState.commandCenterLimit}
              battleTankCount={gameState.battleTankBuildings}
              battleTankLimit={gameState.battleTankLimit}
              skyportCount={gameState.skyports}
              skyportLimit={gameState.skyportLimit}
              onSelectBuilding={handleSelectBuilding}
              selectedBuilding={selectedBuilding}
              onClose={() => setShopOpen(false)}
            />
          </motion.div>
        ) : null}
      </section>
    </main>
  );
}
