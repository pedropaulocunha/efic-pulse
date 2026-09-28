import "server-only";

// Integração com a OpenAI (docs/ia-temas-nuvem.md). Só no servidor: a chave fica
// em OPENAI_API_KEY (variáveis da Vercel / .env.local), nunca no navegador.
// A IA só AGRUPA; quem conta pessoas por tema é o banco (resultado_temas, 0031).

const MODELO_PADRAO = "gpt-4o-mini";
const TEMPO_MAXIMO_MS = 30_000;

export function iaConfigurada() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export type TemaSugerido = { titulo: string; chaves: string[] };

type PalavraNuvem = { palavra: string; chave: string; n: number };

// Pede à IA os temas das palavras da nuvem. Devolve temas já conferidos:
// só chaves que existem, cada chave em um tema só, sem tema vazio, até 8 temas.
export async function sugerirTemas(
  pergunta: string,
  palavras: PalavraNuvem[],
): Promise<{ temas: TemaSugerido[]; modelo: string } | { erro: string }> {
  const chave = process.env.OPENAI_API_KEY;
  if (!chave) return { erro: "A IA não está configurada (falta a chave OPENAI_API_KEY na Vercel)." };
  const modelo = process.env.OPENAI_MODEL || MODELO_PADRAO;

  const instrucoes = [
    "Você organiza respostas de uma nuvem de palavras de um treinamento presencial para cooperativas de crédito no Brasil.",
    "Agrupe as respostas em temas, em português do Brasil.",
    "Regras:",
    "- De 2 a 8 temas; com poucas palavras, menos temas (nunca mais temas do que metade das palavras, arredondando para cima).",
    "- Título curto e claro (até 40 caracteres), sem emojis, sem aspas, com a primeira letra maiúscula.",
    '- Use as "chaves" exatamente como recebidas. Cada chave em no máximo um tema. Não invente chaves.',
    '- Atenção a sentidos opostos e negações: "vergonha" e "sem vergonha" NÃO são o mesmo tema.',
    "- Palavras que não se encaixam em nenhum tema ficam de fora (o sistema as coloca em Outros).",
    '- "vezes" é quantas vezes a palavra apareceu: use para decidir quais temas são mais importantes, não para contar.',
  ].join("\n");

  const entrada = {
    pergunta,
    respostas: palavras.map((p) => ({ chave: p.chave, palavra: p.palavra, vezes: p.n })),
  };

  let resposta: Response;
  try {
    resposta = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelo,
        temperature: 0.2,
        messages: [
          { role: "system", content: instrucoes },
          { role: "user", content: JSON.stringify(entrada) },
        ],
        // Saída em JSON com formato fixo (structured outputs).
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "temas_nuvem",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["temas"],
              properties: {
                temas: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["titulo", "chaves"],
                    properties: {
                      titulo: { type: "string" },
                      chaves: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
      cache: "no-store",
    });
  } catch (e) {
    console.error("sugerirTemas (rede):", e);
    return { erro: "A IA não respondeu a tempo. Tente de novo em instantes." };
  }

  if (!resposta.ok) {
    // Nunca registra a chave; só o código e o começo da mensagem de erro.
    console.error("sugerirTemas:", resposta.status, (await resposta.text()).slice(0, 300));
    if (resposta.status === 401) return { erro: "A chave da OpenAI foi recusada. Confira OPENAI_API_KEY na Vercel." };
    if (resposta.status === 429) return { erro: "Limite de uso da OpenAI atingido. Tente de novo em instantes ou confira o saldo da conta." };
    return { erro: "A IA não conseguiu resumir agora. Tente de novo em instantes." };
  }

  let bruto: { temas?: { titulo?: unknown; chaves?: unknown }[] };
  try {
    const dados = await resposta.json();
    bruto = JSON.parse(dados.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return { erro: "A IA respondeu num formato inesperado. Tente de novo." };
  }

  // Conferência: a IA não decide nada que o Pulse não possa checar.
  const existentes = new Set(palavras.map((p) => p.chave));
  const usadas = new Set<string>();
  const temas: TemaSugerido[] = [];
  for (const t of bruto.temas ?? []) {
    const titulo = String(t.titulo ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    const chaves = (Array.isArray(t.chaves) ? t.chaves : [])
      .map(String)
      .filter((c) => existentes.has(c) && !usadas.has(c));
    if (!titulo || chaves.length === 0 || titulo.toLowerCase() === "outros") continue;
    chaves.forEach((c) => usadas.add(c));
    temas.push({ titulo, chaves });
    if (temas.length === 8) break;
  }
  if (temas.length === 0) return { erro: "A IA não encontrou temas nessas respostas. Tente de novo." };
  return { temas, modelo };
}
