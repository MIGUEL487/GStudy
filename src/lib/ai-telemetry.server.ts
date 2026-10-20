export type AiTelemetryRecord = {
  activity: string;
  auth_ms: number;
  supabase_read_ms: number;
  prompt_build_ms: number;
  ttft_ms: number;
  total_time_ms: number;
  input_tokens: number;
  output_tokens: number;
  provider: string;
  fallback: boolean;
};

export class AiTelemetryTracker {
  private startTime: number;
  public auth_ms = 0;
  public supabase_read_ms = 0;
  public prompt_build_ms = 0;
  public ttft_ms = 0;
  public total_time_ms = 0;
  public input_tokens = 0;
  public output_tokens = 0;
  public provider = "gemini";
  public fallback = false;

  constructor(public activity: string) {
    this.startTime = performance.now();
  }

  public recordAiCall(data: {
    ttft_ms?: number;
    input_tokens?: number;
    output_tokens?: number;
    provider?: string;
    fallback?: boolean;
  }) {
    if (data.ttft_ms !== undefined) this.ttft_ms = Math.round(data.ttft_ms);
    if (data.input_tokens !== undefined) this.input_tokens = data.input_tokens;
    if (data.output_tokens !== undefined) this.output_tokens = data.output_tokens;
    if (data.provider !== undefined) this.provider = data.provider;
    if (data.fallback !== undefined) this.fallback = data.fallback;
  }

  public finish(): AiTelemetryRecord {
    this.total_time_ms = Math.round(performance.now() - this.startTime);
    if (this.ttft_ms === 0) {
      this.ttft_ms = this.total_time_ms;
    }
    const record: AiTelemetryRecord = {
      activity: this.activity,
      auth_ms: Math.round(this.auth_ms),
      supabase_read_ms: Math.round(this.supabase_read_ms),
      prompt_build_ms: Math.round(this.prompt_build_ms),
      ttft_ms: Math.round(this.ttft_ms),
      total_time_ms: this.total_time_ms,
      input_tokens: this.input_tokens,
      output_tokens: this.output_tokens,
      provider: this.provider,
      fallback: this.fallback,
    };

    console.log(
      `[GStudy AI Telemetry] ${record.activity} | Auth: ${record.auth_ms}ms | Supabase: ${record.supabase_read_ms}ms | Prompt: ${record.prompt_build_ms}ms | TTFT: ${record.ttft_ms}ms | Total: ${record.total_time_ms}ms | In: ${record.input_tokens} | Out: ${record.output_tokens} | Provedor: ${record.provider} | Fallback: ${record.fallback}`,
    );

    return record;
  }
}

export function createAiTelemetry(activity: string) {
  return new AiTelemetryTracker(activity);
}
