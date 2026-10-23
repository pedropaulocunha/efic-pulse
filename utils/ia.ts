import "server-only";

// Integração com a OpenAI (docs/ia-temas-nuvem.md). Só no servidor: a chave fica
// em OPENAI_API_KEY (variáveis da Vercel / .env.local), nunca no navegador.
// A IA só AGRUPA; quem conta pessoas por tema é o banco (resultado_temas, 0031).
//
// Para a IA não pular palavras, ela classifica PALAVRA POR PALAVRA (cada chave com o
// número do tema). As que ela esquecer voltam numa segunda chamada, só com elas.
// Se "Outros" ficar grande (mais de 15% das citações), uma chamada extra procura
// até 2 temas novos só entre as palavras de Outros.

const MODELO_PADRAO = "gpt-4o"; // comparado com o gpt-4o-mini em 28/09/2026 (docs/ia-temas-nuvem.md): agrupa melhor; ~US$ 0,01 por resumo
const TEMPO_MAXIMO_MS = 60_000; // modelos de raciocínio demoram mais
const MAX_TEMAS = 8;
const LIMITE_OUTROS = 0.15; // fração das citações em Outros que dispara a busca de temas novos

export function iaConfigurada() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export type TemaSugerido = { titulo: string; chaves: string[] };
type PalavraNuvem = { palavra: string; chave: string; n: number };
type Uso = { entrada: number; saida: number };

const REGRAS = [
  "Você organiza respostas de uma nuvem de palavras de um treinamento presencial para cooperativas de crédito no Brasil.",
  "Cada resposta é uma palavra ou frase curta. Agrupe-as em temas, em português do Brasil.",
  "",
  "Regras dos temas:",
  "- De 4 a 7 temas (com menos de 12 respostas, de 2 a 4). Temas específicos e sem sobreposição entre si.",
  "- Separe ideias diferentes. Em sentimentos, por exemplo: vergonha/constrangimento, raiva/irritação,",
  "  ansiedade/medo/insegurança, indiferença/desinteresse, sentimentos positivos. Nunca um tema genérico como",
  '  "Sentimentos negativos" que junte emoções diferentes.',
  "- Separe circunstância de atitude: o que a pessoa NÃO CONSEGUE fazer (falta de dinheiro, desemprego, doença,",
  "  crise) é diferente do que ela NÃO QUER fazer (falta de caráter, desinteresse, prioriza outras dívidas,",
  '  desiste, "pode mandar pro Serasa"). Em cobrança essa diferença é central.',
  "- O título NUNCA repete ou reformula a própria pergunta; ele diz o que as respostas têm em comum.",
  '- Título curto (até 40 caracteres), em português, só com a primeira letra maiúscula (ex.: "Vergonha e constrangimento"),',
  "  sem emojis e sem aspas.",
  "",
  "Regras da classificação:",
  '- Classifique TODAS as respostas, uma por uma, usando a "chave" exatamente como recebida.',
  "- Masculino e feminino, singular e plural, erros de digitação e frases com a mesma ideia vão para o mesmo tema",
  '  (ex.: "ansioso", "ansiosa" e "anciosa"; "envergonhado", "com vergonha" e "vergonha").',
  '- Atenção a negações e sentidos opostos: "vergonha" e "sem vergonha" (sem-vergonhice) NÃO são o mesmo tema.',
  '- Use o tema 0 ("Outros") só para o que realmente não se encaixa em nenhum tema: no máximo 1 em cada 10 respostas.',
  '- "vezes" diz quantas vezes a resposta apareceu: use para decidir quais temas importam, nunca para contar.',
].join("\n");

async function chamarOpenAI(
  modelo: string,
  sistema: string,
  usuario: unknown,
  schema: Record<string, unknown>,
): Promise<{ dados: unknown; uso: Uso } | { erro: string }> {
  const chave = process.env.OPENAI_API_KEY;
  if (!chave) return { erro: "A IA não está configurada (falta a chave OPENAI_API_KEY na Vercel)." };

  const enviar = (comTemperatura: boolean) =>
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelo,
        ...(comTemperatura ? { temperature: 0.2 } : {}),
        messages: [
          { role: "system", content: sistema },
          { role: "user", content: JSON.stringify(usuario) },
        ],
        // Saída em JSON com formato fixo (structured outputs).
        response_format: { type: "json_schema", json_schema: { name: "resposta", strict: true, schema } },
      }),
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
      cache: "no-store",
    });

  let resposta: Response;
  let erroTexto = "";
  try {
    resposta = await enviar(true);
    // Modelos de "raciocínio" recusam a temperatura: tenta de novo sem ela.
    if (resposta.status === 400) {
      erroTexto = await resposta.text();
      if (erroTexto.includes("temperature")) {
        resposta = await enviar(false);
        erroTexto = "";
      }
    }
  } catch (e) {
    console.error("OpenAI (rede):", e);
    return { erro: "A IA não respondeu a tempo. Tente de novo em instantes." };
  }

  if (!resposta.ok) {
    // Nunca registra a chave; só o código e o começo da mensagem de erro.
    console.error("OpenAI:", resposta.status, (erroTexto || (await resposta.text())).slice(0, 300));
    if (resposta.status === 401) return { erro: "A chave da OpenAI foi recusada. Confira OPENAI_API_KEY na Vercel." };
    if (resposta.status === 404) return { erro: `O modelo "${modelo}" não está disponível nesta conta da OpenAI.` };
    if (resposta.status === 429) return { erro: "Limite de uso da OpenAI atingido. Tente de novo em instantes ou confira o saldo da conta." };
    return { erro: "A IA não conseguiu resumir agora. Tente de novo em instantes." };
  }

  try {
    const corpo = await resposta.json();
    return {
      dados: JSON.parse(corpo.choices?.[0]?.message?.content ?? "{}"),
      uso: { entrada: corpo.usage?.prompt_tokens ?? 0, saida: corpo.usage?.completion_tokens ?? 0 },
    };
  } catch {
    return { erro: "A IA respondeu num formato inesperado. Tente de novo." };
  }
}

const SCHEMA_CLASSIFICACAO = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["chave", "tema"],
    properties: { chave: { type: "string" }, tema: { type: "integer" } },
  },
};

// "Dificuldades Em Cobrança" -> "Dificuldades em cobrança" (siglas como PIX ficam).
function primeiraMaiuscula(titulo: string) {
  const limpo = titulo.replace(/["“”]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  const palavras = limpo.split(" ");
  return palavras
    .map((p, i) => {
      if (i === 0) return p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1);
      return /^\p{Lu}\p{Ll}+$/u.test(p) ? p.toLocaleLowerCase("pt-BR") : p;
    })
    .join(" ");
}

// Pede à IA os temas das palavras da nuvem. Devolve temas conferidos: só chaves que
// existem, cada chave em um tema só, sem tema vazio, até 8 temas.
export async function sugerirTemas(
  pergunta: string,
  palavras: PalavraNuvem[],
  modeloEscolhido?: string,
): Promise<{ temas: TemaSugerido[]; modelo: string; uso: Uso; chamadas: number } | { erro: string }> {
  const modelo = modeloEscolhido || process.env.OPENAI_MODEL || MODELO_PADRAO;
  const respostas = palavras.map((p) => ({ chave: p.chave, resposta: p.palavra, vezes: p.n }));

  // 1ª chamada: temas + classificação de cada resposta.
  const primeira = await chamarOpenAI(
    modelo,
    REGRAS,
    { pergunta, respostas },
    {
      type: "object",
      additionalProperties: false,
      required: ["temas", "classificacao"],
      properties: {
        temas: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["numero", "titulo"],
            properties: { numero: { type: "integer" }, titulo: { type: "string" } },
          },
        },
        classificacao: SCHEMA_CLASSIFICACAO,
      },
    },
  );
  if ("erro" in primeira) return { erro: primeira.erro };
  const uso = { ...primeira.uso };
  let chamadas = 1;

  const bruto = primeira.dados as {
    temas?: { numero?: number; titulo?: string }[];
    classificacao?: { chave?: string; tema?: number }[];
  };
  const titulos = new Map<number, string>();
  for (const t of bruto.temas ?? []) {
    const titulo = primeiraMaiuscula(String(t.titulo ?? ""));
    if (typeof t.numero === "number" && t.numero > 0 && titulo && titulo.toLowerCase() !== "outros") {
      titulos.set(t.numero, titulo);
    }
    if (titulos.size === MAX_TEMAS) break;
  }
  if (titulos.size === 0) return { erro: "A IA não encontrou temas nessas respostas. Tente de novo." };

  const existentes = new Set(palavras.map((p) => p.chave));
  const temaDa = new Map<string, number>(); // chave -> número do tema (0 = Outros)
  const registrar = (lista: { chave?: string; tema?: number }[] | undefined) => {
    for (const c of lista ?? []) {
      const chave = String(c.chave ?? "");
      if (!existentes.has(chave) || temaDa.has(chave)) continue;
      temaDa.set(chave, typeof c.tema === "number" && titulos.has(c.tema) ? c.tema : 0);
    }
  };
  registrar(bruto.classificacao);

  // 2ª chamada, só se a IA pulou respostas: classificar as que faltaram nos temas que já existem.
  const faltando = respostas.filter((r) => !temaDa.has(r.chave));
  if (faltando.length > 0) {
    const segunda = await chamarOpenAI(
      modelo,
      REGRAS +
        "\n\nOs temas já foram definidos (lista abaixo). Classifique SOMENTE as respostas recebidas nesses temas, " +
        "pelo número; use 0 (Outros) só se nenhuma servir.",
      { pergunta, temas: [...titulos].map(([numero, titulo]) => ({ numero, titulo })), respostas: faltando },
      {
        type: "object",
        additionalProperties: false,
        required: ["classificacao"],
        properties: { classificacao: SCHEMA_CLASSIFICACAO },
      },
    );
    chamadas++;
    if (!("erro" in segunda)) {
      uso.entrada += segunda.uso.entrada;
      uso.saida += segunda.uso.saida;
      registrar((segunda.dados as { classificacao?: { chave?: string; tema?: number }[] }).classificacao);
    }
    // Se a segunda falhar, o que faltou fica em Outros: o resumo continua valendo.
  }

  // 3ª chamada, só se Outros ficou grande: temas novos entre as palavras de Outros.
  const citacoes = palavras.reduce((soma, p) => soma + p.n, 0);
  const emOutros = palavras.filter((p) => (temaDa.get(p.chave) ?? 0) === 0);
  const citacoesOutros = emOutros.reduce((soma, p) => soma + p.n, 0);
  if (emOutros.length >= 3 && citacoesOutros > citacoes * LIMITE_OUTROS && titulos.size < MAX_TEMAS) {
    const proximo = Math.max(...titulos.keys()) + 1;
    const extra = await chamarOpenAI(
      modelo,
      REGRAS +
        "\n\nEstas respostas ficaram fora dos temas já definidos (lista abaixo). Procure de 1 a 2 temas NOVOS entre elas, " +
        `numerados a partir de ${proximo}, só para grupos de pelo menos 3 respostas com a mesma ideia e diferentes dos ` +
        "temas já existentes. Classifique cada resposta num tema novo ou em 0 (Outros). Se nada formar grupo, devolva " +
        "a lista de temas vazia e tudo em 0.",
      {
        pergunta,
        temas_existentes: [...titulos.values()],
        respostas: emOutros.map((p) => ({ chave: p.chave, resposta: p.palavra, vezes: p.n })),
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["temas", "classificacao"],
        properties: {
          temas: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["numero", "titulo"],
              properties: { numero: { type: "integer" }, titulo: { type: "string" } },
            },
          },
          classificacao: SCHEMA_CLASSIFICACAO,
        },
      },
    );
    chamadas++;
    if (!("erro" in extra)) {
      uso.entrada += extra.uso.entrada;
      uso.saida += extra.uso.saida;
      const dados = extra.dados as {
        temas?: { numero?: number; titulo?: string }[];
        classificacao?: { chave?: string; tema?: number }[];
      };
      const novos = new Set<number>();
      for (const t of dados.temas ?? []) {
        const titulo = primeiraMaiuscula(String(t.titulo ?? ""));
        if (
          typeof t.numero === "number" && t.numero >= proximo && !titulos.has(t.numero) &&
          titulo && titulo.toLowerCase() !== "outros" && titulos.size < MAX_TEMAS
        ) {
          titulos.set(t.numero, titulo);
          novos.add(t.numero);
        }
      }
      // Só as palavras de Outros mudam, e só para um tema novo desta chamada.
      for (const c of dados.classificacao ?? []) {
        const chave = String(c.chave ?? "");
        if ((temaDa.get(chave) ?? 0) === 0 && existentes.has(chave) && typeof c.tema === "number" && novos.has(c.tema)) {
          temaDa.set(chave, c.tema);
        }
      }
    }
  }

  const temas: TemaSugerido[] = [...titulos]
    .map(([numero, titulo]) => ({
      titulo,
      chaves: palavras.filter((p) => temaDa.get(p.chave) === numero).map((p) => p.chave),
    }))
    .filter((t) => t.chaves.length > 0);
  if (temas.length === 0) return { erro: "A IA não encontrou temas nessas respostas. Tente de novo." };
  return { temas, modelo, uso, chamadas };
}

// ---------------------------------------------------------------
// Respostas de texto livre (docs/mural-abertas.md, 0034): síntese + temas.
// Cada resposta vai com um número curto ("r1", "r2"...) no lugar do id interno.
// A IA classifica resposta por resposta; as que ela pular voltam numa 2ª chamada.
// ---------------------------------------------------------------

const REGRAS_ABERTAS = [
  "Você resume respostas de texto livre de um treinamento presencial para cooperativas de crédito no Brasil.",
  "Escreva em português do Brasil.",
  "",
  "Síntese:",
  "- De 2 a 3 frases (até 400 caracteres) que digam o que a turma respondeu, de forma neutra e fiel.",
  "- Sem nomes de pessoas, sem dados pessoais e sem inventar nada que não esteja nas respostas.",
  "",
  "Temas:",
  "- De 3 a 6 temas (com menos de 8 respostas, de 1 a 3). Específicos e sem sobreposição.",
  "- O título NUNCA repete a pergunta; diz o que as respostas têm em comum. Até 40 caracteres,",
  '  só com a primeira letra maiúscula (ex.: "Contato logo no início do atraso"), sem aspas e sem emojis.',
  "- Separe o que a pessoa NÃO CONSEGUE fazer (falta de dinheiro, doença, crise) do que ela NÃO QUER",
  "  (desinteresse, prioriza outra dívida, desistência).",
  "",
  "Classificação:",
  '- Classifique TODAS as respostas, uma por uma: no campo "chave" da classificação vai o "id" exatamente como recebido.',
  '- Use o tema 0 ("Outros") só para o que não se encaixa em nenhum tema: no máximo 1 em cada 10 respostas.',
  '- Para cada tema, indique em "exemplo" o id de uma resposta que represente bem o tema.',
].join("\n");

export type ResumoAbertasSugerido = {
  sintese: string;
  temas: { titulo: string; respostas: string[]; exemplo: string | null }[];
};

export async function resumirAbertas(
  pergunta: string,
  respostas: { id: string; texto: string }[],
  modeloEscolhido?: string,
): Promise<{ resumo: ResumoAbertasSugerido; modelo: string; uso: Uso; chamadas: number } | { erro: string }> {
  const modelo = modeloEscolhido || process.env.OPENAI_MODEL || MODELO_PADRAO;
  // Números curtos no lugar dos ids internos (menos texto para a IA, nada de interno sai).
  const curtoParaId = new Map(respostas.map((r, i) => [`r${i + 1}`, r.id]));
  const entrada = respostas.map((r, i) => ({ id: `r${i + 1}`, resposta: r.texto.slice(0, 500) }));

  const primeira = await chamarOpenAI(
    modelo,
    REGRAS_ABERTAS,
    { pergunta, respostas: entrada },
    {
      type: "object",
      additionalProperties: false,
      required: ["sintese", "temas", "classificacao"],
      properties: {
        sintese: { type: "string" },
        temas: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["numero", "titulo", "exemplo"],
            properties: { numero: { type: "integer" }, titulo: { type: "string" }, exemplo: { type: "string" } },
          },
        },
        classificacao: SCHEMA_CLASSIFICACAO,
      },
    },
  );
  if ("erro" in primeira) return { erro: primeira.erro };
  const uso = { ...primeira.uso };
  let chamadas = 1;

  const bruto = primeira.dados as {
    sintese?: string;
    temas?: { numero?: number; titulo?: string; exemplo?: string }[];
    classificacao?: { chave?: string; tema?: number }[];
  };
  const sintese = String(bruto.sintese ?? "").replace(/\s+/g, " ").trim().slice(0, 800);
  if (!sintese) return { erro: "A IA não conseguiu escrever a síntese. Tente de novo." };

  const titulos = new Map<number, { titulo: string; exemplo: string | null }>();
  for (const t of bruto.temas ?? []) {
    const titulo = primeiraMaiuscula(String(t.titulo ?? ""));
    if (typeof t.numero === "number" && t.numero > 0 && titulo && titulo.toLowerCase() !== "outros") {
      titulos.set(t.numero, { titulo, exemplo: curtoParaId.get(String(t.exemplo ?? "")) ?? null });
    }
    if (titulos.size === 6) break;
  }
  if (titulos.size === 0) return { erro: "A IA não encontrou temas nessas respostas. Tente de novo." };

  const temaDe = new Map<string, number>(); // id curto -> tema (0 = Outros)
  const registrar = (lista: { chave?: string; tema?: number }[] | undefined) => {
    for (const c of lista ?? []) {
      const curto = String(c.chave ?? "");
      if (!curtoParaId.has(curto) || temaDe.has(curto)) continue;
      temaDe.set(curto, typeof c.tema === "number" && titulos.has(c.tema) ? c.tema : 0);
    }
  };
  registrar(bruto.classificacao);

  // 2ª chamada, só se a IA pulou respostas.
  const faltando = entrada.filter((r) => !temaDe.has(r.id));
  if (faltando.length > 0) {
    const segunda = await chamarOpenAI(
      modelo,
      REGRAS_ABERTAS +
        "\n\nOs temas já foram definidos (lista abaixo). Classifique SOMENTE as respostas recebidas nesses temas, " +
        'pelo número, no campo "chave" use o id da resposta; use 0 (Outros) só se nenhum servir.',
      { pergunta, temas: [...titulos].map(([numero, t]) => ({ numero, titulo: t.titulo })), respostas: faltando },
      {
        type: "object",
        additionalProperties: false,
        required: ["classificacao"],
        properties: { classificacao: SCHEMA_CLASSIFICACAO },
      },
    );
    chamadas++;
    if (!("erro" in segunda)) {
      uso.entrada += segunda.uso.entrada;
      uso.saida += segunda.uso.saida;
      registrar((segunda.dados as { classificacao?: { chave?: string; tema?: number }[] }).classificacao);
    }
  }

  const temas = [...titulos]
    .map(([numero, t]) => {
      const ids = entrada.filter((r) => temaDe.get(r.id) === numero).map((r) => curtoParaId.get(r.id)!);
      return { titulo: t.titulo, respostas: ids, exemplo: t.exemplo && ids.includes(t.exemplo) ? t.exemplo : (ids[0] ?? null) };
    })
    .filter((t) => t.respostas.length > 0);
  if (temas.length === 0) return { erro: "A IA não encontrou temas nessas respostas. Tente de novo." };
  return { resumo: { sintese, temas }, modelo, uso, chamadas };
}

// ---------------------------------------------------------------
// Consolidado de uma pergunta da biblioteca, com todas as turmas (0036,
// docs/consolidado.md). Um único conjunto de temas para todos os eventos.
// Itens: respostas abertas (chave = id da resposta) ou palavras da nuvem
// (chave = palavra normalizada). Com muitos itens, a IA define os temas com os
// primeiros 250 e classifica o resto em lotes de 250 nos mesmos temas.
// ---------------------------------------------------------------

const LOTE_CONSOLIDADO = 250;

const REGRAS_CONSOLIDADO = [
  "Você consolida respostas de VÁRIAS turmas de treinamentos presenciais para cooperativas de crédito no Brasil,",
  "todas à mesma pergunta. Escreva em português do Brasil.",
  "",
  "Síntese:",
  "- De 2 a 4 frases (até 600 caracteres) sobre o conjunto das respostas, neutra e fiel, sem nomes nem dados pessoais.",
  "",
  "Temas:",
  "- De 5 a 8 temas (com menos de 20 itens, de 2 a 5), específicos e sem sobreposição, que sirvam para comparar turmas.",
  "- O título NUNCA repete a pergunta. Até 40 caracteres, só com a primeira letra maiúscula, sem aspas e sem emojis.",
  "- Separe o que a pessoa NÃO CONSEGUE fazer (falta de dinheiro, doença, crise) do que ela NÃO QUER",
  "  (desinteresse, prioriza outra dívida, desistência). Separe emoções diferentes (vergonha, raiva, ansiedade...).",
  "",
  "Classificação:",
  '- Classifique TODOS os itens recebidos: no campo "chave" da classificação vai o "id" exatamente como recebido.',
  "- Masculino/feminino, singular/plural, erros de digitação e frases com a mesma ideia vão para o mesmo tema.",
  '- Use o tema 0 ("Outros") só para o que não se encaixa: no máximo 1 em cada 10 itens.',
  '- "vezes" é quantas vezes o item apareceu: use para decidir o que importa, nunca para contar.',
].join("\n");

type ItemConsolidado = { chave: string; texto: string; vezes: number };

// Classifica itens em temas já definidos (lotes de 250). Devolve chave -> número do tema (1..n) ou 0.
export async function classificarEmTemas(
  pergunta: string,
  temas: string[],
  itens: ItemConsolidado[],
  modeloEscolhido?: string,
): Promise<{ mapa: Record<string, number>; uso: Uso } | { erro: string }> {
  const modelo = modeloEscolhido || process.env.OPENAI_MODEL || MODELO_PADRAO;
  const mapa: Record<string, number> = {};
  const uso: Uso = { entrada: 0, saida: 0 };
  for (let i = 0; i < itens.length; i += LOTE_CONSOLIDADO) {
    const lote = itens.slice(i, i + LOTE_CONSOLIDADO);
    const curto = new Map(lote.map((x, k) => [`i${k + 1}`, x.chave]));
    const r = await chamarOpenAI(
      modelo,
      REGRAS_CONSOLIDADO +
        "\n\nOs temas já foram definidos (lista abaixo). Classifique SOMENTE os itens recebidos nesses temas, pelo número; " +
        "use 0 (Outros) só se nenhum servir.",
      {
        pergunta,
        temas: temas.map((titulo, k) => ({ numero: k + 1, titulo })),
        itens: lote.map((x, k) => ({ id: `i${k + 1}`, resposta: x.texto.slice(0, 500), vezes: x.vezes })),
      },
      { type: "object", additionalProperties: false, required: ["classificacao"], properties: { classificacao: SCHEMA_CLASSIFICACAO } },
    );
    if ("erro" in r) return { erro: r.erro };
    uso.entrada += r.uso.entrada;
    uso.saida += r.uso.saida;
    for (const c of (r.dados as { classificacao?: { chave?: string; tema?: number }[] }).classificacao ?? []) {
      const chave = curto.get(String(c.chave ?? ""));
      if (!chave || chave in mapa) continue;
      mapa[chave] = typeof c.tema === "number" && c.tema >= 1 && c.tema <= temas.length ? c.tema : 0;
    }
  }
  return { mapa, uso };
}

export async function consolidarComIA(
  pergunta: string,
  itens: ItemConsolidado[],
  modeloEscolhido?: string,
): Promise<{ sintese: string; temas: string[]; mapa: Record<string, number>; modelo: string; uso: Uso } | { erro: string }> {
  const modelo = modeloEscolhido || process.env.OPENAI_MODEL || MODELO_PADRAO;
  // Os mais citados primeiro: a amostra que define os temas é a mais representativa.
  const ordenados = [...itens].sort((a, b) => b.vezes - a.vezes);
  const amostra = ordenados.slice(0, LOTE_CONSOLIDADO);
  const curto = new Map(amostra.map((x, k) => [`i${k + 1}`, x.chave]));

  const primeira = await chamarOpenAI(
    modelo,
    REGRAS_CONSOLIDADO,
    { pergunta, itens: amostra.map((x, k) => ({ id: `i${k + 1}`, resposta: x.texto.slice(0, 500), vezes: x.vezes })) },
    {
      type: "object",
      additionalProperties: false,
      required: ["sintese", "temas", "classificacao"],
      properties: {
        sintese: { type: "string" },
        temas: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["numero", "titulo"],
            properties: { numero: { type: "integer" }, titulo: { type: "string" } },
          },
        },
        classificacao: SCHEMA_CLASSIFICACAO,
      },
    },
  );
  if ("erro" in primeira) return { erro: primeira.erro };
  const uso = { ...primeira.uso };
  const bruto = primeira.dados as {
    sintese?: string;
    temas?: { numero?: number; titulo?: string }[];
    classificacao?: { chave?: string; tema?: number }[];
  };
  const sintese = String(bruto.sintese ?? "").replace(/\s+/g, " ").trim().slice(0, 1000);

  // Temas na ordem em que a IA devolveu, renumerados 1..n.
  const numeroNovo = new Map<number, number>();
  const temas: string[] = [];
  for (const t of bruto.temas ?? []) {
    const titulo = primeiraMaiuscula(String(t.titulo ?? ""));
    if (typeof t.numero !== "number" || !titulo || titulo.toLowerCase() === "outros" || numeroNovo.has(t.numero)) continue;
    temas.push(titulo);
    numeroNovo.set(t.numero, temas.length);
    if (temas.length === 8) break;
  }
  if (temas.length === 0 || !sintese) return { erro: "A IA não conseguiu consolidar essas respostas. Tente de novo." };

  const mapa: Record<string, number> = {};
  for (const c of bruto.classificacao ?? []) {
    const chave = curto.get(String(c.chave ?? ""));
    if (!chave || chave in mapa) continue;
    mapa[chave] = typeof c.tema === "number" ? (numeroNovo.get(c.tema) ?? 0) : 0;
  }

  // O resto (e o que a IA pulou na amostra) vai em lotes, nos mesmos temas.
  const faltando = ordenados.filter((x) => !(x.chave in mapa));
  if (faltando.length > 0) {
    const resto = await classificarEmTemas(pergunta, temas, faltando, modelo);
    if ("erro" in resto) return { erro: resto.erro };
    Object.assign(mapa, resto.mapa);
    uso.entrada += resto.uso.entrada;
    uso.saida += resto.uso.saida;
  }
  return { sintese, temas, mapa, modelo, uso };
}
