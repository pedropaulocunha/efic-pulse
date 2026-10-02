# Timer por pergunta

Decidido com o Pedro em 02/10/2026.

- **Cadastro:** campo opcional "Tempo para responder" (minutos e segundos, de 10 s a 30 min) na pergunta do evento e na da biblioteca. Não faz parte da pergunta para o comparativo: pode mudar no evento mesmo em pergunta da biblioteca. Duplicar pergunta, bloco ou modelo copia o tempo.
- **Começa** ao tocar em "Abrir" e reinicia em "Nova rodada". "+30 s" no controle soma 30 segundos (se já zerou, conta 30 s a partir de agora). "Encerrar" apaga o timer.
- **Só avisa:** ao zerar, aparece "Tempo esgotado", mas a votação continua aberta até o instrutor encerrar.
- **Onde aparece:** telão (canto superior direito, ao lado da pergunta), celular (acima da pergunta) e controle (com o botão "+30 s"). Nos últimos 10 segundos, muda para coral. Sem som.
- **Relógio:** quem manda é o servidor. Cada tela recebe "quanto falta" a cada consulta e conta para baixo a partir disso, então o relógio errado de um celular não atrapalha.

## Banco (0032)

- `tempo_resposta_seg` (CHECK de 10 a 1800) em `atividades` e `modelo_perguntas`; `timer_fim` em `atividades`.
- `comandar_atividade`: timer em abrir e nova rodada; comando novo `mais_tempo`; encerrar apaga.
- `sala_estado` entrega `restante_ms`; duplicar e usar modelo copiam o tempo.

## Pronto quando

- [ ] 0032 rodada e teste de isolamento passando.
- [ ] Pergunta com 1 min: ao abrir, telão, celular e controle mostram a contagem juntos.
- [ ] "+30 s" soma no telão e no celular em até 2 s.
- [ ] Ao zerar, aparece "Tempo esgotado" e ainda dá para responder até encerrar.
- [ ] Pergunta sem tempo não mostra timer.
