import { GoogleGenAI, FunctionCallingConfigMode, Type } from '@google/genai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { CallOptions, ContentBlock, LLMAdapter } from './adapter';

interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  description?: string;
}

function toGeminiSchema(schema: JSONSchema): Record<string, unknown> {
  if (!schema.type) return {};
  const typeMap: Record<string, Type> = {
    string: Type.STRING,
    number: Type.NUMBER,
    integer: Type.INTEGER,
    boolean: Type.BOOLEAN,
    array: Type.ARRAY,
    object: Type.OBJECT,
  };
  const out: Record<string, unknown> = { type: typeMap[schema.type] ?? Type.STRING };
  if (schema.description) out.description = schema.description;
  if (schema.type === 'object' && schema.properties) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [k, toGeminiSchema(v)])
    );
    if (schema.required) out.required = schema.required;
  }
  if (schema.type === 'array' && schema.items) {
    out.items = toGeminiSchema(schema.items);
  }
  return out;
}

function toGeminiContent(blocks: ContentBlock[]): Array<Record<string, unknown>> {
  return blocks.map((b) => {
    if (b.type === 'text') return { text: b.text };
    return {
      inlineData: { mimeType: b.mediaType, data: b.base64 },
    };
  });
}

export function makeGeminiAdapter(apiKey: string): LLMAdapter {
  const client = new GoogleGenAI({ apiKey });
  return {
    async call<T>(opts: CallOptions<T>): Promise<T> {
      const jsonSchema = zodToJsonSchema(opts.schema, { target: 'jsonSchema7' }) as JSONSchema;
      delete (jsonSchema as { $schema?: string }).$schema;
      const resp = await client.models.generateContent({
        model: opts.model,
        contents: [
          { role: 'user', parts: toGeminiContent(opts.content) as never },
        ],
        config: {
          systemInstruction: opts.systemPrompt,
          tools: [
            {
              functionDeclarations: [
                {
                  name: opts.toolName,
                  description: opts.toolDescription,
                  parameters: toGeminiSchema(jsonSchema) as never,
                },
              ],
            },
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: [opts.toolName],
            },
          },
          maxOutputTokens: opts.maxTokens,
        },
      });
      const candidate = resp.candidates?.[0];
      const part = candidate?.content?.parts?.find((p) => p.functionCall);
      if (!part?.functionCall?.args) {
        throw new Error('Gemini did not return a function call');
      }
      return opts.schema.parse(part.functionCall.args);
    },
  };
}
