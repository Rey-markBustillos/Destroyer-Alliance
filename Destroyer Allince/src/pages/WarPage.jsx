import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getStoredBuildings } from "../services/buildingStorage";
import { getSession } from "../services/session";

const GRID_ROWS = 7;
const GRID_COLS = 8;
const SEARCH_DELAY_MS = 1500;
const SOLDIER_SPEED_PER_TICK = 0.18;
const SOLDIER_FIRE_RANGE = 0.42;
const SOLDIER_DAMAGE_PER_TICK = 8;

const DUMMY_WAR_TARGET = {
  id: "dummy-raider-001",
  name: "Dummy Raider",
  townHallLevel: 2,
  defense: "Light Base",
  loot: 900,
};

const WALK_TEXTURES = {
  front: ["/assets/army/front/walk.png", "/assets/army/front/walk2.png"],
  back: ["/assets/army/back/backamry.png", "/assets/army/back/backarmy2.png"],
  left: ["/assets/army/left/walk1.png", "/assets/army/left/walk2.png"],
  right: ["/assets/army/right/walk1.png", "/assets/army/right/walk2.png"],
};

const FIRING_TEXTURES = {
  front: "/assets/army/front/firing.png",
  back: "/assets/army/back/firing.png",
  left: "/assets/army/left/firing.png",
  right: "/assets/army/right/firing.png",
};

const INITIAL_STRUCTURES = [
  {
    id: "enemy-town",
    row: 1,
    col: 4,
    image: "/assets/town.png",
    name: "Town Hall",
    health: 180,
  },
  {
    id: "enemy-machine-1",
    row: 3,
    col: 5,
    image: "/assets/machine-wood.png",
    name: "Wood Machine",
    health: 90,
  },
  {
    id: "enemy-machine-2",
    row: 2,
    col: 2,
    image: "/assets/machine-wood.png",
    name: "Wood Machine",
    health: 90,
  },
  {
    id: "enemy-command",
    row: 4,
    col: 3,
    image: "/assets/command center.png",
    name: "Command Center",
    health: 120,
  },
];

const getTileId = (row, col) => `${row}-${col}`;

const getDirectionFromDelta = (dx, dy) => {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }

  return dy >= 0 ? "front" : "back";
};

const getCellCenterPercent = (row, col) => ({
  left: ((col + 0.5) / GRID_COLS) * 100,
  top: ((row + 0.5) / GRID_ROWS) * 100,
});

const getDistance = (aX, aY, bX, bY) => Math.hypot(bX - aX, bY - aY);

export default function WarPage() {
  const navigate = useNavigate();
  const [searchState, setSearchState] = useState("searching");
  const [target, setTarget] = useState(null);
  const [structures, setStructures] = useState(INITIAL_STRUCTURES);
  const [droppedSoldiers, setDroppedSoldiers] = useState([]);

  const totalSoldiers = useMemo(() => {
    const session = getSession();
    const buildings = getStoredBuildings(session);

    return buildings.reduce(
      (total, building) => total + Math.max(0, Number(building?.soldierCount ?? 0) || 0),
      0
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTarget(DUMMY_WAR_TARGET);
      setSearchState("found");
    }, SEARCH_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (searchState !== "found") {
      return undefined;
    }

    const loop = window.setInterval(() => {
      setDroppedSoldiers((currentSoldiers) => {
        if (currentSoldiers.length === 0) {
          return currentSoldiers;
        }

        let nextStructures = structures;
        let structuresChanged = false;

        const updatedSoldiers = currentSoldiers.map((soldier) => {
          const activeStructures = nextStructures.filter((structure) => structure.health > 0);

          if (activeStructures.length === 0) {
            return {
              ...soldier,
              state: "idle",
            };
          }

          let nearestStructure = activeStructures[0];
          let nearestDistance = Number.POSITIVE_INFINITY;

          activeStructures.forEach((structure) => {
            const distance = getDistance(soldier.col, soldier.row, structure.col, structure.row);

            if (distance < nearestDistance) {
              nearestDistance = distance;
              nearestStructure = structure;
            }
          });

          const dx = nearestStructure.col - soldier.col;
          const dy = nearestStructure.row - soldier.row;
          const direction = getDirectionFromDelta(dx, dy);

          if (nearestDistance <= SOLDIER_FIRE_RANGE) {
            nextStructures = nextStructures.map((structure) => {
              if (structure.id !== nearestStructure.id) {
                return structure;
              }

              structuresChanged = true;
              return {
                ...structure,
                health: Math.max(0, structure.health - SOLDIER_DAMAGE_PER_TICK),
              };
            });

            return {
              ...soldier,
              direction,
              state: "firing",
              frameIndex: 0,
            };
          }

          const step = Math.min(SOLDIER_SPEED_PER_TICK, nearestDistance);
          const nextCol = soldier.col + (dx / nearestDistance) * step;
          const nextRow = soldier.row + (dy / nearestDistance) * step;

          return {
            ...soldier,
            col: nextCol,
            row: nextRow,
            direction,
            state: "walk",
            frameIndex: (soldier.frameIndex + 1) % 2,
          };
        });

        if (structuresChanged) {
          setStructures(nextStructures);
        }

        return updatedSoldiers;
      });
    }, 220);

    return () => {
      window.clearInterval(loop);
    };
  }, [searchState, structures]);

  const aliveStructures = structures.filter((structure) => structure.health > 0);
  const availableToDrop = Math.max(0, totalSoldiers - droppedSoldiers.length);
  const battleWon = searchState === "found" && aliveStructures.length === 0;

  const handleDropSoldier = (row, col) => {
    if (searchState !== "found" || availableToDrop <= 0 || battleWon) {
      return;
    }

    if (row < GRID_ROWS - 2) {
      return;
    }

    const tileId = getTileId(row, col);

    setDroppedSoldiers((current) => {
      if (current.some((soldier) => soldier.tileId === tileId)) {
        return current;
      }

      return [
        ...current,
        {
          id: `${tileId}-${current.length}`,
          tileId,
          row,
          col,
          direction: "front",
          state: "walk",
          frameIndex: 0,
        },
      ];
    });
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#4f7b38_0%,#2d4721_55%,#182413_100%)] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.32em] text-rose-300/80">
              War Mode
            </p>
            <h1 className="mt-1 text-2xl font-black">Enemy Village</h1>
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
              <p className="text-sm font-bold text-emerald-200">Deployment</p>
              <p className="mt-2 text-xs text-slate-300">
                Click the bottom two rows to drop your soldiers, then they will march and attack automatically.
              </p>
              <p className="mt-3 text-sm font-semibold text-amber-300">
                Ready to drop: {availableToDrop}
              </p>
              <p className="mt-1 text-sm font-semibold text-sky-300">
                Already deployed: {droppedSoldiers.length}
              </p>
            </div>

            {searchState === "searching" ? (
              <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-bold text-white">Searching for enemy...</p>
                <p className="mt-2 text-xs text-slate-400">
                  Looking for a village target you can raid.
                </p>
              </div>
            ) : target ? (
              <div className="mt-5 rounded-3xl border border-rose-400/20 bg-rose-500/10 p-4">
                <p className="text-lg font-black text-white">{target.name}</p>
                <p className="mt-2 text-xs font-semibold text-amber-300">
                  Town Hall Lv.{target.townHallLevel}
                </p>
                <p className="mt-1 text-xs text-slate-300">Defense: {target.defense}</p>
                <p className="mt-1 text-xs text-emerald-300">
                  Possible loot: {target.loot} gold
                </p>
              </div>
            ) : null}

            {battleWon ? (
              <div className="mt-5 rounded-3xl border border-emerald-400/25 bg-emerald-500/15 p-4">
                <p className="text-sm font-black text-emerald-200">Enemy base cleared</p>
                <p className="mt-2 text-xs text-slate-200">
                  Your soldiers destroyed the dummy village.
                </p>
              </div>
            ) : null}
          </aside>

          <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,#b5da88_0%,#99c56d_48%,#84ae59_100%)] p-4 shadow-[0_24px_80px_rgba(2,6,23,0.25)]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-emerald-900/70">
                  Enemy Village
                </p>
                <p className="mt-1 text-sm font-semibold text-emerald-950">
                  Deploy on the lower tiles and watch your army attack.
                </p>
              </div>
              <p className="text-xs font-semibold text-emerald-950/75">
                Bottom rows = deploy zone
              </p>
            </div>

            <div className="relative overflow-hidden rounded-[2rem] border border-emerald-900/15 bg-[radial-gradient(circle_at_top,#a6d67a_0%,#8abc62_55%,#72a34e_100%)] p-3">
              <div className="grid grid-cols-8 gap-2">
                {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, index) => {
                  const row = Math.floor(index / GRID_COLS);
                  const col = index % GRID_COLS;
                  const tileId = getTileId(row, col);
                  const structure = aliveStructures.find((entry) => entry.row === row && entry.col === col);
                  const droppedSoldier = droppedSoldiers.find((soldier) => soldier.tileId === tileId);
                  const isDeployZone = row >= GRID_ROWS - 2;

                  return (
                    <button
                      key={tileId}
                      type="button"
                      onClick={() => handleDropSoldier(row, col)}
                      disabled={!isDeployZone || Boolean(structure) || Boolean(droppedSoldier) || availableToDrop <= 0}
                      className={`relative flex aspect-square items-center justify-center rounded-2xl border transition ${
                        isDeployZone
                          ? "border-emerald-800/30 bg-emerald-200/55 hover:bg-emerald-200/80"
                          : "border-emerald-900/15 bg-emerald-100/35"
                      }`}
                    >
                      {isDeployZone && !structure && !droppedSoldier ? (
                        <span className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-emerald-900/55">
                          Drop
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {aliveStructures.map((structure) => {
                const position = getCellCenterPercent(structure.row, structure.col);

                return (
                  <div
                    key={structure.id}
                    className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                    style={{
                      left: `${position.left}%`,
                      top: `${position.top}%`,
                    }}
                  >
                    <img
                      src={structure.image}
                      alt={structure.name}
                      className="h-24 w-24 object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.28)]"
                      draggable="false"
                    />
                    <div className="mt-1 rounded-full bg-slate-950/75 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                      {structure.health} HP
                    </div>
                  </div>
                );
              })}

              {droppedSoldiers.map((soldier) => {
                const position = getCellCenterPercent(soldier.row, soldier.col);
                const walkFrames = WALK_TEXTURES[soldier.direction];
                const image =
                  soldier.state === "firing"
                    ? FIRING_TEXTURES[soldier.direction]
                    : walkFrames[soldier.frameIndex % walkFrames.length];

                return (
                  <div
                    key={soldier.id}
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${position.left}%`,
                      top: `${position.top}%`,
                    }}
                  >
                    <img
                      src={image}
                      alt="Attacking soldier"
                      className={`h-12 w-12 object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.32)] ${
                        soldier.state === "firing" ? "scale-110" : ""
                      }`}
                      draggable="false"
                    />
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
