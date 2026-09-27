# Biblioteca de modelos e comparativo entre eventos

Objetivo: o mesmo questionário (ex.: bloco "Quebra gelo") aplicado em vários eventos de cooperativas diferentes, com um relatório que compara as respostas de todos eles.

Decisões do Pedro (27/09/2026):

- **Só o admin** cria e edita os modelos. Instrutores só usam.
- Pergunta que veio de modelo **não pode ser alterada no evento** (nem texto, nem opções): é idêntica em todos os eventos.
- Alterar o modelo depois **não muda os eventos** que já o usaram.
- Filtros do comparativo: **cooperativa** e **período**.
- Formato: **Excel**, como o relatório do evento (uso interno da Efic).

## Como funciona

1. **Biblioteca** (`/painel/biblioteca`, só admin): lista de modelos de bloco. Cada modelo tem título e perguntas, montadas com o mesmo formulário das atividades (os seis tipos). Criar, renomear, reordenar, duplicar e arquivar modelos.
2. **Usar no evento:** na página do evento, "Adicionar bloco da biblioteca" → escolhe o modelo → o Pulse cria no evento um bloco com o título do modelo e cópias das perguntas. Cada pergunta copiada guarda **de qual pergunta do modelo veio** (`atividades.modelo_pergunta_id`).
3. **No evento**, pergunta de modelo aparece com o selo "Da biblioteca": sem "Editar"; pode abrir, encerrar, rodadas, mover de bloco, excluir. **Duplicar** uma pergunta de modelo gera pergunta comum (sem ligação), para não contar a mesma pessoa duas vezes no comparativo.
4. **Modelo alterado depois de usado:** o texto do modelo pode mudar (os eventos continuam com o texto que usaram). Tipo, opções, escala e itens de pergunta já usada ficam **travados**: para mudar, duplica-se o modelo e altera-se a cópia (vira outro modelo, outro comparativo).
5. **Comparativo** (na biblioteca, por modelo): filtros de cooperativa (uma ou várias) e período (datas do evento). Excel com:
   - **Eventos** — lista dos eventos incluídos (cooperativa, data, participantes);
   - **Comparativo** — uma linha por pergunta e opção (ou média/mediana, palavra etc.), uma coluna por evento e a coluna **Total**; rodada 1 e rodada 2 em linhas separadas;
   - **Respostas** — uma linha por resposta, com evento, cooperativa, data e o número anônimo do participante dentro do evento.

## Banco

- Tabelas `modelos` (título, arquivado) e `modelo_perguntas` (modelo, ordem, tipo, enunciado, config — mesmo CHECK de configuração das atividades). RLS: admin escreve; instrutores leem (para escolher ao montar o evento).
- `atividades.modelo_pergunta_id` (opcional), com trava: atividade ligada a modelo não muda tipo, enunciado nem config (gatilho no banco).
- Função `usar_modelo(evento, modelo)`: cria o bloco e as cópias numa operação; só para o instrutor do evento ou admin.
- Função `comparativo_modelo(modelo, cooperativas, de, ate)`: respostas anônimas de todos os eventos com perguntas do modelo, só para admin.
- Testes no `isolamento.sql`: instrutor não cria modelo, não altera pergunta de modelo no evento, não roda o comparativo; admin roda.

## Depois (fora desta etapa)

- Ligar ao modelo eventos já criados antes da biblioteca (quando as perguntas forem idênticas).

## Pronto quando

- [ ] Admin cria o modelo "Quebra gelo" com 4 perguntas.
- [ ] Em dois eventos de cooperativas diferentes, "Adicionar bloco da biblioteca" cria o bloco com as 4 perguntas, sem botão "Editar".
- [ ] Instrutor não vê a biblioteca para editar; consegue usar os modelos.
- [ ] O comparativo do modelo, filtrado por cooperativa e período, traz os dois eventos lado a lado e o total.
- [ ] Teste de isolamento passa.
