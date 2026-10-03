// Mural das respostas de texto livre no telão (docs/mural-abertas.md, migração 0034).
// Usado no servidor (projeção e controle) e no navegador (telão e controle).

export const POR_PAGINA = 6;
export const TROCA_AUTOMATICA_MS = 15_000;

// O que o telão recebe para o mural: as respostas no mural (já filtradas), o filtro
// ativo e a página escolhida pelo instrutor (null = automático, troca a cada 15 s).
export type MuralTelao = { textos: string[]; filtro: string | null; pagina: number | null };

// Resumo por IA das respostas abertas, pronto para o telão. A IA agrupou e escreveu a
// síntese; as pessoas de cada tema são contadas aqui, pelas respostas que estão no mural.
export type ResumoAbertasTelao = {
  sintese: string;
  total: number; // respostas no mural
  temas: { indice: number; titulo: string; pessoas: number; exemplo: string | null }[]; // indice 0 = Outros
};

// Como o resumo fica guardado (tabela temas_abertas).
export type TemasAbertasGuardados = { titulo: string; respostas: string[]; exemplo: string | null }[];

// "Crédito" e "credito", "PRAZO" e "prazo" contam como a mesma palavra no filtro.
export function normalizarBusca(texto: string) {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function filtrarMural(textos: string[], filtro: string | null) {
  const f = filtro ? normalizarBusca(filtro) : "";
  return f ? textos.filter((t) => normalizarBusca(t).includes(f)) : textos;
}

export function totalDePaginas(quantidade: number) {
  return Math.max(1, Math.ceil(quantidade / POR_PAGINA));
}

// Pessoas por tema: só respostas que estão no mural agora (tiradas do mural não contam).
// O que a IA não colocou em tema nenhum vai para "Outros".
export function contarResumo(
  sintese: string,
  temas: TemasAbertasGuardados,
  noMural: { id: string; texto: string }[],
): ResumoAbertasTelao {
  const texto = new Map(noMural.map((r) => [r.id, r.texto]));
  const usadas = new Set<string>();
  const lista = temas.map((t, i) => {
    const ids = t.respostas.filter((id) => texto.has(id) && !usadas.has(id));
    ids.forEach((id) => usadas.add(id));
    const exemplo = (t.exemplo && texto.get(t.exemplo)) ?? (ids[0] ? (texto.get(ids[0]) ?? null) : null);
    return { indice: i + 1, titulo: t.titulo, pessoas: ids.length, exemplo };
  });
  const outros = noMural.filter((r) => !usadas.has(r.id));
  const comPessoas = lista.filter((t) => t.pessoas > 0).sort((a, b) => b.pessoas - a.pessoas || a.indice - b.indice);
  if (outros.length > 0) comPessoas.push({ indice: 0, titulo: "Outros", pessoas: outros.length, exemplo: outros[0].texto });
  return { sintese, total: noMural.length, temas: comPessoas };
}
