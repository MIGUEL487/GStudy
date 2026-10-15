# GStudy v5 — Google + Notion

Esta versão usa Google e Notion na entrada, sem depender de e-mail de confirmação enviado pelo SMTP do aplicativo. Imagens, fontes, cores e estrutura visual foram preservadas, mantendo as correções solicitadas para estabilizar as animações de carregamento. Há uma nova seção Notion nas configurações e um cronograma importado no calendário.

## 1. Publicar no GitHub e na Vercel

1. Extraia o ZIP e abra a pasta interna `notebook-quest-web-main`, que contém `package.json` e `src`.
2. No GitHub Desktop, selecione o repositório e use **Repository → Show in Explorer**.
3. Copie o conteúdo da pasta interna extraída para a raiz do repositório, substituindo os arquivos. Preserve `.git` e seu `.env` local. Não coloque uma pasta de projeto dentro de outra.
4. Faça **Commit** e **Push origin** para a branch publicada pela Vercel. Não force o push.
5. Confira que o deployment **Production** corresponde ao commit novo. A raiz configurada deve conter `package.json`. Use `npm run build`: é um projeto TanStack Start com servidor Nitro.
6. Salve as variáveis em **Settings → Environment Variables**, no ambiente Production, e faça **Redeploy**. As variáveis `VITE_` são incluídas durante a compilação.

A versão nova mostra dois botões na entrada: Google e Notion, sem campo de senha.

## 2. Variáveis do Supabase

No `.env` local, ao lado de `package.json`, ou nas variáveis da Vercel:

```dotenv
SUPABASE_PROJECT_ID=axbuxmtshbflpiguoips
SUPABASE_URL=https://axbuxmtshbflpiguoips.supabase.co
SUPABASE_PUBLISHABLE_KEY=COLE_SUA_CHAVE_PUBLICA
VITE_SUPABASE_PROJECT_ID=axbuxmtshbflpiguoips
VITE_SUPABASE_URL=https://axbuxmtshbflpiguoips.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=COLE_A_MESMA_CHAVE_PUBLICA
```

PROJECT_ID recebe apenas o identificador; URL recebe a URL completa. Use a mesma chave pública dos dois lados. A chave secreta/service_role não é necessária. Não envie senhas ou chaves secretas no chat.

## 3. Google — já configurado por você

Confira **Authentication → Sign In / Providers → Google** habilitado. Em **Authentication → URL Configuration**:

- Site URL: `https://gstudy.vercel.app`
- Redirect URLs: `https://gstudy.vercel.app/` e `https://gstudy.vercel.app/configuracoes?notion=connected`
- Para desenvolvimento local, acrescente `http://localhost:8080/` e `http://localhost:8080/configuracoes?notion=connected`.

O callback do provedor Google é `https://axbuxmtshbflpiguoips.supabase.co/auth/v1/callback`.

O botão usa diretamente o Supabase em qualquer hospedagem. Se a sessão antiga pertencer a outro projeto, saia e entre novamente após publicar.

Para impedir também cadastro por senha via API, desative o provedor **Email** no Supabase. O código removeu esse fluxo da interface, mas não altera seu painel administrativo. Não apague usuários existentes.

## 4. Criar a conexão pública do Notion

A conexão pública permite que cada pessoa autorize o próprio espaço.

1. Em [My integrations do Notion](https://www.notion.so/my-integrations), crie a integração GStudy como **Public integration**.
2. Ative **Read content** e **Read user information including email addresses**. A importação não precisa editar páginas.
3. Cadastre o Redirect URI `https://axbuxmtshbflpiguoips.supabase.co/auth/v1/callback`.
4. Preencha os campos de identificação/publicação solicitados pelo Notion. Copie **OAuth client ID** e **OAuth client secret**.
5. No Supabase, em **Authentication → Sign In / Providers → Notion**, habilite o provedor e salve essas credenciais.
6. Habilite **Allow manual linking** nas configurações de autenticação para conectar Notion à conta que entrou com Google. A posição desse controle pode variar no painel.

Referências: [Notion no Supabase](https://supabase.com/docs/guides/auth/social-login/auth-notion), [vínculo de identidades](https://supabase.com/docs/guides/auth/auth-identity-linking).

## 5. Preparar o banco

Se as tabelas `study_materials` e `learner_stats` ainda não existem, execute primeiro `drizzle/migrations/0000_learning.sql` no SQL Editor do Supabase. Não repita essa migração inicial se as tabelas já existem.

Depois execute **todo** o arquivo `drizzle/migrations/0001_notion.sql`. Entreguei também uma cópia chamada `GSTUDY-NOTION-v5.sql`.

A migração cria as tabelas do Notion, regras de acesso por usuário e uma função para salvar página e material na mesma transação. Pode ser executada novamente e não apaga materiais existentes. Use o SQL Editor do banco, não o explorador de logs.

## 6. Variáveis do Notion no servidor

Na Vercel, acrescente:

```dotenv
NOTION_TOKEN_ENCRYPTION_KEY=CHAVE_ALEATORIA_COM_64_CARACTERES_HEXADECIMAIS
NOTION_CLIENT_ID=SEU_OAUTH_CLIENT_ID_DO_NOTION
NOTION_CLIENT_SECRET=SEU_OAUTH_CLIENT_SECRET_DO_NOTION
```

Gere a chave de criptografia no seu computador:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copie o resultado apenas para `NOTION_TOKEN_ENCRYPTION_KEY`. Não publique essa chave nem use prefixo `VITE_` nessas três variáveis. Mantenha a mesma chave entre deployments: trocá-la exige reconectar os usuários.

As credenciais OAuth são as mesmas cadastradas no Supabase. Elas permitem renovar a autorização quando o Notion fornece um refresh token; quando não for possível renovar, o aplicativo pedirá uma nova conexão.

Os tokens recebidos no retorno OAuth são enviados ao servidor autenticado. O banco guarda tokens criptografados com AES-256-GCM, vinculados ao usuário. Após salvar, o código substitui a sessão do navegador por uma sessão apenas do Supabase. Os textos importados ficam na conta com regras de acesso por usuário.

Faça **Redeploy** depois de salvar. Localmente, preencha essas variáveis no `.env` e reinicie o Vite.

## 7. Como funciona para cada pessoa

- Entra com Notion ou entra com Google e usa **Configurações → Seus estudos do Notion → Conectar Notion**.
- Escolhe as páginas autorizadas durante a conexão. O aplicativo não recebe acesso a páginas privadas que não foram compartilhadas.
- Em **Ver páginas autorizadas**, sugestões de estudo vêm marcadas pelo título e pelos nomes das matérias existentes. A pessoa revisa a seleção antes de importar; não é uma análise de todo o conteúdo do espaço.
- Use **Abrir tabela** para selecionar suas linhas e **Carregar mais** para continuar a listagem.
- **Matéria de destino** é opcional. Preenchida, vale para os itens selecionados; vazia, o app procura campos Matéria/Disciplina/Subject/Course, títulos e a página superior. Sem correspondência, guarda na matéria Notion. Matérias ausentes são criadas ao importar.
- As páginas viram cadernos e materiais da conta em **Teste seu conhecimento**, disponíveis para quiz, flashcards, explicações e Feynman.
- Datas em campos do Notion ou no texto (`DD/MM/AAAA` ou `AAAA-MM-DD`) aparecem no **Cronograma do Notion**, no calendário. Notas sem data continuam como anotações. Horários semanais não são deduzidos de texto ambíguo.
- Para atualizar, selecione e importe novamente. O material é atualizado; edições locais do caderno são preservadas em uma cópia. A atualização é manual, sem sincronização contínua.
- Subpáginas, tabelas e relações são itens separados. Compartilhe-os e importe-os também; importar a página pai não copia automaticamente todas as páginas relacionadas.
- A importação lê texto, blocos internos, listas, tabelas simples e legendas. Não baixa nem interpreta imagens, PDFs ou anexos; esses casos geram aviso.
- Cada página aceita até 200 mil caracteres, 1500 blocos, 12 níveis e 200 datas. Divida páginas maiores: a operação falha em vez de salvar conteúdo cortado. Para uma atividade de IA, selecione materiais que somem até 90 mil caracteres.
- **Desconectar importação** remove as credenciais guardadas pelo app e mantém as anotações importadas. Para retirar o acesso no provedor, remova também a conexão GStudy no Notion.

Materiais do Notion ficam na conta e podem ser recuperados em outro navegador. Cadernos manuais, presença, horários e perfil continuam no armazenamento local, separados por conta. Os dados locais antigos são atribuídos à primeira conta que entrar nesta versão naquele navegador; a cópia antiga é preservada. Use **Exportar meus estudos** para ter uma cópia local.

Referência sobre as páginas disponíveis para busca: [API de busca do Notion](https://developers.notion.com/reference/post-search).

## 8. IA / AionLabs

Google e importação do Notion não precisam de chave de IA. Para usar **aion-labs/aion-2.0**, crie uma chave no [OpenRouter](https://openrouter.ai/settings/keys) e salve em **Vercel → Settings → Environment Variables → Production**:

- `AI_API_KEY`: sua chave privada do OpenRouter (não cole no chat).
- `AI_BASE_URL`: `https://openrouter.ai/api/v1`
- `AI_MODEL`: `aion-labs/aion-2.0`
- `AI_API_MODE`: `chat`

Faça **Redeploy** depois de salvar. Não use prefixo `VITE_` e não coloque a chave no GitHub. Confira também o saldo e as permissões do modelo no OpenRouter. As credenciais do Lovable não são transferidas automaticamente para a Vercel.

O Aion 2.0 aceita **somente texto**: resumos e textos importados do Notion podem gerar quiz, flashcards, explicações e conversas Feynman. Ele não interpreta imagens, PDFs nem desenhos da lousa; o aplicativo informa essa limitação sem enviar um pedido incompatível. O modelo não aparece no catálogo autenticado do Lovable AI consultado nesta correção.

## 9. Abrir no computador

Abra o PowerShell na pasta que contém `package.json`:

```powershell
npm.cmd install
npm.cmd run dev
```

Mantenha o terminal aberto e acesse o endereço exibido pelo Vite, normalmente `http://localhost:8080/`. O arquivo deve se chamar `.env`, e não `.env.example`. Reinicie o Vite depois de alterá-lo.

## Conferência desta entrega

TypeScript e compilação para Vercel executados. Não houve login real nas contas Google/Notion nem aplicação da migração no seu Supabase: dependem da configuração e autorização nos seus painéis. Não foram executados testes automatizados nesta alteração. O código está no ZIP e ainda precisa ser publicado no seu repositório/deployment.
