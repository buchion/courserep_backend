export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompletionResult {
  content: string;
  model: string;
  tokenUsage?: { prompt: number; completion: number; total: number };
}

export interface LlmProvider {
  complete(messages: LlmMessage[], options?: { json?: boolean }): Promise<LlmCompletionResult>;
}

function isJsonModeUnsupported(err: unknown): boolean {
  const msg = (err as { message?: string })?.message?.toLowerCase() ?? '';
  return (
    msg.includes('response_format') ||
    msg.includes('json_object') ||
    msg.includes('json mode') ||
    msg.includes('not supported')
  );
}

export class OpenAiLlmProvider implements LlmProvider {
  private client: import('openai').default | null = null;

  constructor(
    private readonly apiKey: string | undefined,
    private readonly model: string,
    private readonly baseURL?: string,
  ) {}

  private getClient() {
    if (!this.client) {
      if (!this.apiKey) throw new Error('OPENAI_API_KEY not configured');
      const OpenAI = require('openai').default;
      this.client = new OpenAI({
        apiKey: this.apiKey,
        ...(this.baseURL ? { baseURL: this.baseURL } : {}),
      });
    }
    return this.client!;
  }

  async complete(
    messages: LlmMessage[],
    options?: { json?: boolean },
  ): Promise<LlmCompletionResult> {
    const client = this.getClient();
    let response;
    try {
      response = await client.chat.completions.create({
        model: this.model,
        messages,
        ...(options?.json ? { response_format: { type: 'json_object' } } : {}),
      });
    } catch (err) {
      // Retry without json_object for providers/models that reject it.
      if (!options?.json || !isJsonModeUnsupported(err)) throw err;
      response = await client.chat.completions.create({
        model: this.model,
        messages,
      });
    }

    const choice = response.choices[0];
    return {
      content: choice.message.content ?? '',
      model: response.model,
      tokenUsage: response.usage
        ? {
            prompt: response.usage.prompt_tokens,
            completion: response.usage.completion_tokens,
            total: response.usage.total_tokens,
          }
        : undefined,
    };
  }
}
