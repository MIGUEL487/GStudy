# Sócrates

A aba **Sócrates** é uma conversa de estudo por texto. O tutor precisa explicar o porquê e terminar cada etapa com uma pergunta de compreensão. O aplicativo exige os campos de explicação e pergunta antes de mostrar a resposta; o modelo ainda pode cometer erros de conteúdo.

Pode usar uma chave **DeepSeek exclusiva do Sócrates**. Sem ela, continua com Gemini, Groq e OpenRouter já configurados. Com ela, Sócrates chama o DeepSeek primeiro em conversas de texto; em falhas técnicas, tenta os provedores existentes. As outras abas nunca usam essa chave.

O chat aceita fotos JPG, PNG e WebP e PDFs de até 4 MB. `deepseek-chat` não interpreta imagens. Fotos e PDFs digitalizados são enviados à sequência multimodal já configurada. Em PDFs com texto selecionável, o servidor pode extrair somente o texto para o DeepSeek; diagramas e imagens do PDF não são atribuídos ao modelo.

## Ativação

No SQL Editor do mesmo projeto Supabase do site, execute o arquivo completo [0003_socrates.sql](drizzle/migrations/0003_socrates.sql). Ele depende da migração 0002 já existente, adiciona a cota e o namespace das conversas e preserva os dados anteriores. Pode ser executado novamente.

Na Vercel, adicione as variáveis de ambiente **Production** abaixo e publique novamente. Nunca use `VITE_` nem coloque a chave no GitHub.

```text
SOCRATES_AI_PROVIDER=deepseek
SOCRATES_AI_API_KEY=<sua chave DeepSeek>
SOCRATES_AI_BASE_URL=https://api.deepseek.com
SOCRATES_AI_MODEL=deepseek-chat
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
