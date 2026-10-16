# Lousa de estudos e Gemini

Repositório: MIGUEL487/notebook-quest-web, conectado ao site gstudy.vercel.app.

## Aula Feynman

A lousa ocupa a área principal da aula. As ferramentas ficam no topo: giz, apagador, texto, inserir imagem, mover imagem, retângulo, elipse, linha, seta e desfazer/refazer. Para texto, digite no campo que aparece, escolha o tamanho e clique para posicionar. Para formas, arraste do início até o fim. O papel claro e as cores de tinta também são preservados na imagem enviada à IA.

Use **Inserir imagem** para colocar uma foto ou referência de arte na lousa (JPG, PNG ou WebP, até 15 MB; até seis imagens por vez). A foto entra centralizada e preserva sua proporção e a transparência de PNGs. Em **Mover imagem**, arraste para reposicionar ou puxe o círculo no canto inferior direito para redimensionar. Também há botões para aumentar, diminuir, centralizar e remover a imagem, inclusive no celular. Volte ao giz, texto ou formas para fazer anotações por cima. Inserções, movimentos, tamanhos, remoções e a limpeza da lousa podem ser desfeitos e refeitos.

Escolher uma imagem apenas a prepara no navegador. Ao enviar a explicação, a foto e as anotações seguem juntas na imagem da lousa, sem as bordas de seleção. A revisão final também oferece essas ferramentas. O envio aguarda o carregamento da imagem; uma falha de leitura preserva o restante da lousa e uma falha da IA permite tentar novamente com a mesma imagem. Depois de um envio bem-sucedido no Feynman, o conteúdo continua em **Ver conversa**.

Gui, Lia, Rafa e Maya têm aparências e jeitos diferentes de perguntar. O cartão do aluno escolhido mostra a pergunta atual da IA e indica quando a resposta está sendo preparada. O campo para explicar fica **acima da lousa**, visível antes da área de desenho. O fundo acompanha o restante do aplicativo. A conversa inteira, incluindo imagens enviadas e o autor de cada pergunta, pode ser aberta em **Ver conversa**. Em telas menores, o cartão fica acima do campo de explicação. O desenho permanece disponível para tentar novamente se houver erro; ele é limpo depois de um envio bem-sucedido.

## Uma configuração de IA para tudo

Para o Gemini principal, mantenha estas variáveis de IA no servidor/Vercel (sem prefixo VITE_):

```
BOARD_AI_API_KEY=<chave do Google AI Studio>
BOARD_AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
BOARD_AI_MODEL=gemini-3.5-flash-lite
```

Elas são usadas em todas as chamadas: conversas com e sem desenho, leitura de materiais, quizzes, flashcards e explicações. As variáveis antigas `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_MODE` e `LOVABLE_API_KEY` não são mais lidas. Os nomes `BOARD_AI_*` foram mantidos para reaproveitar a chave Gemini que já está configurada. Não é preciso copiar a chave para outro nome.

Na Vercel, use `npm ci` como Install Command, configure as variáveis no ambiente de Production do projeto GStudy e faça Redeploy do commit atual. As configurações da hospedagem podem prevalecer sobre o arquivo .env. Não publique chaves no Git e não use prefixo VITE_ para credenciais de IA. A API recebe o conteúdo da aula ou do material necessário à tarefa. A disponibilidade e a cota gratuita dependem da conta; nenhuma configuração de cobrança é alterada pelo aplicativo.

O aplicativo usa o SDK nativo do Gemini, inclusive para imagens, PDFs e respostas estruturadas. O endereço antigo terminado em /openai também é aceito e normalizado automaticamente. Se houver restrição de rede, permita generativelanguage.googleapis.com. Em Node 24 dentro deste ambiente cloud, NODE_USE_ENV_PROXY=1 habilita o proxy disponibilizado pela plataforma.

## Grok/xAI como alternativa automática

Use `GROK_API_KEY` com a chave completa do Grok/xAI. O nome `XAI_API_KEY` e uma chave `grok_` ou `xai-` no campo antigo `GROQ_API_KEY` também são aceitos. Gemini permanece principal; Grok só entra após falha técnica. Consulte [GROK-ALTERNATIVA.md](./GROK-ALTERNATIVA.md) para modelos, visão, PDFs e configuração.

## Compatibilidade com Groq

Adicione `GROQ_API_KEY` para habilitar a troca automática nas falhas técnicas do Gemini. O Groq usa modelos separados para texto e visão, preservando fotos, desenhos, instruções e a conversa atual. Não é necessário iniciar outra tentativa nem mudar a configuração Gemini. Veja [GROQ-ALTERNATIVA.md](./GROQ-ALTERNATIVA.md) para os modelos, PDFs, limites e configuração na Vercel. Em redes restritas, libere também `api.groq.com`.

## Modelo e diagnóstico

Em 15/10/2026, a API informou que gemini-2.5-flash não estava mais disponível para novos usuários desta conta. Gemini-3.8-flash retornou indisponibilidade temporária. Uma imagem de teste foi corretamente identificada por gemini-3.5-flash-lite. O aplicativo distingue erros de chave, cota, parâmetros, modelo e indisponibilidade sem mostrar dados privados do provedor.

## Desenvolvimento

Use Node 24 e npm: `npm ci`, `npm test`, `npx tsc --noEmit`, `NITRO_PRESET=vercel npm run build`. Para desenvolver: `NODE_USE_ENV_PROXY=1 npm run dev`. As integrações de autenticação e Notion continuam usando as configurações existentes.

## Validação desta atualização

Ferramenta de imagem: 192 testes passaram, junto com TypeScript e o build Vercel. No navegador, foram verificados upload sem chamada de IA, transparência, movimento e redimensionamento pelo canto, desfazer/refazer, anotações, imagem incluída no envio, preservação após erro e histórico após sucesso. A validação em 390 px incluiu arrastar por toque, botões de tamanho e ausência de rolagem horizontal. Sessão e respostas da IA foram simuladas nessa verificação da interface.

118 testes automatizados passaram, além da checagem TypeScript e do build para Vercel. A jornada foi exercitada no navegador em 1512 px e 390 px de largura com sessão e respostas simuladas, sem erros de JavaScript nem rolagem horizontal: criação por matéria/assunto, as seis atividades, temporizador, avaliação com desenho, retomada do progresso após recarregar, bloqueio da terceira tentativa e feedbacks locais. A caixa de texto do Feynman ficou visível no celular sem rolar até o fim da lousa.

Nesta rodada, chamadas reais ao Gemini geraram uma trilha estruturada com três tópicos e dez flashcards com texto e acentuação íntegros. Imagens e PDF já haviam sido validados na atualização anterior. Nenhuma configuração de cobrança foi alterada. Consulte [TRILHAS-DE-ESTUDO.md](./TRILHAS-DE-ESTUDO.md) para as regras das atividades, fontes e armazenamento local.
