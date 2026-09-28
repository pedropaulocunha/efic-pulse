# IA — temas da nuvem de palavras

Primeira etapa da integração com IA (OpenAI, licença da Efic). Decidido com o Pedro em 28/09/2026.

Regras gerais da IA no Pulse:

- **A IA agrupa, o Pulse conta.** A IA só diz qual palavra vai em qual tema; quantas pessoas caíram em cada tema é contado pelo banco. Nenhum número vem da IA.
- **Nada vai ao telão sem o instrutor aprovar.** O resumo aparece primeiro no controle.
- **A IA só é chamada quando o instrutor toca em "Resumir com IA"**, nunca a cada resposta.
- **Chave só no servidor:** `OPENAI_API_KEY` nas variáveis da Vercel e no `.env.local`, sem `NEXT_PUBLIC_`. Modelo em `OPENAI_MODEL` (opcional).
- Vai para a OpenAI só o texto das palavras (anônimas) e a pergunta. Sempre marcado "Resumo por IA" no telão.
- Se a IA falhar ou demorar, a aula segue: a nuvem continua funcionando.

## Como funciona

1. Na nuvem aberta ou encerrada, o controle mostra o quadro **"Temas por IA"** com o botão **Resumir com IA**.
2. O Pulse manda à IA a pergunta e as palavras (já juntadas por acento/plural e sem as ocultas). A IA devolve de 1 a 8 temas, cada um com as palavras dele; o que não se encaixa fica em **Outros**.
3. O controle mostra cada tema com quantas pessoas (% de quem respondeu) e as palavras. O instrutor pode:
   - **renomear** um tema;
   - **mover uma palavra** de tema (toca a palavra, depois "Mover para cá" no tema certo);
   - **gerar de novo**.
4. **Mostrar temas no telão** troca a nuvem pelos temas (barras com % de pessoas e palavras de exemplo). **Voltar para a nuvem** desfaz. Como qualquer resultado, só aparece com o resultado à mostra.
5. Palavras que chegarem depois do resumo entram em **Outros** até gerar de novo; o controle avisa quantas são.
6. Cada rodada tem os seus temas.

## Banco (0031)

- Tabela `temas_nuvem` (atividade, rodada, temas em JSON, `no_telao`, modelo, quando). RLS igual à de `palavras_ocultas`: instrutor da atividade ou admin; o servidor lê para o telão.
- CHECK `temas_nuvem_validos`: de 1 a 10 temas, título de 1 a 60 caracteres, lista de palavras.
- Função `resultado_temas(atividade, rodada)`: pessoas por tema (cada pessoa conta uma vez em cada tema em que tiver palavra), com as mesmas regras de palavras vazias, bloqueadas e ocultas da nuvem. Mesma checagem de acesso de `resultado_atividade`.
- Testes no `isolamento.sql`.

## Próximas etapas (fora desta)

- Temas e síntese das respostas abertas, com ajuda na moderação.
- Resumo por IA no relatório do evento e no comparativo.

## Pronto quando

- [ ] 0031 rodada e teste de isolamento passando.
- [ ] Chave `OPENAI_API_KEY` na Vercel (e no `.env.local`), sem aparecer no chat nem no código.
- [ ] Numa nuvem com respostas, "Resumir com IA" mostra os temas no controle em até ~10 s.
- [ ] Renomear tema e mover palavra funcionam, e os números mudam.
- [ ] "Mostrar temas no telão" troca a nuvem pelos temas; "Voltar para a nuvem" desfaz.
- [ ] Sem a chave configurada, o controle explica o que falta e nada quebra.
