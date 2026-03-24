export default function HUD({ gold = 1000, energy = 500, wave = 1 }) {
  return (
    <aside className="rounded-lg bg-gray-900/80 border border-gray-700 px-3 py-2 text-xs sm:text-sm text-white flex gap-4">
      <span>Gold: {gold}</span>
      <span>Energy: {energy}</span>
      <span>Wave: {wave}</span>
    </aside>
  );
}
