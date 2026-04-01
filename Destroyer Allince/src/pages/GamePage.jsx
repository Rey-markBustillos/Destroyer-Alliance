import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";

import BuildingShop from "../components/BuildingShop";
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

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(Number(value ?? 0) || 0)));

function StrategyIcon({ icon, className = "" }) {
  const sharedProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
  };

  switch (icon) {
    case "gold":
      return (
        <svg {...sharedProps}>
          <circle cx="12" cy="12" r="7.5" />
          <path d="M9 9.5c.7-.8 1.7-1.2 3-1.2 1.8 0 3 .8 3 2.1 0 2.8-5.9 1.3-5.9 4 0 1.1 1 1.9 2.8 1.9 1.3 0 2.3-.4 3.1-1.1" />
          <path d="M12 7v10" />
        </svg>
      );
    case "energy":
      return (
        <svg {...sharedProps}>
          <path d="M13 2 6 13h5l-1 9 8-12h-5l1-8Z" />
        </svg>
      );
    case "war":
      return (
        <svg {...sharedProps}>
          <path d="M6 4h11l-2.2 5L17 14H7l2-5L6 4Z" />
          <path d="M8 18h8" />
          <path d="M10 14v4" />
          <path d="M14 14v4" />
        </svg>
      );
    case "troops":
      return (
        <svg {...sharedProps}>
          <path d="M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M6.5 18.5a5.5 5.5 0 0 1 11 0" />
          <path d="M5 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
          <path d="M19 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
        </svg>
      );
    case "base":
      return (
        <svg {...sharedProps}>
          <path d="M4 20V9l8-5 8 5v11" />
          <path d="M9 20v-5h6v5" />
          <path d="M9 10h6" />
        </svg>
      );
    case "wood":
      return (
        <svg {...sharedProps}>
          <path d="M7 17c0-3.8 2.2-7.2 5-10 2.8 2.8 5 6.2 5 10a5 5 0 1 1-10 0Z" />
          <path d="M12 9v10" />
        </svg>
      );
    case "chat":
      return (
        <svg {...sharedProps}>
          <path d="M5 6.5h14v9H9l-4 3v-3H5Z" />
        </svg>
      );
    case "leaderboard":
      return (
        <svg {...sharedProps}>
          <path d="M6 20V10" />
          <path d="M12 20V4" />
          <path d="M18 20v-8" />
        </svg>
      );
    case "profile":
      return (
        <svg {...sharedProps}>
          <path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    case "shop":
      return (
        <svg {...sharedProps}>
          <path d="M4 8h16l-1.2 11H5.2L4 8Z" />
          <path d="m8 8 1.5-3h5L16 8" />
        </svg>
      );
    case "music":
      return (
        <svg {...sharedProps}>
          <path d="M15 5v9.5a2.5 2.5 0 1 1-2-2.45V7.2L19 6v7.5a2.5 2.5 0 1 1-2-2.45V5.8L15 5Z" />
        </svg>
      );
    case "menu":
      return (
        <svg {...sharedProps}>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      );
    case "close":
      return (
        <svg {...sharedProps}>
          <path d="m6 6 12 12" />
          <path d="M18 6 6 18" />
        </svg>
      );
    default:
      return (
        <svg {...sharedProps}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

function ResourceBar({ progress = 0, tone = "emerald", label = "" }) {
  const palette = {
    emerald: "from-emerald-300 via-emerald-400 to-teal-200 shadow-[0_0_16px_rgba(52,211,153,0.32)]",
    sky: "from-sky-300 via-cyan-400 to-blue-200 shadow-[0_0_16px_rgba(56,189,248,0.3)]",
    amber: "from-amber-300 via-orange-400 to-yellow-200 shadow-[0_0_16px_rgba(251,191,36,0.32)]",
    rose: "from-rose-300 via-fuchsia-400 to-orange-200 shadow-[0_0_16px_rgba(251,113,133,0.3)]",
  }[tone] ?? "from-slate-300 via-slate-200 to-white";

  return (
    <div>
      <div className="flex items-center justify-between text-[0.58rem] uppercase tracking-[0.18em] text-white/55">
        <span>Charge</span>
        <span>{label || `${clampPercent(progress)}%`}</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full border border-white/10 bg-black/35">
        <Motion.div
          className={`h-full rounded-full bg-gradient-to-r ${palette}`}
          initial={false}
          animate={{ width: `${clampPercent(progress)}%` }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

function ResourceCard({
  icon,
  label,
  value,
  caption,
  progress = 0,
  progressLabel = "",
  tone = "emerald",
}) {
  const toneStyles = {
    emerald: {
      shell: "border-emerald-300/18 bg-[linear-gradient(180deg,rgba(7,18,20,0.74)_0%,rgba(3,10,14,0.52)_100%)]",
      glow: "shadow-[0_16px_30px_rgba(16,185,129,0.16)]",
      iconWrap: "bg-emerald-400/12 text-emerald-200 ring-1 ring-emerald-300/20",
    },
    sky: {
      shell: "border-sky-300/18 bg-[linear-gradient(180deg,rgba(8,18,28,0.78)_0%,rgba(4,10,18,0.56)_100%)]",
      glow: "shadow-[0_16px_30px_rgba(56,189,248,0.16)]",
      iconWrap: "bg-sky-400/12 text-sky-200 ring-1 ring-sky-300/20",
    },
    amber: {
      shell: "border-amber-300/18 bg-[linear-gradient(180deg,rgba(28,20,8,0.8)_0%,rgba(19,11,3,0.56)_100%)]",
      glow: "shadow-[0_16px_30px_rgba(245,158,11,0.16)]",
      iconWrap: "bg-amber-400/12 text-amber-200 ring-1 ring-amber-300/20",
    },
    rose: {
      shell: "border-rose-300/18 bg-[linear-gradient(180deg,rgba(28,10,14,0.8)_0%,rgba(15,6,10,0.56)_100%)]",
      glow: "shadow-[0_16px_30px_rgba(244,63,94,0.16)]",
      iconWrap: "bg-rose-400/12 text-rose-200 ring-1 ring-rose-300/20",
    },
  }[tone];

  return (
    <Motion.div
      layout
      whileHover={{ scale: 1.018, y: -2 }}
      transition={{ duration: 0.2 }}
      className={`rounded-[1.35rem] border p-3 text-white backdrop-blur-xl max-[480px]:backdrop-blur-md ${toneStyles.shell} ${toneStyles.glow}`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] ${toneStyles.iconWrap}`}>
          <StrategyIcon icon={icon} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.62rem] uppercase tracking-[0.28em] text-white/58">{label}</p>
          <Motion.p
            key={`${label}-${value}`}
            initial={{ opacity: 0.4, scale: 0.96, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="mt-1 text-[1.2rem] font-black leading-none tracking-tight text-white"
          >
            {value}
          </Motion.p>
          <p className="mt-1 text-[0.68rem] leading-4 text-white/58">{caption}</p>
        </div>
      </div>
      <div className="mt-3">
        <ResourceBar progress={progress} progressLabel={progressLabel} label={progressLabel} tone={tone} />
      </div>
    </Motion.div>
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

function TopMenuButton({
  icon,
  label,
  active = false,
  badge = "",
  className = "",
  ...props
}) {
  const activeClass = active
    ? "border-white/22 bg-white/16 text-white shadow-[0_16px_36px_rgba(14,165,233,0.18)]"
    : "border-white/10 bg-white/8 text-white/82 hover:border-white/18 hover:bg-white/14";

  return (
    <Motion.button
      {...props}
      whileHover={{ scale: 1.05, y: -2 }}
      whileTap={{ scale: 0.98, y: 1 }}
      className={`relative flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 rounded-full border px-4 py-2 text-[0.62rem] font-bold uppercase tracking-[0.2em] backdrop-blur-xl transition disabled:cursor-not-allowed disabled:opacity-50 max-[480px]:min-h-12 max-[480px]:px-3 ${activeClass} ${className}`}
    >
      <StrategyIcon icon={icon} className="h-[1.05rem] w-[1.05rem]" />
      <span>{label}</span>
      {badge ? (
        <span className="absolute -right-1 -top-1 rounded-full border border-emerald-200/30 bg-emerald-400/22 px-1.5 py-0.5 text-[0.52rem] tracking-[0.12em] text-emerald-50">
          {badge}
        </span>
      ) : null}
    </Motion.button>
  );
}

export default function GamePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const gameRootRef = useRef(null);
  const gameRef = useRef(null);
  const chatSocketRef = useRef(null);
  const backendRetryAfterRef = useRef(0);
  const backendWarningShownRef = useRef(false);
  const activeSession = getSession();
  const [clock, setClock] = useState(() => Date.now());
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
  const [mobileHudOpen, setMobileHudOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

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

  const upgradeRemainingMs = selectedPlacedBuilding?.upgradeCompleteAt
    ? Math.max(0, Number(selectedPlacedBuilding.upgradeCompleteAt) - clock)
    : 0;
  const upgradeMinutes = Math.floor(upgradeRemainingMs / 60000);
  const upgradeSeconds = Math.floor((upgradeRemainingMs % 60000) / 1000);
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
  const wageRemainingMs = selectedPlacedBuilding?.nextWageAt
    ? Math.max(0, Number(selectedPlacedBuilding.nextWageAt) - clock)
    : 0;
  const wageHours = Math.floor(wageRemainingMs / 3600000);
  const wageMinutes = Math.floor((wageRemainingMs % 3600000) / 60000);
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
  const nextRankPoints = Math.max(profileWarPoints + 1, Number(activeSession?.nextRankPoints ?? 100) || 100);
  const musicVolumePercent = musicStatus?.volumePercent ?? Math.round((musicStatus?.volume ?? 0) * 100);
  const canLowerMusicVolume = musicVolumePercent > 0;
  const canRaiseMusicVolume = musicVolumePercent < 100;
  const woodStored = Math.max(0, Number(gameState.totalMachineGold ?? 0) || 0);
  const woodCapacity = Math.max(1, Number(gameState.totalMachineCapacity ?? 0) || 1);
  const goldTarget = Math.max(
    2000,
    Number(upgradeCost || 0),
    Number(selectedPlacedBuilding?.tankCost ?? 0) || 0,
    Number(selectedPlacedBuilding?.chopperCost ?? 0) || 0
  );
  const energyTarget = Math.max(
    6,
    Number(gameState.energyMachineLimit ?? 1) * 3,
    Number(selectedPlacedBuilding?.tankRechargeCost ?? 0) || 0,
    Number(selectedPlacedBuilding?.chopperRechargeCost ?? 0) || 0
  );
  const troopTarget = Math.max(
    5,
    ((Number(gameState.tentLimit ?? 0) || 0) * 5)
      + (Number(gameState.battleTankLimit ?? 0) || 0)
      + (Number(gameState.skyportLimit ?? 0) || 0)
  );
  const commandCenterProgress = clampPercent(((Number(gameState.townHallLevel ?? 1) || 1) / 2) * 100);
  const resourceCards = [
    {
      id: "gold",
      icon: "gold",
      label: "Gold",
      value: formatCompactNumber(gameState.gold),
      caption: `Battle fund ready for upgrades and recruits`,
      progress: (Math.max(0, Number(gameState.gold ?? 0) || 0) / goldTarget) * 100,
      progressLabel: `${formatCompactNumber(gameState.gold)}/${formatCompactNumber(goldTarget)}`,
      tone: "amber",
    },
    {
      id: "energy",
      icon: "energy",
      label: "Energy",
      value: formatCompactNumber(gameState.energy ?? 0),
      caption: "Fuel for charges, choppers, and support systems",
      progress: (Math.max(0, Number(gameState.energy ?? 0) || 0) / energyTarget) * 100,
      progressLabel: `${formatCompactNumber(gameState.energy ?? 0)}/${formatCompactNumber(energyTarget)}`,
      tone: "sky",
    },
    {
      id: "wp",
      icon: "war",
      label: "War Points",
      value: formatCompactNumber(profileWarPoints),
      caption: `Next rank unlocks at ${formatCompactNumber(nextRankPoints)} WP`,
      progress: (profileWarPoints / nextRankPoints) * 100,
      progressLabel: `${formatCompactNumber(profileWarPoints)}/${formatCompactNumber(nextRankPoints)}`,
      tone: "rose",
    },
    {
      id: "troops",
      icon: "troops",
      label: "Troops",
      value: formatCompactNumber(gameState.totalArmyUnits ?? 0),
      caption: `${gameState.totalTanks ?? 0} tanks • ${gameState.totalHelicopters ?? 0} choppers`,
      progress: ((Number(gameState.totalArmyUnits ?? 0) || 0) / troopTarget) * 100,
      progressLabel: `${formatCompactNumber(gameState.totalArmyUnits ?? 0)}/${formatCompactNumber(troopTarget)}`,
      tone: "emerald",
    },
    {
      id: "base",
      icon: "base",
      label: "Command Center",
      value: `Lv ${gameState.townHallLevel ?? 1}`,
      caption: `${gameState.commandCenters ?? 0}/${gameState.commandCenterLimit ?? 1} built`,
      progress: commandCenterProgress,
      progressLabel: `${gameState.townHallLevel ?? 1}/2`,
      tone: "amber",
    },
    {
      id: "wood",
      icon: "wood",
      label: "Wood Machine",
      value: gameState.fullWoodMachines > 0
        ? `${gameState.fullWoodMachines} Full`
        : `${formatCompactNumber(woodStored)}/${formatCompactNumber(woodCapacity)}`,
      caption: `${gameState.woodMachines ?? 0}/${gameState.woodMachineLimit ?? 0} active machines`,
      progress: (woodStored / woodCapacity) * 100,
      progressLabel: `${formatCompactNumber(woodStored)}/${formatCompactNumber(woodCapacity)}`,
      tone: "rose",
    },
  ];
  const topMenuItems = [
    {
      id: "chat",
      icon: "chat",
      label: "Chat",
      badge: onlineCount > 0 ? String(onlineCount) : "",
      active: chatOpen,
      onClick: () => {
        setChatOpen((open) => !open);
        setMobileMenuOpen(false);
      },
    },
    {
      id: "leaderboard",
      icon: "leaderboard",
      label: "Board",
      active: leaderboardOpen,
      onClick: () => {
        handleOpenLeaderboard();
        setMobileMenuOpen(false);
      },
    },
    {
      id: "profile",
      icon: "profile",
      label: "Profile",
      active: false,
      onClick: () => {
        setMobileMenuOpen(false);
        navigate("/profile", { state: { backgroundLocation: location } });
      },
    },
    {
      id: "shop",
      icon: "shop",
      label: shopOpen ? "Hide" : "Shop",
      active: shopOpen,
      onClick: () => {
        setShopOpen((open) => !open);
        setMobileMenuOpen(false);
      },
    },
    {
      id: "music",
      icon: "music",
      label: "Music",
      active: musicPanelOpen,
      onClick: () => {
        handleToggleMusicPanel();
      },
    },
  ];
  const actionButtonBase = "min-h-12 rounded-[1rem] border px-3 py-2 text-[0.68rem] font-black uppercase tracking-[0.16em] transition duration-200 hover:-translate-y-0.5 active:translate-y-[1px] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-45";
  const actionButtonStyles = {
    amber: `${actionButtonBase} border-amber-300/15 bg-amber-400 text-slate-950 shadow-[0_10px_24px_rgba(251,191,36,0.22)] hover:bg-amber-300`,
    sky: `${actionButtonBase} border-sky-300/15 bg-sky-400 text-sky-950 shadow-[0_10px_24px_rgba(56,189,248,0.2)] hover:bg-sky-300`,
    emerald: `${actionButtonBase} border-emerald-300/15 bg-emerald-400 text-emerald-950 shadow-[0_10px_24px_rgba(16,185,129,0.22)] hover:bg-emerald-300`,
    rose: `${actionButtonBase} border-rose-300/18 bg-rose-600 text-white shadow-[0_10px_24px_rgba(225,29,72,0.24)] hover:bg-rose-500`,
    violet: `${actionButtonBase} border-violet-300/16 bg-violet-500 text-white shadow-[0_10px_24px_rgba(139,92,246,0.22)] hover:bg-violet-400`,
    cyan: `${actionButtonBase} border-cyan-300/15 bg-cyan-400 text-slate-950 shadow-[0_10px_24px_rgba(34,211,238,0.22)] hover:bg-cyan-300`,
    orange: `${actionButtonBase} border-orange-300/15 bg-orange-400 text-slate-950 shadow-[0_10px_24px_rgba(251,146,60,0.22)] hover:bg-orange-300`,
    slate: `${actionButtonBase} border-white/10 bg-white/84 text-slate-950 shadow-[0_10px_24px_rgba(255,255,255,0.12)] hover:bg-white`,
  };

  return (
    <main className="font-black-ops min-h-screen bg-[#061310] text-white">
      <section className="relative h-screen w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_26%),linear-gradient(180deg,#11211a_0%,#081410_44%,#06110e_100%)]">
        <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_center,transparent_18%,rgba(2,6,23,0.14)_58%,rgba(2,6,23,0.44)_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-40 bg-[linear-gradient(180deg,rgba(2,6,23,0.54)_0%,rgba(2,6,23,0)_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-52 bg-[linear-gradient(180deg,rgba(2,6,23,0)_0%,rgba(2,6,23,0.56)_100%)]" />

        <Motion.div
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 sm:p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="pointer-events-auto md:hidden">
              <Motion.button
                type="button"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setMobileHudOpen((open) => !open)}
                className="flex min-h-12 items-center gap-2 rounded-full border border-white/12 bg-slate-950/48 px-4 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-white shadow-[0_16px_28px_rgba(2,6,23,0.24)] backdrop-blur-md"
              >
                <StrategyIcon icon={mobileHudOpen ? "close" : "menu"} className="h-4 w-4" />
                HUD
              </Motion.button>
            </div>

            <Motion.aside
              initial={false}
              animate={mobileHudOpen ? { x: 0, opacity: 1 } : { x: -28, opacity: 0 }}
              transition={{ duration: 0.24 }}
              className={`pointer-events-auto fixed inset-y-3 left-3 z-30 w-[min(19rem,calc(100vw-1.5rem))] overflow-hidden rounded-[1.75rem] border border-white/12 bg-[linear-gradient(180deg,rgba(8,19,19,0.78)_0%,rgba(5,12,16,0.66)_100%)] p-3 shadow-[0_24px_60px_rgba(2,6,23,0.42)] backdrop-blur-xl max-[480px]:backdrop-blur-md md:static md:w-[18.5rem] md:translate-x-0 md:opacity-100 md:shadow-[0_22px_52px_rgba(2,6,23,0.28)] ${mobileHudOpen ? "" : "max-md:pointer-events-none"}`}
            >
              <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.03)_100%)] p-4">
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-300/10 blur-2xl" />
                <p className="text-[0.62rem] uppercase tracking-[0.36em] text-emerald-200/78">Base Command</p>
                <h2 className="mt-2 text-[1.3rem] font-black leading-none text-white">{profileName}</h2>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-[0.18em] text-white/62">
                  <span className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1">{profileId}</span>
                  <span className="rounded-full border border-amber-300/20 bg-amber-400/12 px-2.5 py-1 text-amber-100">{profileRank}</span>
                </div>
              </div>

              <div className="mt-3 grid gap-2">
                {resourceCards.map((item) => (
                  <ResourceCard
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    value={item.value}
                    caption={item.caption}
                    progress={item.progress}
                    progressLabel={item.progressLabel}
                    tone={item.tone}
                  />
                ))}
              </div>
            </Motion.aside>

            <div className="ml-auto flex items-start gap-2">
              <div className="pointer-events-auto relative md:hidden">
                <Motion.button
                  type="button"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setMobileMenuOpen((open) => !open)}
                  className="flex min-h-12 items-center gap-2 rounded-full border border-white/12 bg-slate-950/48 px-4 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-white shadow-[0_16px_28px_rgba(2,6,23,0.24)] backdrop-blur-md"
                >
                  <StrategyIcon icon={mobileMenuOpen ? "close" : "menu"} className="h-4 w-4" />
                  Menu
                </Motion.button>

                <AnimatePresence>
                  {mobileMenuOpen ? (
                    <Motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.96 }}
                      className="absolute right-0 top-full mt-3 w-[min(19rem,calc(100vw-1.5rem))] rounded-[1.6rem] border border-white/12 bg-slate-950/72 p-3 shadow-[0_24px_60px_rgba(2,6,23,0.44)] backdrop-blur-xl"
                    >
                      <div className="grid grid-cols-3 gap-2">
                        {topMenuItems.map((item) => (
                          <TopMenuButton
                            key={item.id}
                            icon={item.icon}
                            label={item.label}
                            badge={item.badge}
                            active={item.active}
                            onClick={item.onClick}
                            className="w-full"
                          />
                        ))}
                      </div>

                      {musicPanelOpen ? (
                        <div className="mt-3 rounded-[1.2rem] border border-white/10 bg-black/22 p-3">
                          <button
                            type="button"
                            onClick={handleToggleMusicMute}
                            className="min-h-12 w-full rounded-[1rem] border border-white/10 bg-white/6 px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-violet-100 transition hover:bg-white/10"
                          >
                            {musicStatus?.isMuted ? "Unmute Audio" : "Mute Audio"}
                          </button>

                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={handleLowerMusicVolume}
                              disabled={!canLowerMusicVolume}
                              className="min-h-12 rounded-[1rem] border border-white/10 bg-white/6 px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Volume -
                            </button>
                            <button
                              type="button"
                              onClick={handleRaiseMusicVolume}
                              disabled={!canRaiseMusicVolume}
                              className="min-h-12 rounded-[1rem] border border-white/10 bg-white/6 px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Volume +
                            </button>
                          </div>

                          <p className="mt-3 text-center text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-white/64">
                            {musicStatus?.isMuted ? "Muted" : `Volume ${musicVolumePercent}%`}
                          </p>
                        </div>
                      ) : null}
                    </Motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              <div className="pointer-events-auto hidden items-center gap-2 md:flex">
                {topMenuItems.map((item) => (
                  <TopMenuButton
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    badge={item.badge}
                    active={item.active}
                    onClick={item.onClick}
                  />
                ))}
              </div>

              <div className="pointer-events-auto relative hidden md:block">
                {musicPanelOpen ? (
                  <div className="absolute right-0 top-full z-20 mt-3 min-w-[12rem] rounded-[1.35rem] border border-white/10 bg-slate-950/86 p-3 shadow-[0_18px_40px_rgba(2,6,23,0.35)] backdrop-blur-xl">
                    <button
                      type="button"
                      onClick={handleToggleMusicMute}
                      className="min-h-12 w-full rounded-[1rem] border border-white/10 bg-white/6 px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-violet-100 transition hover:bg-white/10"
                    >
                      {musicStatus?.isMuted ? "Unmute Audio" : "Mute Audio"}
                    </button>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleLowerMusicVolume}
                        disabled={!canLowerMusicVolume}
                        className="min-h-12 rounded-[1rem] border border-white/10 bg-white/6 px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Volume -
                      </button>
                      <button
                        type="button"
                        onClick={handleRaiseMusicVolume}
                        disabled={!canRaiseMusicVolume}
                        className="min-h-12 rounded-[1rem] border border-white/10 bg-white/6 px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Volume +
                      </button>
                    </div>

                    <p className="mt-3 text-center text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-white/64">
                      {musicStatus?.isMuted ? "Muted" : `Volume ${musicVolumePercent}%`}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </Motion.div>

        <div
          ref={gameRootRef}
          className="relative z-10 h-full w-full overflow-hidden pt-18 md:pt-0"
        />

        <AnimatePresence>
        {selectedPlacedBuilding ? (
          <Motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22 }}
            className="pointer-events-none absolute inset-x-0 bottom-22 z-20 flex justify-center px-3 md:bottom-4"
          >
            <div
              className="pointer-events-auto w-full max-w-[24rem] rounded-[1.7rem] border border-white/12 bg-[linear-gradient(180deg,rgba(8,17,23,0.9)_0%,rgba(4,10,16,0.78)_100%)] p-3 text-white shadow-[0_22px_60px_rgba(2,6,23,0.38)] backdrop-blur-xl max-[480px]:rounded-[1.5rem] max-[480px]:p-3"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.9rem)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.6rem] uppercase tracking-[0.28em] text-cyan-200/72">Selected Structure</p>
                  <h3 className="mt-1 truncate text-[1rem] font-black text-white">{selectedPlacedBuilding.name}</h3>
                </div>
                <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-400/12 px-3 py-1 text-[0.64rem] font-bold uppercase tracking-[0.16em] text-cyan-100">
                  Lv {selectedPlacedBuilding.level ?? 1}
                </span>
              </div>

              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between text-[0.68rem] uppercase tracking-[0.16em] text-white/58">
                  <span>HP</span>
                  <span className="font-bold text-[0.74rem] text-white">{selectedPlacedBuilding.currentHp ?? 0}/{selectedPlacedBuilding.maxHp ?? 0}</span>
                </div>
                <div className="relative h-2.5 overflow-hidden rounded-full border border-white/8 bg-black/40">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#22c55e_0%,#86efac_42%,#d9f99d_100%)] shadow-[0_0_18px_rgba(34,197,94,0.24)] transition-all duration-500"
                    style={{ width: `${Math.max(0, Math.min(100, selectedPlacedBuilding.hpPercent ?? 100))}%` }}
                  />
                </div>
              </div>

              <div className="mt-3 grid gap-1 text-[0.74rem]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-white/55">Status</span>
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
                    <span className="text-white/55">Stored Gold</span>
                    <span className="font-bold text-white">
                      {selectedPlacedBuilding.machineGold ?? 0}/{selectedPlacedBuilding.maxGold ?? 250}
                    </span>
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "energy-machine" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/55">Stored Energy</span>
                    <span className="font-bold text-white">
                      {selectedPlacedBuilding.machineGold ?? 0}/{selectedPlacedBuilding.maxGold ?? 3}
                    </span>
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "battle-tank" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/55">Tank</span>
                    <span className="font-bold text-white">
                      {selectedPlacedBuilding.hasTank ? "Tank Ready" : `${selectedPlacedBuilding.tankCost ?? 5000} gold`}
                    </span>
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "battle-tank" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/55">Charge</span>
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
                    <span className="text-white/55">Chopper</span>
                    <span className="font-bold text-white">
                      {selectedPlacedBuilding.hasChopper ? "Chopper Ready" : `${selectedPlacedBuilding.chopperCost ?? 0} gold`}
                    </span>
                  </div>
                ) : null}
                {selectedPlacedBuilding.type === "skyport" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/55">Charge</span>
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
                {selectedPlacedBuilding.isUpgrading ? (
                  <p className="pt-px text-[10px] font-semibold text-amber-300">
                    Upgrading... {upgradeMinutes}:{String(upgradeSeconds).padStart(2, "0")}
                  </p>
                ) : (selectedPlacedBuilding.level ?? 1) < upgradeCap ? (
                  <p className="pt-px text-[10px] font-semibold text-emerald-300">
                    Need {upgradeCostLabel} to upgrade
                  </p>
                ) : blockedByTownHall ? (
                  <p className="pt-px text-[10px] font-semibold text-rose-300">
                    Upgrade main base first
                  </p>
                ) : null}
                {(selectedPlacedBuilding.type === "tent" || selectedPlacedBuilding.type === "command-center") && (selectedPlacedBuilding.soldierCount ?? 0) > 0 ? (
                  <p className={`pt-px text-[10px] font-semibold ${
                    selectedPlacedBuilding.isHungry ? "text-rose-300" : "text-sky-300"
                  }`}>
                    {selectedPlacedBuilding.isHungry
                      ? "Gutom na sila"
                      : `Food: ${wageHours}h ${String(wageMinutes).padStart(2, "0")}m`}
                  </p>
                ) : null}
              </div>

              {selectedPlacedBuilding.type === "tent" ? (
                <div className="mt-3">
                  <label className="mb-1.5 block text-[0.68rem] uppercase tracking-[0.16em] text-white/52">Remove Count</label>
                  <input
                    type="number"
                    min="1"
                    max={Math.max(1, selectedPlacedBuilding.soldierCount ?? 1)}
                    value={removeSoldierCount}
                    onChange={(event) => setRemoveSoldierCount(event.target.value)}
                    className="h-12 w-full rounded-[1rem] border border-white/10 bg-black/35 px-3 text-sm font-bold text-white outline-none transition focus:border-rose-400"
                  />
                </div>
              ) : null}

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={handleMoveBuilding}
                  className={actionButtonStyles.amber}
                >
                  Move
                </button>

                <button
                  type="button"
                  onClick={handleUpgradeBuilding}
                  disabled={!canUpgrade}
                  className={actionButtonStyles.sky}
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
                    className={actionButtonStyles.slate}
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
                      className={actionButtonStyles.emerald}
                    >
                      Collect
                    </button>
                    <button
                      type="button"
                      onClick={handleCollectAllWoodMachineGold}
                      disabled={selectedPlacedBuilding.isUpgrading}
                      className={actionButtonStyles.amber}
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
                    className={actionButtonStyles.cyan}
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
                      className={actionButtonStyles.violet}
                    >
                      Recruit
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveSoldiers}
                      disabled={!canRemoveSoldier || parsedRemoveSoldierCount > (selectedPlacedBuilding.soldierCount ?? 0)}
                      className={actionButtonStyles.rose}
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleSoldierSleep}
                      disabled={!canToggleSoldierSleep}
                      className={actionButtonStyles.sky}
                    >
                      {selectedPlacedBuilding.isSleeping ? "Wake" : "Sleep"}
                    </button>
                    <button
                      type="button"
                      onClick={handleFeedSoldiers}
                      disabled={!canFeedSoldiers}
                      className={actionButtonStyles.emerald}
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
                      className={actionButtonStyles.violet}
                    >
                      Recruit
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleSoldierSleep}
                      disabled={!canToggleSoldierSleep}
                      className={actionButtonStyles.sky}
                    >
                      {selectedPlacedBuilding.isSleeping ? "Wake All" : "Sleep All"}
                    </button>
                    <button
                      type="button"
                      onClick={handleFeedSoldiers}
                      disabled={!canFeedSoldiers}
                      className={actionButtonStyles.emerald}
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
                      className={actionButtonStyles.cyan}
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
                      className={actionButtonStyles.cyan}
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
                        className={actionButtonStyles.cyan}
                      >
                        {(selectedPlacedBuilding.chopperShotsRemaining ?? 0) >= (selectedPlacedBuilding.chopperMaxShots ?? 15)
                          ? "Chopper Full"
                          : `Charge ${selectedPlacedBuilding.chopperRechargeCost ?? HELICOPTER_ENERGY_COST}E`}
                      </button>
                      <button
                        type="button"
                        onClick={handleSellChopper}
                        disabled={!canSellChopper}
                        className={actionButtonStyles.orange}
                      >
                        Sell Chop
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleBuyChopper}
                      disabled={!canBuyChopper}
                      className={actionButtonStyles.cyan}
                    >
                      Buy Chop
                    </button>
                  )
                ) : null}

                {canSellBuilding ? (
                  <button
                    type="button"
                    onClick={handleSellBuilding}
                    className={actionButtonStyles.rose}
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
          animate={{
            opacity: 1,
            x: 0,
            scale: canStartWar ? [1, 1.03, 1] : 1,
            boxShadow: canStartWar
              ? [
                "0 18px 36px rgba(244,63,94,0.28)",
                "0 24px 52px rgba(249,115,22,0.42)",
                "0 18px 36px rgba(244,63,94,0.28)",
              ]
              : "0 18px 36px rgba(100,116,139,0.18)",
          }}
          transition={{ duration: 0.45, delay: 0.12 }}
          className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2 md:bottom-10 md:left-5 md:translate-x-0"
        >
          <Motion.button
            type="button"
            onClick={handleStartWar}
            disabled={!canStartWar}
            animate={canStartWar
              ? {
                scale: [1, 1.03, 1],
                boxShadow: [
                  "0 22px 52px rgba(244,63,94,0.32)",
                  "0 28px 62px rgba(249,115,22,0.46)",
                  "0 22px 52px rgba(244,63,94,0.32)",
                ],
              }
              : {
                scale: 1,
                boxShadow: "0 16px 34px rgba(100,116,139,0.18)",
              }}
            transition={{
              duration: canStartWar ? 1.8 : 0.2,
              repeat: canStartWar ? Infinity : 0,
              ease: "easeInOut",
            }}
            whileHover={canStartWar ? { scale: 1.05, y: -3 } : undefined}
            whileTap={canStartWar ? { scale: 0.97, y: 2 } : undefined}
            className="pointer-events-auto relative min-h-14 min-w-[14rem] overflow-hidden rounded-[1.45rem] border border-orange-200/26 bg-[linear-gradient(135deg,rgba(239,68,68,0.96)_0%,rgba(249,115,22,0.96)_62%,rgba(251,191,36,0.88)_100%)] px-7 py-4 text-sm font-black uppercase tracking-[0.28em] text-white shadow-[0_22px_52px_rgba(244,63,94,0.32)] transition disabled:cursor-not-allowed disabled:opacity-45 md:min-w-[12rem]"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
          >
            <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0)_38%,rgba(127,29,29,0.18)_100%)]" />
            <span className="absolute inset-[2px] rounded-[1.3rem] border border-white/14" />
            <span className="relative flex items-center justify-center gap-2">
              <StrategyIcon icon="war" className="h-[1.05rem] w-[1.05rem]" />
              Start War
            </span>
          </Motion.button>
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
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-120 rounded-[1.4rem] border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.88)_0%,rgba(15,23,42,0.74)_100%)] p-4 text-white shadow-[0_20px_60px_rgba(2,6,23,0.34)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.3em] text-amber-300/70">Leaderboard</p>
                  <h3 className="mt-1 text-lg font-black">Top Commanders</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Rank, soldiers, tanks, and choppers per player.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setLeaderboardOpen(false)}
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              {leaderboardState.currentPlayerRank ? (
                <p className="mt-3 text-xs font-semibold text-amber-200">
                  Your Rank: #{leaderboardState.currentPlayerRank}
                </p>
              ) : null}

              {leaderboardState.loading ? (
                <p className="mt-4 text-sm text-slate-300">Loading leaderboard...</p>
              ) : leaderboardState.error ? (
                <p className="mt-4 text-sm font-semibold text-rose-300">{leaderboardState.error}</p>
              ) : (
                <div className="mt-4 max-h-96 overflow-y-auto rounded-2xl border border-white/8 bg-slate-950/45">
                  <div className="grid grid-cols-[3rem_minmax(0,1fr)_3.6rem_3.6rem_3.8rem] gap-2 border-b border-white/8 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                    <span>Rank</span>
                    <span>Player</span>
                    <span>Soldier</span>
                    <span>Tank</span>
                    <span>Chopper</span>
                  </div>

                  {leaderboardState.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="grid grid-cols-[3rem_minmax(0,1fr)_3.6rem_3.6rem_3.8rem] gap-2 border-b border-white/6 px-3 py-2 text-xs last:border-b-0"
                    >
                      <span className="font-black text-amber-200">#{entry.rank}</span>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-white">{entry.name}</p>
                        <p className="truncate text-[10px] text-slate-400">
                          {entry.rankName} • {entry.warPoints} WP
                        </p>
                      </div>
                      <span className="font-bold text-sky-200">{entry.soldiers}</span>
                      <span className="font-bold text-cyan-200">{entry.tanks}</span>
                      <span className="font-bold text-emerald-200">{entry.choppers}</span>
                    </div>
                  ))}

                  {!leaderboardState.entries.length ? (
                    <p className="px-3 py-4 text-sm text-slate-400">No players found.</p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {chatOpen ? (
          <div className="pointer-events-none absolute bottom-4 right-4 z-20 flex w-full max-w-88 justify-end">
            <div className="pointer-events-auto w-full rounded-[1.2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(15,23,42,0.9)_0%,rgba(15,23,42,0.78)_100%)] p-3 text-white shadow-[0_18px_50px_rgba(2,6,23,0.34)] backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.26em] text-emerald-300/70">Live Chat</p>
                  <h3 className="mt-1 text-base font-black">Online: {onlineCount}</h3>
                </div>

                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <div className="mt-3 h-72 overflow-y-auto rounded-2xl border border-white/8 bg-slate-950/45 px-3 py-2">
                {chatMessages.length ? (
                  chatMessages.map((message) => (
                    <div key={message.id} className="mb-2 last:mb-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-200">
                        {message.name}
                      </p>
                      <p className="mt-0.5 wrap-break-word text-sm text-slate-100">{message.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">No messages yet.</p>
                )}
              </div>

              <div className="mt-3 flex gap-2">
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
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                />
                <button
                  type="button"
                  onClick={handleSendChat}
                  className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-slate-950 transition hover:bg-emerald-300"
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
            className="absolute inset-x-0 bottom-0 z-10 p-3 sm:p-4"
          >
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
