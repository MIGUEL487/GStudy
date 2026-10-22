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
