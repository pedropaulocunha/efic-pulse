// Logo do Pulse: "Efic" em IBM Plex Serif negrito, um traço fino e "Pulse" em
// IBM Plex Sans normal, azul-acinzentado. O tamanho vem do font-size (className).
export function Marca({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-[0.32em] whitespace-nowrap leading-none ${className}`}
      aria-label="Efic Pulse"
      role="img"
    >
      <span className="font-marca-serif font-bold tracking-[-0.01em] text-slate-900">Efic</span>
      <span aria-hidden className="h-[0.95em] w-[max(1px,0.045em)] bg-slate-300" />
      <span className="font-marca-sans font-normal text-[#5b82ad]">Pulse</span>
    </span>
  );
}
