// Blocos: grupos de atividades dentro do evento (Abertura, Estudo de caso 1...).
// Mesma ordem da função mover_atividade (0023): primeiro as atividades sem bloco,
// depois cada bloco na ordem dele; dentro de cada grupo, a ordem das atividades.

export type Bloco = { id: string; ordem: number; titulo: string };

type ComBloco = { id: string; ordem: number; bloco_id: string | null };

export type Grupo<A> = { bloco: Bloco | null; atividades: A[] };

const porOrdem = (x: { ordem: number; id: string }, y: { ordem: number; id: string }) =>
  x.ordem - y.ordem || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);

// Grupos na ordem da tela. Blocos vazios aparecem (para receber atividades);
// o grupo "sem bloco" só aparece se tiver atividades.
export function agruparPorBloco<A extends ComBloco>(atividades: A[], blocos: Bloco[]): Grupo<A>[] {
  const ordenados = [...blocos].sort(porOrdem);
  const existe = new Set(ordenados.map((b) => b.id));
  const doGrupo = (id: string | null) =>
    atividades
      .filter((a) => (id === null ? a.bloco_id === null || !existe.has(a.bloco_id) : a.bloco_id === id))
      .sort(porOrdem);

  const grupos: Grupo<A>[] = [];
  const semBloco = doGrupo(null);
  if (semBloco.length > 0) grupos.push({ bloco: null, atividades: semBloco });
  for (const b of ordenados) grupos.push({ bloco: b, atividades: doGrupo(b.id) });
  return grupos;
}

// Lista única, na ordem da tela.
export function ordenarPorBloco<A extends ComBloco>(atividades: A[], blocos: Bloco[]): A[] {
  return agruparPorBloco(atividades, blocos).flatMap((g) => g.atividades);
}
