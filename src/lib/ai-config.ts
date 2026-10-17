export class AiSetupError extends Error {}

// OmniRoute is a self-hosted router. Vercel needs a separately hosted HTTPS
// instance; the default local http://localhost:20128/v1 cannot be reached there.
export function socratesAiConfig(env: Record<string, string | undefined>) {
  const key = env["SOCRATES_AI_API_KEY"]?.trim();
  if (!key) return null;
  if (key.startsWith("oma_live_"))
    throw new AiSetupError("SOCRATES_AI_API_KEY precisa ser uma chave de inferência OmniRoute, não um token de administração oma_live_.");
  const baseURL = env["SOCRATES_AI_BASE_URL"]?.trim().replace(/\/+$/, "");
  const model = env["SOCRATES_AI_MODEL"]?.trim() || "auto";
  if (!baseURL)
    throw new AiSetupError(
      "Para usar OmniRoute no Sócrates, hospede o roteador em um servidor HTTPS acessível pela Vercel e configure SOCRATES_AI_BASE_URL com a base /v1 desse servidor. localhost no seu computador não funciona na Vercel.",
    );
  try {
    const url = new URL(baseURL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      throw new Error();
  } catch {
    throw new AiSetupError("SOCRATES_AI_BASE_URL precisa ser uma URL HTTPS da API OmniRoute, sem chave na URL.");
  }
  if (/\/(?:chat\/completions|responses)$/.test(baseURL))
    throw new AiSetupError("SOCRATES_AI_BASE_URL deve ser a base da API, sem /chat/completions ou /responses.");
  if (model.length > 180 || /^https?:\/\//i.test(model) || /\s/.test(model))
    throw new AiSetupError("SOCRATES_AI_MODEL deve ser um identificador de modelo do OmniRoute, não uma URL.");
  return { key, baseURL, model };
}

// One server-side configuration serves conversations, images and activities.
// Keep the existing BOARD_AI_* names so deployed Gemini credentials are reused.
export function aiConfig(env: Record<string, string | undefined>) {
  const key = env["BOARD_AI_API_KEY"]?.trim();
  if (!key)
    throw new AiSetupError(
      "A IA não está configurada. Preencha BOARD_AI_API_KEY com sua chave do Google AI Studio nas variáveis de Production da hospedagem e publique novamente.",
    );
  const baseURL = (
    env["BOARD_AI_BASE_URL"]?.trim() || "https://generativelanguage.googleapis.com/v1beta"
  ).replace(/\/+$/, "");
  const model = env["BOARD_AI_MODEL"]?.trim() || "gemini-3.5-flash-lite";
  try {
    const url = new URL(baseURL);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "generativelanguage.googleapis.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
  } catch {
    throw new AiSetupError(
      "BOARD_AI_BASE_URL precisa ser uma URL HTTPS da API Gemini, como https://generativelanguage.googleapis.com/v1beta.",
    );
  }
  if (/\/chat\/completions$|\/responses$/.test(baseURL))
    throw new AiSetupError(
      "BOARD_AI_BASE_URL deve terminar na base da API, não em /chat/completions ou /responses.",
    );
  if (/^https?:\/\//i.test(model))
    throw new AiSetupError(
      "BOARD_AI_MODEL deve conter o nome do modelo, como gemini-3.5-flash-lite, e não uma URL.",
    );
  return { key, baseURL: baseURL.replace(/\/openai$/, ""), model };
}

export const boardAiConfig = aiConfig;

// Only explicitly free models may be selected for this optional third provider.
export function openRouterConfig(env: Record<string, string | undefined>) {
  const key = env["OPENROUTER_API_KEY"]?.trim();
  if (!key) return null;
  const model = env["OPENROUTER_MODEL"]?.trim() || "nvidia/nemotron-3.5-super-vl:free";
  const visionModel = env["OPENROUTER_VISION_MODEL"]?.trim() || model;
  for (const [name, value] of [
    ["OPENROUTER_MODEL", model],
    ["OPENROUTER_VISION_MODEL", visionModel],
  ]) {
    if (!value || value.length > 180 || !/^[a-z0-9._-]+\/[a-z0-9._-]+:free$/i.test(value))
      throw new AiSetupError(
        name +
          " precisa ser um modelo gratuito do OpenRouter terminado em :free. Modelos pagos não são enviados por esta integração.",
      );
  }
  return { key, model, visionModel, baseURL: "https://openrouter.ai/api/v1" };
}

// Groq is optional: an absent key must never break a successful Gemini request.
export function groqConfig(env: Record<string, string | undefined>) {
  const key = env["GROQ_API_KEY"]?.trim();
  if (!key) return null;
  if (/^(?:codex_|xai-|grok_)/i.test(key))
    throw new AiSetupError(
      "GROQ_API_KEY recebeu uma chave do Grok/xAI ou de uma ferramenta de código. Grok e Groq são serviços diferentes. Substitua por uma chave completa criada em console.groq.com/keys, na Vercel em Production, e publique novamente. Remover o prefixo não converte a chave.",
    );
  const model = env["GROQ_MODEL"]?.trim() || "llama-3.3-70b-versatile";
  const visionModel =
    env["GROQ_VISION_MODEL"]?.trim() || "meta-llama/llama-4-scout-17b-16e-instruct";
  for (const [name, value] of [
    ["GROQ_MODEL", model],
    ["GROQ_VISION_MODEL", visionModel],
  ]) {
    if (!value || value.length > 180 || /^https?:\/\//i.test(value) || /\s/.test(value))
      throw new AiSetupError(
        `${name} deve conter apenas o identificador de um modelo disponível na sua conta Groq, não uma URL.`,
      );
  }
  return { key, model, visionModel, baseURL: "https://api.groq.com/openai/v1" };
}
