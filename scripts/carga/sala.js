// Teste de carga da sala ao vivo (k6).
// 40 participantes entram pelo código e pelo e-mail, esperam uma atividade
// aberta e respondem quase ao mesmo tempo.
//
//   k6 run -e CODIGO=XXXX scripts/carga/sala.js
//
// Opções: -e BASE=https://pulse.efic.com.br  -e PARTICIPANTES=40  -e ESPERA_MAX=300 (segundos)
// Antes: node --env-file=.env.local scripts/evento-teste.mjs criar (mostra o código).

import http from "k6/http";
import { check, fail, sleep } from "k6";
import exec from "k6/execution";

const BASE = __ENV.BASE || "https://pulse.efic.com.br";
const CODIGO = (__ENV.CODIGO || "").toUpperCase();
const PARTICIPANTES = Number(__ENV.PARTICIPANTES || 40);
const ESPERA_MAX = Number(__ENV.ESPERA_MAX || 300);

export const options = {
  scenarios: {
    sala: {
      executor: "per-vu-iterations",
      vus: PARTICIPANTES,
      iterations: 1,
      maxDuration: `${ESPERA_MAX + 120}s`,
    },
  },
  thresholds: {
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    "http_req_duration{nome:entrar}": ["p(95)<1500"],
    "http_req_duration{nome:estado}": ["p(95)<1000"],
    "http_req_duration{nome:responder}": ["p(95)<1000"],
  },
};

const json = (nome) => ({ headers: { "Content-Type": "application/json" }, tags: { nome } });

function email(numero) {
  return `teste${String(numero).padStart(2, "0")}@pulse.teste`;
}

// Confere o código com UM participante antes de soltar os 40: com código errado,
// 40 tentativas erradas bloqueariam o IP desta máquina por alguns minutos.
export function setup() {
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/.test(CODIGO)) {
    fail("Informe o código de acesso: k6 run -e CODIGO=XXXX scripts/carga/sala.js");
  }
  const r = http.post(`${BASE}/api/sala/entrar`, JSON.stringify({ codigo: CODIGO, email: email(1) }), json("entrar"));
  if (r.status !== 200) fail(`O código ${CODIGO} não funcionou (${r.status}: ${r.body}). Confira o evento de teste.`);
  console.log(`Código ${CODIGO} conferido. Abra uma atividade no controle: os ${PARTICIPANTES} vão responder.`);
}

function sortear(n) {
  return Math.floor(Math.random() * n);
}

const PALAVRAS = ["prazo", "caixa", "renda", "juros", "cadastro", "contato", "confiança", "garantia", "acordo", "renegociação"];

function valorAleatorio(atividade) {
  const c = atividade.config;
  if (atividade.tipo === "multipla") return { opcao: sortear(c.opcoes.length) };
  if (atividade.tipo === "escala") {
    const passos = Math.round((c.max - c.min) / c.passo);
    return { numero: Number((c.min + sortear(passos + 1) * c.passo).toFixed(6)) };
  }
  const quantas = 1 + sortear(c.max_palavras);
  return { palavras: Array.from({ length: quantas }, () => PALAVRAS[sortear(PALAVRAS.length)]) };
}

export default function participante() {
  const meuEmail = email(exec.vu.idInTest);

  // 1. Entrar (o k6 guarda o cookie da sessão de cada participante).
  let r = http.post(`${BASE}/api/sala/entrar`, JSON.stringify({ codigo: CODIGO, email: meuEmail }), json("entrar"));
  if (!check(r, { "entrou na sala": (x) => x.status === 200 })) {
    console.error(`${meuEmail} não entrou: ${r.status} ${r.body}`);
    return;
  }

  // 2. Esperar uma atividade aberta (consulta a cada 2 s).
  const limite = Date.now() + ESPERA_MAX * 1000;
  let atividade = null;
  while (Date.now() < limite) {
    r = http.get(`${BASE}/api/sala/estado`, { tags: { nome: "estado" } });
    check(r, { "consultou a sala": (x) => x.status === 200 });
    const corpo = r.status === 200 ? r.json() : null;
    if (corpo && corpo.atividade && corpo.atividade.estado === "aberta") {
      atividade = corpo.atividade;
      break;
    }
    sleep(2);
  }
  if (!check(atividade, { "viu a atividade aberta": (a) => a !== null })) return;

  // 3. Responder quase ao mesmo tempo (espalhado em até 2 s).
  sleep(Math.random() * 2);
  r = http.post(
    `${BASE}/api/sala/responder`,
    JSON.stringify({ atividade_id: atividade.id, valor: valorAleatorio(atividade) }),
    json("responder"),
  );
  if (!check(r, { "resposta aceita": (x) => x.status === 200 })) {
    console.error(`${meuEmail} não respondeu: ${r.status} ${r.body}`);
  }
}
