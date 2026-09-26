// Assinatura dos aplicativos Efic: "Efic" em IBM Plex Sans negrito, escuro, colado
// ao nome do produto em IBM Plex Serif itálico, na cor da marca.
export function Marca({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline ${className}`}>
      <span className="font-marca-sans font-bold text-slate-800">Efic</span>
      <span className="font-marca-serif font-normal italic text-marca">Pulse</span>
    </span>
  );
}
