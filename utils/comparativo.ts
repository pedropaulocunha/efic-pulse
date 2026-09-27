import "server-only";
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
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
import { formatarData, formatarPeriodo } from "@/lib/formatos";
import { dataBrasilia, estilizarCabecalho, mediana, SITUACAO, textoResposta } from "@/utils/relatorio";

// Comparativo de um modelo da biblioteca entre eventos (docs/biblioteca-modelos.md).
// Só o admin: a função comparativo_modelo (0026) devolve null para os outros.
// Abas: Eventos, Comparativo (uma coluna por evento + Total) e Respostas.

type PerguntaModelo = { id: string; ordem: number; tipo: TipoAtividade; enunciado: string; config: ConfigAtividade };
type EventoComparado = {
  id: string;
  nome_turma: string;
  codigo_interno: string;
  data_inicio: string;
  data_fim: string;
  cooperativa: string | null;
  uf: string | null;
  participantes: number;
};
type AtividadeLigada = { id: string; evento: string; pergunta: string; rodada_atual: number };
type RespostaComparada = {
  evento: string;
  pergunta: string;
  rodada: number;
  participante: number;
  valor: Record<string, unknown>;
  aprovada: boolean | null;
  em: string;
};

export type FiltrosComparativo = { cooperativas: string[]; de: string | null; ate: string | null };

export async function gerarComparativo(supabase: SupabaseClient, modeloId: string, filtros: FiltrosComparativo) {
  const [modelo, perguntas, dados] = await Promise.all([
    supabase.from("modelos").select("titulo").eq("id", modeloId).maybeSingle(),
    supabase
      .from("modelo_perguntas")
      .select("id, ordem, tipo, enunciado, config")
      .eq("modelo_id", modeloId)
      .order("ordem")
      .order("id")
      .returns<PerguntaModelo[]>(),
    supabase.rpc("comparativo_modelo", {
      modelo: modeloId,
      cooperativas: filtros.cooperativas.length > 0 ? filtros.cooperativas : null,
      de: filtros.de,
      ate: filtros.ate,
    }),
  ]);
  if (modelo.error) throw modelo.error;
  if (perguntas.error) throw perguntas.error;
  if (dados.error) throw dados.error;
  if (!modelo.data || dados.data === null) return null; // não é admin, ou modelo inexistente

  const eventos = dados.data.eventos as EventoComparado[];
  const atividades = dados.data.atividades as AtividadeLigada[];
  const respostas = dados.data.respostas as RespostaComparada[];
  const numeroDa = new Map(perguntas.data.map((p, i) => [p.id, i + 1]));
  const perguntaDe = new Map(perguntas.data.map((p) => [p.id, p]));
  const eventoDe = new Map(eventos.map((e) => [e.id, e]));

  // Nuvem: palavras juntadas pelo banco em cada evento (como no telão), somadas pela
  // forma normalizada (chave); mostra a forma mais usada.
  const nuvem = new Map<string, Map<string, { palavra: string; porEvento: Map<string, number> }>>();
  await Promise.all(
    atividades
      .filter((a) => perguntaDe.get(a.pergunta)?.tipo === "nuvem")
      .flatMap((a) =>
        Array.from({ length: a.rodada_atual }, (_, i) => i + 1).map(async (rodada) => {
          const r = await supabase.rpc("resultado_atividade", { atividade: a.id, rodada });
          if (r.error) throw r.error;
          const chaveGrupo = `${a.pergunta}:${rodada}`;
          const grupo = nuvem.get(chaveGrupo) ?? new Map();
          nuvem.set(chaveGrupo, grupo);
          for (const w of (r.data?.palavras ?? []) as { palavra: string; chave: string; n: number }[]) {
            const item = grupo.get(w.chave) ?? { palavra: w.palavra, porEvento: new Map() };
            item.porEvento.set(a.evento, (item.porEvento.get(a.evento) ?? 0) + w.n);
            grupo.set(w.chave, item);
          }
        }),
      ),
  );

  const livro = new ExcelJS.Workbook();
  livro.creator = "Pulse · Efic";
  livro.created = new Date();

  // ---- Eventos
  const abaEventos = livro.addWorksheet("Eventos");
  abaEventos.columns = [
    { header: "Cooperativa", key: "cooperativa", width: 32 },
    { header: "UF", key: "uf", width: 5 },
    { header: "Evento", key: "evento", width: 36 },
    { header: "Código interno", key: "codigo", width: 14 },
    { header: "Datas", key: "datas", width: 24 },
    { header: "Participantes que responderam", key: "participantes", width: 16 },
  ];
  for (const e of eventos) {
    abaEventos.addRow({
      cooperativa: e.cooperativa,
      uf: e.uf,
      evento: e.nome_turma,
      codigo: e.codigo_interno,
      datas: formatarPeriodo(e.data_inicio, e.data_fim),
      participantes: e.participantes,
    });
  }
  abaEventos.addRow({});
  abaEventos.addRow({ cooperativa: `Modelo: ${modelo.data.titulo}` });
  abaEventos.addRow({
    cooperativa: `Filtros: ${filtros.cooperativas.length > 0 ? `${filtros.cooperativas.length} cooperativa(s)` : "todas as cooperativas"}${
      filtros.de ? ` · a partir de ${formatarData(filtros.de)}` : ""
    }${filtros.ate ? ` · até ${formatarData(filtros.ate)}` : ""}`,
  });
  estilizarCabecalho(abaEventos);

  // ---- Comparativo
  const abaComp = livro.addWorksheet("Comparativo");
  abaComp.columns = [
    { header: "Nº", key: "numero", width: 5 },
    { header: "Pergunta", key: "pergunta", width: 44 },
    { header: "Tipo", key: "tipo", width: 16 },
    { header: "Rodada", key: "rodada", width: 8 },
    { header: "Item", key: "item", width: 32 },
    { header: "Medida", key: "medida", width: 16 },
    ...eventos.map((e) => ({
      header: `${e.cooperativa ?? ""} · ${formatarData(e.data_inicio)} · ${e.nome_turma}`,
      key: e.id,
      width: 18,
    })),
    { header: "Total", key: "total", width: 12 },
  ];
  abaComp.getRow(1).height = 48;

  const linhaComp = (
    base: Record<string, unknown>,
    item: string,
    medida: string,
    porEvento: (eventoId: string) => number | null,
    total: number | null,
    formato?: string,
  ) => {
    const valores: Record<string, unknown> = { ...base, item, medida, total };
    for (const e of eventos) valores[e.id] = porEvento(e.id);
    const linha = abaComp.addRow(valores);
    if (formato) {
      for (let c = 7; c <= 7 + eventos.length; c++) linha.getCell(c).numFmt = formato;
    }
  };
  const media = (ns: number[]) => (ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : null);

  for (const p of perguntas.data) {
    const rodadas = [...new Set(respostas.filter((r) => r.pergunta === p.id).map((r) => r.rodada))].sort();
    const base0 = { numero: numeroDa.get(p.id), pergunta: p.enunciado, tipo: rotuloTipo[p.tipo] };
    if (rodadas.length === 0) {
      abaComp.addRow({ ...base0, item: "Sem respostas" });
      continue;
    }
    for (const rodada of rodadas) {
      const base = { ...base0, rodada };
      const rs = respostas.filter((r) => r.pergunta === p.id && r.rodada === rodada);
      const doEvento = (id: string) => rs.filter((r) => r.evento === id);

      linhaComp(base, "Respostas", "quantidade", (id) => doEvento(id).length, rs.length);
      switch (p.tipo) {
        case "multipla":
          (p.config as ConfigMultipla).opcoes.forEach((opcao, i) => {
            const pct = (lista: RespostaComparada[]) =>
              lista.length ? lista.filter((r) => r.valor.opcao === i).length / lista.length : null;
            linhaComp(base, opcao, "% das respostas", (id) => pct(doEvento(id)), pct(rs), "0.0%");
          });
          break;
        case "escala":
        case "numero": {
          const c = p.config as ConfigEscala | ConfigNumero;
          const nums = (lista: RespostaComparada[]) => lista.map((r) => r.valor.numero as number);
          const unidade = c.unidade ? ` (${c.unidade})` : "";
          linhaComp(base, `Média${unidade}`, "média", (id) => media(nums(doEvento(id))), media(nums(rs)), "0.0#");
          linhaComp(
            base,
            `Mediana${unidade}`,
            "mediana",
            (id) => (doEvento(id).length ? mediana(nums(doEvento(id))) : null),
            mediana(nums(rs)),
            "0.0#",
          );
          if (typeof c.referencia === "number") {
            abaComp.addRow({ ...base, item: `Referência: ${formatarNumero(c.referencia, c.unidade)}` });
          }
          break;
        }
        case "ordenar": {
          const itens = (p.config as ConfigOrdenar).itens;
          const posicao = (lista: RespostaComparada[], i: number) =>
            media(lista.map((r) => (r.valor.ordem as number[]).indexOf(i) + 1));
          itens
            .map((item, i) => ({ item, i, geral: posicao(rs, i) ?? 0 }))
            .sort((x, y) => x.geral - y.geral)
            .forEach(({ item, i, geral }) =>
              linhaComp(base, item, "posição média", (id) => posicao(doEvento(id), i), geral, "0.0#"),
            );
          break;
        }
        case "nuvem": {
          const grupo = [...(nuvem.get(`${p.id}:${rodada}`)?.values() ?? [])]
            .map((w) => ({ ...w, total: [...w.porEvento.values()].reduce((s, n) => s + n, 0) }))
            .sort((x, y) => y.total - x.total)
            .slice(0, 40);
          for (const w of grupo) {
            linhaComp(base, w.palavra, "vezes citada", (id) => w.porEvento.get(id) ?? 0, w.total);
          }
          break;
        }
        case "aberta":
          for (const s of [true, false, null] as const) {
            linhaComp(
              base,
              `${SITUACAO(s)}s`,
              "quantidade",
              (id) => doEvento(id).filter((r) => r.aprovada === s).length,
              rs.filter((r) => r.aprovada === s).length,
            );
          }
          break;
      }
    }
  }
  estilizarCabecalho(abaComp);
  abaComp.views = [{ state: "frozen", ySplit: 1, xSplit: 6 }];

  // ---- Respostas
  const abaRespostas = livro.addWorksheet("Respostas");
  abaRespostas.columns = [
    { header: "Cooperativa", key: "cooperativa", width: 28 },
    { header: "Evento", key: "evento", width: 30 },
    { header: "Data do evento", key: "data", width: 13, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Nº", key: "numero", width: 5 },
    { header: "Pergunta", key: "pergunta", width: 44 },
    { header: "Tipo", key: "tipo", width: 16 },
    { header: "Rodada", key: "rodada", width: 8 },
    { header: "Participante", key: "participante", width: 12 },
    { header: "Resposta", key: "resposta", width: 50 },
    { header: "Situação (abertas)", key: "situacao", width: 16 },
    { header: "Horário", key: "em", width: 17, style: { numFmt: "dd/mm/yyyy hh:mm" } },
  ];
  const ordenadas = [...respostas].sort(
    (x, y) =>
      (eventoDe.get(x.evento)?.data_inicio ?? "").localeCompare(eventoDe.get(y.evento)?.data_inicio ?? "") ||
      x.evento.localeCompare(y.evento) ||
      (numeroDa.get(x.pergunta) ?? 0) - (numeroDa.get(y.pergunta) ?? 0) ||
      x.rodada - y.rodada ||
      x.participante - y.participante,
  );
  for (const r of ordenadas) {
    const p = perguntaDe.get(r.pergunta);
    const e = eventoDe.get(r.evento);
    if (!p || !e) continue;
    const [ano, mes, dia] = e.data_inicio.split("-").map(Number);
    abaRespostas.addRow({
      cooperativa: e.cooperativa,
      evento: e.nome_turma,
      data: new Date(Date.UTC(ano, mes - 1, dia)),
      numero: numeroDa.get(p.id),
      pergunta: p.enunciado,
      tipo: rotuloTipo[p.tipo],
      rodada: r.rodada,
      participante: r.participante,
      resposta: textoResposta(p, r.valor),
      situacao: p.tipo === "aberta" ? SITUACAO(r.aprovada) : null,
      em: dataBrasilia(r.em),
    });
  }
  estilizarCabecalho(abaRespostas);

  const buffer = await livro.xlsx.writeBuffer();
  return { buffer, nome: `Pulse - Comparativo - ${modelo.data.titulo}.xlsx`, eventos: eventos.length };
}
