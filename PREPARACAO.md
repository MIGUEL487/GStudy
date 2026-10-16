# Preparação para provas, concursos e olimpíadas

A rota /preparar aparece na barra lateral e nas cinco opções da navegação móvel. O fluxo pergunta a etapa escolar, o tipo e nome do desafio, a edição/nível/cargo quando pertinente, a matéria cadastrada no início e o assunto de interesse.

Para concursos e olimpíadas, a pesquisa usa o Google Search do SDK Gemini. O relatório apresenta orientações e três perguntas para personalizar o estudo. Os links vêm dos metadados de grounding do provedor, com validação de URL e remoção de duplicatas, nunca de links inventados no texto. A pessoa deve conferir a edição e o programa do organizador. Para uma prova da escola, não há pesquisa sobre uma avaliação privada: a IA pergunta pelo conteúdo das aulas e pelo roteiro do professor.

Gemini continua sendo a primeira opção, sem interromper uma geração saudável após 25 segundos. Grok/xAI (ou Groq quando Grok não está configurado) só entra em falhas técnicas. Se o modelo Gemini não suporta grounding, uma resposta sem busca pode ser gerada no próprio Gemini. As alternativas Grok e Groq não recebem a ferramenta de busca neste fluxo. Sem fontes, a interface identifica a resposta como orientação geral e não como confirmação de um programa atual. Não são necessários novos segredos ou migrações SQL.

No último passo, a meta de aproveitamento pode ser ajustada de 0 a 100% por uma volta completa na circunferência, mouse, toque, botões e teclado (setas, Home, End, PageUp e PageDown). Os extremos não saltam entre 0 e 100% ao atravessar o topo. Para criar o plano, a meta precisa ser maior que zero. Ela expressa a intenção de acertos, sem representar uma nota obtida ou garantia de aprovação.

A preparação aceita roteiro/edital em texto, cadernos, páginas importadas do Notion e materiais da conta. É possível adicionar PDF, link e resumo pelo importador existente. Cadernos e respostas pessoais não entram na chamada de pesquisa web. O gerador cria de três a seis tópicos com as seis atividades existentes e preserva seus limites diários. Uma síntese do contexto acompanha as atividades seguintes.

Ano escolar é uma preferência do workspace, alterável em Configurações → Perfil. Cada plano registra o ano utilizado na criação: alterar o perfil não reescreve preparações antigas. Planos, meta e fontes usam os documentos de conta existentes e a mesclagem por revisão, com cópia local para offline. Falhas ao salvar conservam o plano gerado para tentar salvar sem outra chamada de IA.

## Grok e Groq

Grok/xAI e Groq são serviços diferentes. Use GROK_API_KEY com sua chave completa do Grok/xAI. XAI_API_KEY e uma chave grok_ ou xai- já preenchida em GROQ_API_KEY também são reconhecidas. Não remova o prefixo. Groq continua compatível quando Grok não está configurado. Consulte [GROK-ALTERNATIVA.md](./GROK-ALTERNATIVA.md).

## Verificação

208 testes automatizados passaram, além de TypeScript e build para Vercel.

O fluxo foi exercitado em Chromium em 1512 e 390 px, com sessão, documentos de conta e respostas de IA simulados: círculo completo e reverso, arrasto por toque, materiais, persistência após recarga, ano nas configurações, cinco destinos no celular e sincronização de duas preparações entre aparelhos, sem erros JavaScript ou rolagem horizontal. A chamada real de grounding do ambiente retornou HTTP 429 de cota do Gemini; não foi considerada uma pesquisa bem-sucedida. A disponibilidade real continua dependente das cotas e credenciais dos provedores.
