# Verificações no navegador

O teste usa Chromium real e intercepta Supabase e todas as funções remotas da aplicação. Um servidor HTTP local envia eventos NDJSON espaçados para verificar chegada progressiva e cancelamento de rede. Não há chamada a provedores de IA nem login de teste na aplicação publicada.

Instale com `npm ci` e prepare o navegador com `npx playwright install chromium`. Se houver Chromium instalado no sistema, informe seu caminho em `CHROMIUM_PATH`.

Inicie o Vite em outro terminal, sem criar ou editar `.env`:

```sh
VITE_SUPABASE_URL=https://gstudy-test.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=test-public-key SUPABASE_URL=https://gstudy-test.supabase.co SUPABASE_PUBLISHABLE_KEY=test-public-key npm run dev -- --host 127.0.0.1 --port 3002 --mode e2e
```

Execute `npm run test:stream`. `QA_BASE_URL` altera o endereço do servidor local. `QA_OUTPUT` altera a pasta do relatório, capturas e traces; o padrão é `/tmp/gstudy-stream-check`.

São dez cenários: Feynman, Sócrates, quiz, flashcards e explicações em 390 e 1440 px. O teste confere o primeiro trecho antes da conclusão, parada de rede e preservação do texto do Sócrates após recarregar. Nas atividades estruturadas, confere o primeiro item, parada sem descartar o recebido e repetição até a atividade completa. Nenhum desses resultados comprova disponibilidade ou latência de provedores reais.

Os testes Vitest de streaming usam os SDKs reais com HTTP simulado para verificar a cadeia de provedores, resposta vazia, erros técnicos, timeout, falha após o primeiro trecho, uso informado pelo provedor e cancelamento. Os testes do servidor de Sócrates também verificam que o ticket de reserva nunca chega ao cliente e que interrupções com texto recebido não geram devolução integral do consumo.

## Jogos

Com o mesmo servidor local, execute `npm run test:games`. São 80 partidas completas: oito mecânicas em 360, 390, 430, 768 e 1440 px, nos temas claro e escuro. O teste usa os controles visíveis, verifica a última resposta na pontuação, o registro de XP confirmado, ausência de erros JavaScript e de transbordamento horizontal. Supabase e IA são interceptados; estes resultados não comprovam disponibilidade do banco publicado. As permissões, limites e idempotência dos RPCs são verificados separadamente no harness PGlite.

`QA_WIDTHS=390,1440` limita as larguras. `QA_OUTPUT` define a pasta de relatório, capturas e traces (padrão `/tmp/gstudy-games-check`). O relatório é salvo a cada partida. Se a execução for interrompida, `QA_RESUME=1` retoma apenas os cenários que faltaram ou falharam; use essa opção somente com os mesmos arquivos da aplicação. Alterações no aplicativo exigem uma nova rodada em outra pasta.
