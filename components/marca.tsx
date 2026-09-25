// Assinatura dos aplicativos Efic: "Efic" em IBM Plex Sans, nome do produto em IBM Plex Serif.
export function Marca({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-[0.28em] ${className}`}>
      <span className="font-marca-sans font-semibold text-slate-800">Efic</span>
      <span className="font-marca-serif font-medium text-marca">Pulse</span>
    </span>
  );
}
