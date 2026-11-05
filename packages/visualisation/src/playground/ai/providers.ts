/**
 * Where generations run. Phase one: providers that need no key (from mnfst/awesome-free-llm-apis), called straight
 * from the browser through their OpenAI-compatible endpoints, and Claude Haiku on the viewer's own Anthropic key.
 * Model ids and limits are the providers' published ones; `bun run ai:eval --list` prints what an endpoint serves.
 */
import type { ChatMessage, Mode } from './prompt';

export type Transport = 'openai' | 'anthropic';
export type Model = {
  id: string;
  label: string;
  /** What it is picked for; the eval report confirms or reorders it. */
  role: 'default' | 'fallback' | 'light' | 'baseline';
};
export type Provider = {
  id: string;
  label: string;
  transport: Transport;
  baseUrl: string;
  needsKey: boolean;
  /** Free endpoints may log or train on prompts; the bar says so. */
  logsPrompts: boolean;
  /** Requests per minute per model, when the provider publishes one (anonymous use). */
  rpm?: number;
  models: Model[];
};

export const PROVIDERS: readonly Provider[] = [
  {
    id: 'ovh',
    label: 'OVHcloud AI Endpoints (no key)',
    transport: 'openai',
    baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
    needsKey: false,
    logsPrompts: true,
    rpm: 2,
    models: [
      { id: 'Qwen3.5-397B-A17B', label: 'Qwen3.5 397B', role: 'default' },
      { id: 'gpt-oss-120b', label: 'gpt-oss 120B', role: 'fallback' },
      { id: 'Qwen3.6-27B', label: 'Qwen3.6 27B', role: 'light' },
      { id: 'Meta-Llama-3_3-70B-Instruct', label: 'Llama 3.3 70B', role: 'baseline' },
    ],
  },
  {
    id: 'llm7',
    label: 'LLM7.io (no key)',
    transport: 'openai',
    baseUrl: 'https://api.llm7.io/v1',
    needsKey: false,
    logsPrompts: true,
    models: [
      { id: 'codestral-latest', label: 'Codestral', role: 'light' },
      { id: 'gpt-oss-20b', label: 'gpt-oss 20B', role: 'light' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Claude (your Anthropic key)',
    transport: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    needsKey: true,
    logsPrompts: false,
    models: [{ id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', role: 'baseline' }],
  },
];

export const providerById = (id: string) => PROVIDERS.find((p) => p.id === id);
/** `provider/model`, as the picker and the eval name a model. */
export const modelKey = (provider: Provider, model: Model) => `${provider.id}/${model.id}`;
export function resolveModel(key: string): { provider: Provider; model: Model } | undefined {
  const [providerId, ...rest] = key.split('/');
  const provider = providerId ? providerById(providerId) : undefined;
  const model = provider?.models.find((m) => m.id === rest.join('/'));
  return provider && model ? { provider, model } : undefined;
}

export type Usage = { input: number; output: number; cacheRead?: number; cacheWrite?: number };
export type ChatResult = { text: string; usage?: Usage };
export type ChatErrorKind = 'http' | 'rate' | 'network' | 'timeout' | 'refusal' | 'max_tokens' | 'auth' | 'aborted';
export class ChatError extends Error {
  override name = 'ChatError';
  constructor(
    readonly kind: ChatErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export type ChatOptions = {
  mode: Mode;
  signal?: AbortSignal;
  apiKey?: string;
  /** Claude only: how hard it thinks (Haiku 5.5's own default is medium). */
  effort?: 'low' | 'medium' | 'high';
  /** Called before waiting for a free endpoint's rate limit (then the request is sent again, same model). */
  onWait?: (seconds: number) => void;
};
export type Chat = (
  provider: Provider,
  model: Model,
  messages: ChatMessage[],
  options: ChatOptions,
) => Promise<ChatResult>;

const MAX_TOKENS: Record<Mode, number> = { full: 12000, light: 6000 };
/** Endpoints that refused `response_format` (this page): asked for plain text after. */
const noJsonMode = new Set<string>();
/** How often a 429 is waited out before giving up. */
const RATE_RETRIES = 2;

/** When each model was last asked (this page only), to stay under a provider's requests per minute. */
const recent = new Map<string, number[]>();
/** A wait that Cancel ends. */
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new ChatError('aborted', 'Cancelled'));
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      reject(new ChatError('aborted', 'Cancelled'));
    }
    signal?.addEventListener('abort', abort, { once: true });
  });
/** Seconds from a Retry-After header (seconds or a date); missing when the header is absent or unreadable. */
function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1, Math.ceil(seconds));
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(1, Math.ceil((date - Date.now()) / 1000));
}
/** Milliseconds until another request to this model fits in its per-minute limit. */
function untilFree(key: string, rpm: number | undefined): number {
  if (!rpm) return 0;
  const now = Date.now();
  const times = (recent.get(key) ?? []).filter((t) => t > now - 60_000);
  recent.set(key, times);
  return times.length < rpm ? 0 : times[0]! + 60_000 - now + 250;
}
const waitFor = async (ms: number, options: ChatOptions) => {
  options.onWait?.(Math.ceil(ms / 1000));
  await sleep(ms, options.signal);
};

async function chatOpenAI(provider: Provider, model: Model, messages: ChatMessage[], options: ChatOptions) {
  const key = modelKey(provider, model);
  for (let retry = 0; ; retry++) {
    const wait = untilFree(key, provider.rpm);
    if (wait > 0) await waitFor(wait, options);
    recent.set(key, [...(recent.get(key) ?? []), Date.now()]);
    const json = !noJsonMode.has(provider.id);
    const response = await send(provider, model, messages, options, json);
    if (json && response.status === 400 && /response_format|json/i.test(await response.clone().text())) {
      // Not every endpoint takes a JSON mode; the prompt asks for JSON anyway.
      noJsonMode.add(provider.id);
      continue;
    }
    if (response.status === 429 && retry < RATE_RETRIES) {
      // Free endpoints rarely expose Retry-After to the page; then wait until this model's minute is over.
      const seconds = retryAfter(response) ?? Math.max(5, Math.ceil(untilFree(key, 1) / 1000) || 60);
      await waitFor(seconds * 1000, options);
      continue;
    }
    return read(provider, response);
  }
}

async function send(provider: Provider, model: Model, messages: ChatMessage[], options: ChatOptions, json: boolean) {
  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.apiKey && { authorization: `Bearer ${options.apiKey}` }),
      },
      body: JSON.stringify({
        model: model.id,
        messages,
        temperature: 0.2,
        max_tokens: MAX_TOKENS[options.mode],
        ...(json && { response_format: { type: 'json_object' } }),
      }),
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw new ChatError('aborted', 'Cancelled');
    throw new ChatError('network', `${provider.label}: ${(error as Error).message} (blocked by CORS or offline?)`);
  }
  return response;
}

async function read(provider: Provider, response: Response): Promise<ChatResult> {
  if (!response.ok) {
    const body = (await response.text().catch(() => '')).slice(0, 300);
    const kind =
      response.status === 429 ? 'rate' : response.status === 401 || response.status === 403 ? 'auth' : 'http';
    throw new ChatError(kind, `${provider.label} answered ${response.status}: ${body}`, response.status);
  }
  const json = (await response.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = json.choices?.[0];
  const text = choice?.message?.content ?? '';
  if (choice?.finish_reason === 'length') throw new ChatError('max_tokens', 'The answer was cut off (too long)');
  return {
    text,
    usage: json.usage && { input: json.usage.prompt_tokens ?? 0, output: json.usage.completion_tokens ?? 0 },
  };
}

async function chatAnthropic(provider: Provider, model: Model, messages: ChatMessage[], options: ChatOptions) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const browser = typeof window !== 'undefined';
  if (browser && !options.apiKey) throw new ChatError('auth', 'Enter your Anthropic API key to use Claude');
  // In Bun (the eval), a client without a key reads ANTHROPIC_API_KEY or an `ant auth login` profile.
  const envCredentials =
    !browser && ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_PROFILE'].some((name) => process.env[name]);
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const turns = messages
    .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));
  let response;
  try {
    const client = new Anthropic({
      ...(options.apiKey && { apiKey: options.apiKey }),
      ...(browser && { dangerouslyAllowBrowser: true }),
    });
    response = await client.messages.create(
      {
        model: model.id,
        max_tokens: 16000,
        // The rules, reference and examples are the same for every request of a mode: cached after the first.
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: turns,
        output_config: { effort: options.effort ?? 'medium' },
      },
      { signal: options.signal },
    );
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) throw new ChatError('aborted', 'Cancelled');
    if (error instanceof Anthropic.AuthenticationError)
      throw new ChatError('auth', 'The Anthropic key was not accepted', 401);
    if (error instanceof Anthropic.RateLimitError) throw new ChatError('rate', 'Rate limited by Anthropic', 429);
    if (error instanceof Anthropic.APIConnectionError) throw new ChatError('network', `Anthropic: ${error.message}`);
    if (error instanceof Anthropic.APIError)
      throw new ChatError('http', `Anthropic ${error.status}: ${error.message}`, error.status);
    // Without a key, a token or a profile the SDK fails before sending anything (a plain Error).
    if (!options.apiKey && !envCredentials && !browser)
      throw new ChatError('auth', 'No Anthropic credentials (set ANTHROPIC_API_KEY or run `ant auth login`)');
    throw error;
  }
  if (response.stop_reason === 'refusal') throw new ChatError('refusal', 'Claude declined this request');
  const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  if (response.stop_reason === 'max_tokens') throw new ChatError('max_tokens', 'The answer was cut off (too long)');
  const u = response.usage;
  return {
    text,
    usage: {
      input: u.input_tokens,
      output: u.output_tokens,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
    },
  };
}

/** One request, by the provider's transport. */
export const chat: Chat = (provider, model, messages, options) =>
  provider.transport === 'anthropic'
    ? chatAnthropic(provider, model, messages, options)
    : chatOpenAI(provider, model, messages, options);

/** What one model costs per million tokens (USD), for the eval's cost column; free endpoints cost nothing. */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};
export function costOf(modelId: string, usage: Usage | undefined): number {
  const price = PRICES[modelId];
  if (!price || !usage) return 0;
  return (
    (usage.input * price.input +
      usage.output * price.output +
      (usage.cacheRead ?? 0) * price.cacheRead +
      (usage.cacheWrite ?? 0) * price.cacheWrite) /
    1e6
  );
}
