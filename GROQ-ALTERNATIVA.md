# Groq como alternativa ao Gemini

Para a integração atual com Grok/xAI, consulte [GROK-ALTERNATIVA.md](./GROK-ALTERNATIVA.md). Este documento descreve a compatibilidade anterior com Groq; ela só é escolhida quando não há chave Grok configurada.

O Gemini continua como primeira opção. Quando há limite de uso/cota, indisponibilidade, erro de conexão, timeout, configuração inválida ou resposta que não pode ser lida como JSON, a mesma solicitação pode ser repetida uma única vez no Groq. A conversa, as fontes e as imagens são preservadas; a troca acontece dentro da chamada do servidor, sem iniciar outra sessão nem gastar uma segunda tentativa diária. Quando o Gemini funciona, o Groq não é chamado.

## Ativar na Vercel

1. Abra **Vercel → projeto gstudy → Settings → Environment Variables**.
2. Adicione **`GROQ_API_KEY`** com sua chave privada da [console Groq](https://console.groq.com/keys), no ambiente **Production** (e Preview se também quiser testar deployments de preview).
3. Salve e faça **Deployments → último deployment da main → ⋯ → Redeploy**.
4. Mantenha as variáveis `BOARD_AI_*` do Gemini. Não use prefixo `VITE_`, não envie a chave em mensagens e não a grave no GitHub.

O único campo novo obrigatório para ativar a alternativa é `GROQ_API_KEY`. Os modelos têm padrões no código e podem ser personalizados:

| Variável opcional | Padrão | Uso |
| --- | --- | --- |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Conversas de texto, resumos e atividades |
| `GROQ_VISION_MODEL` | `meta-llama/llama-4-scout-17b-16e-instruct` | Lousa, fotos do caderno e do boletim |

A base é fixa: `https://api.groq.com/openai/v1`. Não precisa criar `GROQ_BASE_URL`. Se um modelo estiver indisponível para sua conta, escolha outro identificador ativo no [catálogo Groq](https://console.groq.com/docs/models); para `GROQ_VISION_MODEL`, escolha um modelo que aceite imagens. A disponibilidade, a cota gratuita e os limites dependem da conta Groq. O aplicativo não muda cobrança ou plano.

## Comportamento

- O Gemini não é interrompido por um cronômetro local de 25 segundos. Enquanto ele estiver gerando sem erro, a solicitação continua nele. O Groq só é carregado depois de uma falha elegível do Gemini e tem prazo de 25 segundos, sem retries internos. O tempo total também depende da resposta dos provedores e do limite da hospedagem.
- Não há troca permanente: a próxima solicitação tenta novamente o Gemini. O comportamento não depende de qual instância da Vercel atende a chamada.
- Erros de conteúdo/parâmetros (HTTP 400/422, exceto chave Google inválida) e respostas bloqueadas por filtro não são encaminhados para outro provedor. Erros da sessão Supabase e falhas ao salvar também não disparam troca de IA.
- Sem chave Groq, o comportamento do Gemini continua funcionando e seus erros são informados normalmente. Se os dois provedores falharem, o aplicativo mostra uma mensagem segura para nova tentativa, sem expor diagnósticos privados, fotos, chaves ou textos nos logs.
- As atividades continuam usando validação de conteúdo com Zod antes de salvar. No Groq, usa-se JSON mode, compatível com modelos de texto e visão que não oferecem JSON Schema estrito; o esquema é incluído nas instruções. JSON inválido não é entregue como uma atividade válida.
- A troca inclui o conteúdo necessário da tarefa no envio ao Groq, conforme o uso autorizado da IA. A leitura de fotos informa os dois provedores antes do envio.

## PDFs

O Gemini continua lendo o arquivo PDF nativamente. O Groq não recebe PDFs nativos neste fluxo. Se o Gemini falhar, o servidor pode extrair o texto de um PDF de até 40 páginas e 90 mil caracteres e enviá-lo ao modelo de texto Groq. A resposta identifica que somente o texto foi analisado; figuras e diagramas não são interpretados nessa alternativa. O arquivo original não é enviado ao Groq.

Se houver páginas sem texto extraível, senha, arquivo inválido ou conteúdo muito extenso, a importação pede fotos das páginas, texto ou um PDF menor. Não se apresenta a leitura parcial de uma digitalização como se o documento inteiro tivesse sido compreendido.

## Desenvolvimento

Use Node 24 e `npm ci --cache /tmp/notebook-quest-npm-cache`; o lockfile npm inclui `@ai-sdk/groq` e `unpdf`. `GROQ_API_KEY` deve ser fornecida de forma segura no ambiente local/cloud, separadamente das variáveis da Vercel. Em redes restritas, permita `api.groq.com`; a documentação fica em `console.groq.com`. Neste ambiente, use `NODE_USE_ENV_PROXY=1` para chamadas Node através do proxy.

Os testes do SDK usam HTTP simulado para verificar respostas do Gemini, troca por limite/erro, visão, JSON, credenciais separadas e mensagens sem dados sensíveis. Um PDF real de teste valida a extração de texto. Chamadas reais ao Groq dependem de uma chave configurada e acesso de rede ao serviço.
