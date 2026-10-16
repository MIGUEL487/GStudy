# Notebook Quest Web

consegue dar um jeito nesse codigo? Adicione transições fluidas, e a parte de criar cadernos e cursos não ta funcionando. Me suurpreenda

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/beba2bbc-3043-42b5-b4cf-127b82fd9b1e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Lousa de estudos e Gemini

A aula Feynman tem uma lousa ampla com texto, formas e um cartão do aluno virtual que mostra a pergunta atual. A conversa completa continua acessível em **Ver conversa**.

Todas as funções de IA tentam Gemini (`BOARD_AI_*`) primeiro e usam Groq (`GROQ_API_KEY`) e depois OpenRouter gratuito (`OPENROUTER_API_KEY`) nas falhas técnicas. Grok/xAI foi removido; suas variáveis antigas são ignoradas. Veja [Groq como alternativa](./GROQ-ALTERNATIVA.md) e [OpenRouter gratuito](./OPENROUTER-ALTERNATIVA.md). Veja [LOUSA-E-IA.md](./LOUSA-E-IA.md). Na Vercel, use `npm ci` como comando de instalação para utilizar o lockfile npm atualizado.

Em **Aprender**, escolha uma matéria para suas trilhas de atividades. **Rumo à prova** tem um painel próprio com roteiro de sessões, indicações de vídeos e livros e mapa do programa, sem misturar seus planos com as trilhas. Planos antigos podem receber o novo roteiro mantendo seus dados. Veja [PREPARACAO.md](./PREPARACAO.md).
