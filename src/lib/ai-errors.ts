import { AiSetupError } from "./ai-config";

type Context = {
  whiteboard: boolean;
  google: boolean;
  groq?: boolean;
  openrouter?: boolean;
  omniroute?: boolean;
  deepseek?: boolean;
  keyVariable?: string | undefined;
};
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
const categories = [
  "key",
  "plan",
  "model",
  "vision",
  "context",
  "image-input",
  "schema",
  "parameter",
  "credits",
  "request",
] as const;
type FailureCategory = (typeof categories)[number];

// Read provider diagnostics only to classify them. Never return raw response text,
// URLs, prompts, project identifiers, request bodies or credentials to the client.
export function providerFailure(status: number, payload: unknown, context: Context): AiSetupError {
  const failure = (message: string, category?: FailureCategory) =>
    Object.assign(new AiSetupError(message), {
      statusCode: status,
      ...(category ? { category } : {}),
    });
  const root = record(Array.isArray(payload) ? payload[0] : payload);
  const error = record(root?.["error"]);
  const message =
    typeof error?.["message"] === "string"
      ? error["message"]
      : typeof root?.["error"] === "string"
        ? root["error"]
        : typeof root?.["message"] === "string"
          ? root["message"]
          : "";
  const code =
    typeof error?.["code"] === "string"
      ? error["code"]
      : typeof root?.["code"] === "string"
        ? root["code"]
        : "";
  const param = typeof error?.["param"] === "string" ? error["param"] : "";
  const diagnostic = [message, code, param].join(" ");
  const details = Array.isArray(error?.["details"]) ? error["details"] : [];
  const reasons = details.map((value) => record(value)?.["reason"]);
  const key =
    context.keyVariable ??
    (context.openrouter
      ? "OPENROUTER_API_KEY"
      : context.groq
        ? "GROQ_API_KEY"
        : "BOARD_AI_API_KEY");
  const model = context.omniroute || context.deepseek ? "SOCRATES_AI_MODEL" : context.groq
    ? context.whiteboard
      ? "GROQ_VISION_MODEL"
      : "GROQ_MODEL"
    : context.openrouter
      ? context.whiteboard
        ? "OPENROUTER_VISION_MODEL"
        : "OPENROUTER_MODEL"
      : "BOARD_AI_MODEL";
  const service = context.deepseek ? "DeepSeek" : context.omniroute ? "OmniRoute" : context.openrouter ? "OpenRouter" : "Groq";
  const url =
    context.omniroute || context.deepseek ? "SOCRATES_AI_BASE_URL" : context.groq || context.openrouter ? "o acesso à API " + service : "BOARD_AI_BASE_URL";
  const provider =
    context.groq || context.openrouter || context.omniroute || context.deepseek
      ? "O " + service
      : context.google
        ? "O Gemini"
        : "O provedor de IA";
  if (
    reasons.some((reason) =>
      ["API_KEY_INVALID", "API_KEY_EXPIRED", "API_KEY_NOT_FOUND"].includes(String(reason)),
    ) ||
    status === 401 ||
    ((context.groq || context.openrouter || context.omniroute || context.deepseek) &&
      /(?:invalid|incorrect|expired|revoked)[ _-]*(?:api[ _-]*)?key|api[ _-]*key[ _-]*(?:invalid|expired|revoked)/i.test(
        diagnostic,
      ))
  ) {
    return failure(
      `A chave de IA foi recusada (HTTP ${status}). Confira ${key} nas variáveis de Production da hospedagem e publique novamente.`,
      "key",
    );
  }
  if (
    context.google &&
    status === 404 &&
    /no longer available|new users|deprecated|retired/i.test(message)
  ) {
    return failure(
      `O Google não disponibiliza mais esse modelo para sua conta (HTTP 404). Atualize ${model} para um modelo ativo no Google AI Studio e publique novamente.`,
    );
  }
  if (status === 403)
    return failure(
      `${provider} bloqueou o acesso (HTTP 403). Confira as permissões e restrições da chave ${key} para chamadas pelo servidor.`,
    );
  if (status === 402)
    return failure("Os créditos de IA acabaram (HTTP 402). Confira o saldo no provedor.");
  if (status === 429)
    return failure(
      `${provider} atingiu o limite de requisições ou a cota do projeto (HTTP 429). Confira a cota desse modelo no provedor e aguarde a renovação do limite.`,
    );
  if (status === 404)
    return failure(
      `O modelo ou endereço da IA não está disponível (HTTP 404). Confira ${model} e ${url} na hospedagem.`,
    );
  if ((context.groq || context.openrouter || context.omniroute || context.deepseek) && (status === 400 || status === 422)) {
    const prefix = provider + " recusou a solicitação (HTTP " + status + "). ";
    if (
      /(?:coding|code[- ]only|programming).*(?:key|plan|only|restrict)|(?:key|plan).*(?:only.*(?:coding|code)|restricted.*(?:coding|code))/i.test(
        diagnostic,
      )
    )
      return failure(
        prefix +
          "A chave ou o plano está restrito a programação. Essa permissão não cobre todas as funções de estudo. Confira o acesso à API geral; se a conta não permitir texto, imagens e atividades estruturadas, use outro provedor compatível.",
        "plan",
      );
    if (
      /(?:credit|balance|spending|billing|payment).*(?:insufficient|exhaust|limit|exceed|required)|(?:insufficient|exhaust).*(?:credit|balance)/i.test(
        diagnostic,
      )
    )
      return failure(
        prefix +
          "O provedor informou restrição de créditos ou cobrança. Confira o saldo e o limite de gastos da conta " +
          service +
          ".",
        "credits",
      );
    if (
      /(?:does not support|not support|unsupported|not available).*(?:images|image input|vision|multimodal)|(?:images|image input|vision|multimodal).*(?:not supported|unsupported|not available)/i.test(
        diagnostic,
      )
    )
      return failure(
        prefix +
          "O modelo selecionado não aceita imagens nesta API. Configure " +
          (context.omniroute || context.deepseek ? "SOCRATES_AI_MODEL" : context.openrouter ? "OPENROUTER_VISION_MODEL" : "GROQ_VISION_MODEL") +
          " com um modelo de visão autorizado para sua chave. Para usar lousa e fotos com esta conta, é necessário esse suporte ou outro provedor compatível.",
        "vision",
      );
    if (
      /(?:context|token).*(?:length|window|limit|exceed|too long)|(?:maximum|max)[ _-]*(?:context|input)[ _-]*(?:length|tokens)|context_length_exceeded/i.test(
        diagnostic,
      )
    )
      return failure(
        prefix +
          "O conteúdo ultrapassa a janela de contexto autorizada para este modelo. O conteúdo foi preservado. Para enviá-lo completo, escolha um modelo ou provedor com capacidade suficiente.",
        "context",
      );
    if (/json[ _-]*schema|response_format|text\.format|structured[ _-]*output/i.test(diagnostic))
      return failure(
        prefix +
          "O formato de resposta estruturada enviado pela integração foi rejeitado. Isso é uma incompatibilidade de formato ou configuração, não uma conclusão sobre o tamanho do conteúdo.",
        "schema",
      );
    if (
      /reasoning\.encrypted_content|\binclude\b|\bstore\b|unsupported[ _-]*parameter|unknown[ _-]*(?:field|parameter)|unrecognized[ _-]*(?:field|parameter)/i.test(
        diagnostic,
      )
    )
      return failure(
        prefix +
          "A API rejeitou um parâmetro da integração. O formato da chamada precisa ser corrigido; reduzir o conteúdo não resolve esse tipo de erro.",
        "parameter",
      );
    if (
      /(?:model).*(?:not found|not exist|not available|unknown|invalid|not enabled|not authorized|not allowed|not permitted)|(?:unknown|invalid|unsupported)[ _-]*model|model_not_found/i.test(
        diagnostic,
      )
    )
      return failure(
        prefix +
          "O modelo solicitado não está disponível ou autorizado para esta chave. Confira " +
          model +
          " e os modelos liberados no painel " +
          service +
          ".",
        "model",
      );
    if (
      /(?:image|image_url).*(?:invalid|malformed|format|too large|size|resolution)|(?:invalid|malformed).*(?:image|image_url)/i.test(
        diagnostic,
      )
    )
      return failure(
        prefix +
          "A API recusou o formato, a resolução ou o tamanho de uma imagem. A imagem foi preservada; confira os formatos e limites aceitos pelo modelo de visão.",
        "image-input",
      );
    return failure(
      prefix +
        "O motivo específico não foi identificado. Confira o modelo e as permissões da chave. Esse código HTTP, sozinho, não demonstra que o modelo não consegue realizar a tarefa.",
      "request",
    );
  }
  if (status === 400 || status === 422)
    return failure(
      `${provider} recusou ${context.whiteboard ? "a imagem" : "o conteúdo"} ou os parâmetros enviados (HTTP ${status}). Confira a configuração do modelo e tente um conteúdo menor.`,
    );
  if (status >= 500)
    return failure(
      `${provider} está temporariamente indisponível (HTTP ${status}). Aguarde alguns instantes e tente novamente.`,
    );
  return failure(
    `${provider} recusou a solicitação (HTTP ${status}). Confira a configuração do serviço na hospedagem.`,
  );
}

export function safeAiFailure(
  error: unknown,
  context: Context,
): { message: string; status: number | undefined; category?: FailureCategory } {
  const seen = new Set<unknown>();
  let current = error;
  let status: number | undefined;
  for (let depth = 0; depth < 8 && current && !seen.has(current); depth++) {
    seen.add(current);
    const item = record(current);
    if (typeof item?.["statusCode"] === "number") status = item["statusCode"];
    if (current instanceof AiSetupError) {
      const category = categories.find((value) => value === item?.["category"]);
      return { message: current.message, status, ...(category ? { category } : {}) };
    }
    if (["AbortError", "TimeoutError"].includes(String(item?.["name"])))
      return {
        message:
          "A IA demorou demais para responder. Tente novamente com um desenho ou uma mensagem menor.",
        status,
      };
    if (["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(String(item?.["code"])))
      return {
        message: "Não foi possível conectar ao provedor de IA. Tente novamente em instantes.",
        status,
      };
    current = item?.["cause"];
  }
  if (status !== undefined && status >= 400 && status < 600)
    return { message: providerFailure(status, null, context).message, status };
  return { message: "A IA não conseguiu responder agora. Tente de novo em instantes.", status };
}

// Retry another provider only for availability/configuration/format failures.
// A refusal or content filter is not a reason to forward the request elsewhere.
export function canFallback(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  let eligible = false;
  for (let depth = 0; depth < 8 && current && !seen.has(current); depth++) {
    seen.add(current);
    const item = record(current);
    if (item?.["finishReason"] === "content-filter" || item?.["finishReason"] === "tool-calls")
      return false;
    const status = item?.["statusCode"];
    if (typeof status === "number") {
      if (status === 400 || status === 422)
        return (
          current instanceof AiSetupError &&
          (current.message.includes("chave de IA foi recusada") ||
            [
              "key",
              "plan",
              "model",
              "vision",
              "context",
              "schema",
              "parameter",
              "credits",
            ].includes(String(item?.["category"])))
        );
      if ([401, 402, 403, 404, 408, 409, 429].includes(status) || status >= 500) eligible = true;
      else if (status >= 400) return false;
    }
    if (current instanceof AiSetupError || item?.["isRetryable"] === true) eligible = true;
    if (
      [
        "AbortError",
        "TimeoutError",
        "AI_NoObjectGeneratedError",
        "AI_NoOutputGeneratedError",
        "AI_TypeValidationError",
        "AI_JSONParseError",
      ].includes(String(item?.["name"]))
    )
      eligible = true;
    if (
      [
        "ENOTFOUND",
        "ECONNREFUSED",
        "ECONNRESET",
        "ETIMEDOUT",
        "EAI_AGAIN",
        "UND_ERR_CONNECT_TIMEOUT",
        "UND_ERR_HEADERS_TIMEOUT",
      ].includes(String(item?.["code"]))
    )
      eligible = true;
    if (
      current instanceof TypeError &&
      /fetch failed|failed to fetch|networkerror/i.test(current.message)
    )
      eligible = true;
    current = item?.["cause"];
  }
  return eligible;
}
