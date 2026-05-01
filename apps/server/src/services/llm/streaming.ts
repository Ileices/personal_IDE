// ============================================
// Streaming Handler - SSE for chat responses
// ============================================
import type OpenAI from 'openai';
import type { FastifyReply } from 'fastify';
import type { ChatStreamEvent } from '@personal-ide/shared';
import { buildModelParams } from '@personal-ide/shared';

/** Strip provider prefix from model ID (e.g. 'ollama/codellama:latest' -> 'codellama:latest') */
function stripModelPrefix(model: string): string {
  const knownPrefixes = [
    'github', 'ollama', 'groq', 'huggingface', 'cohere', 'mistral', 'gemini',
    'together', 'openrouter', 'lmstudio', 'nano', 'cerebras',
    'anthropic', 'openai-direct', 'deepseek-direct', 'qwen', 'zhipuai',
    'moonshot', 'minimax', 'xai', 'perplexity', 'fireworks', 'siliconflow',
  ];
  const slashIdx = model.indexOf('/');
  if (slashIdx > 0) {
    const prefix = model.substring(0, slashIdx).toLowerCase();
    if (knownPrefixes.includes(prefix)) {
      return model.substring(slashIdx + 1);
    }
  }
  return model;
}

/**
 * Stream an OpenAI chat completion to the client via SSE
 */
export async function streamChatResponse(
  client: OpenAI,
  model: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  reply: FastifyReply,
  options?: {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    conversationId?: string;
    messageId?: string;
    onContent?: (fullContent: string) => void;
    onDone?: (fullContent: string, usage: any) => void;
    signal?: AbortSignal;
  }
): Promise<void> {
  // Set SSE headers
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (event: ChatStreamEvent) => {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    // Emit immediately so clients can bind conversation/message IDs without
    // waiting for upstream model stream initialization.
    sendEvent({
      type: 'message_start',
      messageId: options?.messageId || '',
      conversationId: options?.conversationId || '',
    });

    const modelParams = buildModelParams(model, {
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      jsonMode: options?.jsonMode,
    });
    const stream = await client.chat.completions.create({
      model: stripModelPrefix(model),
      messages,
      stream: true,
      ...modelParams,
    }, { signal: options?.signal ?? AbortSignal.timeout(10 * 60_000) });

    let fullContent = '';

    for await (const chunk of stream) {
      // Check for abort
      if (options?.signal?.aborted) {
        sendEvent({ type: 'content_done', fullContent });
        sendEvent({ type: 'done' });
        reply.raw.end();
        return;
      }

      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullContent += delta;
        sendEvent({ type: 'content_delta', delta });
      }

      // Check for finish
      if (chunk.choices[0]?.finish_reason) {
        sendEvent({ type: 'content_done', fullContent });

        const usage = chunk.usage || (chunk as any).x_groq?.usage;
        sendEvent({
          type: 'done',
          usage: usage ? {
            promptTokens: usage.prompt_tokens || 0,
            completionTokens: usage.completion_tokens || 0,
            totalTokens: usage.total_tokens || 0,
          } : undefined,
        });

        options?.onDone?.(fullContent, usage);
      }
    }

    options?.onContent?.(fullContent);
  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown LLM error';
    sendEvent({ type: 'error', error: errorMsg });
  } finally {
    reply.raw.end();
  }
}

/**
 * Non-streaming completion (for internal agent use)
 * Now captures response headers for rate limit tracking.
 */
export async function completeChatResponse(
  client: OpenAI,
  model: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    signal?: AbortSignal;
    timeoutMs?: number;
  }
): Promise<{ content: string; usage: any; headers?: Record<string, string>; statusCode?: number; confidence?: number; nanoCount?: number }> {
  // Use .withResponse() to capture HTTP headers for rate limit tracking
  const modelParams = buildModelParams(model, {
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
    jsonMode: options?.jsonMode,
  });

  // Create a timeout signal if none provided — 10 min default to accommodate
  // local models (Ollama) that process sequentially and fleet queue buildup
  const signal = options?.signal ?? AbortSignal.timeout(options?.timeoutMs ?? 10 * 60_000);

  const { data: response, response: rawResponse } = await client.chat.completions.create({
    model: stripModelPrefix(model),
    messages,
    ...modelParams,
  }, { signal }).withResponse();

  // Extract rate-limit-relevant headers
  const headers: Record<string, string> = {};
  const rateLimitKeys = [
    'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset',
    'x-ratelimit-used', 'retry-after',
  ];
  for (const key of rateLimitKeys) {
    const val = rawResponse.headers.get(key);
    if (val) headers[key] = val;
  }

  return {
    content: response.choices[0]?.message?.content || '',
    usage: response.usage,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    statusCode: rawResponse.status,
    confidence: typeof (response as any)?.confidence === 'number' ? (response as any).confidence : undefined,
    nanoCount: typeof (response as any)?.nano_count === 'number' ? (response as any).nano_count : undefined,
  };
}
