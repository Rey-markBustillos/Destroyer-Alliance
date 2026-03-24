export default function Buttons({ onPrimaryClick, onSecondaryClick }) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onPrimaryClick}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-white font-medium hover:bg-emerald-500"
      >
        Build
      </button>
      <button
        onClick={onSecondaryClick}
        className="rounded-lg bg-slate-700 px-4 py-2 text-white font-medium hover:bg-slate-600"
      >
        Cancel
      </button>
    </div>
  );
}
