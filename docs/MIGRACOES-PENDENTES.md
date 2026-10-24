# Migrações Pendentes - Supabase Postgres

Este documento rastreia as migrations geradas no código e prontas para execução nos ambientes de banco de dados do Supabase.

## Ordem e limites de aplicação

Em um banco novo, aplique `0000` a `0016`, em ordem. Em um banco existente, confira o histórico e aplique somente as migrações pendentes. As migrações históricas contêm `CREATE POLICY` sem proteção contra repetição; não reaplique indiscriminadamente. As correções `0013` a `0016` são aditivas e podem ser reaplicadas.

Nenhuma migração foi aplicada ao banco remoto durante esta correção. O harness PGlite executa a sequência completa com `auth.uid()` e os papéis `anon`, `authenticated` e `service_role`; verifica acessos e escritas reais entre duas identidades, inclusive tentativas indevidas.

## 0016_voice_calls.sql

- Chamadas começam somente pelo botão Ligar; entrar em uma sala não abre conexão nem pede microfone. `voice_calls`, `call_members`, `call_invites`, `call_preferences` e `call_signals` usam RLS, escrita somente por RPC e identidade de `auth.uid()`. A chamada admite seis participantes aceitos, começa mutada e expira após oito horas; participações sem heartbeat por três minutos deixam de autorizar acesso.
- Convites duram 30 segundos. `respond_voice_invite` aceita somente o destinatário; recusas impõem 30 segundos de espera no servidor, inclusive entre chamadas diferentes. Não perturbar é salvo por conta: uma hora, até meia-noite de São Paulo ou até desligar. Convites silenciosos e expirados geram notificação perdida uma vez, consultada também ao reabrir o app.
- A sinalização usa registros imutáveis criados por `send_voice_signal`; o destinatário recebe somente registros que o servidor atribuiu ao remetente autenticado. O código não confia em identidade enviada por broadcast. Há deduplicação no cliente, limites no servidor e recuperação por consulta a cada três segundos se um evento Realtime se perder. Registros com mais de 90 segundos ficam invisíveis e são removidos no próximo envio.
- Habilite `call_signals`, `call_members` e `call_invites` na publicação `supabase_realtime` pelo painel Supabase. A migração adiciona uma policy de leitura em `realtime.messages` quando esse schema existe, para canais privados `voice:<UUID>` de participantes ativos. Não concede envio de broadcast. Audite policies Realtime antigas permissivas do projeto; o harness local valida as tabelas e as funções, mas não executa o serviço Realtime hospedado.
- Criador da chamada, dono da sala e administradores do grupo podem silenciar ou remover participantes. Silêncio imposto também interrompe a reprodução no receptor; quem foi removido perde acesso às RPCs, aos registros de sinalização e aos demais peers na próxima atualização. Bloqueios bilaterais prevalecem.
- Respeite `VITE_FEATURE_VOICE` e `VITE_FEATURE_SOCIAL`. STUN público funciona sem configuração adicional; redes restritivas podem exigir `VITE_TURN_URL`, `VITE_TURN_USERNAME` e `VITE_TURN_CREDENTIAL` no ambiente de build. Essas credenciais TURN são públicas no cliente WebRTC: use credenciais temporárias/de escopo limitado do seu provedor, nunca uma chave administrativa. Nenhum valor foi escrito em `.env` ou solicitado em chat.
- A tela não grava áudio ou vídeo. Compartilhamento usa somente vídeo, até 1280×720 e 15 fps, com seleção da aba GStudy ou do navegador. Sem `getDisplayMedia`, o botão fica oculto; receber compartilhamento continua disponível. O navegador controla a seleção e a permissão.
- Sem a migração, iniciar uma chamada mostra uma mensagem amigável e preserva os demais recursos. Nada foi aplicado remotamente. Para retenção, o administrador pode agendar limpeza de chamadas encerradas, convites antigos e sinalização expirada conforme a política do projeto; não habilitamos extensões nem jobs remotos.

## 0015_games.sql

- `game_runs` guarda partidas imutáveis por conta. `record_game_result` confere limites dos contadores, associação ao desafio e identidade pela sessão, deduplica por evento e usa `record_learning_reward` para o teto adicional de 100 XP/dia. Reenviar a mesma partida devolve o registro já confirmado. Pontuação do cliente tem limites de consistência; isso não constitui uma prova contra trapaça competitiva.
- `get_game_leaderboard` oferece melhores pontuações por jogo/dificuldade, semana de São Paulo ou total. Inclui o próprio usuário e amigos com ranking público, respeitando bloqueios. `get_game_records` recupera os recordes pessoais da conta; a cópia local usa chave por conta. O armazenamento global antigo fica preservado sem ser atribuído a outra pessoa.
- `game_challenges`, `create_game_challenge` e `get_game_challenge` permitem convites entre amigos, notificação, semente/dificuldade iguais e comparação assíncrona. O servidor limita convites, valida o participante e impede registrar uma partida com outros parâmetros como se fosse daquele desafio.
- `game_content_cache` permite leitura de conteúdo educativo validado por usuários autenticados e escrita somente por `service_role`. O cache expira em 30 dias. A geração respeita a cota técnica de `game` e não grava dados de perfil ou histórico de estudos no conteúdo compartilhado.
- Para popular o cache compartilhado de jogos com IA, configure `SUPABASE_SERVICE_ROLE_KEY` **somente no servidor**, nas configurações seguras da hospedagem/ambiente; nunca use prefixo `VITE_`. Nenhum valor foi solicitado em chat, impresso ou escrito em `.env`. A credencial não está presente neste runtime de desenvolvimento. Sem ela, o jogo é validado e jogável em modo solo, mas seu compartilhamento é desabilitado. O restante do aplicativo continua disponível.
- Não exige nova flag nem publicação Realtime: convites usam o canal de notificações existente. Sem a migração, jogos locais continuam funcionando e o resultado informa que não pôde ser registrado; o app não inventa XP confirmado. Nada foi aplicado ao banco remoto.

## 0014_learning_hearts_and_rewards.sql

- Substitui as vidas locais por corações por conta, calculados e alterados somente nas RPCs `get_learning_hearts()` e `lose_learning_heart(p_event_id)`. IDs repetidos não descontam duas vezes. O relógio continua com o app fechado e não acumula crédito com os corações completos.
- A única configuração efetiva fica na linha protegida `learning_rules`: máximo de 3 corações, recuperação a cada 120 minutos, até 100 XP por ação e 500 por dia. Somente administradores do banco podem alterar essas regras. As constantes TypeScript são valores de apresentação; respostas do servidor prevalecem.
- `record_learning_reward(p_action, p_event_id, p_amount)` aplica tetos por ação/dia e deduplica recompensas. Jogos têm teto adicional de 100 XP/dia. A RPC histórica de XP passa pela mesma regra; INSERT/UPDATE diretos em contadores ficam revogados.
- `get_learning_leaderboard(p_metric, p_period)` oferece XP e ofensiva semanal/total, incluindo somente o próprio usuário e amigos aceitos com `ranking_visibility = 'public'`, respeitando bloqueios. A ofensiva considera a sequência atual; na visão semanal, conta somente os dias da sequência dentro da semana.
- A cota técnica de IA é atômica, calculada pelo dia de São Paulo e limitada pelas regras protegidas. Um cliente não pode aumentar o teto passando outro parâmetro. Não há alternativa permissiva quando a RPC falha. As gerações não são mais bloqueadas pelo contador local antigo de duas tentativas; os registros antigos são preservados.
- O quiz salva perguntas, ordem das opções, respostas, explicações e a operação de coração pendente no armazenamento por conta e atividade do navegador. Retomar no mesmo navegador não gera outro quiz nem perde a questão atual; sincronização desse progresso entre dispositivos ainda não foi implementada. Após uma interrupção, o mesmo ID de operação é reenviado para evitar cobrança dupla.
- A terceira resposta errada ainda mostra sua explicação. Depois, a pessoa pode revisar os erros sem custo e retomar ao recuperar um coração. Flashcards não gastam corações. Atualizar corações consulta o servidor e nunca recarrega localmente.
- Não exige novas variáveis ou flags, nem publicações Realtime adicionais. Sem esta migração, os quizzes mostram um aviso amigável e os demais recursos permanecem acessíveis. Não foi aplicada ao projeto remoto pelo agente.

## 0013_social_security_hardening.sql

- Bloqueios bilaterais passam a valer para perfis, salas, participantes e mensagens privadas, mesmo quando os usuários compartilham um grupo.
- A entrada por código acontece na RPC `join_study_group(p_code)`, com registro de convite aceito. Inserir diretamente uma participação arbitrária não permite entrar em grupos de terceiros ou virar administrador.
- Participantes não podem transferir a autoria ou o grupo da sala, alterar privacidade ou encerramento, nem transferir a própria participação para outra sala ou conta. Salas novas são privadas por padrão.
- O servidor define nome e data das mensagens de sala. O envio, inclusive pela RPC histórica, valida acesso e aplica limite de 20 mensagens por minuto, serializado por remetente.
- Mensagens privadas também têm limite de 20/minuto. Somente o destinatário pode atualizar `read_at`; conteúdo e autoria não podem ser alterados. Notificações são criadas pelo servidor; o cliente só marca leitura ou exclui as próprias notificações.
- Tipos adicionais de notificação: `direct_message`, `missed_call`, `game_challenge`. Os dois últimos preparam o schema; não comprovam implementação dos fluxos de chamada e desafio.
- A limpeza de chat fica restrita a `service_role`. Se `pg_cron` já existir, registra uma tarefa horária idempotente. Se não existir, o administrador precisa configurar um agendador seguro para `cleanup_old_room_messages()`; a política de leitura já oculta mensagens com mais de 24 horas.
- Habilite Realtime para `friendships`, `direct_messages`, `notifications`, `study_room_participants` e `study_room_messages` conforme os recursos utilizados. A autorização de canais privados e o funcionamento do Realtime remoto ainda exigem validação no projeto Supabase.
- Mantenha `VITE_FEATURE_SOCIAL` e `VITE_FEATURE_VOICE` conforme o ambiente. As credenciais existentes continuam nas configurações seguras; nenhum segredo deve entrar neste documento.

Reversão: reverta o commit da aplicação se necessário. Para o banco, prepare uma nova migração corretiva após revisar os dados; não apague mensagens, perfis ou tabelas para desfazer o endurecimento.

---

## 0006_social_friends_and_groups.sql

- **Fase:** Fase 2 — Amigos e Grupos (`feat/amigos`)
- **Data:** 22/10/2026
- **Feature Flag Relacionada:** `VITE_FEATURE_SOCIAL`
- **Conteúdo da Migration:**
  1. `public.profiles`: Perfis com username único sanitizado (`^[a-z0-9_]{3,20}$`), display_name, status online/offline/estudando, bio.
  2. `public.friendships`: Relações bilaterais com índice único em `(least(user_id, friend_id), greatest(user_id, friend_id))` impedindo duplicatas em qualquer direção.
  3. `public.study_groups` e `public.group_members`: Grupos de estudo privados com código de convite e controle de administradores/membros.
  4. `public.user_blocks` e `public.user_reports`: Mecanismos de bloqueio recíproco e denúncia.
  5. `public.user_search_audit`: Auditoria para taxa limite de 10 buscas por minuto por usuário.
  6. `public.search_user_exact(query_term)`: Função RPC `SECURITY DEFINER SET search_path = ''` que realiza busca estrita por `@username` ou e-mail exato com rate limit, retornando apenas `{ id, username, display_name, avatar_url }` (nunca expõe e-mails nem lista usuários).
  7. **RLS Estrita:** Usuários só visualizam perfis de amigos aceitos ou do mesmo grupo de estudo. Varredura pública de perfis devolve conjunto vazio.
- **Como Aplicar no Supabase:**
  Copie o conteúdo de `drizzle/migrations/0006_social_friends_and_groups.sql` e execute no painel **SQL Editor** do projeto Supabase.

---

## 0007_study_rooms_and_presence.sql

- **Fase:** Fase 3 — Salas ao Vivo e Presença (`feat/salas-estudo`)
- **Data:** 22/10/2026
- **Feature Flag Relacionada:** `VITE_FEATURE_SOCIAL`
- **Conteúdo da Migration:**
  1. `public.study_rooms`: Salas de estudo ao vivo com tópico/matéria, limite de 2 a 16 participantes, estado sincronizado do Pomodoro (modo trabalho/pausa e segundos restantes) e fechamento automático.
  2. `public.study_room_participants`: Registro dos participantes na sala com meta de foco (`current_goal`), status de conclusão (`is_goal_completed`), microfone mutado e câmera.
  3. **RLS Estrita:** Salas privadas só são visíveis e acessíveis para amigos aceitos do criador ou membros do grupo de estudo correspondente. Ninguém fora da sala pode listar ou visualizar os participantes de uma sala.
- **Como Aplicar no Supabase:**
  Copie o conteúdo de `drizzle/migrations/0007_study_rooms_and_presence.sql` e execute no painel **SQL Editor** do projeto Supabase.

---

## 0008_study_room_chat.sql

- **Fase:** Fase 4 — Chat em Tempo Real nas Salas (`feat/chat-salas`)
- **Data:** 22/10/2026
- **Feature Flag Relacionada:** `VITE_FEATURE_SOCIAL`
- **Conteúdo da Migration:**
  1. `public.study_room_messages`: Mensagens de texto puro em salas de estudo com limite de 500 caracteres, autoria verificada e remoção de espaços em branco vazios.
  2. `public.send_room_message(p_room_id, p_content, p_sender_username, p_sender_display_name)`: RPC `SECURITY DEFINER SET search_path = ''` que impõe rate limit de 20 mensagens por minuto por usuário.
  3. `public.cleanup_old_room_messages()`: Função para expurgar mensagens com mais de 24 horas (caráter efêmero).
  4. **RLS Estrita:** Apenas participantes ativos ou salas públicas permitem leitura e envio de mensagens. Varredura pública externa devolve zero registros.
- **Como Aplicar no Supabase:**
  Copie o conteúdo de `drizzle/migrations/0008_study_room_chat.sql` e execute no painel **SQL Editor** do projeto Supabase.

---

## 0009_social_gamification_and_rankings.sql

- **Fase:** Fase 5 — Gamificação Social e Rankings (`feat/gamificacao-social`)
- **Data:** 22/10/2026
- **Feature Flag Relacionada:** `VITE_FEATURE_SOCIAL`
- **Conteúdo da Migration:**
  1. `public.profiles.ranking_visibility`: Campo de privacidade (`public`, `anonymous`, `hidden`), permitindo ao estudante controlar como aparece em placares.
  2. `public.social_focus_logs`: Registro seguro de sessões de estudo/foco concluídas (minutos de 1 a 300).
  3. `public.social_achievements`: Conquistas sociais (`first_group_session`, `collective_focus_50h`, etc.) com RLS restrita.
  4. `public.get_social_leaderboard(p_scope, p_group_id)`: RPC `SECURITY DEFINER SET search_path = ''` que computa o ranking semanal entre amigos ou grupos, mascarando perfis anônimos e ocultando quem optou por privacidade.
  5. `public.record_room_focus_session(p_room_id, p_minutes)`: RPC `SECURITY DEFINER SET search_path = ''` que registra blocos de foco concluídos e destrava conquistas automaticamente.
- **Como Aplicar no Supabase:**
  Copie o conteúdo de `drizzle/migrations/0009_social_gamification_and_rankings.sql` e execute no painel **SQL Editor** do projeto Supabase.

---

## 0010_fix_rls_recursion_and_room_chat_columns.sql

- **Fase:** Bloco 0 — Correção de RLS e Integridade de Migrações
- **Data:** 23/10/2026
- **Feature Flag Relacionada:** `VITE_FEATURE_SOCIAL`
- **Conteúdo da Migration:**
  1. `public.is_group_member(p_group_id, p_user_id)`: Função auxiliar `SECURITY DEFINER SET search_path = ''` para eliminar recursão de consulta em `group_members`.
  2. `public.is_friend(p_user_a, p_user_b)`: Função auxiliar `SECURITY DEFINER SET search_path = ''` para checagem bilateral segura de amizade sem loop.
  3. `public.is_study_room_participant(p_room_id, p_user_id)`: Função auxiliar `SECURITY DEFINER SET search_path = ''` para validação de participação em salas.
  4. `public.is_study_room_accessible(p_room_id, p_user_id)`: Função auxiliar `SECURITY DEFINER SET search_path = ''` que unifica verificação de acesso a salas e mensagens de chat.
  5. **Correção de Políticas de RLS:** Substituição de subqueries recursivas por chamadas diretas às funções auxiliares em `group_members`, `study_groups`, `profiles`, `study_rooms`, `study_room_participants` e `study_room_messages`.
- **Como Aplicar no Supabase:**
  Copie o conteúdo de `drizzle/migrations/0010_fix_rls_recursion_and_room_chat_columns.sql` e execute no painel **SQL Editor** do projeto Supabase.

---

## 0011_student_profile_and_onboarding.sql

- **Fase:** Bloco 2 — Onboarding e Perfil do Estudante (`feat/bloco-2-onboarding-perfil`)
- **Data:** 23/10/2026
- **Feature Flag Relacionada:** Todas
- **Conteúdo da Migration:**
  1. `public.profiles`: Novas colunas `school_year` (etapa de estudo), `favorite_subject` (matéria favorita), `school_days` (dias com aula), `exam_goals` (metas de vestibulares como ENEM/Fuvest), `year_selected_at` (data da última confirmação de ano letivo), `theme` e `onboarding_completed`.
  2. `public.check_username_available(desired_username text)`: RPC `SECURITY DEFINER SET search_path = ''` que valida formato e disponibilidade de `@username` sem expor e-mails ou listar qualquer usuário.
  3. `public.save_student_onboarding(...)`: RPC `SECURITY DEFINER SET search_path = ''` para persistência atômica dos dados de onboarding do estudante com `auth.uid()`.
  4. `public.advance_school_year(p_new_school_year text)`: RPC `SECURITY DEFINER SET search_path = ''` para virada anual de ano escolar com carimbo temporal.
- **Como Aplicar no Supabase:**
  Copie o conteúdo de `drizzle/migrations/0011_student_profile_and_onboarding.sql` e execute no painel **SQL Editor** do projeto Supabase.

---

## 0012_sessions_dm_notifications_and_friendship_fix.sql

- **Fase:** Bloco 3 — Centralização de Sessões, Amigos, DMs e Notificações (`feat/bloco-3-sessoes-amigos-dm-notificacoes`)
- **Data:** 23/10/2026
- **Feature Flag Relacionada:** `VITE_FEATURE_SOCIAL`
- **Conteúdo da Migration:**
  1. `public.has_friendship_relation(p_user_a, p_user_b)`: Função auxiliar `SECURITY DEFINER SET search_path = ''` para verificar relação mútua sem recursão.
  2. **Correção de visualização de perfil em pedidos de amizade pendentes:** Atualização da política de RLS em `public.profiles` para incluir `has_friendship_relation`, permitindo que quem recebe ou envia um pedido veja o nome/username do outro sem abrir dados privados.
  3. `public.direct_messages`: Tabela de mensagens diretas 1:1 entre amigos aceitos com RLS estrita, índices por par ordenado e marcação de leitura (`read_at`).
  4. `public.notifications`: Central de notificações (pedidos de amizade, aceite, convites de sala, avisos) com RLS estrita por `user_id`.
  5. `public.send_friend_request_v2(p_target_user_id)`: RPC `SECURITY DEFINER SET search_path = ''` para envio atômico de pedido com criação automática de notificação.
  6. `public.respond_friend_request(p_friendship_id, p_accept)`: RPC `SECURITY DEFINER SET search_path = ''` para aceitar ou recusar com notificação automática de retorno.
- **Como Aplicar no Supabase:**
  Copie o conteúdo de `drizzle/migrations/0012_sessions_dm_notifications_and_friendship_fix.sql` e execute no painel **SQL Editor** do projeto Supabase.
