// Evento de teste de carga: seis atividades (uma de cada tipo), em dois blocos.
// Os participantes entram só com o código (o k6 faz isso por eles).
//
// No PowerShell, dentro da pasta do projeto:
//   node --env-file=.env.local scripts/evento-teste.mjs criar
//   node --env-file=.env.local scripts/evento-teste.mjs apagar
//
// Usa a chave secreta do .env.local. O evento fica em nome do primeiro admin.

import { createClient } from "@supabase/supabase-js";

const NOME = "TESTE DE CARGA — pode apagar";
const COOPERATIVA = "Cooperativa de Teste de Carga";

if (!process.env.SUPABASE_SECRET_KEY) {
  console.error("Falta SUPABASE_SECRET_KEY. Rode com: node --env-file=.env.local scripts/evento-teste.mjs criar");
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

function falhar(etapa, error) {
  console.error(`Erro ao ${etapa}:`, error.message);
  process.exit(1);
}

async function criar() {
  const existente = await db.from("eventos").select("id, codigo_acesso, projecao_token").eq("nome_turma", NOME).maybeSingle();
  if (existente.error) falhar("procurar evento", existente.error);
  if (existente.data) {
    console.log("O evento de teste já existe.");
    return mostrar(existente.data);
  }

  const admin = await db.from("perfis").select("id").eq("papel", "admin").limit(1).single();
  if (admin.error) falhar("achar um admin", admin.error);

  let coop = await db.from("cooperativas").select("id").eq("nome", COOPERATIVA).maybeSingle();
  if (!coop.data) coop = await db.from("cooperativas").insert({ nome: COOPERATIVA, uf: "SC" }).select("id").single();
  if (coop.error) falhar("criar cooperativa", coop.error);

  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
  const evento = await db
    .from("eventos")
    .insert({ cooperativa_id: coop.data.id, nome_turma: NOME, data_inicio: hoje, data_fim: hoje, instrutor_id: admin.data.id })
    .select("id, codigo_acesso, projecao_token")
    .single();
  if (evento.error) falhar("criar evento", evento.error);

  const blocos = await db
    .from("blocos")
    .insert([
      { evento_id: evento.data.id, ordem: 1, titulo: "Abertura" },
      { evento_id: evento.data.id, ordem: 2, titulo: "Estudo de caso 1" },
    ])
    .select("id, ordem")
    .order("ordem");
  if (blocos.error) falhar("criar blocos", blocos.error);
  const [abertura, caso1] = blocos.data.map((b) => b.id);

  const atividades = await db.from("atividades").insert([
    {
      evento_id: evento.data.id,
      bloco_id: abertura,
      ordem: 1,
      tipo: "multipla",
      enunciado: "Qual a principal causa de atraso na sua agência?",
      config: { opcoes: ["Desemprego", "Doença na família", "Descontrole financeiro", "Queda nas vendas"] },
    },
    {
      evento_id: evento.data.id,
      bloco_id: abertura,
      ordem: 2,
      tipo: "escala",
      enunciado: "Quanto da carteira em atraso vocês recuperam em 90 dias?",
      config: { min: 0, max: 100, passo: 5, unidade: "%", referencia: 35 },
    },
    {
      evento_id: evento.data.id,
      bloco_id: abertura,
      ordem: 3,
      tipo: "nuvem",
      enunciado: "Em até três palavras: o que trava a cobrança?",
      config: { max_palavras: 3 },
    },
    {
      evento_id: evento.data.id,
      bloco_id: caso1,
      ordem: 1,
      tipo: "ordenar",
      enunciado: "Ordene as etapas da cobrança, da primeira à última.",
      config: { itens: ["Contato amigável", "Negociação", "Acordo formal", "Cobrança judicial"] },
    },
    {
      evento_id: evento.data.id,
      bloco_id: caso1,
      ordem: 2,
      tipo: "numero",
      enunciado: "Em quantos dias de atraso vocês fazem o primeiro contato?",
      config: { casas: 0, unidade: "dias", min: 0, max: 120, referencia: 5 },
    },
    {
      evento_id: evento.data.id,
      bloco_id: caso1,
      ordem: 3,
      tipo: "aberta",
      enunciado: "Conte, em uma frase, um caso de renegociação que deu certo.",
      config: { max_caracteres: 280 },
    },
  ]);
  if (atividades.error) falhar("criar atividades", atividades.error);

  console.log("Evento de teste criado com 2 blocos e 6 atividades.");
  mostrar(evento.data);
}

function mostrar(evento) {
  const base = "https://pulse.efic.com.br";
  console.log("");
  console.log(`  Código de acesso:  ${evento.codigo_acesso}`);
  console.log(`  Página do evento:  ${base}/painel/evento/${evento.id}`);
  console.log(`  Controle:          ${base}/painel/evento/${evento.id}/controle`);
  console.log(`  Projeção:          ${base}/projecao/${evento.projecao_token}`);
  console.log("");
  console.log(`  Teste de carga:    k6 run -e CODIGO=${evento.codigo_acesso} scripts/carga/sala.js`);
}

async function apagar() {
  const eventos = await db.from("eventos").select("id").eq("nome_turma", NOME);
  if (eventos.error) falhar("procurar evento", eventos.error);

  // Apagar o evento leva junto inscrições, sessões, atividades e respostas.
  if (eventos.data.length > 0) {
    const r = await db.from("eventos").delete().in("id", eventos.data.map((e) => e.id));
    if (r.error) falhar("apagar evento", r.error);
  }

  const coop = await db.from("cooperativas").select("id, eventos(id)").eq("nome", COOPERATIVA);
  const coopSoltas = (coop.data ?? []).filter((c) => c.eventos.length === 0).map((c) => c.id);
  if (coopSoltas.length > 0) await db.from("cooperativas").delete().in("id", coopSoltas);

  console.log(`Apagado: ${eventos.data.length} evento(s) de teste.`);
}

const acao = process.argv[2];
if (acao === "criar") await criar();
else if (acao === "apagar") await apagar();
else {
  console.log("Use: node --env-file=.env.local scripts/evento-teste.mjs criar | apagar");
  process.exit(1);
}
