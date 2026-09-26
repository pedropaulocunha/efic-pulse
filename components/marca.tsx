// Wordmark PROVISÓRIO (fatia 1), até o Pedro fechar a versão definitiva:
// "Efic" em IBM Plex Sans SemiBold e "Pulse" em IBM Plex Serif Italic, na mesma linha.
// Para mudar cor, peso ou espaçamento, mexa só aqui.
export function Marca({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline whitespace-nowrap text-slate-800 ${className}`}>
      <span className="font-marca-sans font-semibold">Efic</span>
      <span className="font-marca-serif font-normal italic">Pulse</span>
    </span>
  );
}
