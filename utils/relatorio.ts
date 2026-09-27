import "server-only";
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { agruparPorBloco, type Bloco } from "@/lib/blocos";
import {
  formatarNumero,
  rotuloTipo,
  type ConfigAtividade,
  type ConfigEscala,
  type ConfigMultipla,
  type ConfigNumero,
  type ConfigOrdenar,
  type TipoAtividade,
} from "@/lib/atividades";
import { formatarPeriodo } from "@/lib/formatos";

// Relatório do evento em Excel, para uso interno da Efic. Usa o login do instrutor:
// só sai o que ele pode ver (as políticas e a função relatorio_respostas, 0025).
// Quatro abas:
//   Evento           — dados do evento;
//   Resumo           — por pergunta e rodada: contagens, porcentagens, média, mediana...;
//   Respostas        — uma linha por resposta, com o número anônimo do participante;
//   Por participante — uma linha por participante, uma coluna por pergunta (para cruzar).

type Atividade = {
  id: string;
  ordem: number;
  bloco_id: string | null;
  tipo: TipoAtividade;
  enunciado: string;
  config: ConfigAtividade;
  rodada_atual: number;
};

type Resposta = {
  atividade: string;
  rodada: number;
  participante: number;
  valor: Record<string, unknown>;
  aprovada: boolean | null;
  em: string;
};

type Pergunta = Atividade & { numero: number; bloco: string };

export const SITUACAO = (aprovada: boolean | null) =>
  aprovada === true ? "Aprovada" : aprovada === false ? "Recusada" : "Pendente";

// Horário de Brasília, gravado como data do Excel (o Excel não tem fuso).
export function dataBrasilia(iso: string) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return new Date(
    Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute, +partes.second),
  );
}

export function mediana(ns: number[]) {
  const o = [...ns].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

// A resposta em texto legível (a mesma para as abas Respostas e Por participante).
export function textoResposta(p: { tipo: TipoAtividade; config: ConfigAtividade }, valor: Record<string, unknown>): string | number {
  switch (p.tipo) {
    case "multipla":
      return (p.config as ConfigMultipla).opcoes[valor.opcao as number] ?? "";
    case "escala":
    case "numero":
      return valor.numero as number;
    case "nuvem":
      return (valor.palavras as string[]).join(", ");
    case "ordenar": {
      const itens = (p.config as ConfigOrdenar).itens;
      return (valor.ordem as number[]).map((i, pos) => `${pos + 1}º ${itens[i]}`).join(" · ");
    }
    case "aberta":
      return String(valor.texto ?? "");
  }
}

export function estilizarCabecalho(aba: ExcelJS.Worksheet) {
  const linha = aba.getRow(1);
  linha.font = { bold: true, color: { argb: "FFFFFFFF" } };
  linha.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F4C64" } };
  linha.alignment = { vertical: "middle", wrapText: true };
  aba.views = [{ state: "frozen", ySplit: 1 }];
  aba.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: aba.columnCount } };
}

export async function gerarRelatorio(supabase: SupabaseClient, eventoId: string) {
  const [evento, atividades, blocos, respostas] = await Promise.all([
    supabase
      .from("eventos")
      .select("nome_turma, codigo_interno, data_inicio, data_fim, cooperativas(nome, uf)")
      .eq("id", eventoId)
      .maybeSingle(),
    supabase
      .from("atividades")
      .select("id, ordem, bloco_id, tipo, enunciado, config, rodada_atual")
      .eq("evento_id", eventoId)
      .returns<Atividade[]>(),
    supabase.from("blocos").select("id, ordem, titulo").eq("evento_id", eventoId).returns<Bloco[]>(),
    supabase.rpc("relatorio_respostas", { evento: eventoId }),
  ]);
  if (evento.error) throw evento.error;
  if (atividades.error) throw atividades.error;
  if (blocos.error) throw blocos.error;
  if (respostas.error) throw respostas.error;
  if (!evento.data || respostas.data === null) return null; // evento de outro instrutor

  const e = evento.data;
  const coop = e.cooperativas as unknown as { nome: string; uf: string } | null;
  const todas = respostas.data as Resposta[];

  // Perguntas na ordem da tela, com numeração corrida e o nome do bloco.
  const perguntas: Pergunta[] = [];
  for (const g of agruparPorBloco(atividades.data, blocos.data)) {
    for (const a of g.atividades) {
      perguntas.push({ ...a, numero: perguntas.length + 1, bloco: g.bloco?.titulo ?? "Sem bloco" });
    }
  }
  const respostasDe = (id: string, rodada: number) =>
    todas.filter((r) => r.atividade === id && r.rodada === rodada);
  const participantes = todas.reduce((m, r) => Math.max(m, r.participante), 0);

  // Nuvem: as palavras juntadas pelo banco (singular/plural, acentos), como no telão.
  const nuvens = new Map<string, { palavra: string; n: number }[]>();
  await Promise.all(
    perguntas
      .filter((p) => p.tipo === "nuvem")
      .flatMap((p) =>
        Array.from({ length: p.rodada_atual }, (_, i) => i + 1).map(async (rodada) => {
          const r = await supabase.rpc("resultado_atividade", { atividade: p.id, rodada });
          if (r.error) throw r.error;
          nuvens.set(`${p.id}:${rodada}`, r.data?.palavras ?? []);
        }),
      ),
  );

  const livro = new ExcelJS.Workbook();
  livro.creator = "Pulse · Efic";
  livro.created = new Date();

  // ---- Evento
  const abaEvento = livro.addWorksheet("Evento");
  abaEvento.columns = [
    { header: "Campo", key: "campo", width: 30 },
    { header: "Valor", key: "valor", width: 60 },
  ];
  abaEvento.addRows([
    { campo: "Evento", valor: e.nome_turma },
    { campo: "Cooperativa", valor: coop ? `${coop.nome} · ${coop.uf}` : "" },
    { campo: "Datas", valor: formatarPeriodo(e.data_inicio, e.data_fim) },
    { campo: "Código interno", valor: e.codigo_interno },
    { campo: "Participantes que responderam", valor: participantes },
    { campo: "Perguntas", valor: perguntas.length },
    { campo: "Gerado em", valor: dataBrasilia(new Date().toISOString()) },
  ]);
  abaEvento.getCell("B8").numFmt = "dd/mm/yyyy hh:mm";
  estilizarCabecalho(abaEvento);

  // ---- Resumo
  const resumo = livro.addWorksheet("Resumo");
  resumo.columns = [
    { header: "Bloco", key: "bloco", width: 22 },
    { header: "Nº", key: "numero", width: 5 },
    { header: "Pergunta", key: "pergunta", width: 50 },
    { header: "Tipo", key: "tipo", width: 18 },
    { header: "Rodada", key: "rodada", width: 8 },
    { header: "Item", key: "item", width: 40 },
    { header: "Quantidade", key: "qtd", width: 12 },
    { header: "%", key: "pct", width: 9, style: { numFmt: "0.0%" } },
    { header: "Valor", key: "valor", width: 12 },
  ];

  for (const p of perguntas) {
    const base = { bloco: p.bloco, numero: p.numero, pergunta: p.enunciado, tipo: rotuloTipo[p.tipo] };
    const rodadasUsadas = Array.from({ length: p.rodada_atual }, (_, i) => i + 1).filter(
      (rd) => respostasDe(p.id, rd).length > 0,
    );
    if (rodadasUsadas.length === 0) {
      resumo.addRow({ ...base, item: "Sem respostas", qtd: 0 });
      continue;
    }
    for (const rodada of rodadasUsadas) {
      const rs = respostasDe(p.id, rodada);
      const total = rs.length;
      const linha = (item: string, qtd?: number | null, valor?: number | string | null) =>
        resumo.addRow({
          ...base,
          rodada,
          item,
          qtd: qtd ?? null,
          pct: typeof qtd === "number" && total > 0 ? qtd / total : null,
          valor: valor ?? null,
        });

      linha("Respostas", total);
      switch (p.tipo) {
        case "multipla": {
          (p.config as ConfigMultipla).opcoes.forEach((opcao, i) =>
            linha(opcao, rs.filter((r) => r.valor.opcao === i).length),
          );
          break;
        }
        case "escala":
        case "numero": {
          const c = p.config as ConfigEscala | ConfigNumero;
          const ns = rs.map((r) => r.valor.numero as number);
          resumo.addRow({ ...base, rodada, item: "Média", valor: ns.reduce((s, n) => s + n, 0) / ns.length });
          resumo.addRow({ ...base, rodada, item: "Mediana", valor: mediana(ns) });
          if (typeof c.referencia === "number") resumo.addRow({ ...base, rodada, item: "Referência", valor: c.referencia });
          const contagem = new Map<number, number>();
          for (const n of ns) contagem.set(n, (contagem.get(n) ?? 0) + 1);
          [...contagem.entries()]
            .sort((x, y) => x[0] - y[0])
            .forEach(([n, qtd]) => linha(formatarNumero(n, c.unidade), qtd, n));
          break;
        }
        case "ordenar": {
          // Posição média de cada item (1 = primeiro lugar) e quantas vezes ficou em 1º.
          const itens = (p.config as ConfigOrdenar).itens;
          resumo.addRow({ ...base, rodada, item: "Valor = posição média (1 = primeiro); Quantidade = vezes em 1º" });
          itens
            .map((item, i) => {
              const posicoes = rs.map((r) => (r.valor.ordem as number[]).indexOf(i) + 1);
              return {
                item,
                media: posicoes.reduce((s, n) => s + n, 0) / posicoes.length,
                primeiro: posicoes.filter((n) => n === 1).length,
              };
            })
            .sort((x, y) => x.media - y.media)
            .forEach((x) => linha(x.item, x.primeiro, x.media));
          break;
        }
        case "nuvem": {
          for (const w of nuvens.get(`${p.id}:${rodada}`) ?? []) linha(w.palavra, w.n);
          break;
        }
        case "aberta": {
          for (const s of [true, false, null] as const) {
            linha(SITUACAO(s) + "s", rs.filter((r) => r.aprovada === s).length);
          }
          break;
        }
      }
    }
  }
  resumo.getColumn("valor").numFmt = "0.0#";
  estilizarCabecalho(resumo);

  // ---- Respostas
  const abaRespostas = livro.addWorksheet("Respostas");
  abaRespostas.columns = [
    { header: "Bloco", key: "bloco", width: 22 },
    { header: "Nº", key: "numero", width: 5 },
    { header: "Pergunta", key: "pergunta", width: 50 },
    { header: "Tipo", key: "tipo", width: 18 },
    { header: "Rodada", key: "rodada", width: 8 },
    { header: "Participante", key: "participante", width: 12 },
    { header: "Resposta", key: "resposta", width: 60 },
    { header: "Situação (abertas)", key: "situacao", width: 16 },
    { header: "Horário", key: "em", width: 17, style: { numFmt: "dd/mm/yyyy hh:mm" } },
  ];
  for (const p of perguntas) {
    for (const r of todas.filter((x) => x.atividade === p.id)) {
      abaRespostas.addRow({
        bloco: p.bloco,
        numero: p.numero,
        pergunta: p.enunciado,
        tipo: rotuloTipo[p.tipo],
        rodada: r.rodada,
        participante: r.participante,
        resposta: textoResposta(p, r.valor),
        situacao: p.tipo === "aberta" ? SITUACAO(r.aprovada) : null,
        em: dataBrasilia(r.em),
      });
    }
  }
  abaRespostas.getColumn("resposta").alignment = { wrapText: true, vertical: "top" };
  estilizarCabecalho(abaRespostas);

  // ---- Por participante (uma coluna por pergunta e rodada)
  const abaPessoa = livro.addWorksheet("Por participante");
  const colunas = perguntas.flatMap((p) =>
    Array.from({ length: p.rodada_atual }, (_, i) => i + 1)
      .filter((rd) => respostasDe(p.id, rd).length > 0)
      .map((rodada) => ({ p, rodada })),
  );
  abaPessoa.columns = [
    { header: "Participante", key: "participante", width: 12 },
    ...colunas.map(({ p, rodada }) => ({
      header: `${p.numero}. ${p.enunciado.slice(0, 60)}${p.enunciado.length > 60 ? "…" : ""}${rodada > 1 ? ` (rodada ${rodada})` : ""}`,
      key: `${p.id}:${rodada}`,
      width: 28,
    })),
  ];
  for (let n = 1; n <= participantes; n++) {
    const linha: Record<string, string | number> = { participante: n };
    for (const { p, rodada } of colunas) {
      const r = todas.find((x) => x.atividade === p.id && x.rodada === rodada && x.participante === n);
      if (r) linha[`${p.id}:${rodada}`] = textoResposta(p, r.valor);
    }
    abaPessoa.addRow(linha);
  }
  abaPessoa.getRow(1).height = 60;
  estilizarCabecalho(abaPessoa);

  const buffer = await livro.xlsx.writeBuffer();
  return { buffer, nome: `Pulse - ${e.nome_turma} - ${e.codigo_interno}.xlsx` };
}
