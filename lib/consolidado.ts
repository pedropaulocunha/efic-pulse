// Consolidado de uma pergunta da biblioteca com todas as turmas (docs/consolidado.md, 0036).
// A IA definiu os temas e classificou cada item; aqui o Pulse conta as PESSOAS por tema
// e por evento, e compara um grupo de eventos (A) com os outros do período (B).

export type EventoConsolidado = {
  id: string;
  nome_turma: string;
  data_inicio: string;
  cooperativa: string | null;
  uf: string | null;
};

export type DadosConsolidado = {
  tipo: string;
  eventos: EventoConsolidado[];
  respostas: { id: string; evento: string; texto: string | null; palavras: { chave: string; forma: string }[] | null }[];
};

// Itens que a IA classifica: cada resposta aberta (chave = id) ou cada palavra da nuvem.
export function itensDoConsolidado(dados: DadosConsolidado) {
  if (dados.tipo === "aberta") {
    return dados.respostas
      .filter((r) => r.texto && r.texto.trim())
      .map((r) => ({ chave: r.id, texto: r.texto!.trim(), vezes: 1 }));
  }
  // Nuvem: uma entrada por palavra (chave), com a forma mais usada e quantas vezes apareceu.
  const contagem = new Map<string, { formas: Map<string, number>; vezes: number }>();
  for (const r of dados.respostas) {
    for (const w of r.palavras ?? []) {
      const item = contagem.get(w.chave) ?? { formas: new Map(), vezes: 0 };
      item.vezes++;
      item.formas.set(w.forma, (item.formas.get(w.forma) ?? 0) + 1);
      contagem.set(w.chave, item);
    }
  }
  return [...contagem].map(([chave, x]) => ({
    chave,
    texto: [...x.formas].sort((a, b) => b[1] - a[1])[0][0],
    vezes: x.vezes,
  }));
}

// Por evento: quantas pessoas responderam e quantas caíram em cada tema.
// porTema[0] = Outros; porTema[i] = tema i (1..n). semTema = pessoas com itens que
// chegaram depois do consolidado (ainda não classificados).
export type ContagemEvento = { total: number; porTema: number[]; semTema: number };

export function contarPorEvento(dados: DadosConsolidado, nTemas: number, mapa: Record<string, number>) {
  const porEvento = new Map<string, ContagemEvento>();
  for (const e of dados.eventos) porEvento.set(e.id, { total: 0, porTema: Array(nTemas + 1).fill(0), semTema: 0 });
  for (const r of dados.respostas) {
    const chaves = dados.tipo === "aberta" ? (r.texto && r.texto.trim() ? [r.id] : []) : (r.palavras ?? []).map((w) => w.chave);
    if (chaves.length === 0) continue;
    const c = porEvento.get(r.evento);
    if (!c) continue;
    c.total++;
    // Cada pessoa conta uma vez em cada tema em que tiver algum item.
    const temas = new Set<number>();
    let semTema = false;
    for (const k of chaves) {
      if (k in mapa) temas.add(mapa[k]);
      else semTema = true;
    }
    for (const t of temas) c.porTema[t]++;
    if (semTema && temas.size === 0) c.semTema++;
  }
  return porEvento;
}

// Soma de um grupo de eventos.
export function somarGrupo(porEvento: Map<string, ContagemEvento>, ids: string[], nTemas: number): ContagemEvento {
  const soma: ContagemEvento = { total: 0, porTema: Array(nTemas + 1).fill(0), semTema: 0 };
  for (const id of ids) {
    const c = porEvento.get(id);
    if (!c) continue;
    soma.total += c.total;
    soma.semTema += c.semTema;
    c.porTema.forEach((n, i) => (soma.porTema[i] += n));
  }
  return soma;
}

export const pct = (n: number, total: number) => (total > 0 ? (n / total) * 100 : 0);
