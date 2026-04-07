import { useMemo, useState } from "react";
import { motion as Motion } from "framer-motion";

import { BUILDING_LIST } from "../game/utils/buildingTypes";

export default function BuildingShop({
  gold,
  onSelectBuilding,
  selectedBuilding,
  onClose,
  woodMachineCount = 0,
  woodMachineLimit = 4,
  energyMachineCount = 0,
  energyMachineLimit = 2,
  commandCenterCount = 0,
  commandCenterLimit = 1,
  tentCount = 0,
  tentLimit = 4,
  battleTankCount = 0,
  battleTankLimit = 1,
  skyportCount = 0,
  skyportLimit = 1,
  airDefenseCount = 0,
  airDefenseLimit = 0,
}) {
  return (
    <Motion.div
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="mobile-landscape-panel mobile-safe-solid-panel mx-auto flex w-full flex-col overflow-hidden rounded-[1.1rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_28%),linear-gradient(135deg,rgba(8,20,38,0.95)_0%,rgba(14,34,46,0.9)_50%,rgba(10,26,34,0.94)_100%)] p-3 shadow-[0_22px_70px_rgba(2,6,23,0.42)] backdrop-blur-2xl min-[901px]:max-w-5xl min-[901px]:rounded-[1.25rem] min-[901px]:p-4"
    >
      <div className="mobile-safe-effect-layer pointer-events-none absolute inset-x-10 top-0 h-16 rounded-full bg-cyan-300/10 blur-3xl" />

      <div className="relative mb-3 flex shrink-0 flex-col items-start justify-between gap-2 min-[560px]:flex-row min-[901px]:mb-4 min-[901px]:gap-3">
        <div>
          <p className="font-orbitron text-[0.66rem] uppercase tracking-[0.34em] text-cyan-300/80">
            Builder Menu
          </p>
          <h3 className="font-orbitron mt-1 text-xl font-extrabold tracking-[0.08em] text-white">
            Choose A Structure
          </h3>
          <p className="mt-1 text-xs text-slate-300/80 min-[901px]:text-sm">Compact command build menu with visible costs and limits.</p>
        </div>

        <button
          onClick={onClose}
          className="font-orbitron rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white transition duration-200 hover:scale-105 hover:border-cyan-300/30 hover:bg-cyan-400/10 hover:shadow-[0_0_18px_rgba(34,211,238,0.18)] min-[901px]:text-[11px]"
        >
          Close
        </button>
      </div>

      <div className="mobile-landscape-panel-scroll relative min-h-0 pr-1">
        <div className="mobile-landscape-shop-grid relative grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[901px]:gap-3">
          {BUILDING_LIST.map((building) => {
          const canAfford = gold >= building.cost;
          const woodMachineCapReached = building.id === "wood-machine" && woodMachineCount >= woodMachineLimit;
          const energyMachineCapReached = building.id === "energy-machine" && energyMachineCount >= energyMachineLimit;
          const commandCenterCapReached = building.id === "command-center" && commandCenterCount >= commandCenterLimit;
          const tentCapReached = building.id === "tent" && tentCount >= tentLimit;
          const battleTankLocked = building.id === "battle-tank" && battleTankLimit <= 0;
          const battleTankCapReached = building.id === "battle-tank" && battleTankCount >= battleTankLimit;
          const skyportLocked = building.id === "skyport" && skyportLimit <= 0;
          const skyportCapReached = building.id === "skyport" && skyportCount >= skyportLimit;
          const airDefenseLocked = building.id === "air-defense" && airDefenseLimit <= 0;
          const airDefenseCapReached = building.id === "air-defense" && airDefenseCount >= airDefenseLimit && airDefenseLimit > 0;
          const isLockedByRules = woodMachineCapReached
            || energyMachineCapReached
            || commandCenterCapReached
            || tentCapReached
            || battleTankLocked
            || battleTankCapReached
            || skyportLocked
            || skyportCapReached
            || airDefenseLocked
            || airDefenseCapReached;
          const canBuy = canAfford && !isLockedByRules;
          const isSelected = selectedBuilding?.id === building.id;

            return (
              <Motion.button
                key={building.id}
                type="button"
                onClick={() => onSelectBuilding(building)}
                disabled={!canBuy}
                whileHover={canBuy ? { scale: 1.05, y: -2 } : undefined}
                whileTap={canBuy ? { scale: 0.98 } : undefined}
                className={`rounded-2xl border px-2.5 py-2.5 text-left transition duration-200 min-[901px]:rounded-[1.05rem] min-[901px]:px-3 min-[901px]:py-3 ${
                  isSelected
                    ? "border-cyan-300/60 bg-[linear-gradient(180deg,rgba(34,211,238,0.18)_0%,rgba(15,23,42,0.5)_100%)] shadow-[0_0_0_1px_rgba(125,211,252,0.4),0_14px_28px_rgba(34,211,238,0.12)]"
                    : canBuy
                      ? "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07)_0%,rgba(15,23,42,0.36)_100%)] hover:border-cyan-300/35 hover:shadow-[0_0_0_1px_rgba(125,211,252,0.18),0_18px_28px_rgba(2,6,23,0.22)]"
                      : "cursor-not-allowed border-white/5 bg-white/4 opacity-45"
                }`}
              >
              {building.shopImage ? (
                <ShopPreviewImage building={building} />
              ) : (
                <div
                  className="mb-2 flex h-10 w-10 items-center justify-center rounded-[0.95rem] text-[11px] font-black text-slate-950 min-[901px]:mb-3 min-[901px]:h-11 min-[901px]:w-11 min-[901px]:text-xs"
                  style={{ backgroundColor: `#${building.color.toString(16).padStart(6, "0")}` }}
                >
                  {building.label}
                </div>
              )}
              <p className="font-orbitron text-[0.9rem] font-bold text-white min-[901px]:text-[0.95rem]">{building.name}</p>
              <p className="mt-1 min-h-9 text-[10px] leading-4 text-slate-300/80 min-[901px]:min-h-10 min-[901px]:text-[11px] min-[901px]:leading-5">
                {woodMachineCapReached
                  ? `${woodMachineCount}/${woodMachineLimit} Wood Machines`
                  : energyMachineCapReached
                    ? `${energyMachineCount}/${energyMachineLimit} Energy Machines`
                    : commandCenterCapReached
                      ? "Main base already built"
                      : tentCapReached
                        ? `${tentCount}/${tentLimit} Soldier Tents`
                      : battleTankLocked
                        ? "Unlock at Command Center Lv.2"
                      : battleTankCapReached
                        ? `${battleTankCount}/${battleTankLimit} Battle Tanks`
                        : skyportLocked
                          ? "Unlock at Command Center Lv.2"
                          : skyportCapReached
                            ? `${skyportCount}/${skyportLimit} Chopper Bays`
                          : airDefenseLocked
                            ? "Unlock at Command Center Lv.2"
                            : airDefenseCapReached
                              ? `${airDefenseCount}/${airDefenseLimit} Air Defense`
                              : itemizeCost(building.cost)}
              </p>
              </Motion.button>
            );
          })}
        </div>

        <p className="mt-3 text-center text-[11px] leading-5 text-slate-300/75 min-[901px]:mt-4 min-[901px]:text-xs">
          Main base is limited to 1. Wood Machine is 4 at Command Center level 1 and 6 at level 2. Energy Machine is 1 at Command Center level 1 and 2 at level 2. Soldier Tent cap is fixed at {tentLimit} on every Command Center level. Chopper Bay and Battle Tank unlock at Command Center level 2 with a 1-building cap, and Air Defense also unlocks at Command Center level 2 with a 1-building cap.
        </p>
      </div>
    </Motion.div>
  );
}

function itemizeCost(cost) {
  return `${cost} gold`;
}

function ShopPreviewImage({ building }) {
  const sources = useMemo(() => {
    const baseSources = [building.shopImage, ...(building.fallbackShopImages ?? [])];
    return [...new Set(baseSources.filter(Boolean))];
  }, [building.fallbackShopImages, building.shopImage]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const currentSource = sources[sourceIndex] ?? null;

  if (!currentSource) {
    return (
      <div
        className="mb-2 flex h-10 w-10 items-center justify-center rounded-[0.95rem] text-[11px] font-black text-slate-950 min-[901px]:mb-3 min-[901px]:h-11 min-[901px]:w-11 min-[901px]:text-xs"
        style={{ backgroundColor: `#${building.color.toString(16).padStart(6, "0")}` }}
      >
        {building.label}
      </div>
    );
  }

  if ((building.shopSpriteFrames ?? 1) > 1) {
    const safeFrames = Math.max(1, Number(building.shopSpriteFrames) || 1);

    return (
      <div className="mb-2 flex h-16 w-full items-center justify-center overflow-hidden rounded-[0.95rem] border border-white/6 bg-black/20 p-2 min-[901px]:mb-3 min-[901px]:h-20">
        <div
          aria-label={building.name}
          className="mobile-safe-filter h-full max-w-full flex-1 rounded-md bg-contain bg-no-repeat"
          style={{
            aspectRatio: "512 / 516",
            backgroundImage: `url(${currentSource})`,
            backgroundPosition: "center top",
            backgroundRepeat: "no-repeat",
            backgroundSize: `100% ${safeFrames * 100}%`,
            filter: "drop-shadow(0 8px 18px rgba(2, 6, 23, 0.22)) saturate(1.05) contrast(1.04)",
            transform: "translateZ(0)",
          }}
        />
      </div>
    );
  }

  return (
    <div className="mb-2 flex h-16 w-full items-center justify-center overflow-hidden rounded-[0.95rem] border border-white/6 bg-black/20 p-2 min-[901px]:mb-3 min-[901px]:h-20">
      <img
        src={currentSource}
        alt={building.name}
        className="mobile-safe-filter h-full w-full object-contain"
        style={{
          imageRendering: "auto",
          filter: "drop-shadow(0 8px 18px rgba(2, 6, 23, 0.22)) saturate(1.05) contrast(1.04)",
          transform: "translateZ(0)",
        }}
        loading="lazy"
        decoding="async"
        draggable="false"
        onError={() => {
          setSourceIndex((index) => (index < sources.length - 1 ? index + 1 : index));
        }}
      />
    </div>
  );
}
