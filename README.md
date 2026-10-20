# GStudy

> Plataforma completa e inteligente de gestão e aceleração de estudos, construída com TanStack Start, React 19, Supabase e arquitetura resiliente com múltiplos provedores de inteligência artificial.

---

## 📖 Visão Geral

O **GStudy** é um ambiente de aprendizado focado em concentração, retenção e organização acadêmica. O projeto combina métodos pedagógicos comprovados com ferramentas modernas:

- **Cadernos de Ideias:** Editor de anotações com salvamento automático desacoplado (debounce de 500 ms) e persistência resiliente.
- **Trilhas de Aprendizagem:**
  - **Método Feynman:** Explicação com lousa digital interativa (desenho, formas, texto e imagens) avaliada por alunos virtuais com diferentes perfis.
  - **Flashcards & Recordação Ativa:** Revisão espaçada com algoritmo de intervalo e autoavaliação.
  - **Quiz Inteligente:** Descarte automático de inconsistências e embaralhamento com gabarito dinâmico.
- **Tutor Sócrates:** Diálogo socrático para aprofundamento conceitual, com upload de anexos (PDF e imagens) e gestão atômica de cota diária no banco de dados.
- **Rumo à Prova:** Módulo de preparação para vestibulares e concursos, incluindo roteiro de estudos, biblioteca curada (YouTube com capítulos oficiais e livros abertos OpenStax) e simulados.
- **Gestão de Faltas e Frequência:** Calendário letivo (padrão de 200 dias / 40 semanas letivas), cálculo preciso de faltas com base na carga horária semanal e congelamento de históricos por período.
- **Integração com Notion:** Leitura e importação de páginas e notas de estudo com resumo automático para caber no contexto das IAs.
- **Importação de Fotos:** Transcrição e extração de notas e presenças diretamente de fotos de cadernos e boletins.

---

## 🚀 Como Executar Localmente

### Pré-requisitos

- **Node.js:** Versão 20+ (recomendado **Node 22 LTS**)
- **npm:** Versão 10+ (utilize o `package-lock.json` para garantir determinismo)

### Instalação

```bash
# Clone o repositório
git clone https://github.com/MIGUEL487/GStudy.git
cd GStudy

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env

# Inicie o servidor de desenvolvimento
npm run dev
```

A aplicação estará disponível em `http://localhost:3000`.

---

## ⚙️ Variáveis de Ambiente

Crie um arquivo `.env` baseado no `.env.example`:

| Variável                    | Descrição                                                                       | Obrigatória |
| --------------------------- | ------------------------------------------------------------------------------- | :---------: |
| `VITE_SUPABASE_URL`         | URL do projeto Supabase                                                         |     Sim     |
| `VITE_SUPABASE_ANON_KEY`    | Chave anônima (pública) do Supabase                                             |     Sim     |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave administrativa do Supabase (para rotinas serverless seguras)              |     Não     |
| `BOARD_AI_API_KEY`          | Chave do Google Gemini (AI Studio) para a IA principal                          |     Sim     |
| `BOARD_AI_MODEL`            | Modelo padrão do Gemini (padrão: `gemini-2.5-flash` ou `gemini-3.5-flash-lite`) |     Não     |
| `SOCRATES_AI_API_KEY`       | Chave dedicada para o Sócrates (Gemini, DeepSeek ou OmniRoute)                  |     Não     |
| `SOCRATES_AI_PROVIDER`      | Provedor do Sócrates (`gemini`, `deepseek` ou `omniroute`)                      |     Não     |
| `GROQ_API_KEY`              | Chave de fallback secundário do Groq (Llama 3.3 70B)                            |     Não     |
| `OPENROUTER_API_KEY`        | Chave de fallback terciário do OpenRouter (modelos `:free`)                     |     Não     |
| `YOUTUBE_API_KEY`           | Chave da API do YouTube para busca de videoaulas com capítulos                  |     Não     |
| `NOTION_CLIENT_ID`          | Client ID da integração OAuth do Notion                                         |     Não     |
| `NOTION_CLIENT_SECRET`      | Client Secret da integração OAuth do Notion                                     |     Não     |
| `NOTION_TOKEN_SECRET`       | Chave secreta de criptografia (AES-256-GCM) para tokens do Notion               |     Não     |

---

## 🗄️ Banco de Dados & Migrations

As migrações SQL estão organizadas no diretório `drizzle/migrations/` e devem ser executadas em ordem no **SQL Editor** do Supabase:

1. `0000_learning.sql` — Tabelas de materiais de estudo (`study_materials`) e estatísticas de progresso (`learner_stats`).
2. `0001_notion.sql` — Armazenamento seguro de conexões, tokens criptografados e páginas importadas do Notion.
3. `0002_account_sync_reviews.sql` — Sincronização multi-dispositivo baseada em CRDT/vetor de versões e mural de avaliações/feedbacks.
4. `0003_socrates.sql` — Sistema de reservas e cobrança atômica de cotas de tokens do Sócrates (`SECURITY DEFINER`).
5. `0004_server_ai_quotas.sql` — Controle de cotas diárias de IA no servidor (`user_daily_ai_usage`) e incremento atômico de XP (`award_learner_xp`).

### Verificação do Banco

Para confirmar que todas as tabelas, políticas de RLS e funções RPC foram criadas corretamente:

```bash
npm run verify:schema
```

---

## 🛡️ Segurança e Resiliência

- **Proteção contra SSRF:** Requisições para links externos utilizam o helper `safeFetch`, com validação de DNS, bloqueio de redes privadas (RFC 1918), loopback, link-local e metadados de nuvem (`169.254.169.254`), limite de 3 redirecionamentos manuais e streaming de corpo com corte em ~1 MB.
- **Cotas de IA no Servidor:** As server functions aplicam o middleware `enforceServerAiQuota`, garantindo que os limites diários não possam ser burlados via manipulação de `localStorage`.
- **Atomicidade no XP e Streak:** A progressão de XP é gerenciada via RPC SQL com transação fechada, eliminando race conditions e bloqueando alteração arbitrária pelo cliente.
- **Timeouts Explícitos:** Todas as chamadas para APIs de IA possuem sinais de cancelamento (`AbortSignal.timeout`) com limite de execução compatível com funções serverless.
- **Failover em Cascata:** Se a IA primária (Gemini) falhar ou estiver sem cota, o sistema migra automaticamente para Groq e, em seguida, para OpenRouter, convertendo anexos (PDF para texto via OCR/unpdf) conforme as capacidades do provedor de destino.

---

## 🧪 Testes e Qualidade

```bash
# Rodar todos os testes unitários e de integração
npm test

# Rodar verificação de lint
npm run lint

# Formatar o código com Prettier
npm run format

# Gerar build de produção
npm run build
```

---

## 📚 Documentação Complementar

- [Configuração Geral e Variáveis](CONFIGURAR-GSTUDY.md)
- [Lousa Digital e Integração com IA](LOUSA-E-IA.md)
- [Tutor Sócrates](SOCRATES.md)
- [Biblioteca de Estudos e Direitos de Livros](BIBLIOTECA-DE-ESTUDOS.md)
- [Rumo à Prova](PREPARACAO.md)
- [Trilhas de Estudo](TRILHAS-DE-ESTUDO.md)
- [Importação de Fotos do Caderno](IMPORTAR-FOTOS.md)
- [Sincronização de Conta e Avaliações](SINCRONIZACAO-E-AVALIACOES.md)
- [Fallback para Groq](GROQ-ALTERNATIVA.md)
- [Fallback para OpenRouter Gratuito](OPENROUTER-ALTERNATIVA.md)

---

## 🚢 Deploy na Vercel

O projeto está configurado para deploy contínuo na [Vercel](https://vercel.com):

- **Framework Preset:** Vite / TanStack Start
- **Install Command:** `npm ci`
- **Build Command:** `npm run build`
- **Output Directory:** `.output`
- **Max Duration:** Funções serverless configuradas com `maxDuration: 60` no `vercel.json` e `nitro.config.ts`.
