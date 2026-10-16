# Sincronização da conta e avaliações

## Ativar o banco

1. Abra o **SQL Editor** do projeto Supabase usado pelo GStudy (`axbuxmtshbflpiguoips.supabase.co`).
2. Cole e execute o arquivo completo [`drizzle/migrations/0002_account_sync_reviews.sql`](./drizzle/migrations/0002_account_sync_reviews.sql).
3. Entre com a mesma conta no celular e no computador. Os dados antigos do navegador serão preservados e enviados após a primeira sincronização.

A migração é aditiva e pode ser executada novamente. Ela não altera as tabelas existentes de materiais, Notion ou XP. Não é necessária uma nova chave de API.

O novo esquema separa documentos privados da conta e avaliações compartilhadas. As funções usam o usuário autenticado; o cliente não escolhe o proprietário. A versão de cada documento impede que uma gravação antiga substitua silenciosamente uma nova.

Avaliações podem ser anônimas ou mostrar o nome de perfil, conforme a escolha antes do envio. O UUID e o e-mail do autor não são retornados na lista. Sugestões ficam disponíveis apenas ao autor e ao responsável. Votos são únicos por conta/avaliação; o autor não vota no próprio texto. Respostas são autorizadas no banco apenas para o usuário com e-mail confirmado `mi.c.openheimer@gmail.com`.

Os feedbacks locais anteriores não serão publicados automaticamente: o usuário deve escolher conscientemente enviar uma avaliação ou sugestão.

## O que é sincronizado

Perfil e foto, matérias, cadernos, cursos, calendário, horários, notas, trilhas, etapas concluídas, sessões e rascunhos do Active Recall e contadores diários. Materiais enviados, vínculo do Notion e XP continuam nas tabelas já existentes.

A primeira leitura da conta acontece antes de abrir o espaço de estudo. As alterações locais são enviadas após uma pausa de digitação; o aplicativo verifica novidades a cada 10 segundos enquanto está visível e ao recuperar foco/conexão. O indicador no topo e a seção **Perfil → Sincronização entre aparelhos** mostram o estado e permitem tentar novamente. Sem conexão, o conteúdo continua no aparelho e será reenviado quando possível. É necessário acessar o site pelo menos uma vez com conexão para autenticar e obter a cópia da conta.

As gravações usam revisão e comparação no banco. Alterações em campos diferentes são combinadas. Se o mesmo caderno for editado simultaneamente nos dois aparelhos, o texto deste aparelho será preservado em um caderno com o sufixo **(cópia deste aparelho)**. Resumos diferentes do Active Recall ficam disponíveis em **Rascunhos preservados de outro aparelho**. Não é um editor colaborativo em tempo real. Os limites diários são compartilhados pela sincronização; a geração simultânea enquanto offline não é uma cota de servidor.

Nos testes, a navegação lateral e a barra do celular ficam recolhidas e fora da navegação por teclado. **Sair do teste** continua disponível. Durante a leitura do Active Recall, os cadernos ficam acessíveis e um cronômetro flutuante acompanha a sessão. Ao terminar o prazo, a escrita abre sem permitir consulta pelo menu. Recarregar não reinicia os cinco minutos.
