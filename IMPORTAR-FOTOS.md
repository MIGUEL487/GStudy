# Fotos de cadernos e boletins

O recurso reutiliza a integração Gemini (`BOARD_AI_*`) e a alternativa Groq de visão (`GROQ_API_KEY` e `GROQ_VISION_MODEL`). Veja [Groq como alternativa](./GROQ-ALTERNATIVA.md). Não exige migrações SQL.

- **Caderno → Transcrever foto do caderno:** escolha uma imagem da galeria ou use a câmera. Clique em **Transcrever foto**, revise o texto e confirme em **Adicionar ao caderno**. O texto é adicionado ao final; as anotações anteriores são mantidas. A leitura é uma transcrição, não um resumo, e marca trechos incertos como `[ilegível]`.
- **Notas e desempenho → Importar foto do boletim:** leia a imagem, confira as matérias e bimestres e edite as notas antes de salvar. Nomes equivalentes são associados às matérias cadastradas; nomes diferentes ou ambíguos exigem escolha manual. Um semestre ou trimestre não é convertido automaticamente em bimestre. Você pode desmarcar qualquer registro.
- Valores existentes são mantidos por padrão. Substituição e importação de faltas exigem marcar as opções correspondentes. Médias finais, escalas de nota, comportamento, advertências, configurações e registros de estudo não são calculados nem alterados pela importação. Confira faltas já lançadas no calendário para não contar o mesmo registro duas vezes.

As fotos são preparadas no aparelho (JPG, PNG ou WebP, até 15 MB de entrada, maior lado de até 2400 px e envio abaixo de 3 milhões de caracteres). O envio ao Gemini ou, em caso de falha técnica, ao Groq acontece somente ao iniciar a leitura; a foto não é gravada no banco do GStudy. Apenas o texto e os valores confirmados entram na cópia local e na sincronização da conta. O recurso não publica nem compartilha o boletim. Cada envio requer sessão autenticada, e a chave da IA fica no servidor.

Fotografe uma página ou um ano letivo por vez, com luz e resolução suficientes. A leitura pode conter erros; a revisão é editável, mostra a foto original para comparação e não salva automaticamente. Se a IA ou o armazenamento falhar, a revisão aberta é mantida para nova tentativa. Fechar a revisão a descarta sem alterar o caderno ou as notas.
