# Trilhas de estudo

Em **Teste seu conhecimento**, escolha uma matéria já cadastrada no início e informe o assunto. O Gemini organiza de 3 a 6 tópicos em ordem de pré-requisitos. É possível começar pelo assunto ou selecionar cadernos, resumos, PDFs e páginas já importadas do Notion.

Cada tópico tem seis etapas: explicações → flashcards → quiz → Active Recall → Método Feynman → revisão de síntese. Concluir uma etapa abre a seguinte; concluir as seis abre o próximo tópico. A revisão aceita texto e desenho, com nota e sugestões. Em assuntos de Pitágoras e radianos há ilustrações conceituais após comparar a resposta de referência.

## Fontes e IA

- Toda a IA usa a configuração Gemini `BOARD_AI_API_KEY`, `BOARD_AI_BASE_URL` e `BOARD_AI_MODEL` já existente. Nenhuma chave nova é necessária.
- Materiais precisam ser selecionados na criação da trilha. A IA recebe somente as referências escolhidas e o contexto da etapa. Cadernos selecionados são incluídos como uma cópia do conteúdo daquele momento.
- Conectar o Notion permite importar páginas autorizadas. Depois da importação, seus textos aparecem como cadernos e fontes para personalização. O login sozinho não importa páginas privadas.
- Links de cursos públicos podem ser importados como material. Para aulas em vídeo, páginas privadas e arquivos inacessíveis, envie suas anotações ou um PDF.
- Flashcards usam texto legível, com instruções de revisão do português e limpeza de escapes, entidades e acentuação corrompida. A interface mostra uma face por vez.

## Tentativas e armazenamento

Há **duas tentativas de cada tipo de atividade por dia**, compartilhadas entre as trilhas da mesma conta neste navegador. O dia acompanha a data local do aparelho. A tentativa é reservada ao iniciar a geração e devolvida se ela falhar. Uma conversa inteira do Feynman conta como uma tentativa; pedir outra avaliação do mesmo resumo/desenho após uma falha não inicia outra sessão.

Trilhas, progresso, contadores e feedbacks são persistidos por conta no armazenamento do navegador, conforme a arquitetura local do aplicativo. Eles não sincronizam entre dispositivos; apagar os dados do site também os apaga. O limite é de uso da interface, não uma proteção de consumo da API contra manipulação do cliente. Fontes importadas e XP continuam nas tabelas Supabase existentes. Esta atualização não exige migração SQL.

Erros de leitura ou escrita são mostrados e dados inválidos são preservados. Uma avaliação pronta pode ter o progresso salvo novamente sem repetir a chamada à IA. Em Configurações → Meus dados, a exportação inclui os cadernos, cursos e trilhas. Feedbacks têm exportação própria e não são enviados automaticamente à equipe.

## Verificação

```sh
npm test
npx --no-install tsc --noEmit
NITRO_PRESET=vercel npm run build
```

Os testes cobrem contexto das fontes, resultados estruturados, tentativas e virada do dia, desbloqueio de etapas, falhas de armazenamento, temporizador de cinco minutos, desenhos, alunos, feedbacks e navegação móvel. O roteiro de navegador usa sessão e respostas de teste; autenticação real e novas importações do Notion precisam de uma conta autorizada.
