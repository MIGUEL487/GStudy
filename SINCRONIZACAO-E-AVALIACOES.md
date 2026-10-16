# Sincronização da conta e avaliações

## Ativar o banco

1. Abra o **SQL Editor** do projeto Supabase usado pelo GStudy (`axbuxmtshbflpiguoips.supabase.co`).
2. Cole e execute o arquivo completo [`drizzle/migrations/0002_account_sync_reviews.sql`](./drizzle/migrations/0002_account_sync_reviews.sql).
3. Entre com a mesma conta no celular e no computador. Os dados antigos do navegador serão preservados e enviados após a primeira sincronização.

A migração é aditiva e pode ser executada novamente. Ela não altera as tabelas existentes de materiais, Notion ou XP. Não é necessária uma nova chave de API.

O novo esquema separa documentos privados da conta e avaliações compartilhadas. As funções usam o usuário autenticado; o cliente não escolhe o proprietário. A versão de cada documento impede que uma gravação antiga substitua silenciosamente uma nova.

Avaliações podem ser anônimas ou mostrar o nome de perfil, conforme a escolha antes do envio. O UUID e o e-mail do autor não são retornados na lista. Sugestões ficam disponíveis apenas ao autor e ao responsável. Votos são únicos por conta/avaliação; o autor não vota no próprio texto. Respostas são autorizadas no banco apenas para o usuário com e-mail confirmado `mi.c.openheimer@gmail.com`.

Os feedbacks locais anteriores não serão publicados automaticamente: o usuário deve escolher conscientemente enviar uma avaliação ou sugestão.
