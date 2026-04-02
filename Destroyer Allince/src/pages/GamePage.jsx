import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";

import BuildingShop from "../components/BuildingShop";
import MobileLandscapePrompt from "../components/MobileLandscapePrompt";
import { createGame, destroyGame } from "../game/main";
import { getBuildingUpgradeCost } from "../game/utils/buildingTypes";
import { createBattleSocket } from "../services/battleSocket";
import { fetchLeaderboard } from "../services/auth";
import {
  fetchGameSnapshot,
  syncGameSnapshot,
} from "../services/game";
import {
  getGameSnapshot as getLocalGameSnapshot,
  saveGameSnapshot,
} from "../services/gameStorage";
import {
  clearWelcomeBackPending,
  getSession,
  isWelcomeBackPending,
} from "../services/session";
import soundManager from "../services/soundManager";

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

const BACKEND_RETRY_COOLDOWN_MS = 10000;
const SOLDIER_RECRUIT_COST = 2;
const TANK_ENERGY_COST = 2;
const HELICOPTER_ENERGY_COST = 3;

const isBackendConnectionError = (error) => {
  const message = String(error?.message ?? "");
  const code = String(error?.code ?? "");

  return (
    code === "ERR_NETWORK"
    || code === "ECONNREFUSED"
    || message.includes("Network Error")
  );
};

const getChargePercent = (shotsRemaining, maxShots) => {
  const resolvedMax = Math.max(1, Number(maxShots ?? 1) || 1);
  const resolvedShots = Math.max(0, Number(shotsRemaining ?? 0) || 0);
  return Math.max(0, Math.min(100, Math.round((resolvedShots / resolvedMax) * 100)));
};

function HudMetric({ label, value, tone = "emerald" }) {
  const toneClass = {
    emerald: "text-emerald-50 border-emerald-300/20 bg-[linear-gradient(180deg,rgba(16,185,129,0.22)_0%,rgba(15,23,42,0.34)_100%)]",
    amber: "text-amber-50 border-amber-300/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.22)_0%,rgba(15,23,42,0.34)_100%)]",
    sky: "text-sky-50 border-sky-300/20 bg-[linear-gradient(180deg,rgba(56,189,248,0.22)_0%,rgba(15,23,42,0.34)_100%)]",
    rose: "text-rose-50 border-rose-300/20 bg-[linear-gradient(180deg,rgba(251,113,133,0.22)_0%,rgba(15,23,42,0.34)_100%)]",
  }[tone];

  return (
    <div className={`min-w-0 rounded-[0.64rem] border px-1 py-0.5 backdrop-blur-md min-[901px]:rounded-[0.8rem] min-[901px]:px-1.5 min-[901px]:py-1.5 ${toneClass}`}>
      <p className="text-[0.32rem] uppercase tracking-[0.12em] text-white/70 min-[901px]:text-[0.42rem] min-[901px]:tracking-[0.2em]">{label}</p>
      <p className="mt-0.5 text-[0.62rem] font-black leading-none tracking-tight min-[901px]:text-[0.8rem]">{value}</p>
    </div>
  );
}

function ChargeRing({ percent = 0, label = "Charge", tone = "cyan" }) {
  const resolvedPercent = Math.max(0, Math.min(100, Math.round(Number(percent ?? 0) || 0)));
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - ((resolvedPercent / 100) * circumference);
  const palette = tone === "emerald"
    ? {
      track: "rgba(16, 185, 129, 0.18)",
      stroke: "#34d399",
      glow: "drop-shadow(0 0 10px rgba(52, 211, 153, 0.28))",
    }
    : {
      track: "rgba(56, 189, 248, 0.18)",
      stroke: "#38bdf8",
      glow: "drop-shadow(0 0 10px rgba(56, 189, 248, 0.28))",
    };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2">
      <p className="text-center text-[10px] uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <div className="mt-2 flex items-center justify-center">
        <div className="relative h-14 w-14">
          <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
            <circle
              cx="28"
              cy="28"
              r={radius}
              fill="none"
              stroke={palette.track}
              strokeWidth="5"
            />
            <circle
              cx="28"
              cy="28"
              r={radius}
              fill="none"
              stroke={palette.stroke}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{
                transition: "stroke-dashoffset 240ms ease",
                filter: palette.glow,
              }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-white">
            {resolvedPercent}%
          </div>
        </div>
      </div>
    </div>
  );
}

function CommandButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`rounded-lg px-1.5 py-1 text-[8px] leading-tight font-bold uppercase tracking-[0.06em] transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50 min-[901px]:rounded-2xl min-[901px]:px-4 min-[901px]:py-3 min-[901px]:text-sm min-[901px]:tracking-[0.16em] ${className}`}
    >
      {children}
    </button>
  );
}

function BuildingStatusNotes({
  building,
  blockedByTownHall,
  upgradeCap,
  upgradeCostLabel,
}) {
  const [now, setNow] = useState(() => Date.now());
  const hasSoldiers = (building?.soldierCount ?? 0) > 0;
  const showsFoodTimer = (building?.type === "tent" || building?.type === "command-center")
    && hasSoldiers
    && !building?.isHungry
    && Number(building?.nextWageAt) > 0;
  const shouldTick = Boolean(building?.isUpgrading || showsFoodTimer);

  useEffect(() => {
    if (!shouldTick) {
      return undefined;
    }

    setNow(Date.now());

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [building?.isUpgrading, building?.nextWageAt, shouldTick]);

  if (!building) {
    return null;
  }

  const upgradeRemainingMs = building?.upgradeCompleteAt
    ? Math.max(0, Number(building.upgradeCompleteAt) - now)
    : 0;
  const upgradeMinutes = Math.floor(upgradeRemainingMs / 60000);
  const upgradeSeconds = Math.floor((upgradeRemainingMs % 60000) / 1000);
  const wageRemainingMs = building?.nextWageAt
    ? Math.max(0, Number(building.nextWageAt) - now)
    : 0;
  const wageHours = Math.floor(wageRemainingMs / 3600000);
  const wageMinutes = Math.floor((wageRemainingMs % 3600000) / 60000);

  return (
    <>
      {building.isUpgrading ? (
        <p className="pt-px text-[10px] font-semibold text-amber-300">
          Upgrading... {upgradeMinutes}:{String(upgradeSeconds).padStart(2, "0")}
        </p>
      ) : (building.level ?? 1) < upgradeCap ? (
        <p className="pt-px text-[10px] font-semibold text-emerald-300">
          Need {upgradeCostLabel} to upgrade
        </p>
      ) : blockedByTownHall ? (
        <p className="pt-px text-[10px] font-semibold text-rose-300">
          Upgrade main base first
        </p>
      ) : null}
      {(building.type === "tent" || building.type === "command-center") && hasSoldiers ? (
        <p className={`pt-px text-[10px] font-semibold ${building.isHungry ? "text-rose-300" : "text-sky-300"}`}>
          {building.isHungry
            ? "Gutom na sila"
            : `Food: ${wageHours}h ${String(wageMinutes).padStart(2, "0")}m`}
        </p>
      ) : null}
    </>
  );
}

export default function GamePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const gameRootRef = useRef(null);
  const gameRef = useRef(null);
  const chatSocketRef = useRef(null);
  const musicPanelRef = useRef(null);
  const backendRetryAfterRef = useRef(0);
  const backendWarningShownRef = useRef(false);
  const activeSession = getSession();
  const [gameState, setGameState] = useState({
    gold: 1200,
    energy: 0,
    buildings: 0,
    totalMachineGold: 0,
    totalMachineCapacity: 0,
    totalSoldiers: 0,
    totalTanks: 0,
    totalHelicopters: 0,
    totalArmyUnits: 0,
    commandCenters: 0,
    commandCenterLimit: 1,
    battleTankBuildings: 0,
    battleTankLimit: 0,
    skyports: 0,
    skyportLimit: 0,
    airDefenseBuildings: 0,
    airDefenseLimit: 0,
    woodMachines: 0,
    energyMachines: 0,
    tents: 0,
    tentLimit: 4,
    fullWoodMachines: 0,
    townHallLevel: 1,
    townHallCount: 1,
    woodMachineLimit: 4,
    energyMachineLimit: 2,
  });
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedPlacedBuilding, setSelectedPlacedBuilding] = useState(null);
  const [isMoveMode, setIsMoveMode] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [leaderboardState, setLeaderboardState] = useState({
    loading: false,
    error: "",
    entries: [],
    currentPlayerRank: null,
  });
  const [hireModalOpen, setHireModalOpen] = useState(false);
  const [removeSoldierCount, setRemoveSoldierCount] = useState("1");
  const [showWelcomeBack, setShowWelcomeBack] = useState(() => isWelcomeBackPending());
  const [musicStatus, setMusicStatus] = useState(() => soundManager.getStatus());
  const [musicPanelOpen, setMusicPanelOpen] = useState(false);

  useEffect(() => {
    if (!musicPanelOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (musicPanelRef.current?.contains(event.target)) {
        return;
      }

      setMusicPanelOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [musicPanelOpen]);

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
    const token = activeSession?.token ?? null;

    if (!token) {
      return undefined;
    }

    const socket = createBattleSocket(token);
    chatSocketRef.current = socket;

    socket.on("presence:update", (payload = {}) => {
      setOnlineCount(Math.max(0, Number(payload?.onlineCount ?? 0) || 0));
    });

    socket.on("chat:history", (payload = {}) => {
      setChatMessages(Array.isArray(payload?.messages) ? payload.messages : []);
    });

    socket.on("chat:message", (message) => {
      setChatMessages((current) => [...current, message].slice(-60));
    });

    return () => {
      chatSocketRef.current = null;
      socket.disconnect();
    };
  }, [activeSession?.token]);

  const handleCloseWelcomeBack = () => {
    setShowWelcomeBack(false);
    clearWelcomeBackPending();
  };

  const handleSendChat = () => {
    const text = chatInput.trim();

    if (!text || !chatSocketRef.current) {
      return;
    }

    chatSocketRef.current.emit("chat:send", { text });
    setChatInput("");
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

  const handleOpenLeaderboard = async () => {
    const token = activeSession?.token ?? null;
    setLeaderboardOpen(true);

    if (!token) {
      setLeaderboardState({
        loading: false,
        error: "Login session missing.",
        entries: [],
        currentPlayerRank: null,
      });
      return;
    }

    setLeaderboardState((current) => ({
      ...current,
      loading: true,
      error: "",
    }));

    try {
      const data = await fetchLeaderboard(token);
      setLeaderboardState({
        loading: false,
        error: "",
        entries: Array.isArray(data?.leaderboard) ? data.leaderboard : [],
        currentPlayerRank: data?.currentPlayerRank ?? null,
      });
    } catch {
      setLeaderboardState({
        loading: false,
        error: "Unable to load leaderboard.",
        entries: [],
        currentPlayerRank: null,
      });
    }
  };

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

        if (Date.now() < backendRetryAfterRef.current) {
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
            backendRetryAfterRef.current = 0;
            backendWarningShownRef.current = false;
            saveGameSnapshot({
              ...savedSnapshot,
              gold: savedSnapshot?.gold ?? snapshot.gold,
              energy: savedSnapshot?.energy ?? snapshot.energy,
              buildings: savedSnapshot?.buildings ?? snapshot.buildings,
              camera: snapshot.camera ?? null,
              serverSyncedAt: Date.now(),
            }, session);
          } catch (error) {
            if (isBackendConnectionError(error)) {
              backendRetryAfterRef.current = Date.now() + BACKEND_RETRY_COOLDOWN_MS;

              if (!backendWarningShownRef.current) {
                backendWarningShownRef.current = true;
                console.warn("Backend unavailable. Using local save for now.");
              }
            } else {
              console.error("Unable to sync game snapshot:", error);
            }
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

      const handleEnergyChanged = () => {
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
        if (building?.type !== "tent") {
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
        tankRechargeCost,
        tankShotsRemaining,
        tankMaxShots,
        tankChargePercent,
        tankHealth,
        tankDamage,
        chopperRechargeCost,
        chopperShotsRemaining,
        chopperMaxShots,
        chopperChargePercent,
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
          tankRechargeCost,
          tankShotsRemaining,
          tankMaxShots,
          tankChargePercent,
          tankHealth,
          tankDamage,
          chopperRechargeCost,
          chopperShotsRemaining,
          chopperMaxShots,
          chopperChargePercent,
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
        tankRechargeCost,
        tankShotsRemaining,
        tankMaxShots,
        tankChargePercent,
        tankHealth,
        tankDamage,
        chopperRechargeCost,
        chopperShotsRemaining,
        chopperMaxShots,
        chopperChargePercent,
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
            tankRechargeCost,
            tankShotsRemaining,
            tankMaxShots,
            tankChargePercent,
            tankHealth,
            tankDamage,
            chopperRechargeCost,
            chopperShotsRemaining,
            chopperMaxShots,
            chopperChargePercent,
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
        tankRechargeCost,
        tankShotsRemaining,
        tankMaxShots,
        tankChargePercent,
        tankHealth,
        tankDamage,
        chopperRechargeCost,
        chopperShotsRemaining,
        chopperMaxShots,
        chopperChargePercent,
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
            tankRechargeCost,
            tankShotsRemaining,
            tankMaxShots,
            tankChargePercent,
            tankHealth,
            tankDamage,
            chopperRechargeCost,
            chopperShotsRemaining,
            chopperMaxShots,
            chopperChargePercent,
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
        tankRechargeCost,
        tankShotsRemaining,
        tankMaxShots,
        tankChargePercent,
        tankHealth,
        tankDamage,
        chopperRechargeCost,
        chopperShotsRemaining,
        chopperMaxShots,
        chopperChargePercent,
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
            tankRechargeCost,
            tankShotsRemaining,
            tankMaxShots,
            tankChargePercent,
            tankHealth,
            tankDamage,
            chopperRechargeCost,
            chopperShotsRemaining,
            chopperMaxShots,
            chopperChargePercent,
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
        tankRechargeCost,
        tankShotsRemaining,
        tankMaxShots,
        tankChargePercent,
        tankHealth,
        tankDamage,
        chopperRechargeCost,
        chopperShotsRemaining,
        chopperMaxShots,
        chopperChargePercent,
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
            tankRechargeCost,
            tankShotsRemaining,
            tankMaxShots,
            tankChargePercent,
            tankHealth,
            tankDamage,
            chopperRechargeCost,
            chopperShotsRemaining,
            chopperMaxShots,
            chopperChargePercent,
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
        tankRechargeCost,
        tankShotsRemaining,
        tankMaxShots,
        tankChargePercent,
        tankHealth,
        tankDamage,
        chopperRechargeCost,
        chopperShotsRemaining,
        chopperMaxShots,
        chopperChargePercent,
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
            tankRechargeCost,
            tankShotsRemaining,
            tankMaxShots,
            tankChargePercent,
            tankHealth,
            tankDamage,
            chopperRechargeCost,
            chopperShotsRemaining,
            chopperMaxShots,
            chopperChargePercent,
          };
        });
      };

      gameScene.events.on("game-state-update", handleGameStateUpdate);
      gameScene.events.on("gold-changed", handleGoldChanged);
      gameScene.events.on("energy-changed", handleEnergyChanged);
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

          if (resolvedSnapshot?.energy == null && localSnapshot?.energy != null) {
            resolvedSnapshot = {
              ...resolvedSnapshot,
              energy: localSnapshot.energy,
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
          if (isBackendConnectionError(error)) {
            backendRetryAfterRef.current = Date.now() + BACKEND_RETRY_COOLDOWN_MS;

            if (!backendWarningShownRef.current) {
              backendWarningShownRef.current = true;
              console.warn("Backend unavailable. Loaded local save instead.");
            }
          } else {
            console.error("Unable to load saved game state:", error);
          }

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
        gameScene.events.off("energy-changed", handleEnergyChanged);
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
    setShopOpen(false);
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

  const handleCollectEnergy = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.collectSelectedBuildingEnergy();
  };

  const handleCollectAllWoodMachineGold = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.collectAllWoodMachineGold();
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
    if (selectedPlacedBuilding?.type === "command-center") {
      const gameScene = gameRef.current?.scene?.getScene("GameScene");
      const updatedBuilding = gameScene?.recruitSoldierAcrossTents?.();

      if (updatedBuilding) {
        setSelectedPlacedBuilding(updatedBuilding);
      }
      return;
    }

    setHireModalOpen(true);
  };

  const handleConfirmHireSoldier = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    const updatedBuilding = gameScene?.hireSoldierAtSelectedBuilding?.(selectedPlacedBuilding);

    if (updatedBuilding) {
      setSelectedPlacedBuilding(updatedBuilding);
    }
  };

  const handleRemoveSoldiers = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    const count = Math.max(1, Math.floor(Number(removeSoldierCount) || 1));

    gameScene?.removeSoldiersAtSelectedBuilding(count);
    setRemoveSoldierCount("1");
  };

  const handleFeedSoldiers = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");

    if (selectedPlacedBuilding?.type === "command-center") {
      gameScene?.feedAllTentSoldiers?.();
      return;
    }

    gameScene?.feedSelectedCommandCenterSoldiers();
  };

  const handleToggleSoldierSleep = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");

    if (selectedPlacedBuilding?.type === "command-center") {
      gameScene?.toggleAllTentSleep?.();
      return;
    }

    gameScene?.toggleSelectedCommandCenterSleep();
  };

  const handleBuyChopper = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.buyChopperAtSelectedBuilding();
  };

  const handleBuyTank = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.buyTankAtSelectedBuilding();
  };

  const handleRechargeTank = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.rechargeTankAtSelectedBuilding();
  };

  const handleSellChopper = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.sellChopperAtSelectedBuilding();
  };

  const handleRechargeChopper = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.rechargeChopperAtSelectedBuilding();
  };

  const handleStartWar = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");

    if (gameScene) {
      saveGameSnapshot(gameScene.getPersistedSnapshot(), activeSession);
    }

    navigate("/war");
  };

  const upgradeCost = selectedPlacedBuilding
    ? getBuildingUpgradeCost(selectedPlacedBuilding.type)
    : 0;
  const upgradeCostLabel = `${formatCompactNumber(upgradeCost)} gold`;
  const upgradeCap = selectedPlacedBuilding?.type === "command-center"
    ? 2
    : Math.min(2, gameState.townHallLevel ?? 1);
  const blockedByTownHall = selectedPlacedBuilding
    && selectedPlacedBuilding.type !== "command-center"
    && (selectedPlacedBuilding.level ?? 1) >= upgradeCap;
  const canUpgrade = selectedPlacedBuilding
    && !selectedPlacedBuilding.isUpgrading
    && (selectedPlacedBuilding.level ?? 1) < upgradeCap
    && gameState.gold >= upgradeCost;
  const canHireSoldier = (selectedPlacedBuilding?.type === "tent" || selectedPlacedBuilding?.type === "command-center")
    && (selectedPlacedBuilding.soldierCount ?? 0) < (selectedPlacedBuilding.maxSoldiers ?? 0);
  const canAffordRecruit = gameState.gold >= SOLDIER_RECRUIT_COST;
  const soldierCapacityReached = (selectedPlacedBuilding?.soldierCount ?? 0) >= (selectedPlacedBuilding?.maxSoldiers ?? 0);
  const canRecruitSoldier = canHireSoldier && canAffordRecruit;
  const parsedRemoveSoldierCount = Math.max(1, Math.floor(Number(removeSoldierCount) || 1));
  const canRemoveSoldier = selectedPlacedBuilding?.type === "tent"
    && (selectedPlacedBuilding.soldierCount ?? 0) > 0;
  const canToggleSoldierSleep = (selectedPlacedBuilding?.type === "tent" || selectedPlacedBuilding?.type === "command-center")
    && (selectedPlacedBuilding.soldierCount ?? 0) > 0;
  const feedCost = (selectedPlacedBuilding?.soldierCount ?? 0) * 1;
  const canFeedSoldiers = (selectedPlacedBuilding?.type === "tent" || selectedPlacedBuilding?.type === "command-center")
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
  const canRechargeTank = selectedPlacedBuilding?.type === "battle-tank"
    && selectedPlacedBuilding.hasTank
    && (selectedPlacedBuilding.tankShotsRemaining ?? 0) < (selectedPlacedBuilding.tankMaxShots ?? 10)
    && gameState.energy >= (selectedPlacedBuilding.tankRechargeCost ?? TANK_ENERGY_COST);
  const canRechargeChopper = selectedPlacedBuilding?.type === "skyport"
    && selectedPlacedBuilding.hasChopper
    && (selectedPlacedBuilding.chopperShotsRemaining ?? 0) < (selectedPlacedBuilding.chopperMaxShots ?? 15)
    && gameState.energy >= (selectedPlacedBuilding.chopperRechargeCost ?? HELICOPTER_ENERGY_COST);
  const canSellBuilding = selectedPlacedBuilding?.type !== "command-center";
  const tankEnergyPercent = getChargePercent(
    selectedPlacedBuilding?.tankShotsRemaining,
    selectedPlacedBuilding?.tankMaxShots
  );
  const helicopterEnergyPercent = getChargePercent(
    selectedPlacedBuilding?.chopperShotsRemaining,
    selectedPlacedBuilding?.chopperMaxShots
  );
  const canStartWar = (gameState.totalArmyUnits ?? 0) > 0;
  const profileName = activeSession?.name || activeSession?.email?.split("@")[0] || "Commander";
  const profileId = activeSession?.playerId
    || (activeSession?.id ? `PLYR-${String(activeSession.id).padStart(6, "0")}` : "-");
  const profileRank = activeSession?.rankName || "Recruit";
  const profileWarPoints = Number(activeSession?.warPoints ?? 0) || 0;
  const musicVolumePercent = musicStatus?.volumePercent ?? Math.round((musicStatus?.volume ?? 0) * 100);
  const canLowerMusicVolume = musicVolumePercent > 0;
  const canRaiseMusicVolume = musicVolumePercent < 100;

  return (
    <main className="font-black-ops min-h-screen bg-[#243322] text-slate-950">
      <section className="app-screen-height relative w-full overflow-hidden bg-[#243322]">

        <Motion.div
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="pointer-events-none absolute inset-x-0 top-0 z-10 p-2 min-[901px]:p-4"
        >
          <div className="flex items-start justify-between gap-1.5 min-[901px]:gap-3">
            <div className="pointer-events-none flex w-[4rem] flex-col gap-0.5 min-[901px]:w-[6.7rem]">
              <div className="rounded-[0.64rem] border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.56)_0%,rgba(15,23,42,0.38)_100%)] px-1 py-0.75 text-white backdrop-blur-sm min-[901px]:rounded-[0.8rem] min-[901px]:px-1.5 min-[901px]:py-1.5">
                <p className="text-[0.32rem] uppercase tracking-[0.14em] text-emerald-300/75 min-[901px]:text-[0.42rem] min-[901px]:tracking-[0.26em]">Base</p>
                <p className="mt-0.5 text-[0.56rem] font-black leading-tight text-white min-[901px]:mt-1 min-[901px]:text-[0.7rem]">{profileName}</p>
                <p className="mt-0.5 text-[0.3rem] uppercase tracking-[0.05em] text-slate-100/90 min-[901px]:text-[0.4rem] min-[901px]:tracking-[0.1em]">{profileId}</p>
                <p className="mt-0.5 text-[0.3rem] uppercase tracking-[0.1em] text-amber-200/90 min-[901px]:text-[0.4rem] min-[901px]:tracking-[0.2em]">{profileRank}</p>
              </div>

              <HudMetric label="Gold" value={formatCompactNumber(gameState.gold)} tone="emerald" />
              <HudMetric label="Energy" value={formatCompactNumber(gameState.energy ?? 0)} tone="sky" />
              <HudMetric label="WP" value={formatCompactNumber(profileWarPoints)} tone="amber" />
              <HudMetric label="Troops" value={formatCompactNumber(gameState.totalArmyUnits ?? 0)} tone="sky" />
              <HudMetric label="Command Center" value={`Lv ${gameState.townHallLevel ?? 1}`} tone="amber" />

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

            <div className="pointer-events-auto grid w-[min(12.5rem,calc(100vw-4.9rem))] grid-cols-3 gap-1 min-[901px]:flex min-[901px]:w-auto min-[901px]:max-w-none min-[901px]:gap-1.5 min-[901px]:flex-nowrap">
              <CommandButton
                onClick={() => setChatOpen((open) => !open)}
                className="min-h-7 border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.52)_0%,rgba(15,23,42,0.3)_100%)] px-1 py-0.75 text-[7px] tracking-[0.04em] text-emerald-50 backdrop-blur-sm hover:bg-[linear-gradient(180deg,rgba(15,23,42,0.68)_0%,rgba(15,23,42,0.42)_100%)] min-[901px]:min-h-0 min-[901px]:px-2.5 min-[901px]:py-3 min-[901px]:text-[10px] min-[901px]:tracking-[0.16em]"
              >
                Chat {onlineCount > 0 ? `(${onlineCount})` : ""}
              </CommandButton>
              <CommandButton
                onClick={handleOpenLeaderboard}
                className="min-h-7 border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.52)_0%,rgba(15,23,42,0.3)_100%)] px-1 py-0.75 text-[7px] tracking-[0.04em] text-amber-50 backdrop-blur-sm hover:bg-[linear-gradient(180deg,rgba(15,23,42,0.68)_0%,rgba(15,23,42,0.42)_100%)] min-[901px]:min-h-0 min-[901px]:px-2.5 min-[901px]:py-3 min-[901px]:text-[10px] min-[901px]:tracking-[0.16em]"
              >
                Leaderboard
              </CommandButton>
              <CommandButton
                onClick={() => navigate("/profile", { state: { backgroundLocation: location } })}
                className="min-h-7 border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.52)_0%,rgba(15,23,42,0.3)_100%)] px-1 py-0.75 text-[7px] tracking-[0.04em] text-sky-50 backdrop-blur-sm hover:bg-[linear-gradient(180deg,rgba(15,23,42,0.68)_0%,rgba(15,23,42,0.42)_100%)] min-[901px]:min-h-0 min-[901px]:px-2.5 min-[901px]:py-3 min-[901px]:text-[10px] min-[901px]:tracking-[0.16em]"
              >
                Profile
              </CommandButton>
              <CommandButton
                onClick={() => setShopOpen((open) => !open)}
                className="min-h-7 border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.52)_0%,rgba(15,23,42,0.3)_100%)] px-1 py-0.75 text-[7px] tracking-[0.04em] text-white backdrop-blur-sm hover:bg-[linear-gradient(180deg,rgba(15,23,42,0.68)_0%,rgba(15,23,42,0.42)_100%)] min-[901px]:min-h-0 min-[901px]:px-2.5 min-[901px]:py-3 min-[901px]:text-[10px] min-[901px]:tracking-[0.16em]"
              >
                {shopOpen ? "Hide Shop" : "Open Shop"}
              </CommandButton>
              <div ref={musicPanelRef} className="relative">
                <CommandButton
                  onClick={handleToggleMusicPanel}
                  className="min-h-7 border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.52)_0%,rgba(15,23,42,0.3)_100%)] px-1 py-0.75 text-[7px] tracking-[0.04em] text-violet-100 backdrop-blur-sm hover:bg-[linear-gradient(180deg,rgba(15,23,42,0.68)_0%,rgba(15,23,42,0.42)_100%)] min-[901px]:min-h-0 min-[901px]:px-2.5 min-[901px]:py-3 min-[901px]:text-[10px] min-[901px]:tracking-[0.16em]"
                >
                  Music
                </CommandButton>

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
        </Motion.div>

        <div ref={gameRootRef} className="h-full w-full overflow-hidden" />
        <MobileLandscapePrompt />

        <AnimatePresence>
        {selectedPlacedBuilding ? (
          <Motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22 }}
            className="pointer-events-none absolute inset-x-0 bottom-20 z-10 flex justify-center px-3 sm:bottom-2.5"
          >
            <div className="pointer-events-auto w-full max-w-sm rounded-[0.8rem] border border-white/10 bg-[rgba(20,30,40,0.85)] p-1.5 text-white shadow-[0_8px_20px_rgba(0,0,0,0.5)] backdrop-blur-[10px] sm:max-w-59">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Selected</p>
                  <h3 className="mt-0.5 truncate text-[12px] font-bold text-white">{selectedPlacedBuilding.name}</h3>
                </div>
                <span className="shrink-0 rounded-full border border-sky-300/20 bg-sky-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-sky-100">
                  Lv.{selectedPlacedBuilding.level ?? 1}
                </span>
              </div>

              <div className="mt-1.5">
                <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
                  <span>HP</span>
                  <span className="font-bold text-[10px] text-white">{selectedPlacedBuilding.currentHp ?? 0}/{selectedPlacedBuilding.maxHp ?? 0}</span>
                </div>
                <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-950/80">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#22c55e_0%,#86efac_100%)] transition-all duration-300"
                    style={{ width: `${Math.max(0, Math.min(100, selectedPlacedBuilding.hpPercent ?? 100))}%` }}
                  />
                </div>
              </div>

              <div className="mt-1.5 grid gap-0.5 text-[10px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Status</span>
                  <span className="font-bold text-white">
                    {isMoveMode
                      ? "Moving"
                      : selectedPlacedBuilding.type === "tent" || selectedPlacedBuilding.type === "command-center"
                        ? (selectedPlacedBuilding.isSleeping ? "Sleeping" : "Awake")
                        : selectedPlacedBuilding.isUpgrading
                        ? "Upgrading"
                        : "Ready"}
                  </span>
                </div>
                {selectedPlacedBuilding.type === "tent" || selectedPlacedBuilding.type === "command-center" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Soldiers</span>
                    <span className="font-bold text-white">
                      {selectedPlacedBuilding.soldierCount ?? 0}/{selectedPlacedBuilding.maxSoldiers ?? 15}
                    </span>
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "wood-machine" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Stored Gold</span>
                    <span className="font-bold text-white">
                      {selectedPlacedBuilding.machineGold ?? 0}/{selectedPlacedBuilding.maxGold ?? 250}
                    </span>
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "energy-machine" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Stored Energy</span>
                    <span className="font-bold text-white">
                      {selectedPlacedBuilding.machineGold ?? 0}/{selectedPlacedBuilding.maxGold ?? 3}
                    </span>
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "battle-tank" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Cost</span>
                    <span className="font-bold text-white">
                      {selectedPlacedBuilding.hasTank ? "Tank Ready" : `${selectedPlacedBuilding.tankCost ?? 5000} gold`}
                    </span>
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "battle-tank" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Charge</span>
                    <span className="font-bold text-cyan-200">{tankEnergyPercent}%</span>
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "battle-tank" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Shots</span>
                    <span className="font-bold text-white">
                      {selectedPlacedBuilding.tankShotsRemaining ?? 0}/{selectedPlacedBuilding.tankMaxShots ?? 10}
                    </span>
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "skyport" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Cost</span>
                    <span className="font-bold text-white">
                      {selectedPlacedBuilding.hasChopper ? "Chopper Ready" : `${selectedPlacedBuilding.chopperCost ?? 0} gold`}
                    </span>
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "skyport" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Charge</span>
                    <span className="font-bold text-cyan-200">{helicopterEnergyPercent}%</span>
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "skyport" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Shots</span>
                    <span className="font-bold text-white">
                      {selectedPlacedBuilding.chopperShotsRemaining ?? 0}/{selectedPlacedBuilding.chopperMaxShots ?? 15}
                    </span>
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "battle-tank" ? (
                  <div className="pt-1">
                    <ChargeRing percent={tankEnergyPercent} label={`Tank ${selectedPlacedBuilding.tankShotsRemaining ?? 0}/${selectedPlacedBuilding.tankMaxShots ?? 10}`} tone="cyan" />
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "skyport" ? (
                  <div className="pt-1">
                    <ChargeRing percent={helicopterEnergyPercent} label={`Chopper ${selectedPlacedBuilding.chopperShotsRemaining ?? 0}/${selectedPlacedBuilding.chopperMaxShots ?? 15}`} tone="emerald" />
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "tent" || selectedPlacedBuilding.type === "command-center" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Recruit Cost</span>
                    <span className="font-bold text-white">{SOLDIER_RECRUIT_COST} gold</span>
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "tent" || selectedPlacedBuilding.type === "command-center" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Feed Cost</span>
                    <span className="font-bold text-white">{feedCost} gold</span>
                  </div>
                ) : null}
                {(selectedPlacedBuilding.level ?? 1) < upgradeCap ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Upgrade</span>
                    <span className="font-bold text-amber-200">{upgradeCostLabel}</span>
                  </div>
                ) : null}
                <BuildingStatusNotes
                  building={selectedPlacedBuilding}
                  blockedByTownHall={blockedByTownHall}
                  upgradeCap={upgradeCap}
                  upgradeCostLabel={upgradeCostLabel}
                />
              </div>

              {selectedPlacedBuilding.type === "tent" ? (
                <div className="mt-1.5">
                  <label className="mb-1 block text-[10px] text-slate-400">Remove Count</label>
                  <input
                    type="number"
                    min="1"
                    max={Math.max(1, selectedPlacedBuilding.soldierCount ?? 1)}
                    value={removeSoldierCount}
                    onChange={(event) => setRemoveSoldierCount(event.target.value)}
                    className="w-full rounded-[9px] border border-white/10 bg-slate-950/80 px-2 py-0.5 text-[10px] font-bold text-white outline-none transition focus:border-rose-400"
                  />
                </div>
              ) : null}

              <div className="mt-1.5 grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={handleMoveBuilding}
                  className="rounded-[9px] bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-300"
                >
                  Move
                </button>

                <button
                  type="button"
                  onClick={handleUpgradeBuilding}
                  disabled={!canUpgrade}
                  className="rounded-[9px] bg-sky-400 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-sky-950 transition hover:-translate-y-0.5 hover:bg-sky-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                >
                  {selectedPlacedBuilding.isUpgrading
                    ? "Upgrading"
                    : (selectedPlacedBuilding.level ?? 1) < upgradeCap
                      ? `Upgrade ${formatCompactNumber(upgradeCost)}G`
                      : "Upgrade"}
                </button>

                {selectedPlacedBuilding.isUpgrading ? (
                  <button
                    type="button"
                    onClick={handleCancelUpgrade}
                    className="rounded-[9px] bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-slate-950 transition hover:-translate-y-0.5 hover:bg-white"
                  >
                    Cancel
                  </button>
                ) : null}

                {selectedPlacedBuilding.type === "wood-machine" ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCollectGold}
                      disabled={(selectedPlacedBuilding.machineGold ?? 0) <= 0 || selectedPlacedBuilding.isUpgrading}
                      className="rounded-[9px] bg-emerald-400 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-emerald-950 transition hover:-translate-y-0.5 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                    >
                      Collect
                    </button>
                    <button
                      type="button"
                      onClick={handleCollectAllWoodMachineGold}
                      disabled={selectedPlacedBuilding.isUpgrading}
                      className="rounded-[9px] bg-yellow-400 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-yellow-950 transition hover:-translate-y-0.5 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                    >
                      Collect All
                    </button>
                  </>
                ) : null}

                {selectedPlacedBuilding.type === "energy-machine" ? (
                  <button
                    type="button"
                    onClick={handleCollectEnergy}
                    disabled={(selectedPlacedBuilding.machineGold ?? 0) <= 0 || selectedPlacedBuilding.isUpgrading}
                    className="rounded-[9px] bg-cyan-400 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                  >
                    Collect Energy
                  </button>
                ) : null}

                {selectedPlacedBuilding.type === "tent" ? (
                  <>
                    <button
                      type="button"
                      onClick={handleHireSoldier}
                      disabled={!canRecruitSoldier}
                      className="rounded-[9px] bg-violet-500 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-white transition hover:-translate-y-0.5 hover:bg-violet-400 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                    >
                      Recruit
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveSoldiers}
                      disabled={!canRemoveSoldier || parsedRemoveSoldierCount > (selectedPlacedBuilding.soldierCount ?? 0)}
                      className="rounded-[9px] bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-white transition hover:-translate-y-0.5 hover:bg-rose-400 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleSoldierSleep}
                      disabled={!canToggleSoldierSleep}
                      className="rounded-[9px] bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-white transition hover:-translate-y-0.5 hover:bg-sky-400 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                    >
                      {selectedPlacedBuilding.isSleeping ? "Wake" : "Sleep"}
                    </button>
                    <button
                      type="button"
                      onClick={handleFeedSoldiers}
                      disabled={!canFeedSoldiers}
                      className="rounded-[9px] bg-emerald-400 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-slate-950 transition hover:-translate-y-0.5 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                    >
                      Feed
                    </button>
                  </>
                ) : null}

                {selectedPlacedBuilding.type === "command-center" ? (
                  <>
                    <button
                      type="button"
                      onClick={handleHireSoldier}
                      disabled={!canRecruitSoldier}
                      className="rounded-[9px] bg-violet-500 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-white transition hover:-translate-y-0.5 hover:bg-violet-400 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                    >
                      Recruit
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleSoldierSleep}
                      disabled={!canToggleSoldierSleep}
                      className="rounded-[9px] bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-white transition hover:-translate-y-0.5 hover:bg-sky-400 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                    >
                      {selectedPlacedBuilding.isSleeping ? "Wake All" : "Sleep All"}
                    </button>
                    <button
                      type="button"
                      onClick={handleFeedSoldiers}
                      disabled={!canFeedSoldiers}
                      className="rounded-[9px] bg-emerald-400 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-slate-950 transition hover:-translate-y-0.5 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                    >
                      Feed All
                    </button>
                  </>
                ) : null}

                {selectedPlacedBuilding.type === "battle-tank" ? (
                  selectedPlacedBuilding.hasTank ? (
                    <button
                      type="button"
                      onClick={handleRechargeTank}
                      disabled={!canRechargeTank}
                      className="rounded-[9px] bg-cyan-400 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                    >
                      {(selectedPlacedBuilding.tankShotsRemaining ?? 0) >= (selectedPlacedBuilding.tankMaxShots ?? 10)
                        ? "Tank Full"
                        : `Charge ${selectedPlacedBuilding.tankRechargeCost ?? TANK_ENERGY_COST}E`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleBuyTank}
                      disabled={!canBuyTank}
                      className="rounded-[9px] bg-cyan-400 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                    >
                      Buy Tank
                    </button>
                  )
                ) : null}

                {selectedPlacedBuilding.type === "skyport" ? (
                  selectedPlacedBuilding.hasChopper ? (
                    <>
                      <button
                        type="button"
                        onClick={handleRechargeChopper}
                        disabled={!canRechargeChopper}
                        className="rounded-[9px] bg-cyan-400 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                      >
                        {(selectedPlacedBuilding.chopperShotsRemaining ?? 0) >= (selectedPlacedBuilding.chopperMaxShots ?? 15)
                          ? "Chopper Full"
                          : `Charge ${selectedPlacedBuilding.chopperRechargeCost ?? HELICOPTER_ENERGY_COST}E`}
                      </button>
                      <button
                        type="button"
                        onClick={handleSellChopper}
                        disabled={!canSellChopper}
                        className="rounded-[9px] bg-orange-400 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-slate-950 transition hover:-translate-y-0.5 hover:bg-orange-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                      >
                        Sell Chop
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleBuyChopper}
                      disabled={!canBuyChopper}
                      className="rounded-[9px] bg-cyan-400 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                    >
                      Buy Chop
                    </button>
                  )
                ) : null}

                {canSellBuilding ? (
                  <button
                    type="button"
                    onClick={handleSellBuilding}
                    className="rounded-[9px] bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-white transition hover:-translate-y-0.5 hover:bg-rose-500"
                  >
                    Sell
                  </button>
                ) : null}
              </div>
            </div>
          </Motion.div>
        ) : null}
        </AnimatePresence>

        <Motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.12 }}
          className="mobile-landscape-start-war-wrap pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 sm:bottom-10 sm:left-5 sm:translate-x-0"
        >
          <button
            type="button"
            onClick={handleStartWar}
            disabled={!canStartWar}
            className="mobile-landscape-start-war-button pointer-events-auto min-h-8 rounded-[0.95rem] border border-rose-300/20 bg-[linear-gradient(135deg,rgba(225,29,72,0.92)_0%,rgba(244,63,94,0.9)_100%)] px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-[0_12px_24px_rgba(190,24,93,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(190,24,93,0.28)] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50 sm:min-h-12 sm:rounded-[1.35rem] sm:px-6 sm:py-4 sm:text-sm sm:tracking-[0.24em] sm:shadow-[0_22px_40px_rgba(190,24,93,0.28)] sm:hover:shadow-[0_26px_50px_rgba(190,24,93,0.36)]"
          >
            Start War
          </button>
        </Motion.div>

        {hireModalOpen && selectedPlacedBuilding?.type === "tent" ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[3px]">
            <div className="w-full max-w-74 rounded-[1.4rem] border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.82)_0%,rgba(15,23,42,0.68)_100%)] p-3 text-white shadow-[0_20px_60px_rgba(2,6,23,0.28)] backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.3em] text-amber-300/70">
                    Soldier Tent
                  </p>
                  <h3 className="mt-1 text-lg font-black">Unit Shop</h3>
                  <p className="mt-2 text-xs text-slate-400">
                    Dito ka bibili ng soldiers para sa selected Soldier Tent.
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
                  disabled={!canRecruitSoldier}
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
                  <p className="mt-1 text-xs text-slate-300">Starter unit para sa Soldier Tent.</p>
                  <p className="mt-2 text-xs font-semibold text-amber-300">
                    Recruit: {SOLDIER_RECRUIT_COST} gold / unit
                  </p>
                  <p className="mt-1 text-xs font-semibold text-amber-300">
                    Wage: 1 gold / 24 hrs
                  </p>
                  <p className="mt-1 text-xs font-semibold text-sky-300">
                    {selectedPlacedBuilding.soldierCount ?? 0}/{selectedPlacedBuilding.maxSoldiers ?? 15} hired
                  </p>
                </button>
              </div>

              {!canRecruitSoldier && (
                <p className="mt-4 text-sm font-semibold text-rose-300">
                  {soldierCapacityReached
                    ? "Max soldiers reached na para sa Soldier Tent na ito."
                    : `Kulang gold. Kailangan ${SOLDIER_RECRUIT_COST} gold kada recruit.`}
                </p>
              )}
            </div>
          </div>
        ) : null}

        {leaderboardOpen ? (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-xs min-[901px]:p-4"
            onClick={() => setLeaderboardOpen(false)}
          >
            <div
              className="mobile-landscape-overlay-card flex w-full flex-col rounded-[1rem] border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.88)_0%,rgba(15,23,42,0.74)_100%)] p-3 text-white shadow-[0_20px_60px_rgba(2,6,23,0.34)] min-[901px]:max-w-120 min-[901px]:rounded-[1.4rem] min-[901px]:p-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-2 min-[901px]:gap-4">
                <div>
                  <p className="text-[0.56rem] uppercase tracking-[0.2em] text-amber-300/70 min-[901px]:text-[0.68rem] min-[901px]:tracking-[0.3em]">Leaderboard</p>
                  <h3 className="mt-1 text-base font-black min-[901px]:text-lg">Top Commanders</h3>
                  <p className="mt-1 text-[11px] leading-tight text-slate-400 min-[901px]:text-xs">
                    Rank, soldiers, tanks, and choppers per player.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setLeaderboardOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10 min-[901px]:rounded-2xl min-[901px]:px-3 min-[901px]:py-1.5 min-[901px]:text-xs"
                >
                  Close
                </button>
              </div>

              {leaderboardState.currentPlayerRank ? (
                <p className="mt-2 shrink-0 text-[11px] font-semibold text-amber-200 min-[901px]:mt-3 min-[901px]:text-xs">
                  Your Rank: #{leaderboardState.currentPlayerRank}
                </p>
              ) : null}

              <div className="mobile-landscape-overlay-scroll mt-3 min-h-0 flex-1 min-[901px]:mt-4">
                {leaderboardState.loading ? (
                  <p className="text-xs text-slate-300 min-[901px]:text-sm">Loading leaderboard...</p>
                ) : leaderboardState.error ? (
                  <p className="text-xs font-semibold text-rose-300 min-[901px]:text-sm">{leaderboardState.error}</p>
                ) : (
                  <div className="rounded-xl border border-white/8 bg-slate-950/45 min-[901px]:rounded-2xl">
                  <div className="grid grid-cols-[2.4rem_minmax(0,1fr)_2.5rem_2.5rem_2.9rem] gap-1 border-b border-white/8 px-2 py-1.5 text-[8px] font-black uppercase tracking-[0.1em] text-slate-400 min-[901px]:grid-cols-[3rem_minmax(0,1fr)_3.6rem_3.6rem_3.8rem] min-[901px]:gap-2 min-[901px]:px-3 min-[901px]:py-2 min-[901px]:text-[10px] min-[901px]:tracking-[0.18em]">
                    <span>Rank</span>
                    <span>Player</span>
                    <span>Soldier</span>
                    <span>Tank</span>
                    <span>Chopper</span>
                  </div>

                  {leaderboardState.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="grid grid-cols-[2.4rem_minmax(0,1fr)_2.5rem_2.5rem_2.9rem] gap-1 border-b border-white/6 px-2 py-1.5 text-[10px] last:border-b-0 min-[901px]:grid-cols-[3rem_minmax(0,1fr)_3.6rem_3.6rem_3.8rem] min-[901px]:gap-2 min-[901px]:px-3 min-[901px]:py-2 min-[901px]:text-xs"
                    >
                      <span className="font-black text-amber-200">#{entry.rank}</span>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-white">{entry.name}</p>
                        <p className="truncate text-[8px] text-slate-400 min-[901px]:text-[10px]">
                          {entry.rankName} • {entry.warPoints} WP
                        </p>
                      </div>
                      <span className="font-bold text-sky-200">{entry.soldiers}</span>
                      <span className="font-bold text-cyan-200">{entry.tanks}</span>
                      <span className="font-bold text-emerald-200">{entry.choppers}</span>
                    </div>
                  ))}

                  {!leaderboardState.entries.length ? (
                    <p className="px-3 py-4 text-xs text-slate-400 min-[901px]:text-sm">No players found.</p>
                  ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {chatOpen ? (
          <div
            className="absolute inset-0 z-20 flex items-end justify-center p-2 min-[901px]:justify-end min-[901px]:p-4"
            onClick={() => setChatOpen(false)}
          >
            <div
              className="mobile-landscape-overlay-card mobile-landscape-chat-card mt-auto mb-16 flex w-full flex-col rounded-[1rem] border border-white/12 bg-[linear-gradient(180deg,rgba(15,23,42,0.9)_0%,rgba(15,23,42,0.78)_100%)] p-2.5 text-white shadow-[0_18px_50px_rgba(2,6,23,0.34)] backdrop-blur-xl min-[901px]:mb-4 min-[901px]:max-w-88 min-[901px]:rounded-[1.2rem] min-[901px]:p-3"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-2 min-[901px]:gap-4">
                <div>
                  <p className="text-[0.56rem] uppercase tracking-[0.18em] text-emerald-300/70 min-[901px]:text-[0.65rem] min-[901px]:tracking-[0.26em]">Live Chat</p>
                  <h3 className="mt-1 text-sm font-black min-[901px]:text-base">Online: {onlineCount}</h3>
                </div>

                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-slate-200 transition hover:bg-white/10 min-[901px]:rounded-xl min-[901px]:px-3 min-[901px]:py-1.5 min-[901px]:text-[11px]"
                >
                  Close
                </button>
              </div>

              <div className="mobile-landscape-overlay-scroll mt-2.5 min-h-0 flex-1 rounded-xl border border-white/8 bg-slate-950/45 px-2.5 py-2 min-[901px]:mt-3 min-[901px]:rounded-2xl min-[901px]:px-3">
                {chatMessages.length ? (
                  chatMessages.map((message) => (
                    <div key={message.id} className="mb-2 last:mb-0">
                      <p className="text-[9px] font-black uppercase tracking-[0.08em] text-emerald-200 min-[901px]:text-[10px] min-[901px]:tracking-[0.12em]">
                        {message.name}
                      </p>
                      <p className="mt-0.5 wrap-break-word text-[12px] leading-tight text-slate-100 min-[901px]:text-sm">{message.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 min-[901px]:text-sm">No messages yet.</p>
                )}
              </div>

              <div className="mt-2.5 flex shrink-0 gap-1.5 min-[901px]:mt-3 min-[901px]:gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleSendChat();
                    }
                  }}
                  placeholder="Type message..."
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950/70 px-2.5 py-1.5 text-[12px] text-white outline-none transition focus:border-emerald-400 min-[901px]:rounded-xl min-[901px]:px-3 min-[901px]:py-2 min-[901px]:text-sm"
                />
                <button
                  type="button"
                  onClick={handleSendChat}
                  className="rounded-lg bg-emerald-400 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-slate-950 transition hover:bg-emerald-300 min-[901px]:rounded-xl min-[901px]:px-4 min-[901px]:py-2 min-[901px]:text-sm min-[901px]:tracking-[0.12em]"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {shopOpen ? (
          <Motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            className="absolute inset-0 z-10 flex items-end justify-center p-2 min-[901px]:p-4"
            onClick={() => setShopOpen(false)}
          >
            <div className="w-full" onClick={(event) => event.stopPropagation()}>
              <BuildingShop
                gold={gameState.gold}
                townHallLevel={gameState.townHallLevel}
                woodMachineCount={gameState.woodMachines}
                woodMachineLimit={gameState.woodMachineLimit}
                energyMachineCount={gameState.energyMachines}
                energyMachineLimit={gameState.energyMachineLimit}
                commandCenterCount={gameState.commandCenters}
                commandCenterLimit={gameState.commandCenterLimit}
                tentCount={gameState.tents}
                tentLimit={gameState.tentLimit}
                battleTankCount={gameState.battleTankBuildings}
                battleTankLimit={gameState.battleTankLimit}
                skyportCount={gameState.skyports}
                skyportLimit={gameState.skyportLimit}
                airDefenseCount={gameState.airDefenseBuildings}
                airDefenseLimit={gameState.airDefenseLimit}
                onSelectBuilding={handleSelectBuilding}
                selectedBuilding={selectedBuilding}
                onClose={() => setShopOpen(false)}
              />
            </div>
          </Motion.div>
        ) : null}

        <AnimatePresence mode="wait">
          {showWelcomeBack ? (
            <Motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.38 }}
              className="absolute inset-0 z-30 flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.14),transparent_30%),linear-gradient(135deg,rgba(2,6,23,0.94)_0%,rgba(2,6,23,0.82)_42%,rgba(2,6,23,0.96)_100%)] px-6 backdrop-blur-[3px]"
            >
              <Motion.div
                initial={{ opacity: 0, x: 46, scale: 0.94 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -260, scale: 0.96 }}
                transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
                className="relative flex h-full w-full items-center justify-center overflow-hidden text-white"
              >
                <div className="relative z-10 flex w-full max-w-352 items-center justify-center gap-10">
                  <div className="h-136 w-136 shrink-0 overflow-hidden">
                    <img
                      src="/assets/welcomeback.png"
                      alt="Welcome Back"
                      className="h-full w-full object-contain"
                      draggable="false"
                    />
                  </div>

                  <div className="min-w-0 max-w-md">
                    <p className="text-[0.9rem] uppercase tracking-[0.42em] text-sky-300/80">
                      Welcome Back
                    </p>
                    <h2 className="mt-3 text-6xl font-black leading-[0.95] text-white">
                      {profileName}
                    </h2>
                    <p className="mt-4 text-lg leading-8 text-slate-300">
                      Your base is ready, Commander. Continue building and prepare for the next battle.
                    </p>
                    <button
                      type="button"
                      onClick={handleCloseWelcomeBack}
                      className="pointer-events-auto mt-6 rounded-2xl bg-sky-400 px-6 py-3.5 text-base font-black uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-300"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </Motion.div>
            </Motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </main>
  );
}
