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
const TEMPO_MAXIMO_MS = 45_000;
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

  let resposta: Response;
  try {
    resposta = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelo,
        temperature: 0.2,
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
  } catch (e) {
    console.error("OpenAI (rede):", e);
    return { erro: "A IA não respondeu a tempo. Tente de novo em instantes." };
  }

  if (!resposta.ok) {
    // Nunca registra a chave; só o código e o começo da mensagem de erro.
    console.error("OpenAI:", resposta.status, (await resposta.text()).slice(0, 300));
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
