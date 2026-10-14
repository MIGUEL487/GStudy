# GStudy — login e IA na Vercel

Esta versão mantém as imagens, cores, fontes, cartões, telas e navegação do ZIP enviado. As mudanças são o fluxo de e-mail e recuperação de senha, a estabilidade do carregamento e a configuração da sessão/IA fora do Lovable.

## 1. Aplicar os arquivos

Extraia o ZIP e abra a pasta que contém `package.json`. Substitua os arquivos do seu projeto pelos arquivos desta versão. Preserve seu `.env` local: ele não está no ZIP. O `.env.example` mostra os campos necessários. `node_modules` e arquivos compilados não precisam ser enviados ao GitHub.

No PowerShell, dentro dessa pasta:

```powershell
npm.cmd install
npm.cmd run dev
```

Abra a URL `Local` mostrada no terminal. Atualize seu repositório para a Vercel publicar a nova versão.

## 2. Exigir confirmação por e-mail

No projeto Supabase `axbuxmtshbflpiguoips`, abra **Authentication → Sign In / Providers → Email** (em algumas versões: **Providers → Email**). Ative **Enable Email provider**, **Allow new users to sign up** e **Confirm email**. A confirmação é uma configuração do servidor: o código do navegador não consegue ativar essa opção.

Na consulta pública feita em 14/10/2026, este projeto já tinha e-mail habilitado, cadastro permitido e confirmação obrigatória. Mantenha essas opções. A consulta não enviou nenhuma mensagem e não acessou contas de usuários.

Com `Confirm email` ligado, o cadastro aguarda o link de confirmação antes de permitir o login. Se o Supabase retornar uma sessão imediata, o aplicativo encerra essa sessão e avisa que a confirmação está desativada, sem anunciar um envio inexistente. Contas antigas que já foram confirmadas automaticamente continuam confirmadas; ligar a opção protege os cadastros novos.

Mantenha o **Custom SMTP** do Brevo ou Resend configurado em **Authentication → Emails → SMTP Settings**. O cadastro e o botão **Esqueci a senha** usam esse SMTP. As credenciais SMTP ficam no painel Supabase, não no `.env` do navegador.

Em **Authentication → URL Configuration**:

- **Site URL:** `https://gstudy.vercel.app`
- **Redirect URLs:** `https://gstudy.vercel.app/` e `https://gstudy.vercel.app/?auth=recovery`
- Para uso local, adicione `http://localhost:8080/` e `http://localhost:8080/?auth=recovery` (use a porta real do terminal).

O aplicativo usa o domínio onde o usuário solicitou o e-mail. Configure também as URLs exatas de outros domínios que você queira usar. O link de recuperação abre a tela de nova senha, inclusive se o link criar uma sessão autenticada. Depois da troca, o aplicativo pede login com a nova senha. Links expirados mostram uma mensagem para solicitar outro.

Se você personalizou os templates, preserve o link `{{ .ConfirmationURL }}` nos modelos **Confirm signup** e **Reset password**.

## 3. Corrigir a configuração do Supabase na Vercel

Abra **Vercel → GStudy → Settings → Environment Variables**. Configure para Production e para Preview, se usar previews:

| Variável | Valor |
| --- | --- |
| `SUPABASE_URL` | `https://axbuxmtshbflpiguoips.supabase.co` |
| `VITE_SUPABASE_URL` | o mesmo URL |
| `SUPABASE_PUBLISHABLE_KEY` | chave pública desse projeto |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | a mesma chave pública |
| `SUPABASE_PROJECT_ID` | `axbuxmtshbflpiguoips` |
| `VITE_SUPABASE_PROJECT_ID` | `axbuxmtshbflpiguoips` |

Depois faça **Deployments → Redeploy**. As variáveis `VITE_*` entram durante a compilação; alterar apenas o painel sem publicar novamente não atualiza o navegador. Saia da conta e entre novamente se mudou de projeto Supabase.

O servidor agora aceita as variáveis públicas como fallback, detecta chaves divergentes e valida a sessão no serviço Auth do projeto. O navegador renova uma sessão que estiver perto de expirar antes de chamar a IA. Não use `service_role`, `sb_secret_*`, chave SMTP ou chave de IA em variáveis `VITE_*`.

## 4. Configurar a IA — necessário na sua Vercel

Você confirmou que `LOVABLE_API_KEY` não está configurada na Vercel. O ZIP também não contém uma chave de IA. Assim, nenhuma geração real de quiz, flashcards, explicações ou respostas do Feynman pode funcionar lá até você configurar um provedor no servidor.

Escolha uma das configurações abaixo. Não precisa me enviar nenhuma chave.

### Usar o gateway do projeto Lovable

Se você tiver acesso à chave de IA do seu projeto, cadastre **`LOVABLE_API_KEY`** na Vercel. Essa é a chave de IA gerenciada para o aplicativo, não a chave da API do workspace Lovable e não a chave do Supabase. O código conserva o gateway e o modelo usados no ZIP original. Se a chave não estiver acessível, use um provedor próprio pela opção abaixo.

### Usar outro provedor compatível

Esta versão aceita estas variáveis apenas no servidor:

| Variável | O que preencher |
| --- | --- |
| `AI_API_KEY` | sua chave do provedor |
| `AI_BASE_URL` | URL HTTPS da API compatível, geralmente terminando em `/v1` |
| `AI_MODEL` | identificador exato do modelo no provedor |
| `AI_API_MODE` | `chat` para Chat Completions ou `responses` para Responses |

`AI_API_KEY` preenchida tem prioridade sobre o gateway Lovable. Escolha um modelo com saída JSON e visão para o desenho da lousa. PDF também depende do suporte do modelo/provedor; esses recursos não são garantidos por qualquer API compatível. O uso e eventuais custos dependem do provedor escolhido. Não há simulação de respostas quando uma chave está ausente.

Após configurar, faça **Redeploy**. Não basta colocar as chaves em GitHub Secrets: elas precisam estar nas variáveis de ambiente do projeto Vercel, disponíveis para o servidor.

## 5. Materiais e memória da conta

As tabelas e políticas de acesso estão em `drizzle/migrations/0000_learning.sql`. Se elas já existem no seu Supabase, mantenha-as. Se aparecer erro de tabela ausente, aplique essa migração uma vez no SQL Editor do mesmo projeto. Os materiais e XP continuam separados por usuário com RLS; o servidor usa o token do usuário, sem chave administrativa.

## 6. Conferir após a publicação

1. Cadastre uma conta de teste e confirme que ela só entra depois de abrir o e-mail.
2. Em **Esqueci a senha**, solicite um link para essa conta; abra o link e escolha a nova senha.
3. Entre com a nova senha e adicione um material de estudo.
4. Gere quiz, flashcards e explicações; a coruja e o avatar não sobem e descem durante o carregamento, e a barra do quiz conserva o espaço das vidas.
5. No Feynman, envie uma explicação e um desenho. O chat rola por dentro, mantendo a barra superior no lugar.

Na entrega, passaram 40 testes automatizados, a verificação TypeScript e a compilação completa para a Vercel. As imagens e demais arquivos públicos foram comparados com o ZIP original e continuam idênticos. A conferência em navegador não pôde ser concluída porque este ambiente não conseguiu acessar o servidor local.

Os testes locais usam respostas simuladas para validar os fluxos sem mandar e-mails nem gastar créditos. Entrega de e-mail e resposta real da IA precisam ser conferidas depois que SMTP, confirmação, URLs e chave estiverem configurados na hospedagem.

Referências: [SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp), [recuperação de senha](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [IA Lovable](https://docs.lovable.dev/features/ai).
