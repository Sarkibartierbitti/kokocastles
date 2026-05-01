import OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { CallOptions, ContentBlock, LLMAdapter } from './adapter';

function toOpenAIContent(blocks: ContentBlock[]): OpenAI.Chat.ChatCompletionContentPart[] {
  return blocks.map((b) => {
    if (b.type === 'text') return { type: 'text', text: b.text };
    return {
      type: 'image_url',
      image_url: { url: `data:${b.mediaType};base64,${b.base64}` },
    };
  });
}

export function makeOpenAIAdapter(apiKey: string): LLMAdapter {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  return {
    async call<T>(opts: CallOptions<T>): Promise<T> {
      const parameters = zodToJsonSchema(opts.schema, { target: 'jsonSchema7' }) as Record<string, unknown>;
      delete (parameters as { $schema?: string }).$schema;
      const resp = await client.chat.completions.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user', content: toOpenAIContent(opts.content) },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: opts.toolName,
              description: opts.toolDescription,
              parameters: parameters as Record<string, unknown>,
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: opts.toolName } },
      });
      const call = resp.choices[0]?.message?.tool_calls?.[0];
      if (!call || call.type !== 'function') {
        throw new Error('OpenAI did not return a function call');
      }
      let args: unknown;
      try {
        args = JSON.parse(call.function.arguments);
      } catch (e) {
        throw new Error(`OpenAI returned invalid JSON arguments: ${(e as Error).message}`);
      }
      return opts.schema.parse(args);
    },
  };
}
