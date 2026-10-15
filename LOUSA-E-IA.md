# Lousa com texto, formas e IA de visão

Atualização aplicada ao repositório MIGUEL487/notebook-quest-web, conectado ao site gstudy.vercel.app. As integrações existentes foram preservadas. As novas chaves devem ser configuradas como variáveis do servidor na hospedagem; não as adicione ao Git. O package-lock.json foi sincronizado com o package.json para permitir npm ci.

## Ferramentas

Na aula Feynman, use os botões Giz, Apagador, Texto, Retângulo, Elipse, Linha ou Seta. Para texto, digite no campo que aparece, escolha o tamanho e clique na lousa para posicionar. Para formas, arraste do início até o fim. As cores funcionam com texto e formas. Desfazer/refazer e limpar também estão disponíveis. O desenho inteiro é incluído na imagem enviada ao aluno virtual. A lousa fica bloqueada durante o envio para evitar perder edições feitas enquanto a IA responde. O texto digitado na lousa vira parte da imagem; a explicação no chat continua sendo texto.

## Usar outra IA só na lousa

Mantenha AI_API_KEY, AI_BASE_URL, AI_MODEL e AI_API_MODE do Aion. Adicione somente no servidor/Vercel (sem prefixo VITE_):

```
BOARD_AI_API_KEY=<chave do provedor de visão>
BOARD_AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
BOARD_AI_MODEL=gemini-2.5-flash
```

Esse é um exemplo para a API Gemini pela interface compatível com OpenAI. Confirme no Google AI Studio se esse modelo e a cota gratuita estão disponíveis na sua conta; se necessário, selecione outro modelo com entrada de imagem e atualize BOARD_AI_MODEL. Chaves de provedores diferentes não são intercambiáveis. Na Vercel, defina o Install Command como `npm ci` para usar o package-lock.json atualizado (o bun.lock legado do ZIP não foi atualizado). Salve as variáveis no ambiente do deployment que usa e faça Redeploy. Se houver restrição de rede, permita o hostname do provedor (no exemplo, generativelanguage.googleapis.com).

Com uma imagem na última mensagem, somente a resposta Feynman usa o provedor BOARD_AI_*. Sem desenho, continua usando o Aion. Upload de PDF/imagem em outras áreas não foi redirecionado para essa IA. Sem as três variáveis, o app informa exatamente o que falta, sem enviar o desenho ao Aion. Um modelo de visão vê o contexto da conversa e as notas de estudo usadas na aula junto com a imagem.

Não há chave de demonstração nem conexão de conta incluída. O roteamento foi testado com provedores simulados; a resposta real do modelo exige uma chave válida e cota no provedor escolhido.

## Opções de API com acesso gratuito ou cota gratuita

- Google Gemini: modelos multimodais com cota gratuita para modelos/regiões/contas elegíveis. https://ai.google.dev/gemini-api/docs/pricing e https://ai.google.dev/gemini-api/docs/openai
- Groq: acesso de desenvolvimento com limites; confirme um modelo de visão ativo, como os da família Llama 4 quando disponíveis. Base compatível: https://api.groq.com/openai/v1. https://console.groq.com/docs/vision
- OpenRouter: catálogo variável de modelos gratuitos; filtre por preço zero e entrada de imagem. Use o ID exato exibido no catálogo, geralmente com sufixo :free quando indicado. Base: https://openrouter.ai/api/v1. https://openrouter.ai/models

Os catálogos e preços não puderam ser consultados nesta máquina (HTTP 403). Portanto, esses são serviços com modalidades gratuitas conhecidas, sem garantia de disponibilidade atual de um modelo ou cota específica. Ter um chat gratuito no site de um fornecedor não significa que sua API seja gratuita. Verifique limites e condições de uso de dados antes de enviar anotações pessoais.

## Validação local

Use Node 24 e npm: npm ci, npm test, npx tsc --noEmit e npm run build. Para desenvolvimento: npm run dev. Configure as credenciais de Supabase e provedores na hospedagem ou no .env local, sem versioná-las. O arquivo .env agora é ignorado pelo Git.

Validação desta entrega: 47 testes passaram em 8 arquivos; TypeScript sem erros; build com NITRO_PRESET=vercel concluído; rota /aprender/feynman respondeu HTTP 200 com o HTML esperado. Nenhuma chamada a uma API de IA real foi executada.
