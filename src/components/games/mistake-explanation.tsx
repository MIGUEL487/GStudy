import { useServerFn } from "@tanstack/react-start";
import { explainGameMistake } from "@/lib/games.functions";
import { readAiText } from "@/lib/ai-event-stream";
import { useStreamingText } from "@/lib/streaming-ai";
import { StreamingMessage } from "@/components/streaming-message";
import type { GameQuestion } from "@/lib/games/types";

function correctGameAnswer(question: GameQuestion): string {
  return String(
    question.correctAnswer ??
      question.options?.[question.correctIndex ?? -1] ??
      question.sequence?.join(" → ") ??
      question.pairs?.map((pair) => `${pair.left}: ${pair.right}`).join("; ") ??
      question.items?.map((item) => `${item.label}: ${item.category}`).join("; ") ??
      "Confira o conceito na explicação",
  );
}
export function MistakeExplanation({ question }: { question: GameQuestion }) {
  const reply = useServerFn(explainGameMistake);
  const stream = useStreamingText();
  const explain = () =>
    void stream.start(async (signal) =>
      readAiText(
        await reply({
          signal,
          data: {
            prompt: question.prompt.slice(0, 1000),
            answer: `${correctGameAnswer(question)}. ${question.explanation ?? ""}`.slice(0, 1500),
          },
        }),
      ),
    );
  return (
    <div className="game-mistake-explanation">
      <p>{question.explanation ?? correctGameAnswer(question)}</p>
      <button className="game-card-btn-challenge" onClick={explain} disabled={stream.isStreaming}>
        Explicar com IA
      </button>
      {(stream.text || stream.isStreaming || stream.error) && (
        <StreamingMessage
          text={stream.text}
          isStreaming={stream.isStreaming}
          isStopped={stream.isStopped}
          error={stream.error}
          onStop={stream.stop}
          onRetry={explain}
        />
      )}
    </div>
  );
}
