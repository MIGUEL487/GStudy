# Integração Grok/xAI desativada

O aplicativo voltou a usar Gemini como principal e Groq como alternativa. O SDK xAI e sua seleção automática foram removidos. GROK_* e XAI_API_KEY são ignorados, mesmo quando ainda cadastrados na Vercel.

Se GROQ_API_KEY ainda contiver uma chave grok_, substitua-a por uma chave completa criada em https://console.groq.com/keys. O código não reaproveita nem envia essa chave para outro serviço. Consulte [GROQ-ALTERNATIVA.md](./GROQ-ALTERNATIVA.md).
