# Sócrates

A aba **Sócrates** é uma conversa de estudo por texto. O tutor precisa explicar o porquê e terminar cada etapa com uma pergunta de compreensão. O aplicativo exige os campos de explicação e pergunta antes de mostrar a resposta; o modelo ainda pode cometer erros de conteúdo.

Pode usar uma instância **OmniRoute exclusiva do Sócrates**. Sem ela, continua com Gemini, Groq e OpenRouter já configurados. Com ela, Sócrates chama o OmniRoute primeiro; em falhas técnicas, tenta os provedores existentes. As outras abas nunca usam a chave exclusiva do Sócrates. O pacote `omniroute` é um roteador auto-hospedado com API compatível com OpenAI, não um provedor de chave de IA na nuvem.

## Ativação

No SQL Editor do mesmo projeto Supabase do site, execute o arquivo completo [0003_socrates.sql](drizzle/migrations/0003_socrates.sql). Ele depende da migração 0002 já existente, adiciona a cota e o namespace das conversas e preserva os dados anteriores. Pode ser executado novamente.

`npm install -g omniroute` inicia um servidor local em `http://localhost:20128/v1`. Esse endereço só funciona no próprio computador; a Vercel não pode usá-lo. Para integrar o site publicado, hospede o OmniRoute continuamente em outro servidor com URL HTTPS pública e proteja a API com uma **chave de inferência**. Um token de administração `oma_live_...` não é uma chave de inferência. Consulte a [documentação oficial da API](https://github.com/diegosouzapw/OmniRoute/blob/main/docs/reference/API_REFERENCE.md) e do [modo remoto](https://github.com/diegosouzapw/OmniRoute/blob/main/docs/guides/REMOTE-MODE.md).

Depois de hospedar a instância, na Vercel adicione as variáveis de ambiente **Production** abaixo e publique novamente. O modelo padrão é `auto`; não precisa escolher um nome de modelo. A URL base deve terminar em `/v1`, sem `/chat/completions`. Nunca use `VITE_` nem coloque a chave no GitHub.

```text
SOCRATES_AI_API_KEY=<sua chave OmniRoute>
SOCRATES_AI_BASE_URL=https://seu-servidor-omniroute.example/v1
SOCRATES_AI_MODEL=auto
```

Depois da publicação, abra Sócrates e clique em **Atualizar cota**. A migração não pode ser executada pela chave pública do aplicativo.

## Cota e histórico

- 50.000 tokens por dia e por conta, compartilhados entre dispositivos; renovação às 00h de `America/Sao_Paulo`.
- O servidor reserva uma margem antes de chamar a IA e acerta o consumo depois usando a contagem do provedor, incluindo contexto. Quando não informada, usa estimativa de texto. Falhas tratadas estornam a reserva. Se o processo da hospedagem for encerrado antes do acerto, a reserva pode continuar contabilizada naquele dia.
- Reservas são protegidas por transação e o limite é fixado no PostgreSQL. Tickets de estorno são gerados no servidor e nunca enviados ao navegador; o banco armazena somente o hash. Usuários não podem consultar a tabela de consumo, editar o saldo ou estornar tickets de outra conta. Acertos repetidos são idempotentes.
- O histórico tem cache por conta e sincronização com revisão; nova conversa não apaga as anteriores. A IA recebe até quatro turnos recentes para conter o custo. A interface conserva o histórico completo e oferece até 50 conversas e 200 mensagens por conversa.
- O limite é específico do Sócrates. Os limites dos testes de Aprender/Rumo à prova continuam independentes.

## Verificação

`npm test`, `npx tsc --noEmit` e `NITRO_PRESET=vercel npm run build` verificam o aplicativo.

O teste SQL opcional usa PostgreSQL via PGlite instalado fora do repositório:

```sh
npm install --prefix /tmp/gstudy-socrates-sql --no-package-lock --no-audit --no-fund @electric-sql/pglite
GSTUDY_PGLITE_MODULE=/tmp/gstudy-socrates-sql/node_modules/@electric-sql/pglite/dist/index.js node scripts/check-socrates-quota.mjs
```

Ele testa migrações em banco local descartável, nunca no Supabase de produção.
