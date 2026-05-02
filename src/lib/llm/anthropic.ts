import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { CallOptions, ContentBlock, LLMAdapter } from './adapter';

function toAnthropicContent(blocks: ContentBlock[]): Anthropic.MessageParam['content'] {
  return blocks.map((b) =>
    b.type === 'text'
      ? { type: 'text', text: b.text }
      : {
          type: 'image',
          source: { type: 'base64', media_type: b.mediaType, data: b.base64 },
        }
  ) as unknown as Anthropic.MessageParam['content'];
}

export function makeAnthropicAdapter(apiKey: string): LLMAdapter {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    defaultHeaders: { 'anthropic-dangerous-direct-browser-access': 'true' },
  });
  return {
    async call<T>(opts: CallOptions<T>): Promise<T> {
      const inputSchema = zodToJsonSchema(opts.schema, { target: 'jsonSchema7' }) as Record<string, unknown>;
      delete (inputSchema as { $schema?: string }).$schema;
      const tool = {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: inputSchema as Anthropic.Tool['input_schema'],
      } satisfies Anthropic.Tool;
      const resp = await client.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.systemPrompt,
        tools: [tool],
        tool_choice: { type: 'tool', name: opts.toolName },
        messages: [{ role: 'user', content: toAnthropicContent(opts.content) }],
      });
      const block = resp.content.find((b) => b.type === 'tool_use');
      if (!block || block.type !== 'tool_use') {
        throw new Error('Anthropic did not return tool_use');
      }
      return opts.schema.parse(block.input);
    },
  };
}
