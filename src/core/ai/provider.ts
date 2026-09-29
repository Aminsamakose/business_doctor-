import Anthropic from '@anthropic-ai/sdk';

export interface LlmRequest { system: string; user: string; maxTokens: number }
export interface LlmResponse { text: string; model: string; modelVersion: string; inputTokens: number; outputTokens: number }
export interface LlmProvider { complete(req: LlmRequest): Promise<LlmResponse> }

/** Server-only adapter. The key and model come from the environment, never source or the browser. */
export class AnthropicProvider implements LlmProvider {
  private client: Anthropic;
  constructor(private model: string = process.env.ANTHROPIC_MODEL ?? '', apiKey: string | undefined = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    if (!this.model) throw new Error('ANTHROPIC_MODEL is not set');
    this.client = new Anthropic({ apiKey });
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const r = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    });
    const text = r.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return { text, model: this.model, modelVersion: r.model, inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens };
  }
}
