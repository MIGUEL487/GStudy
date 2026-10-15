# Lousa de estudos e Gemini

Repositório: MIGUEL487/notebook-quest-web, conectado ao site gstudy.vercel.app.

## Aula Feynman

A lousa ocupa a área principal da aula. As ferramentas ficam no topo: giz, apagador, texto, retângulo, elipse, linha, seta e desfazer/refazer. Para texto, digite no campo que aparece, escolha o tamanho e clique para posicionar. Para formas, arraste do início até o fim. O papel claro e as cores de tinta também são preservados na imagem enviada à IA.

O cartão do Gui, seu aluno virtual, mostra a pergunta atual da IA e indica quando a resposta está sendo preparada. O campo para explicar fica abaixo da lousa. A conversa inteira, incluindo imagens enviadas, pode ser aberta em **Ver conversa**. Em telas menores, o cartão fica acima da área de desenho. O desenho permanece disponível para tentar novamente se houver erro; ele é limpo depois de um envio bem-sucedido, como na versão anterior.

## Uma configuração de IA para tudo

Mantenha somente estas variáveis de IA no servidor/Vercel (sem prefixo VITE_):

```
BOARD_AI_API_KEY=<chave do Google AI Studio>
BOARD_AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
BOARD_AI_MODEL=gemini-3.5-flash-lite
```

Elas são usadas em todas as chamadas: conversas com e sem desenho, leitura de materiais, quizzes, flashcards e explicações. As variáveis antigas `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_MODE` e `LOVABLE_API_KEY` não são mais lidas. Os nomes `BOARD_AI_*` foram mantidos para reaproveitar a chave Gemini que já está configurada. Não é preciso copiar a chave para outro nome.

Na Vercel, use `npm ci` como Install Command, configure as variáveis no ambiente de Production do projeto GStudy e faça Redeploy do commit atual. As configurações da hospedagem podem prevalecer sobre o arquivo .env. Não publique chaves no Git e não use prefixo VITE_ para credenciais de IA. A API recebe o conteúdo da aula ou do material necessário à tarefa. A disponibilidade e a cota gratuita dependem da conta; nenhuma configuração de cobrança é alterada pelo aplicativo.

O aplicativo usa o SDK nativo do Gemini, inclusive para imagens, PDFs e respostas estruturadas. O endereço antigo terminado em /openai também é aceito e normalizado automaticamente. Se houver restrição de rede, permita generativelanguage.googleapis.com. Em Node 24 dentro deste ambiente cloud, NODE_USE_ENV_PROXY=1 habilita o proxy disponibilizado pela plataforma.

## Modelo e diagnóstico

Em 15/10/2026, a API informou que gemini-2.5-flash não estava mais disponível para novos usuários desta conta. Gemini-3.8-flash retornou indisponibilidade temporária. Uma imagem de teste foi corretamente identificada por gemini-3.5-flash-lite. O aplicativo distingue erros de chave, cota, parâmetros, modelo e indisponibilidade sem mostrar dados privados do provedor.

## Desenvolvimento

Use Node 24 e npm: `npm ci`, `npm test`, `npx tsc --noEmit`, `NITRO_PRESET=vercel npm run build`. Para desenvolver: `NODE_USE_ENV_PROXY=1 npm run dev`. As integrações de autenticação e Notion continuam usando as configurações existentes.

## Validação desta atualização

67 testes automatizados passaram. A aula foi exercitada no navegador em 1512 px e 390 px de largura, sem erros de JavaScript nem rolagem horizontal: desenho, texto, envio, pergunta do aluno e histórico com imagem funcionaram com respostas de teste. Foram feitas chamadas reais pelo código da aplicação para ler uma imagem, gerar dois flashcards em JSON e resumir um PDF de teste com o Gemini nativo. Não foi necessário alterar configurações de cobrança.
