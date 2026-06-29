import type { LlmCompletionClient } from './types';

/**
 * OpenAI-backed JSON completion client. Kept self-contained so the discovery
 * worker only needs to provide an API key and model name.
 */
export class OpenAiCompletionClient implements LlmCompletionClient {
  private client: import('openai').default | null = null;

  constructor(
    private readonly apiKey: string | undefined,
    private readonly model: string,
  ) {}

  private getClient() {
    if (!this.client) {
      if (!this.apiKey) throw new Error('OPENAI_API_KEY not configured');
      const OpenAI = require('openai').default;
      this.client = new OpenAI({ apiKey: this.apiKey });
    }
    return this.client!;
  }

  async completeJson(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.getClient().chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    return response.choices[0]?.message?.content ?? '{}';
  }
}
