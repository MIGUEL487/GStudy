# Verificações no navegador

## Perfil e amigos

Com o Vite de teste na porta 3002, execute `CHROMIUM_PATH=/usr/bin/chromium npm run test:social`. Para outra porta use `QA_BASE_URL`. O script abre duas contas em contextos isolados e encaminha as requisições Supabase para um PGlite local, com todas as migrações e os papéis reais. IA fica bloqueada.

O fluxo confere a soma de pedido e mensagem não lida; abre a conversa e verifica a leitura no banco; envia texto matemático sem perder `<` e `>`; denuncia e bloqueia; busca por username e e-mail; recusa, cancela, envia e aceita pedidos; preserva outro amigo ao bloquear; salva nome/ano na conta; cria uma única notificação de novo ano e confirma sua etapa pelo painel. O padrão cobre 390/1440 px, claro/escuro. `QA_WIDTHS`, `QA_THEMES` e `QA_OUTPUT` limitam a rodada e definem a pasta de capturas, traces e relatório.

O simulador respeita o retorno mínimo de INSERT/UPDATE do PostgREST. Uma denúncia pode ser enviada sem conceder ao remetente acesso de leitura à tabela de moderação. As verificações administrativas usam somente o banco isolado do teste. Não alteramos as policies para fazer a simulação passar, e estes resultados não comprovam o serviço Realtime hospedado nem um dispositivo físico.

## Streaming

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

## Chamadas

Execute `npm run test:voice` com o servidor local acima. São dois contextos reais do Chromium em 390 e 1440 px, claro e escuro. Supabase é interceptado no navegador e encaminhado a um PGlite isolado que executa todas as migrações e os RPCs reais com a identidade de cada contexto. IA fica bloqueada. A mídia usa `RTCPeerConnection`, `getUserMedia`, áudio de teste, análise de nível e, quando autorizado pelo navegador, captura da aba real.

O fluxo verifica convite sem abertura de mídia, recusa e espera real de 30 segundos, Não perturbar com notificação silenciosa, atendimento com microfone desligado, conexão entre os dois contextos, bytes de áudio recebidos, indicador de fala, mudo, silêncio imposto pelo responsável, vídeo compartilhado e encerramento ao sair. Falhas deixam trace, captura e diagnóstico em `QA_OUTPUT` (padrão `/tmp/gstudy-voice-check`). Receber vídeo só conta como confirmado quando o elemento tem frames disponíveis. Estas verificações não usam o serviço Realtime hospedado: exercitam a recuperação por consulta de sinalização, protegida pelas RLS reais. Realtime em produção e dispositivos físicos continuam exigindo verificação após configuração manual.

Neste ambiente o Chromium aplica a policy gerenciada `WebRtcIPHandling=disable_non_proxied_udp`. Sem TURN, não fornece candidatos ICE; a aplicação mostra a limitação de rede. A policy não foi modificada. Para reproduzir o caminho TURN por TCP **somente no computador de teste**, instale o relay opcional fora do aplicativo:

```sh
npm install --prefix /tmp/gstudy-qa-relay --ignore-scripts --no-audit --no-fund node-turn@0.0.6
QA_TURN_MODULE=/tmp/gstudy-qa-relay/node_modules/node-turn node scripts/qa-turn-relay.mjs
```

Em outro terminal, acrescente ao comando Vite de teste: `VITE_TURN_URL='turn:127.0.0.1:3480?transport=tcp' VITE_TURN_USERNAME=gstudy-local-qa VITE_TURN_CREDENTIAL=local-test-only`. As credenciais são públicas, descartáveis e válidas somente para o relay ligado em loopback. Nenhum `.env` é criado. O pacote opcional serve exclusivamente ao QA, não foi adicionado às dependências do GStudy e não é um servidor TURN de produção. Encerre o processo do relay após testar.

Se usar a porta 3003 para esse Vite, execute `QA_BASE_URL=http://127.0.0.1:3003 npm run test:voice`. Pode apontar o Vite a um TURN de teste já disponível em vez do relay local. Em redes sem esse requisito, o STUN pode ser suficiente.
