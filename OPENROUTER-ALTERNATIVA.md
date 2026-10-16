# OpenRouter gratuito como terceira IA

Todas as funções de estudo tentam **Gemini → Groq → OpenRouter**, avançando somente em falhas técnicas. Cada opção é tentada uma vez, sem reduzir o conteúdo, criar outra sessão ou consumir outra tentativa diária. A próxima solicitação volta a começar pelo Gemini. Sem chave de um dos serviços opcionais, ele é pulado.

## Configurar na Vercel

1. Crie uma conta no [OpenRouter](https://openrouter.ai/) e gere uma chave em [API Keys](https://openrouter.ai/settings/keys).
2. No projeto GStudy, abra **Environment Variables** e adicione `OPENROUTER_API_KEY` em **Production**. Não use prefixo `VITE_`, não publique em `.env` no GitHub e não compartilhe a chave no chat.
3. Mantenha `BOARD_AI_*` para o Gemini. Em `GROQ_API_KEY`, use uma chave da [Groq](https://console.groq.com/keys), substituindo qualquer chave antiga `grok_`. Grok e Groq são serviços diferentes; remover o prefixo não converte uma chave.
4. Publique novamente o commit atualizado (**Redeploy**). Só a chave OpenRouter é nova e obrigatória para ativar esta terceira opção; modelos têm padrões no código.

| Variável opcional         | Padrão                              | Uso                |
| ------------------------- | ----------------------------------- | ------------------ |
| `OPENROUTER_MODEL`        | `nvidia/nemotron-3.5-super-vl:free` | Texto e atividades |
| `OPENROUTER_VISION_MODEL` | Mesmo valor de `OPENROUTER_MODEL`   | Lousa e fotos      |

O catálogo público consultado em 16/10/2026 listava esse NVIDIA Nemotron com entrada de texto e imagens e preço zero. `google/gemma-4-26b-a4b-it:free` também estava disponível com visão. A disponibilidade pode mudar. Para trocar, selecione um identificador ativo terminado em `:free` que aceite as entradas necessárias no [catálogo](https://openrouter.ai/models?max_price=0). Um modelo de texto não ganha visão apenas por ser colocado em `OPENROUTER_VISION_MODEL`.

A base é fixa: `https://openrouter.ai/api/v1`. Chaves `GROK_*`, `XAI_API_KEY` e `MISTRAL_API_KEY` não ativam esta integração. Mistral não faz parte da sequência.

## Gratuidade e limites

Segundo a [documentação de limites](https://openrouter.ai/docs/api/reference/limits), consultada em 16/10/2026, os modelos gratuitos permitem **20 solicitações por minuto** e **50 por dia por conta sem compra de créditos**, compartilhadas entre os modelos gratuitos. Podem existir limites adicionais e indisponibilidade do provedor. Não é uma cota para cada usuário do GStudy: o site compartilha a conta configurada na Vercel.

O código exige modelos `:free` e envia `provider.max_price` com preços de entrada e saída iguais a zero. Não há troca automática para modelos pagos nem adição de créditos. Se não existir uma rota gratuita disponível, a chamada falha com uma mensagem segura.

## Imagens e PDFs

Imagens da lousa, do caderno e do boletim são enviadas ao modelo de visão sem redução adicional pela troca de provedor. As atividades e a leitura do boletim usam JSON mode e validação de estrutura antes de salvar.

O Gemini continua lendo PDFs nativamente. Na alternativa Groq, o servidor extrai somente o texto e informa essa limitação. Quando a solicitação chega ao OpenRouter, o **PDF original completo** é enviado em `file_data`, inclusive quando a extração local da Groq falhou. O fluxo aceita arquivos válidos de até 4 MB e 40 páginas; arquivos fora desses limites são recusados, sem corte silencioso de páginas.

O aplicativo define explicitamente `file-parser` com `pdf.engine: "cloudflare-ai"`, listado como gratuito na [documentação de PDFs](https://openrouter.ai/docs/guides/overview/multimodal/pdfs). O padrão do OpenRouter é `mistral-ocr`, que é pago, e **não é usado**. A integração não pede uma chave Mistral nem faz chamadas diretas de OCR pago.

Esse leitor converte o documento em conteúdo textual/Markdown. A resposta avisa que a interpretação de ilustrações não é garantida; para analisar detalhes visuais, envie fotos das páginas ao modelo de visão. A qualidade de PDFs digitalizados depende do leitor. O original não é substituído por texto parcial nem reenviado a um leitor pago se houver erro.

## Comportamento e validação

Gemini saudável continua sendo a primeira opção, sem cancelamento local apenas por ultrapassar 25 segundos. Groq tem prazo de 25 segundos e OpenRouter de 45 segundos, sem retries internos; o prazo total também depende da hospedagem. Recusas por filtro de conteúdo e erros de entrada não identificados não disparam a troca. Falhas técnicas de chave, cota, conexão, modelo e formato podem avançar para a próxima opção.

Somente Gemini usa pesquisa web neste fluxo. Groq e OpenRouter recebem instruções para não afirmar que consultaram fontes e não retornam URLs de pesquisa inventadas. Logs registram apenas provedor, status, visão e categoria segura; chaves, fotos, PDFs, conteúdo e diagnósticos brutos não são registrados.

Os testes usam SDKs reais com HTTP simulado para verificar a ordem, conteúdo completo, credenciais separadas, visão, JSON, falhas, preço zero e o leitor gratuito com um PDF real de teste. O funcionamento com uma conta real exige as chaves configuradas e cota disponível. Para desenvolvimento em rede restrita, permita `openrouter.ai`; no ambiente cloud Node, use `NODE_USE_ENV_PROXY=1` para o proxy.
