import { ApiError } from '../lib/errors.js';
import type { ModelWithSecret } from './model-service.js';
import { decryptModelKey } from './model-service.js';
import type { KeyStore } from '../security/key-store.js';

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
  disableThinking?: boolean;
}

export async function callChatCompletion(
  model: ModelWithSecret,
  keyStore: KeyStore,
  messages: ChatTurn[],
  options: CompletionOptions = {},
): Promise<string> {
  return callChatCompletionAttempt(model, keyStore, messages, options, true);
}

async function callChatCompletionAttempt(
  model: ModelWithSecret,
  keyStore: KeyStore,
  messages: ChatTurn[],
  options: CompletionOptions,
  allowEmptyRetry: boolean,
): Promise<string> {
  const apiKey = decryptModelKey(keyStore, model);
  const endpoint = completionEndpoint(model.baseUrl);
  const body: Record<string, unknown> = {
    model: model.modelId,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 700,
    stream: false,
  };
  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }
  if (options.disableThinking && model.provider === 'deepseek') {
    body.thinking = { type: 'disabled' };
  }
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new ApiError(504, 'LLM_TIMEOUT', 'The model provider did not respond in time.');
    }
    throw new ApiError(502, 'LLM_REQUEST_FAILED', 'The model provider could not be reached.');
  }

  if (!response.ok) {
    // Provider bodies can be long and occasionally echo request material. Do not
    // return them to the browser or print headers/keys in logs.
    console.error(`[courseatlas] LLM provider returned HTTP ${response.status}`);
    throw new ApiError(502, 'LLM_REQUEST_FAILED', 'The model provider rejected the request.');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(502, 'LLM_REQUEST_FAILED', 'The model provider returned an invalid response.');
  }
  const content = extractContent(payload);
  if (!content) {
    // DeepSeek can spend the whole completion budget on reasoning_content and
    // return an empty message.content. Retry once with thinking explicitly
    // disabled so the visible answer gets a budget.
    if (allowEmptyRetry && !options.jsonMode) {
      console.error('[courseatlas] LLM returned empty content; retrying with thinking disabled');
      return callChatCompletionAttempt(
        model,
        keyStore,
        messages,
        { ...options, disableThinking: true },
        false,
      );
    }
    throw new ApiError(502, 'LLM_REQUEST_FAILED', 'The model provider returned an empty answer.');
  }
  return content.trim();
}

function completionEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

function extractContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text ?? '');
        }
        return '';
      })
      .join('\n');
  }
  return '';
}

export function stripFakePageCitations(answer: string): string {
  return answer.replace(/\[[^\]\n]{1,140}\bp\.?\s*\d+\]/gi, '').replace(/[ \t]{2,}/g, ' ').trim();
}
