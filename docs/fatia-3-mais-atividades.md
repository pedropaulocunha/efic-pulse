# Fatia 3 — Mais atividades, rodadas e nuvem limpa

> Decisões do Pedro em 26/09/2026: ordenar por pontos; abertas só com aprovação; rodadas comparadas no telão; plural juntado na nuvem; encerrar evento pode ser desfeito (só admin); destaques são criados só pelo instrutor (fatia 4).

Objetivo: o instrutor ganha três tipos novos de atividade, pode repetir uma atividade em rodadas (antes e depois da discussão) e a nuvem de palavras chega ao telão limpa e moderada. O instrutor também pode encerrar o evento.

Pré-requisito: fatia 2 concluída e publicada.

## Tipos novos

| Tipo | Configuração (`config`) | Resposta (`valor`) | No telão |
|---|---|---|---|
| `ordenar` | `{"itens": ["A", "B", "C"]}` (3 a 6 itens) | `{"ordem": [2, 0, 1]}` (índices, do primeiro ao último) | Os itens em ordem de posição média, com barra de pontos |
| `numero` | `{"unidade": "dias", "casas": 0, "min": 0, "max": 365, "referencia": 90}` (limites e referência opcionais) | `{"numero": 45}` | Histograma em faixas automáticas, média e mediana; referência só quando revelada |
| `aberta` | `{"max_caracteres": 280}` | `{"texto": "..."}` | Mural de cartões, só com as respostas que o instrutor aprovar |

- `numero` difere da `escala`: o participante **digita** o número, sem controle deslizante e sem passo.
- No celular, `ordenar` funciona por toque: tocar os itens na ordem de preferência, com opção de desfazer. Arrastar é ruim em tela pequena.
- Resultado do `ordenar` por **pontos**: com N itens, o 1º lugar vale N pontos, o 2º vale N−1, e assim por diante. O telão mostra os itens do mais pontuado para o menos, com o total de pontos.
- `aberta`: o texto nunca mostra o nome de quem escreveu, e só aparece no telão depois de o instrutor **aprovar** o cartão no controle.

## Caso em rodadas

- A atividade ganha `rodada_atual` (padrão 1). No controle, o botão **Nova rodada** abre a mesma pergunta de novo, como rodada 2, 3…, e o participante responde do zero. A tabela `respostas` já tem a coluna `rodada` desde a fatia 2.
- O resultado agregado passa a receber a rodada. Funciona para `multipla`, `escala`, `numero` e `ordenar`.
- A partir da rodada 2, o telão **compara** a rodada 1 com a atual, com a rodada 1 em tom mais claro.
- Nuvem e abertas não têm rodadas nesta fatia.

## Nuvem limpa e moderada

- **Palavras vazias:** "de", "a", "o", "que", "para", "com", "não" etc. não entram na contagem. A lista fica num arquivo do projeto.
- **Acento e maiúsculas:** "crédito" e "credito" contam juntos. O telão mostra a forma mais usada.
- **Plural simples:** "prazos" junta com "prazo", com uma lista de exceções para palavras que já terminam em "s", como "juros" e "ônus".
- **Moderação:** no controle, o instrutor toca numa palavra para **ocultá-la** do telão. Uma lista padrão de palavrões já vem oculta. Ocultar não apaga a resposta, só a tira da nuvem.
- Todas as regras valem no banco, dentro da função `resultado_atividade`, para o telão e o controle verem a mesma coisa.

## Encerrar evento

- Na página do evento, o botão **Encerrar evento**, com confirmação. O estado vai para `encerrado`, o código de acesso fica livre para outro evento, e o celular mostra "Este evento já terminou."
- O admin pode **reabrir** um evento encerrado, se o código de acesso ainda estiver livre; se não estiver, o evento reabre com um código novo.

## Banco

- `atividades.tipo`: o CHECK ganha `ordenar`, `numero` e `aberta`; `config_atividade_valida` e `normalizar_resposta` passam a conhecer os tipos novos.
- `atividades.rodada_atual` (int, padrão 1).
- `palavras_ocultas` (atividade, palavra), para a moderação da nuvem; e `respostas.aprovada` (boolean), para as abertas.
- Mudança de CHECK em migração própria. Remoção de qualquer coisa em bloco separado (regra 4).
- Teste de isolamento: o instrutor só modera as próprias atividades, e o participante nunca lê texto de resposta aberta de outra pessoa.

## Pronto quando

- [ ] Cada tipo novo funciona de ponta a ponta: montar, abrir, responder pelo celular, mostrar no telão.
- [ ] Uma escala em duas rodadas mostra no telão a rodada 1 e a 2 comparadas.
- [ ] Na nuvem, "Crédito", "credito" e "créditos" viram uma palavra só, e "de" e "para" não aparecem.
- [ ] Uma palavra ocultada no controle some do telão em até 2 segundos.
- [ ] Uma resposta aberta só aparece no telão depois de aprovada.
- [ ] Encerrar o evento faz o celular mostrar "Este evento já terminou."
- [ ] O teste de isolamento continua passando, com os casos novos.
- [ ] O teste de carga com 40 participantes continua sem erro.

## Fora desta fatia

**Destaques** e **módulos** (grupos de destaques), criados só pelo instrutor, e **relatos** (coleta de casos reais): fatia 4. Antes dela, falta o Pedro descrever quando e onde o destaque aparece na sala.
