// Leitura da planilha de inscritos (CSV com ponto e vírgula, UTF-8).
// Sem acesso ao banco: só transforma o texto em linhas e aponta erros de formato.

import { emailValido, normalizarEmail, textoLimpo } from "@/lib/formatos";

export const LIMITE_LINHAS = 2000;

export type LinhaPlanilha = {
  linha: number; // número da linha na planilha, contando o cabeçalho
  nome: string;
  email: string;
  cargo: string;
  agencia: string;
  erro?: string;
};

// Divide o CSV em células, respeitando aspas ("Silva; Souza" é uma célula só).
export function lerCsv(texto: string, separador = ";"): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = "";
  let entreAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreAspas) {
      if (c === '"' && texto[i + 1] === '"') {
        celula += '"';
        i++;
      } else if (c === '"') {
        entreAspas = false;
      } else {
        celula += c;
      }
    } else if (c === '"' && celula === "") {
      // Aspas só abrem um trecho protegido no começo da célula.
      entreAspas = true;
    } else if (c === separador) {
      linha.push(celula);
      celula = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(celula);
      linhas.push(linha);
      linha = [];
      celula = "";
    } else {
      celula += c;
    }
  }
  if (celula !== "" || linha.length > 0) {
    linha.push(celula);
    linhas.push(linha);
  }
  return linhas;
}

// "E-mail", "Agência" → "email", "agencia"
function normalizarTitulo(titulo: string) {
  return titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export function interpretarPlanilha(textoBruto: string): { erro?: string; linhas: LinhaPlanilha[] } {
  const texto = textoBruto.replace(/^\uFEFF/, "");

  if (texto.includes("\uFFFD")) {
    return {
      erro: "A planilha não está em UTF-8, e os acentos se perderam. No Excel, use Salvar como → “CSV UTF-8”.",
      linhas: [],
    };
  }

  // Guarda o número de cada linha como o Excel mostra, antes de pular as vazias.
  const tabela = lerCsv(texto)
    .map((celulas, i) => ({ celulas, numero: i + 1 }))
    .filter(({ celulas }) => celulas.some((c) => c.trim() !== ""));
  if (tabela.length === 0) return { erro: "A planilha está vazia.", linhas: [] };

  if (tabela.every(({ celulas }) => celulas.length === 1 && celulas[0].includes(","))) {
    return {
      erro: "As colunas precisam ser separadas por ponto e vírgula (;), e não por vírgula.",
      linhas: [],
    };
  }

  // Cabeçalho opcional: Nome;Email;Cargo;Agencia (em qualquer ordem, com ou sem acento).
  let colunas = { nome: 0, email: 1, cargo: 2, agencia: 3 };
  let inicio = 0;
  const titulos = tabela[0].celulas.map(normalizarTitulo);
  if (titulos.includes("nome") || titulos.includes("email")) {
    const achar = (nome: string) => titulos.indexOf(nome);
    if (achar("nome") < 0 || achar("email") < 0) {
      return { erro: "O cabeçalho precisa ter as colunas Nome e Email.", linhas: [] };
    }
    colunas = { nome: achar("nome"), email: achar("email"), cargo: achar("cargo"), agencia: achar("agencia") };
    inicio = 1;
  }

  const dados = tabela.slice(inicio);
  if (dados.length > LIMITE_LINHAS) {
    return { erro: `A planilha tem mais de ${LIMITE_LINHAS} linhas. Divida em partes.`, linhas: [] };
  }

  const celula = (celulas: string[], indice: number) => (indice >= 0 ? celulas[indice] ?? "" : "");
  const primeiraLinhaDoEmail = new Map<string, number>();

  const linhas = dados.map(({ celulas, numero }): LinhaPlanilha => {
    const item: LinhaPlanilha = {
      linha: numero,
      nome: textoLimpo(celula(celulas, colunas.nome), 120),
      email: normalizarEmail(celula(celulas, colunas.email)),
      cargo: textoLimpo(celula(celulas, colunas.cargo), 120),
      agencia: textoLimpo(celula(celulas, colunas.agencia), 120),
    };

    if (!item.nome) {
      item.erro = "Nome vazio";
    } else if (!emailValido(item.email)) {
      item.erro = item.email ? "E-mail inválido" : "E-mail vazio";
    } else if (primeiraLinhaDoEmail.has(item.email)) {
      item.erro = `E-mail repetido (igual à linha ${primeiraLinhaDoEmail.get(item.email)})`;
    } else {
      primeiraLinhaDoEmail.set(item.email, item.linha);
    }
    return item;
  });

  return { linhas };
}
