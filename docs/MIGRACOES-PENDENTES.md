# Migrações Pendentes - Supabase Postgres

Este documento rastreia as migrations geradas no código e prontas para execução nos ambientes de banco de dados do Supabase.

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
