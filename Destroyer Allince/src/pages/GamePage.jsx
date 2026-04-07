import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";

import BuildingShop from "../components/BuildingShop";
import MobileLandscapePrompt from "../components/MobileLandscapePrompt";
import SpriteAnimator from "../components/SpriteAnimator";
import { createGame, destroyGame } from "../game/main";
import { RANGER_FRONT_PREVIEW } from "../game/utils/rangerSprites";
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
import { primeWarRoute } from "../utils/routePreload";

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
const RANGER_TALA_RECRUIT_COST = 4;
const TANK_ENERGY_COST = 2;
const HELICOPTER_ENERGY_COST = 3;
const GLOBAL_MARKET_TANK_SELL_VALUE = 4000;
const GLOBAL_MARKET_HELICOPTER_SELL_VALUE = 4000;
const GLOBAL_MARKET_ENERGY_SELL_VALUE = 200;
const GLOBAL_MARKET_PRICING = {
  tank: GLOBAL_MARKET_TANK_SELL_VALUE,
  helicopter: GLOBAL_MARKET_HELICOPTER_SELL_VALUE,
  energy: GLOBAL_MARKET_ENERGY_SELL_VALUE,
};
const GLOBAL_MARKET_ITEM_META = {
  energy: {
    label: "Energy",
    icon: "/assets/energymachine.png",
    alt: "Energy",
    toneCardClass: "border-cyan-400/20 bg-cyan-400/10",
    toneTextClass: "text-cyan-200/80",
  },
  tank: {
    label: "Tank",
    icon: "/assets/tank/tank1.png",
    alt: "Tank",
    toneCardClass: "border-amber-400/20 bg-amber-400/10",
    toneTextClass: "text-amber-200/80",
  },
  helicopter: {
    label: "Helicopter",
    icon: "/assets/parkingchopper-Photoroom.png",
    alt: "Helicopter",
    toneCardClass: "border-sky-400/20 bg-sky-400/10",
    toneTextClass: "text-sky-200/80",
  },
  army: {
    label: "Army",
    icon: "/assets/army/front/firing.png",
    alt: "Army",
    toneCardClass: "border-violet-400/20 bg-violet-400/10",
    toneTextClass: "text-violet-200/80",
  },
};

const getBuildingTroopCount = (building) =>
  Math.max(0, Number(building?.soldierCount ?? 0) || 0)
  + Math.max(0, Number(building?.rangerTalaCount ?? 0) || 0);

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
              className="mobile-safe-filter"
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
  const hasSoldiers = getBuildingTroopCount(building) > 0;
  const showsFoodTimer = (building?.type === "tent" || building?.type === "command-center")
    && hasSoldiers
    && !building?.isHungry
    && Number(building?.nextWageAt) > 0;
  const shouldTick = Boolean(building?.isUpgrading || showsFoodTimer);

  useEffect(() => {
    if (!shouldTick) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [shouldTick]);

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
    tentLimit: 10,
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
  const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [marketNotice, setMarketNotice] = useState("");
  const [marketListings, setMarketListings] = useState([]);
  const [marketSocketReady, setMarketSocketReady] = useState(false);
  const [inventoryMarketDraft, setInventoryMarketDraft] = useState(null);
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

    socket.on("connect", () => {
      setMarketSocketReady(true);
      socket.emit("market:listings:request");
    });

    socket.on("disconnect", () => {
      setMarketSocketReady(false);
    });

    socket.on("presence:update", (payload = {}) => {
      setOnlineCount(Math.max(0, Number(payload?.onlineCount ?? 0) || 0));
    });

    socket.on("chat:history", (payload = {}) => {
      setChatMessages(Array.isArray(payload?.messages) ? payload.messages : []);
    });

    socket.on("chat:message", (message) => {
      setChatMessages((current) => [...current, message].slice(-60));
    });

    socket.on("market:listings", (payload = {}) => {
      setMarketListings(Array.isArray(payload?.listings) ? payload.listings : []);
    });

    socket.on("market:error", (payload = {}) => {
      const message = typeof payload?.message === "string" ? payload.message : "Unable to post market listing.";
      setMarketNotice(message);
    });

    socket.on("market:listing:created", (listing) => {
      const itemLabel = listing?.itemLabel ?? "item";
      setMarketNotice(
        listing?.listingType === "trade"
          ? `Trade listing posted for ${itemLabel}.`
          : `Sell listing posted for ${itemLabel}.`
      );
      socket.emit("market:listings:request");
    });

    socket.on("market:listing:cancelled", () => {
      setMarketNotice("Listing cancelled from Global Market.");
      socket.emit("market:listings:request");
    });

    socket.emit("market:listings:request");

    return () => {
      setMarketSocketReady(false);
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
        setInventoryModalOpen(false);
        setInventoryMarketDraft(null);
        setRemoveSoldierCount("1");
      };

      const handlePlacedBuildingSelected = (building) => {
        setSelectedPlacedBuilding(building);
        setIsMoveMode(false);
        setRemoveSoldierCount("1");
        if (building?.type !== "tent" && building?.type !== "command-center") {
          setHireModalOpen(false);
        }
        if (building?.type !== "command-center") {
          setInventoryModalOpen(false);
          setInventoryMarketDraft(null);
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
        maxSoldiers,
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
            maxSoldiers,
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
        setInventoryModalOpen(false);
        setInventoryMarketDraft(null);
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
        maxSoldiers,
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
            maxSoldiers,
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
        maxSoldiers,
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
            maxSoldiers,
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
        maxSoldiers,
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
            maxSoldiers,
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
        rangerTalaCount,
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
            rangerTalaCount,
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
    setInventoryMarketDraft(null);
    setMarketOpen(false);
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
    setInventoryModalOpen(false);
    setInventoryMarketDraft(null);
    setMarketOpen(false);
    gameScene.startMovingSelectedBuilding();
  };

  const handleCloseSelectedBuilding = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    setHireModalOpen(false);
    setInventoryModalOpen(false);
    setInventoryMarketDraft(null);
    gameScene?.clearPlacedBuildingSelection?.();
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
    setInventoryModalOpen(false);
    setInventoryMarketDraft(null);
    setHireModalOpen(true);
  };

  const handleToggleInventoryModal = () => {
    setHireModalOpen(false);
    setInventoryMarketDraft(null);
    setInventoryModalOpen((open) => !open);
  };

  const handleToggleMarket = () => {
    setShopOpen(false);
    setLeaderboardOpen(false);
    setHireModalOpen(false);
    setInventoryModalOpen(false);
    setInventoryMarketDraft(null);
    setMusicPanelOpen(false);
    setMarketNotice("");
    setMarketOpen((open) => {
      const nextOpen = !open;

      if (nextOpen) {
        chatSocketRef.current?.emit("market:listings:request");
      }

      return nextOpen;
    });
  };

  const handleCloseMarket = () => {
    setMarketNotice("");
    setMarketOpen(false);
  };

  const getMarketItemCount = (itemType) => {
    if (itemType === "tank") {
      return Math.max(0, Number(gameState.totalTanks ?? 0) || 0);
    }

    if (itemType === "helicopter") {
      return Math.max(0, Number(gameState.totalHelicopters ?? 0) || 0);
    }

    if (itemType === "energy") {
      return Math.max(0, Number(gameState.energy ?? 0) || 0);
    }

    return 0;
  };

  const handleOpenInventoryMarketDraft = (itemType) => {
    const meta = GLOBAL_MARKET_ITEM_META[itemType];
    const available = getMarketItemCount(itemType);

    if (!meta || available <= 0) {
      setMarketNotice(`No ${meta?.label?.toLowerCase() ?? "items"} available for market listing.`);
      return;
    }

    setInventoryMarketDraft({
      itemType,
      listingType: "sell",
      quantity: "1",
      desiredItemType: itemType === "tank" ? "helicopter" : "tank",
      desiredQuantity: "1",
    });
  };

  const handleCloseInventoryMarketDraft = () => {
    setInventoryMarketDraft(null);
  };

  const clampInventoryDraftQuantity = (rawValue, maxValue = Number.POSITIVE_INFINITY) => {
    const digitsOnly = String(rawValue ?? "").replace(/[^\d]/g, "");

    if (!digitsOnly) {
      return "";
    }

    const parsedValue = Math.max(1, Math.floor(Number(digitsOnly) || 1));

    if (Number.isFinite(maxValue)) {
      return String(Math.min(Math.max(1, Math.floor(maxValue || 1)), parsedValue));
    }

    return String(parsedValue);
  };

  const handleInventoryDraftQuantityChange = (field, rawValue) => {
    const maxValue = field === "quantity"
      ? Math.max(1, inventoryDraftAvailableCount)
      : Number.POSITIVE_INFINITY;

    setInventoryMarketDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [field]: clampInventoryDraftQuantity(rawValue, maxValue),
      };
    });
  };

  const stepInventoryDraftQuantity = (field, delta) => {
    const maxValue = field === "quantity"
      ? Math.max(1, inventoryDraftAvailableCount)
      : Number.POSITIVE_INFINITY;

    setInventoryMarketDraft((current) => {
      if (!current) {
        return current;
      }

      const currentValue = Math.max(1, Math.floor(Number(current[field] ?? 1) || 1));
      const nextValue = currentValue + delta;
      const clampedValue = Number.isFinite(maxValue)
        ? Math.max(1, Math.min(maxValue, nextValue))
        : Math.max(1, nextValue);

      return {
        ...current,
        [field]: String(clampedValue),
      };
    });
  };

  const swallowModalBackdropPointer = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleSubmitInventoryMarketDraft = () => {
    const itemType = inventoryMarketDraft?.itemType;
    const listingType = inventoryMarketDraft?.listingType === "trade" ? "trade" : "sell";
    const availableCount = getMarketItemCount(itemType);
    const quantity = Math.max(
      1,
      Math.min(availableCount, Math.floor(Number(inventoryMarketDraft?.quantity ?? 1) || 1))
    );
    const desiredItemType = typeof inventoryMarketDraft?.desiredItemType === "string"
      ? inventoryMarketDraft.desiredItemType
      : "tank";
    const desiredQuantity = Math.max(1, Math.floor(Number(inventoryMarketDraft?.desiredQuantity ?? 1) || 1));

    if (!itemType || !availableCount) {
      setMarketNotice("No inventory available for market listing.");
      return;
    }

    if (listingType === "trade" && !GLOBAL_MARKET_ITEM_META[desiredItemType]) {
      setMarketNotice("Choose what item you want in exchange.");
      return;
    }

    const socket = chatSocketRef.current;

    if (!socket) {
      setMarketNotice("Market connection is not ready yet.");
      return;
    }

    if (!socket.connected) {
      socket.connect();
      setMarketNotice("Reconnecting to Global Market. Try again in a moment.");
      return;
    }

    const listingPayload = {
      listingType,
      itemType,
      quantity,
      priceGold: listingType === "sell"
        ? quantity * (GLOBAL_MARKET_PRICING[itemType] ?? 0)
        : 0,
      desiredItemType: listingType === "trade" ? desiredItemType : null,
      desiredQuantity: listingType === "trade" ? desiredQuantity : null,
    };

    socket.emit("market:listing:create", listingPayload, (response = {}) => {
      if (!response?.ok) {
        setMarketNotice(response?.message || "Unable to post market listing.");
        return;
      }

      const listing = response?.listing ?? null;
      const itemLabel = listing?.itemLabel ?? GLOBAL_MARKET_ITEM_META[itemType]?.label ?? "Item";
      const desiredItemLabel = listing?.desiredItemLabel ?? GLOBAL_MARKET_ITEM_META[desiredItemType]?.label ?? "item";

      if (listing) {
        setMarketListings((current) => {
          const next = [listing, ...current.filter((entry) => entry.id !== listing.id)];
          return next.slice(0, 80);
        });
      }

      setMarketNotice(
        listingType === "sell"
          ? `Listed ${formatCompactNumber(quantity)} ${itemLabel.toLowerCase()} for sale in Global Market.`
          : `Listed ${formatCompactNumber(quantity)} ${itemLabel.toLowerCase()} for trade. Wants ${formatCompactNumber(desiredQuantity)} ${desiredItemLabel.toLowerCase()}.`
      );
      setInventoryMarketDraft(null);
      setInventoryModalOpen(false);
      setMarketOpen(true);
      socket.emit("market:listings:request");
    });
  };

  const handleCancelMarketListing = (listingId) => {
    const socket = chatSocketRef.current;

    if (!listingId || !socket) {
      setMarketNotice("Market connection is not ready yet.");
      return;
    }

    if (!socket.connected) {
      socket.connect();
      setMarketNotice("Reconnecting to Global Market. Try again in a moment.");
      return;
    }

    socket.emit("market:listing:cancel", {
      listingId,
    }, (response = {}) => {
      if (!response?.ok) {
        setMarketNotice(response?.message || "Unable to cancel listing.");
        return;
      }

      setMarketListings((current) => current.filter((listing) => listing.id !== listingId));
      setMarketNotice("Listing cancelled from Global Market.");
      socket.emit("market:listings:request");
    });
  };

  const handleConfirmHireSoldier = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    const updatedBuilding = selectedPlacedBuilding?.type === "command-center"
      ? gameScene?.recruitSoldierAcrossTents?.()
      : gameScene?.hireSoldierAtSelectedBuilding?.(selectedPlacedBuilding);

    if (updatedBuilding) {
      setSelectedPlacedBuilding(updatedBuilding);
    }
  };

  const handleConfirmHireRangerTala = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    const updatedBuilding = selectedPlacedBuilding?.type === "command-center"
      ? gameScene?.recruitRangerTalaAcrossTents?.()
      : gameScene?.hireRangerTalaAtSelectedBuilding?.(selectedPlacedBuilding);

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

  const handleZoomIn = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.zoomCameraIn?.();
  };

  const handleZoomOut = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");
    gameScene?.zoomCameraOut?.();
  };

  const handleStartWar = () => {
    const gameScene = gameRef.current?.scene?.getScene("GameScene");

    if (gameScene) {
      saveGameSnapshot(gameScene.getPersistedSnapshot(), activeSession);
    }

    void primeWarRoute().finally(() => {
      navigate("/war");
    });
  };

  const upgradeCost = selectedPlacedBuilding
    ? getBuildingUpgradeCost(selectedPlacedBuilding.type)
    : 0;
  const upgradeCostLabel = `${formatCompactNumber(upgradeCost)} gold`;
  const upgradeCap = selectedPlacedBuilding?.type === "command-center"
    ? 3
    : Math.min(3, gameState.townHallLevel ?? 1);
  const blockedByTownHall = selectedPlacedBuilding
    && selectedPlacedBuilding.type !== "command-center"
    && (selectedPlacedBuilding.level ?? 1) >= upgradeCap;
  const canUpgrade = selectedPlacedBuilding
    && !selectedPlacedBuilding.isUpgrading
    && (selectedPlacedBuilding.level ?? 1) < upgradeCap
    && gameState.gold >= upgradeCost;
  const canHireSoldier = (selectedPlacedBuilding?.type === "tent" || selectedPlacedBuilding?.type === "command-center")
    && getBuildingTroopCount(selectedPlacedBuilding) < (selectedPlacedBuilding.maxSoldiers ?? 0);
  const canAffordRecruit = gameState.gold >= SOLDIER_RECRUIT_COST;
  const canAffordRangerRecruit = gameState.gold >= RANGER_TALA_RECRUIT_COST;
  const soldierCapacityReached = getBuildingTroopCount(selectedPlacedBuilding) >= (selectedPlacedBuilding?.maxSoldiers ?? 0);
  const canRecruitSoldier = canHireSoldier && canAffordRecruit;
  const canRecruitRangerTala = canHireSoldier && canAffordRangerRecruit;
  const selectedTroopCount = getBuildingTroopCount(selectedPlacedBuilding);
  const selectedRangerTalaCount = Math.max(0, Number(selectedPlacedBuilding?.rangerTalaCount ?? 0) || 0);
  const selectedBasicSoldierCount = Math.max(0, Number(selectedPlacedBuilding?.soldierCount ?? 0) || 0);
  const parsedRemoveSoldierCount = Math.max(1, Math.floor(Number(removeSoldierCount) || 1));
  const canRemoveSoldier = selectedPlacedBuilding?.type === "tent"
    && selectedTroopCount > 0;
  const canToggleSoldierSleep = (selectedPlacedBuilding?.type === "tent" || selectedPlacedBuilding?.type === "command-center")
    && selectedTroopCount > 0;
  const feedCost = selectedTroopCount * 1;
  const canFeedSoldiers = (selectedPlacedBuilding?.type === "tent" || selectedPlacedBuilding?.type === "command-center")
    && selectedTroopCount > 0
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
  const inventoryDraftAvailableCount = getMarketItemCount(inventoryMarketDraft?.itemType);
  const inventoryDraftPriceGold = inventoryMarketDraft?.itemType
    ? (GLOBAL_MARKET_PRICING[inventoryMarketDraft.itemType] ?? 0) * Math.max(
      1,
      Math.min(inventoryDraftAvailableCount, Math.floor(Number(inventoryMarketDraft?.quantity ?? 1) || 1))
    )
    : 0;
  const inventoryDraftDesiredMeta = GLOBAL_MARKET_ITEM_META[inventoryMarketDraft?.desiredItemType] ?? null;
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
            <div className="pointer-events-none flex w-16 flex-col gap-0.5 min-[901px]:w-[6.7rem]">
              <div className="rounded-[0.64rem] border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.56)_0%,rgba(15,23,42,0.38)_100%)] px-1 py-0.75 text-white backdrop-blur-sm min-[901px]:rounded-[0.8rem] min-[901px]:px-1.5 min-[901px]:py-1.5">
                <p className="text-[0.32rem] uppercase tracking-[0.14em] text-emerald-300/75 min-[901px]:text-[0.42rem] min-[901px]:tracking-[0.26em]">Base</p>
                <p className="mt-0.5 text-[0.56rem] font-black leading-tight text-white min-[901px]:mt-1 min-[901px]:text-[0.7rem]">{profileName}</p>
                <p className="mt-0.5 text-[0.3rem] uppercase tracking-[0.05em] text-slate-100/90 min-[901px]:text-[0.4rem] min-[901px]:tracking-widest">{profileId}</p>
                <p className="mt-0.5 text-[0.3rem] uppercase tracking-widest text-amber-200/90 min-[901px]:text-[0.4rem] min-[901px]:tracking-[0.2em]">{profileRank}</p>
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
                onClick={handleZoomOut}
                className="min-h-7 border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.52)_0%,rgba(15,23,42,0.3)_100%)] px-1 py-0.75 text-[7px] tracking-[0.04em] text-cyan-50 backdrop-blur-sm hover:bg-[linear-gradient(180deg,rgba(15,23,42,0.68)_0%,rgba(15,23,42,0.42)_100%)] min-[901px]:min-h-0 min-[901px]:px-2.5 min-[901px]:py-3 min-[901px]:text-[10px] min-[901px]:tracking-[0.16em]"
              >
                Zoom -
              </CommandButton>
              <CommandButton
                onClick={handleZoomIn}
                className="min-h-7 border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.52)_0%,rgba(15,23,42,0.3)_100%)] px-1 py-0.75 text-[7px] tracking-[0.04em] text-cyan-50 backdrop-blur-sm hover:bg-[linear-gradient(180deg,rgba(15,23,42,0.68)_0%,rgba(15,23,42,0.42)_100%)] min-[901px]:min-h-0 min-[901px]:px-2.5 min-[901px]:py-3 min-[901px]:text-[10px] min-[901px]:tracking-[0.16em]"
              >
                Zoom +
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
                  <div className="absolute right-0 top-full z-20 mt-1.5 min-w-38 rounded-xl border border-white/10 bg-slate-950/90 p-2 shadow-[0_14px_36px_rgba(2,6,23,0.35)] backdrop-blur-md">
                    <button
                      type="button"
                      onClick={handleToggleMusicMute}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-violet-100 transition hover:bg-white/10"
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

        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center pr-2 min-[901px]:left-0 min-[901px]:right-auto min-[901px]:pr-0 min-[901px]:pl-4">
          <button
            type="button"
            onClick={handleToggleMarket}
            className="pointer-events-auto flex min-h-30 w-10 flex-col items-center justify-center gap-2 rounded-2xl border border-amber-300/18 bg-[linear-gradient(180deg,rgba(15,23,42,0.94)_0%,rgba(15,23,42,0.84)_100%)] px-2 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100 shadow-[0_16px_36px_rgba(2,6,23,0.3)] transition hover:bg-[linear-gradient(180deg,rgba(15,23,42,0.98)_0%,rgba(15,23,42,0.9)_100%)] min-[901px]:min-h-36 min-[901px]:w-12 min-[901px]:text-[11px]"
          >
            <span className="text-sm min-[901px]:text-base">$</span>
            <span className="[writing-mode:vertical-rl] [text-orientation:mixed]">{marketOpen ? "Close" : "Market"}</span>
          </button>
        </div>

        <div ref={gameRootRef} className="h-full w-full overflow-hidden" />
        <MobileLandscapePrompt />

        <AnimatePresence>
        {selectedPlacedBuilding ? (
          <Motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22 }}
            className="absolute inset-0 bottom-0 z-10 flex items-end justify-center px-3 pb-20 pointer-events-auto sm:pb-2.5"
          >
            <div
              className="absolute inset-0 pointer-events-auto"
              onClick={handleCloseSelectedBuilding}
            />
            <div
              className="relative z-10 w-full max-w-sm rounded-[0.8rem] border border-white/10 bg-[rgba(20,30,40,0.85)] p-1.5 text-white shadow-[0_8px_20px_rgba(0,0,0,0.5)] backdrop-blur-[10px] sm:max-w-59"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Selected</p>
                  <h3 className="mt-0.5 truncate text-[12px] font-bold text-white">{selectedPlacedBuilding.name}</h3>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-sky-100">
                    Lv.{selectedPlacedBuilding.level ?? 1}
                  </span>
                  <button
                    type="button"
                    onClick={handleCloseSelectedBuilding}
                    className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold text-slate-100 transition hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>
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
                    <span className="text-slate-400">Troops</span>
                    <span className="font-bold text-white">
                      {selectedTroopCount}/{selectedPlacedBuilding.maxSoldiers ?? 15}
                    </span>
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "tent" || selectedPlacedBuilding.type === "command-center" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Riflemen</span>
                    <span className="font-bold text-white">{selectedBasicSoldierCount}</span>
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "tent" || selectedPlacedBuilding.type === "command-center" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Ranger Tala</span>
                    <span className="font-bold text-cyan-100">{selectedRangerTalaCount}</span>
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
                    <span className="font-bold text-white">{SOLDIER_RECRUIT_COST}G basic / {RANGER_TALA_RECRUIT_COST}G ranger</span>
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
                    max={Math.max(1, selectedTroopCount || 1)}
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
                      disabled={!canHireSoldier || (!canAffordRecruit && !canAffordRangerRecruit)}
                      className="rounded-[9px] bg-violet-500 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-white transition hover:-translate-y-0.5 hover:bg-violet-400 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                    >
                      Recruit
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveSoldiers}
                      disabled={!canRemoveSoldier || parsedRemoveSoldierCount > selectedTroopCount}
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
                      disabled={!canHireSoldier || (!canAffordRecruit && !canAffordRangerRecruit)}
                      className="rounded-[9px] bg-violet-500 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-white transition hover:-translate-y-0.5 hover:bg-violet-400 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                    >
                      Recruit
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleInventoryModal}
                      className="rounded-[9px] bg-cyan-500 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-white transition hover:-translate-y-0.5 hover:bg-cyan-400"
                    >
                      Inventory
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
            Start Raid
          </button>
        </Motion.div>

        {hireModalOpen && (selectedPlacedBuilding?.type === "tent" || selectedPlacedBuilding?.type === "command-center") ? (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/70 px-2 py-2 min-[901px]:px-4 min-[901px]:py-4 min-[901px]:bg-slate-950/55 min-[901px]:backdrop-blur-[3px]"
            onPointerDown={swallowModalBackdropPointer}
            onClick={swallowModalBackdropPointer}
          >
            <div className="mobile-landscape-overlay-card mobile-game-recruit-modal mobile-safe-solid-panel w-full max-w-74 rounded-[1.15rem] border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(15,23,42,0.92)_100%)] p-2.5 text-white shadow-[0_20px_60px_rgba(2,6,23,0.28)] min-[901px]:rounded-[1.4rem] min-[901px]:bg-[linear-gradient(180deg,rgba(15,23,42,0.82)_0%,rgba(15,23,42,0.68)_100%)] min-[901px]:p-3 min-[901px]:backdrop-blur-xl">
              <div className="flex items-start justify-between gap-2 min-[901px]:gap-4">
                <div>
                  <p className="text-[0.56rem] uppercase tracking-[0.2em] text-amber-300/70 min-[901px]:text-[0.68rem] min-[901px]:tracking-[0.3em]">
                    {selectedPlacedBuilding?.type === "command-center" ? "Command Center" : "Soldier Tent"}
                  </p>
                  <h3 className="mt-1 text-base font-black min-[901px]:text-lg">Unit Shop</h3>
                  <p className="mt-1 text-[11px] leading-tight text-slate-400 min-[901px]:mt-2 min-[901px]:text-xs">
                    {selectedPlacedBuilding?.type === "command-center"
                      ? "Dito ka pipili ng unit para ma-assign agad sa available Soldier Tent."
                      : "Dito ka bibili ng units para sa selected Soldier Tent."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setHireModalOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10 min-[901px]:rounded-2xl min-[901px]:px-3 min-[901px]:py-1.5 min-[901px]:text-xs"
                >
                  Close
                </button>
              </div>

              <div className="mobile-landscape-overlay-scroll mt-2.5 min-h-0 max-h-[calc(var(--app-screen-height)-7rem)] space-y-2 pr-0.5 min-[901px]:max-h-none min-[901px]:space-y-0 min-[901px]:overflow-visible">
                <button
                  type="button"
                  onClick={handleConfirmHireSoldier}
                  disabled={!canRecruitSoldier}
                  className="block w-full rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-2 text-left transition hover:border-emerald-300 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex h-12 items-center justify-center rounded-xl bg-slate-900/70 p-1.5 min-[901px]:h-14">
                    <img
                      src="/assets/army/front/firing.png"
                      alt="Riflemen"
                      className="h-full w-full object-contain"
                      draggable="false"
                    />
                  </div>
                  <p className="mt-2 text-sm font-bold text-white">Riflemen</p>
                  <p className="mt-1 text-[11px] leading-tight text-slate-300 min-[901px]:text-xs">
                    {selectedPlacedBuilding?.type === "command-center"
                      ? "Starter unit na mapupunta sa unang tent na may space."
                      : "Starter unit para sa Soldier Tent."}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-amber-300 min-[901px]:text-xs">
                    Recruit: {SOLDIER_RECRUIT_COST} gold / unit
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-amber-300 min-[901px]:text-xs">
                    Wage: 1 gold / 24 hrs
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-sky-300 min-[901px]:text-xs">
                    {selectedBasicSoldierCount} hired
                  </p>
                </button>
                <button
                  type="button"
                  onClick={handleConfirmHireRangerTala}
                  disabled={!canRecruitRangerTala}
                  className="block w-full rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-2 text-left transition hover:border-cyan-300 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex h-12 items-center justify-center overflow-hidden rounded-xl bg-slate-900/70 p-1.5 min-[901px]:h-14">
                    <SpriteAnimator
                      frames={RANGER_FRONT_PREVIEW.frames}
                      displayWidth={50}
                      displayHeight={55}
                      chrome={false}
                      label="Ranger Tala sprite animation"
                      className="flex h-full w-full items-center justify-center"
                    />
                  </div>
                  <p className="mt-2 text-sm font-bold text-white">Ranger Tala</p>
                  <p className="mt-1 text-[11px] leading-tight text-slate-300 min-[901px]:text-xs">
                    {selectedPlacedBuilding?.type === "command-center"
                      ? "Long-range infantry na mapupunta sa unang tent na may space."
                      : "Longer-range infantry for Warpage assaults."}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-amber-300 min-[901px]:text-xs">
                    Recruit: {RANGER_TALA_RECRUIT_COST} gold / unit
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-amber-300 min-[901px]:text-xs">
                    Wage: 1 gold / 24 hrs
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-cyan-300 min-[901px]:text-xs">
                    {selectedRangerTalaCount} hired
                  </p>
                </button>
                <p className="text-[11px] font-semibold text-sky-300 min-[901px]:text-xs">
                  Total garrison: {selectedTroopCount}/{selectedPlacedBuilding.maxSoldiers ?? 15}
                </p>
              </div>

              {!(canRecruitSoldier || canRecruitRangerTala) && (
                <p className="mt-3 text-[11px] font-semibold leading-tight text-rose-300 min-[901px]:mt-4 min-[901px]:text-sm">
                  {soldierCapacityReached
                    ? selectedPlacedBuilding?.type === "command-center"
                      ? "Max troops reached na sa lahat ng available Soldier Tents."
                      : "Max troops reached na para sa Soldier Tent na ito."
                    : `Kulang gold. Kailangan ${SOLDIER_RECRUIT_COST} gold para sa Riflemen o ${RANGER_TALA_RECRUIT_COST} gold para sa Ranger Tala.`}
                </p>
              )}
            </div>
          </div>
        ) : null}

        {inventoryModalOpen && selectedPlacedBuilding?.type === "command-center" ? (
          <div
            className="absolute inset-0 z-20 flex items-end justify-center overflow-y-auto bg-slate-950/70 px-2 py-2 min-[540px]:items-center min-[901px]:px-4 min-[901px]:py-4 min-[901px]:bg-slate-950/55 min-[901px]:backdrop-blur-[3px]"
            onPointerDown={swallowModalBackdropPointer}
            onClick={(event) => {
              swallowModalBackdropPointer(event);
              setInventoryModalOpen(false);
              setInventoryMarketDraft(null);
            }}
          >
            <div
              className="mobile-landscape-overlay-card mobile-landscape-inventory-modal mobile-safe-solid-panel relative flex w-full max-w-[min(96vw,32rem)] flex-col rounded-[1.15rem] border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(15,23,42,0.92)_100%)] p-3 text-white shadow-[0_20px_60px_rgba(2,6,23,0.28)] min-[901px]:rounded-[1.4rem] min-[901px]:p-4 min-[901px]:bg-[linear-gradient(180deg,rgba(15,23,42,0.82)_0%,rgba(15,23,42,0.68)_100%)] min-[901px]:backdrop-blur-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-2 min-[901px]:gap-4">
                <div>
                  <p className="text-[0.56rem] uppercase tracking-[0.2em] text-cyan-300/70 min-[901px]:text-[0.68rem] min-[901px]:tracking-[0.3em]">
                    Command Center
                  </p>
                  <h3 className="mt-1 text-base font-black min-[901px]:text-lg">Inventory</h3>
                  <p className="mt-1 text-[11px] leading-tight text-slate-400 min-[901px]:text-xs">
                    Current stored units and resources available in your base.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setInventoryModalOpen(false);
                    setInventoryMarketDraft(null);
                  }}
                  className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10 min-[901px]:rounded-2xl min-[901px]:px-3 min-[901px]:py-1.5 min-[901px]:text-xs"
                >
                  Close
                </button>
              </div>

              <div className="mobile-landscape-overlay-scroll mt-3 pr-0.5">
                <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 min-[901px]:gap-3">
                  <button
                    type="button"
                    onClick={() => handleOpenInventoryMarketDraft("energy")}
                    disabled={gameState.energy <= 0}
                    className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-left transition hover:border-cyan-300/40 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <div className="flex h-12 items-center justify-center rounded-xl bg-slate-900/60 p-2">
                      <img
                        src="/assets/energymachine.png"
                        alt="Energy"
                        className="h-full w-full object-contain"
                        draggable="false"
                      />
                    </div>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/80">Energy</p>
                    <p className="mt-1 text-lg font-black text-white min-[901px]:text-xl">{formatCompactNumber(gameState.energy)}</p>
                    <p className="mt-1 text-[10px] font-semibold text-cyan-100/80">Tap to list in Global Market</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenInventoryMarketDraft("tank")}
                    disabled={gameState.totalTanks <= 0}
                    className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-left transition hover:border-amber-300/40 hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <div className="flex h-12 items-center justify-center rounded-xl bg-slate-900/60 p-2">
                      <img
                        src="/assets/tank/tank1.png"
                        alt="Tanks"
                        className="h-full w-full object-contain"
                        draggable="false"
                      />
                    </div>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/80">Tanks</p>
                    <p className="mt-1 text-lg font-black text-white min-[901px]:text-xl">{formatCompactNumber(gameState.totalTanks)}</p>
                    <p className="mt-1 text-[10px] font-semibold text-amber-100/80">Tap to sell or trade</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenInventoryMarketDraft("helicopter")}
                    disabled={gameState.totalHelicopters <= 0}
                    className="rounded-2xl border border-sky-400/20 bg-sky-400/10 p-3 text-left transition hover:border-sky-300/40 hover:bg-sky-400/15 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <div className="flex h-12 items-center justify-center rounded-xl bg-slate-900/60 p-2">
                      <img
                        src="/assets/parkingchopper-Photoroom.png"
                        alt="Helicopters"
                        className="h-full w-full object-contain"
                        draggable="false"
                      />
                    </div>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200/80">Helicopters</p>
                    <p className="mt-1 text-lg font-black text-white min-[901px]:text-xl">{formatCompactNumber(gameState.totalHelicopters)}</p>
                    <p className="mt-1 text-[10px] font-semibold text-sky-100/80">Tap to sell or trade</p>
                  </button>

                  <div className="rounded-2xl border border-violet-400/20 bg-violet-400/10 p-3">
                    <div className="flex h-12 items-center justify-center rounded-xl bg-slate-900/60 p-2">
                      <img
                        src="/assets/army/front/firing.png"
                        alt="Troops"
                        className="h-full w-full object-contain"
                        draggable="false"
                      />
                    </div>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200/80">Troops</p>
                    <p className="mt-1 text-lg font-black text-white min-[901px]:text-xl">{formatCompactNumber(gameState.totalSoldiers)}</p>
                  </div>

                  <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3 min-[420px]:col-span-2">
                    <div className="flex h-12 items-center justify-center overflow-hidden rounded-xl bg-slate-900/60 p-2">
                      <SpriteAnimator
                        frames={RANGER_FRONT_PREVIEW.frames}
                        displayWidth={38}
                        displayHeight={42}
                        chrome={false}
                        label="Total Army"
                        className="flex h-full w-full items-center justify-center"
                      />
                    </div>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-200/80">Total Army</p>
                    <p className="mt-1 text-lg font-black text-white min-[901px]:text-xl">{formatCompactNumber(gameState.totalArmyUnits)}</p>
                  </div>
                </div>

                <p className="mt-3 text-[11px] font-semibold leading-tight text-slate-300 min-[901px]:text-xs">
                  Tap `Energy`, `Tanks`, or `Helicopters` to create a `Sell` or `Trade` listing in Global Market.
                </p>
              </div>

              {inventoryMarketDraft ? (
                <div className="absolute inset-0 z-10 flex items-end justify-center rounded-[1.15rem] bg-slate-950/80 p-2 min-[540px]:items-center min-[901px]:rounded-[1.4rem] min-[901px]:p-4">
                  <div className="w-full max-w-sm rounded-[1.1rem] border border-white/12 bg-[linear-gradient(180deg,rgba(15,23,42,0.98)_0%,rgba(15,23,42,0.94)_100%)] p-3 shadow-[0_20px_60px_rgba(2,6,23,0.34)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[0.56rem] uppercase tracking-[0.22em] text-amber-300/75">Item Action</p>
                        <h4 className="mt-1 text-sm font-black text-white">
                          {GLOBAL_MARKET_ITEM_META[inventoryMarketDraft.itemType]?.label}
                        </h4>
                        <p className="mt-1 text-[11px] leading-tight text-slate-400">
                          Choose kung `Sell` o `Trade`, then ipo-post ito sa Global Market listings.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleCloseInventoryMarketDraft}
                        className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10"
                      >
                        Close
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setInventoryMarketDraft((current) => ({
                          ...current,
                          listingType: "sell",
                        }))}
                        className={`rounded-xl border px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] transition ${
                          inventoryMarketDraft.listingType === "sell"
                            ? "border-emerald-300/20 bg-emerald-400 text-slate-950"
                            : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                        }`}
                      >
                        Sell
                      </button>
                      <button
                        type="button"
                        onClick={() => setInventoryMarketDraft((current) => ({
                          ...current,
                          listingType: "trade",
                        }))}
                        className={`rounded-xl border px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] transition ${
                          inventoryMarketDraft.listingType === "trade"
                            ? "border-cyan-300/20 bg-cyan-400 text-slate-950"
                            : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                        }`}
                      >
                        Trade
                      </button>
                    </div>

                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Quantity
                      </label>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => stepInventoryDraftQuantity("quantity", -1)}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950 text-lg font-black text-white transition hover:bg-white/10"
                        >
                          -
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={inventoryMarketDraft.quantity}
                          onChange={(event) => handleInventoryDraftQuantityChange("quantity", event.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-center text-sm text-white outline-none focus:border-cyan-400"
                        />
                        <button
                          type="button"
                          onClick={() => stepInventoryDraftQuantity("quantity", 1)}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950 text-lg font-black text-white transition hover:bg-white/10"
                        >
                          +
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] leading-tight text-slate-300">
                        Available: {formatCompactNumber(inventoryDraftAvailableCount)}
                      </p>
                      <p className="mt-1 text-[11px] leading-tight text-slate-300">
                        {inventoryMarketDraft.listingType === "sell"
                          ? `Sale price: ${formatCompactNumber(inventoryDraftPriceGold)} gold`
                          : "Trade listing: choose the item and quantity you want in exchange."}
                      </p>
                    </div>

                    {inventoryMarketDraft.listingType === "trade" ? (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                        <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                          Wants In Exchange
                        </label>

                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {["tank", "helicopter", "energy", "army"].map((itemType) => {
                            const meta = GLOBAL_MARKET_ITEM_META[itemType];

                            return (
                              <button
                                key={itemType}
                                type="button"
                                onClick={() => setInventoryMarketDraft((current) => ({
                                  ...current,
                                  desiredItemType: itemType,
                                }))}
                                className={`rounded-xl border px-2 py-2 text-[11px] font-bold uppercase tracking-[0.12em] transition ${
                                  inventoryMarketDraft.desiredItemType === itemType
                                    ? "border-cyan-300/20 bg-cyan-400 text-slate-950"
                                    : "border-white/10 bg-slate-950/70 text-slate-200 hover:bg-white/10"
                                }`}
                              >
                                {meta.label}
                              </button>
                            );
                          })}
                        </div>

                        <label className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                          Wanted Quantity
                        </label>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => stepInventoryDraftQuantity("desiredQuantity", -1)}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950 text-lg font-black text-white transition hover:bg-white/10"
                          >
                            -
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={inventoryMarketDraft.desiredQuantity}
                            onChange={(event) => handleInventoryDraftQuantityChange("desiredQuantity", event.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-center text-sm text-white outline-none focus:border-cyan-400"
                          />
                          <button
                            type="button"
                            onClick={() => stepInventoryDraftQuantity("desiredQuantity", 1)}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950 text-lg font-black text-white transition hover:bg-white/10"
                          >
                            +
                          </button>
                        </div>
                        <p className="mt-2 text-[11px] leading-tight text-slate-300">
                          {`This listing asks for ${formatCompactNumber(Math.max(1, Math.floor(Number(inventoryMarketDraft.desiredQuantity ?? 1) || 1)))} ${inventoryDraftDesiredMeta?.label?.toLowerCase() ?? "item"}.`}
                        </p>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={handleSubmitInventoryMarketDraft}
                      disabled={!marketSocketReady}
                      className="mt-3 w-full rounded-2xl border border-cyan-300/20 bg-[linear-gradient(180deg,#22d3ee_0%,#0891b2_100%)] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-slate-950 transition hover:brightness-105"
                    >
                      {marketSocketReady ? "Post to Global Market" : "Connecting to Market..."}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {leaderboardOpen ? (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-xs min-[901px]:p-4"
            onPointerDown={swallowModalBackdropPointer}
            onClick={(event) => {
              swallowModalBackdropPointer(event);
              setLeaderboardOpen(false);
            }}
          >
            <div
              className="mobile-landscape-overlay-card flex w-full flex-col rounded-2xl border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.88)_0%,rgba(15,23,42,0.74)_100%)] p-3 text-white shadow-[0_20px_60px_rgba(2,6,23,0.34)] min-[901px]:max-w-120 min-[901px]:rounded-[1.4rem] min-[901px]:p-4"
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
                  <div className="grid grid-cols-[2.4rem_minmax(0,1fr)_2.5rem_2.5rem_2.9rem] gap-1 border-b border-white/8 px-2 py-1.5 text-[8px] font-black uppercase tracking-widest text-slate-400 min-[901px]:grid-cols-[3rem_minmax(0,1fr)_3.6rem_3.6rem_3.8rem] min-[901px]:gap-2 min-[901px]:px-3 min-[901px]:py-2 min-[901px]:text-[10px] min-[901px]:tracking-[0.18em]">
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
            className="mobile-game-chat-overlay fixed inset-0 z-30 flex items-end justify-center p-2 min-[901px]:justify-end min-[901px]:p-4"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setChatOpen(false)}
          >
            <div
              className="mobile-landscape-overlay-card mobile-landscape-chat-card mobile-game-chat-card mobile-safe-solid-panel mt-auto mb-16 flex w-full flex-col rounded-2xl border border-white/12 bg-slate-950 p-2.5 text-white shadow-[0_18px_50px_rgba(2,6,23,0.34)] min-[901px]:mb-4 min-[901px]:max-w-88 min-[901px]:rounded-[1.2rem] min-[901px]:bg-[linear-gradient(180deg,rgba(15,23,42,0.9)_0%,rgba(15,23,42,0.78)_100%)] min-[901px]:p-3 min-[901px]:backdrop-blur-xl"
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

              <div className="mobile-landscape-overlay-scroll mobile-game-chat-scroll mt-2.5 min-h-0 flex-1 rounded-xl border border-white/8 bg-slate-950 px-2.5 py-2 min-[901px]:mt-3 min-[901px]:rounded-2xl min-[901px]:bg-slate-950/45 min-[901px]:px-3">
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

              <div className="mobile-game-chat-input-row mt-2.5 flex shrink-0 gap-1.5 min-[901px]:mt-3 min-[901px]:gap-2">
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
                  className="mobile-game-chat-input min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1.5 text-[12px] text-white outline-none transition focus:border-emerald-400 min-[901px]:rounded-xl min-[901px]:bg-slate-950/70 min-[901px]:px-3 min-[901px]:py-2 min-[901px]:text-sm"
                />
                <button
                  type="button"
                  onClick={handleSendChat}
                  className="mobile-game-chat-send rounded-lg bg-emerald-400 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-slate-950 transition hover:bg-emerald-300 min-[901px]:rounded-xl min-[901px]:px-4 min-[901px]:py-2 min-[901px]:text-sm min-[901px]:tracking-[0.12em]"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {marketOpen ? (
          <div
            className="absolute inset-0 z-20 flex items-end justify-center bg-slate-950/68 px-2 py-2 min-[540px]:items-center min-[901px]:justify-start min-[901px]:px-4 min-[901px]:py-4"
            onPointerDown={swallowModalBackdropPointer}
            onClick={(event) => {
              swallowModalBackdropPointer(event);
              handleCloseMarket();
            }}
          >
            <div
              className="mobile-landscape-overlay-card mobile-landscape-market-modal mobile-safe-solid-panel flex w-full max-w-[min(96vw,34rem)] flex-col rounded-[1.2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(15,23,42,0.97)_0%,rgba(15,23,42,0.92)_100%)] p-3 text-white shadow-[0_20px_60px_rgba(2,6,23,0.34)] min-[901px]:ml-14 min-[901px]:max-w-[min(34rem,42vw)] min-[901px]:rounded-[1.4rem] min-[901px]:p-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.56rem] uppercase tracking-[0.22em] text-amber-300/75 min-[901px]:text-[0.68rem] min-[901px]:tracking-[0.3em]">
                    Global Market
                  </p>
                  <h3 className="mt-1 text-base font-black min-[901px]:text-lg">Player Listings</h3>
                  <p className="mt-1 text-[11px] leading-tight text-slate-400 min-[901px]:text-xs">
                    Listings will only appear here kapag may nag-post nang `Sell` o `Trade`.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCloseMarket}
                  className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10 min-[901px]:rounded-2xl min-[901px]:px-3 min-[901px]:py-1.5 min-[901px]:text-xs"
                >
                  Close
                </button>
              </div>

              <div className="mobile-landscape-overlay-scroll mt-3 pr-0.5">
                {marketListings.length ? (
                  <div className="grid grid-cols-1 gap-2.5 min-[901px]:gap-3">
                    {marketListings.map((listing) => {
                      const meta = GLOBAL_MARKET_ITEM_META[listing.itemType] ?? GLOBAL_MARKET_ITEM_META.energy;
                      const desiredMeta = GLOBAL_MARKET_ITEM_META[listing.desiredItemType] ?? null;
                      const isOwnListing = String(listing.sellerUserId) === String(activeSession?.id ?? "");

                      return (
                        <div
                          key={listing.id}
                          className={`rounded-2xl border p-3 ${meta.toneCardClass}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-950/60 p-2">
                              <img src={meta.icon} alt={meta.alt} className="h-full w-full object-contain" draggable="false" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-black text-white">
                                    {listing.listingType === "trade" ? "Trade Listing" : "Sell Listing"}
                                  </p>
                                  <p className="mt-0.5 truncate text-[11px] text-slate-300 min-[901px]:text-xs">
                                    {listing.sellerName} · {listing.sellerPlayerId}
                                  </p>
                                </div>
                                <span className={`rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${meta.toneTextClass}`}>
                                  {isOwnListing ? "Yours" : listing.listingType}
                                </span>
                              </div>
                              <p className="mt-2 text-sm font-bold text-white">
                                {formatCompactNumber(listing.quantity)} {listing.itemLabel}
                              </p>
                              <p className="mt-1 text-[11px] leading-tight text-slate-300 min-[901px]:text-xs">
                                {listing.listingType === "sell"
                                  ? `Selling for ${formatCompactNumber(listing.priceGold ?? 0)} gold`
                                  : `Wants ${formatCompactNumber(listing.desiredQuantity ?? 1)} ${desiredMeta?.label ?? listing.desiredItemLabel ?? "item"} in exchange.`}
                              </p>

                              {isOwnListing ? (
                                <button
                                  type="button"
                                  onClick={() => handleCancelMarketListing(listing.id)}
                                  className="mt-2 rounded-xl border border-rose-300/18 bg-rose-400/12 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-rose-50 transition hover:bg-rose-400/20"
                                >
                                  Cancel
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-6 text-center text-[12px] font-semibold text-slate-300 min-[901px]:text-sm">
                    No global market listings yet.
                    <p className="mt-2 text-[11px] font-medium text-slate-400 min-[901px]:text-xs">
                      Open the `Inventory` in your Command Center and post an item with `Sell` or `Trade`.
                    </p>
                  </div>
                )}

                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-[11px] leading-tight text-slate-300 min-[901px]:text-xs">
                  {marketNotice || (
                    marketSocketReady
                      ? "Global Market only shows listings that players have posted from their inventory."
                      : "Connecting to Global Market..."
                  )}
                </div>
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
            onPointerDown={swallowModalBackdropPointer}
            onClick={(event) => {
              swallowModalBackdropPointer(event);
              setShopOpen(false);
            }}
          >
            <div className="w-full" onClick={(event) => event.stopPropagation()}>
              <BuildingShop
                gold={gameState.gold}
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
                className="relative flex h-full w-full items-center justify-center overflow-y-auto text-white"
              >
                <div className="relative z-10 flex w-full max-w-352 flex-col items-center justify-center gap-4 py-6 sm:gap-6 md:flex-row md:gap-10 md:py-8">
                  <div className="h-48 w-48 shrink-0 overflow-hidden sm:h-64 sm:w-64 md:h-136 md:w-136">
                    <img
                      src="/assets/welcomeback.png"
                      alt="Welcome Back"
                      className="h-full w-full object-contain"
                      draggable="false"
                    />
                  </div>

                  <div className="min-w-0 max-w-md text-center md:text-left">
                    <p className="text-[0.68rem] uppercase tracking-[0.28em] text-sky-300/80 sm:text-[0.78rem] sm:tracking-[0.34em] md:text-[0.9rem] md:tracking-[0.42em]">
                      Welcome Back
                    </p>
                    <h2 className="mt-2 text-3xl font-black leading-[0.95] text-white sm:mt-3 sm:text-4xl md:text-6xl">
                      {profileName}
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base sm:leading-7 md:mt-4 md:text-lg md:leading-8">
                      Your base is ready, Commander. Continue building and prepare for the next battle.
                    </p>
                    <button
                      type="button"
                      onClick={handleCloseWelcomeBack}
                      className="pointer-events-auto mt-4 w-full rounded-2xl bg-sky-400 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-sky-300 sm:mt-5 sm:w-auto sm:px-6 sm:py-3.5 sm:text-base sm:tracking-[0.18em]"
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
