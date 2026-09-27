# Fatia 2 — Sala ao vivo

Objetivo: o Pulse vai para uma turma de verdade. Você cria atividades no evento, abre e encerra pelo tablet, o celular do participante troca sozinho de tela, e o resultado aparece só no telão.

Pré-requisito: fatia 1 concluída e publicada.

## Tipos desta fatia

Só três, para chegar à sala o quanto antes. Os outros vêm na fatia 3.

| Tipo | Configuração (`config`, jsonb) | Resposta (`valor`, jsonb) |
|---|---|---|
| `multipla` | `{"opcoes": ["A", "B", "C"]}` (2 a 6 opções) | `{"opcao": 1}` (índice) |
| `escala` | `{"min": 0, "max": 100, "passo": 5, "unidade": "%", "referencia": 35}` (referência opcional) | `{"numero": 40}` |
| `nuvem` | `{"max_palavras": 3}` | `{"palavras": ["caixa", "prazo"]}` |

Nesta fatia a nuvem só junta minúsculas e tira espaços. A limpeza completa (palavras vazias, plural, acento, moderação) é da fatia 3.

## Banco

**atividades**
- `id`, `evento_id`, `ordem`, `tipo` (CHECK nos três acima), `enunciado`, `config` (jsonb), `estado` (CHECK em `fechada`, `aberta`, `encerrada`; padrão `fechada`), `resultado_visivel` (boolean, padrão falso), `referencia_revelada` (boolean, padrão falso), `aberta_em`, `encerrada_em`

**eventos** ganha `atividade_atual_id`, que diz ao celular o que mostrar.

**respostas**
- `id`, `atividade_id`, `inscricao_id`, `rodada` (int, padrão 1, já preparado para a fatia 3), `valor` (jsonb), `criado_em`, `atualizado_em`
- Único em (`atividade_id`, `inscricao_id`, `rodada`). Responder de novo com a votação aberta **substitui** a resposta anterior: vale a última.

**Função `resultado_atividade(atividade_id)`**, SECURITY DEFINER, `search_path` fixado: devolve só números agregados (contagem por opção; histograma, média e mediana da escala; frequência de palavras da nuvem) e o total de respostas. **Nunca devolve quem respondeu.** Projeção e controle leem o resultado só por ela.

Regras:
- Só uma atividade `aberta` por evento. Abrir outra encerra a anterior, na mesma transação.
- O servidor recusa resposta para atividade que não está `aberta`.
- Instrutor lê e escreve as atividades dos próprios eventos; respostas ele só lê pela função agregada. Acrescentar esses casos ao teste de isolamento.

## Tempo real

Supabase Realtime, canal Broadcast por evento, com o nome `evento:<id do evento>` (o uuid, nunca o código de acesso).

- **O aviso não carrega dado.** O servidor envia só `{"tipo": "estado"}` quando algo muda no evento (abrir, encerrar, mostrar resultado, revelar referência) e `{"tipo": "resposta"}` quando chega uma resposta.
- **Quem recebe o aviso consulta o servidor** e redesenha. O banco guarda a verdade; o aviso só acorda a tela.
- **Rede de segurança:** toda tela também consulta o servidor a cada 15 segundos e sempre que volta a ficar visível (`visibilitychange`), para o celular que bloqueou a tela ou perdeu o Wi-Fi se acertar sozinho.
- A projeção redesenha o resultado no máximo uma vez por segundo, mesmo com muitas respostas chegando juntas.

## Telas do instrutor

**Montar atividades** (dentro da página do evento): criar, editar, excluir e reordenar atividades, com um formulário por tipo. Na escala, mínimo, máximo, passo, unidade e referência opcional; o formulário recusa passo que não divide o intervalo.

**Controle** (`/painel/evento/<id>/controle`), pensado para tablet na mão, botões de pelo menos 44 px:
- lista das atividades na ordem, com o estado de cada uma;
- na atividade selecionada: **Abrir**, **Encerrar**, **Mostrar resultado / Esconder resultado** e, na escala com referência, **Revelar referência**;
- contador "X respostas de Y inscritos", sem nomes;
- uma prévia pequena do que está no telão.

**Projeção** (`/projecao/<projecao_token>`), sem login, para abrir em tela cheia no notebook ou no computador da sala:
- sem nenhum botão;
- mostra a pergunta da atividade atual e, só quando `resultado_visivel`, o resultado: barras na múltipla escolha, histograma com média e mediana na escala (com a referência sobreposta quando revelada), nuvem de palavras;
- canto fixo com o wordmark, `pulse.efic.com.br` e o código de acesso em letras grandes;
- sem atividade aberta: o nome do evento e o código, grandes.
- No painel do evento, um botão "Abrir projeção" e "Copiar link da projeção".

## Tela do participante (`/sala`)

Segue os estados da especificação:

| Momento | Tela |
|---|---|
| Sem atividade aberta | Nome do evento, código e "A próxima atividade aparece aqui sozinha." |
| Atividade aberta | A pergunta e o controle do tipo: botões grandes na múltipla escolha, controle deslizante que só para nos passos na escala (com o valor grande acima enquanto arrasta), até três campos na nuvem. Botão "Enviar". |
| Depois de enviar | "Resposta enviada." com a opção "Mudar minha resposta" enquanto estiver aberta. Vibração curta no Android, se o aparelho permitir. |
| Encerrada | "Votação encerrada. Acompanhe no telão." |

**O celular nunca mostra resultado**, nem a referência da escala.

## Teste de carga

Antes de levar à primeira turma:

- Um evento de teste com 40 inscritos fictícios (`teste01@pulse.teste` a `teste40@pulse.teste`), criado por um script em `scripts/`, e um comando para apagá-lo depois.
- Um script k6 em `scripts/carga/` que faz os 40 entrarem pelo código e pelo e-mail, esperarem uma atividade aberta e responderem quase ao mesmo tempo. O Claude Code indica como instalar o k6 no Windows e como rodar.
- Olhar o resultado também pela tabela de funções da Vercel, e não só pelo k6: no Estimador, o gargalo aparente era a internet da máquina de teste.

## Pronto quando

- [x] Com projeção no notebook, controle no tablet e três celulares, abrir uma atividade faz os três celulares trocarem de tela em até 2 segundos.
  - Testado em 26/09/2026 com um celular real (troca "quase instantânea") e controle e projeção no mesmo computador; no teste automático, a troca levou 0,4 s. Falta repetir com tablet e três celulares numa sala.
- [x] Mudar a resposta com a votação aberta substitui a anterior, e o contador não aumenta.
- [x] O resultado só aparece no telão quando o instrutor mostra, e nunca no celular.
- [x] A referência da escala só aparece quando revelada.
- [x] Um celular com a tela bloqueada durante a abertura mostra a atividade certa ao ser desbloqueado.
- [x] O link da projeção abre sem login e não comanda nada.
- [x] 40 participantes simulados respondem sem erro, com as funções abaixo de 1 segundo na tabela da Vercel.
  - 26/09/2026: sem erro, mas entrar levava 1,31 s (p95) com os 40 no mesmo instante; o Supabase Micro atende em torno de 40 pedidos por segundo.
  - 27/09/2026, depois da fatia 3: k6 com 2223 de 2223 verificações; dentro do servidor (p95) entrar 0,79 s, estado 0,61 s, responder 0,17 s. Todos abaixo de 1 s, ainda no Micro.
  - Upgrade para Small: não é mais obrigatório; fica como folga opcional, decisão do Pedro.
- [x] O teste de isolamento continua passando.

## Fora desta fatia

Ordenar, resposta numérica, respostas abertas, caso em rodadas, limpeza e moderação da nuvem, destaques. É a fatia 3 em diante.
