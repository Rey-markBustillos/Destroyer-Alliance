import { BUILDING_LIST } from "../game/utils/buildingTypes";

export default function BuildingShop({
  gold,
  onSelectBuilding,
  selectedBuilding,
  onClose,
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/88 p-3 shadow-[0_20px_50px_rgba(2,6,23,0.45)] backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.3em] text-emerald-300/70">
            Builder Menu
          </p>
          <h3 className="mt-1 text-base font-black text-white">Choose a structure</h3>
        </div>

        <button
          onClick={onClose}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
        >
          Close
        </button>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1.5">
        {BUILDING_LIST.map((building) => {
          const canAfford = gold >= building.cost;
          const isSelected = selectedBuilding?.id === building.id;

          return (
            <button
              key={building.id}
              type="button"
              onClick={() => onSelectBuilding(building)}
              disabled={!canAfford}
              className={`min-w-28 rounded-2xl border px-3 py-3 text-left transition ${
                isSelected
                  ? "border-emerald-300 bg-emerald-400/15 shadow-[0_0_0_1px_rgba(110,231,183,0.4)]"
                  : canAfford
                    ? "border-white/10 bg-white/5 hover:border-emerald-400/40 hover:bg-white/10"
                    : "cursor-not-allowed border-white/5 bg-white/3 opacity-45"
              }`}
            >
              {building.shopImage ? (
                <div className="mb-2 flex h-16 w-full items-center justify-center overflow-hidden rounded-2xl bg-black/15 p-2">
                  <img
                    src={building.shopImage}
                    alt={building.name}
                    className="h-full w-full object-contain"
                    draggable="false"
                  />
                </div>
              ) : (
                <div
                  className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-xs font-black text-slate-950"
                  style={{ backgroundColor: `#${building.color.toString(16).padStart(6, "0")}` }}
                >
                  {building.label}
                </div>
              )}
              <p className="text-sm font-semibold text-white">{building.name}</p>
              <p className="mt-1 text-xs text-slate-400">{building.cost} gold</p>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-slate-400">
        Click a structure, then click a tile to place it. Drag to pan, and use the mouse wheel to zoom.
      </p>
    </div>
  );
}
