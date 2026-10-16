# Grok/xAI como alternativa ao Gemini

Gemini continua como principal. Depois de uma falha técnica elegível (como HTTP 429 de cota, indisponibilidade ou JSON inválido), a mesma tarefa pode ser tentada uma vez no Grok. Não há interrupção de um Gemini saudável após 25 segundos, chamada simultânea nem troca permanente de provedor. O SDK xAI só é carregado depois da falha.

## Chave na Vercel

O nome recomendado é **GROK_API_KEY**, em Production, com a chave completa — incluindo grok_ ou outro prefixo que o serviço forneceu. XAI_API_KEY também é aceito. Uma chave Grok com prefixo grok_ ou xai- que já esteja em GROQ_API_KEY é reconhecida automaticamente e enviada à xAI, nunca à Groq. Isso permite aproveitar a configuração já preenchida.

A precedência é GROK_API_KEY, XAI_API_KEY e, por último, uma chave Grok reconhecida no campo antigo. Se Grok e Groq estiverem configurados, a alternativa escolhida será Grok. Não há uma terceira tentativa na Groq após uma falha do Grok.

Mantenha BOARD_AI_* para o Gemini. Não use VITE_ para chaves de IA nem as grave no Git. Depois de alterar variáveis na Vercel, publique novamente. A chave precisa autorizar o uso da API xAI; o prefixo sozinho não prova acesso, saldo ou permissão para um modelo.

## API e modelos

O aplicativo usa @ai-sdk/xai e a API Responses nativa em https://api.x.ai/v1/responses. A base é fixa, para não encaminhar credenciais para um endereço arbitrário. O parâmetro store é enviado como false; o histórico necessário de cada tarefa acompanha a chamada.

| Variável opcional | Padrão |
| --- | --- |
| GROK_MODEL | grok-4.20-non-reasoning |
| GROK_VISION_MODEL | Mesmo valor de GROK_MODEL |

Esses identificadores constam do SDK instalado. O acesso efetivo depende da conta. É possível indicar outro modelo ativo; para visão, escolha um que aceite imagens. Os modelos de Groq em GROQ_MODEL/GROQ_VISION_MODEL não são usados pelo Grok.

## Conteúdo e limites

Texto, desenhos, fotos e respostas estruturadas usam o mesmo fluxo autenticado existente, com validação de conteúdo antes de salvar. JSON Schema é enviado pela API nativa xAI. Fotos do caderno, boletim e lousa são preservadas no envio ao modelo de visão.

O Grok tem prazo de 45 segundos e nenhuma repetição interna. O tempo total depende também da falha do Gemini e do limite da hospedagem. Filtros e erros de conteúdo/parâmetros não disparam troca. Erros e logs mostram apenas informações seguras, sem chaves, notas ou imagens.

PDFs usam a extração de texto existente, com os mesmos limites de 40 páginas e 90 mil caracteres. Diagramas e digitalizações não são apresentados como interpretados. A interface avisa quando apenas o texto foi analisado. Na preparação para provas, esta alternativa não ativa busca web: sem grounding Gemini, a resposta continua identificada como orientação geral, sem fontes inventadas.

## Desenvolvimento e validação

Nesta atualização passaram 220 testes, a checagem TypeScript e o build para Vercel.

Use Node 24, npm ci --cache /tmp/notebook-quest-npm-cache, npm test, npx tsc --noEmit e NITRO_PRESET=vercel npm run build. Em uma rede restrita, permita registry.npmjs.org, api.x.ai e os serviços existentes. Para requisições Node através do proxy deste ambiente, use NODE_USE_ENV_PROXY=1.

Os testes executam os SDKs reais com HTTP simulado para validar Gemini primeiro, seleção da chave, API Responses, visão, JSON Schema, mensagens seguras e ausência de uma terceira tentativa. A autenticação real com a chave cadastrada exclusivamente na Vercel não pode ser confirmada pelo ambiente de desenvolvimento.
