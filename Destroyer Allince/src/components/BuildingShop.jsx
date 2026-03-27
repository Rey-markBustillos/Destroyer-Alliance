import { motion } from "framer-motion";

import { BUILDING_LIST } from "../game/utils/buildingTypes";

export default function BuildingShop({
  gold,
  onSelectBuilding,
  selectedBuilding,
  onClose,
  townHallCount = 0,
  townHallLevel = 1,
  woodMachineCount = 0,
  woodMachineLimit = 4,
  commandCenterCount = 0,
  commandCenterLimit = 2,
  battleTankCount = 0,
  battleTankLimit = 1,
  skyportCount = 0,
  skyportLimit = 1,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="mx-auto w-full max-w-5xl rounded-[1.25rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_28%),linear-gradient(135deg,rgba(8,20,38,0.95)_0%,rgba(14,34,46,0.9)_50%,rgba(10,26,34,0.94)_100%)] p-4 shadow-[0_22px_70px_rgba(2,6,23,0.42)] backdrop-blur-2xl"
    >
      <div className="pointer-events-none absolute inset-x-10 top-0 h-16 rounded-full bg-cyan-300/10 blur-3xl" />

      <div className="relative mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-orbitron text-[0.66rem] uppercase tracking-[0.34em] text-cyan-300/80">
            Builder Menu
          </p>
          <h3 className="font-orbitron mt-1 text-xl font-extrabold tracking-[0.08em] text-white">
            Choose A Structure
          </h3>
          <p className="mt-1 text-sm text-slate-300/80">Compact command build menu with visible costs and limits.</p>
        </div>

        <button
          onClick={onClose}
          className="font-orbitron rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition duration-200 hover:scale-105 hover:border-cyan-300/30 hover:bg-cyan-400/10 hover:shadow-[0_0_18px_rgba(34,211,238,0.18)]"
        >
          Close
        </button>
      </div>

      <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {BUILDING_LIST.map((building) => {
          const canAfford = gold >= building.cost;
          const hasTownHallAlready = building.id === "town-hall" && townHallCount >= 1;
          const woodMachineCapReached = building.id === "wood-machine" && woodMachineCount >= woodMachineLimit;
          const commandCenterCapReached = building.id === "command-center" && commandCenterCount >= commandCenterLimit;
          const battleTankCapReached = building.id === "battle-tank" && battleTankCount >= battleTankLimit;
          const skyportCapReached = building.id === "skyport" && skyportCount >= skyportLimit;
          const isLockedByRules = hasTownHallAlready
            || woodMachineCapReached
            || commandCenterCapReached
            || battleTankCapReached
            || skyportCapReached;
          const canBuy = canAfford && !isLockedByRules;
          const isSelected = selectedBuilding?.id === building.id;

          return (
            <motion.button
              key={building.id}
              type="button"
              onClick={() => onSelectBuilding(building)}
              disabled={!canBuy}
              whileHover={canBuy ? { scale: 1.05, y: -2 } : undefined}
              whileTap={canBuy ? { scale: 0.98 } : undefined}
              className={`rounded-[1.05rem] border px-3 py-3 text-left transition duration-200 ${
                isSelected
                  ? "border-cyan-300/60 bg-[linear-gradient(180deg,rgba(34,211,238,0.18)_0%,rgba(15,23,42,0.5)_100%)] shadow-[0_0_0_1px_rgba(125,211,252,0.4),0_14px_28px_rgba(34,211,238,0.12)]"
                  : canBuy
                    ? "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07)_0%,rgba(15,23,42,0.36)_100%)] hover:border-cyan-300/35 hover:shadow-[0_0_0_1px_rgba(125,211,252,0.18),0_18px_28px_rgba(2,6,23,0.22)]"
                    : "cursor-not-allowed border-white/5 bg-white/4 opacity-45"
              }`}
            >
              {building.shopImage ? (
                <div className="mb-3 flex h-20 w-full items-center justify-center overflow-hidden rounded-[0.95rem] border border-white/6 bg-black/20 p-2">
                  <img
                    src={building.shopImage}
                    alt={building.name}
                    className="h-full w-full object-contain"
                    draggable="false"
                  />
                </div>
              ) : (
                <div
                  className="mb-3 flex h-11 w-11 items-center justify-center rounded-[0.95rem] text-xs font-black text-slate-950"
                  style={{ backgroundColor: `#${building.color.toString(16).padStart(6, "0")}` }}
                >
                  {building.label}
                </div>
              )}
              <p className="font-orbitron text-[0.95rem] font-bold text-white">{building.name}</p>
              <p className="mt-1 min-h-[2.5rem] text-[11px] leading-5 text-slate-300/80">
                {hasTownHallAlready
                  ? "Only 1 Town Hall"
                  : woodMachineCapReached
                    ? `${woodMachineCount}/${woodMachineLimit} Wood Machines`
                    : commandCenterCapReached
                      ? `${commandCenterCount}/${commandCenterLimit} Command Centers`
                      : battleTankCapReached
                        ? `${battleTankCount}/${battleTankLimit} Battle Tanks`
                        : skyportCapReached
                          ? `${skyportCount}/${skyportLimit} Chopper Bays`
                    : itemizeCost(building.cost)}
              </p>
            </motion.button>
          );
        })}
      </div>

      <p className="mt-4 text-center text-xs leading-5 text-slate-300/75">
        Town Hall is limited to 1. Command Center max is {commandCenterLimit}. Chopper Bay and Battle Tank max follow Town Hall level. Wood Machine limit starts at 4 on Town Hall level {townHallLevel}.
      </p>
    </motion.div>
  );
}

function itemizeCost(cost) {
  return `${cost} gold`;
}
