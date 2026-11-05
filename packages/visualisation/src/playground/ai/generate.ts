/**
 * A prompt to a working definition: ask for JSON, check the reply with `validateJson`, and send what failed back for a fix
 * (full mode two fixes, light one). Nothing reaches the playground unless every check passes.
 */
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { printDefinition } from '../model/print';
import { extractJson } from './extract';
import { buildMessages, repairMessage, type ChatMessage, type Mode } from './prompt';
import {
  chat as defaultChat,
  ChatError,
  type Chat,
  type ChatErrorKind,
  type Model,
  type Provider,
  type Usage,
} from './providers';
import { validateJson, type Stage, type Validation } from './validate';

export type Target = { provider: Provider; model: Model };
export type Attempt = {
  attempt: number;
  target: Target;
  reply: string;
  validation: Validation;
  usage?: Usage;
  ms: number;
};
export type Progress =
  | { type: 'request'; attempt: number; target: Target; timeoutMs: number; repairing?: Stage }
  | { type: 'checked'; attempt: number; validation: Validation }
  | { type: 'fallback'; from: Target; to: Target; reason: string }
  /** Waiting out a free endpoint's rate limit; the same request is sent again after. */
  | { type: 'waiting'; seconds: number; target: Target };

/** Why a generation failed: a validation stage, or how the request failed. */
export type FailureKind = Stage | 'unchanged' | 'repeated' | ChatErrorKind;
export type GenerateResult =
  | { ok: true; definition: Definition; code: string; attempts: Attempt[] }
  | { ok: false; kind: FailureKind; message: string; attempts: Attempt[]; last?: Validation };

export type GenerateOptions = {
  prompt: string;
  mode: Mode;
  /** The definition to change; without it the request starts from nothing. */
  current?: Definition;
  target: Target;
  /** Tried once when the target is unreachable (a rate limit is waited out on the same model instead). */
  fallback?: Target;
  chat?: Chat;
  signal?: AbortSignal;
  apiKey?: string;
  effort?: 'low' | 'medium' | 'high';
  maxRepairs?: number;
  /** How long one request (the first answer, or a fix) may take; rate-limit waits do not count. */
  requestTimeoutMs?: number;
  onProgress?: (progress: Progress) => void;
};

export const LIMITS: Record<Mode, { repairs: number }> = {
  full: { repairs: 2 },
  light: { repairs: 1 },
};
export const DEFAULT_REQUEST_TIMEOUT_MS = 100_000;

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const { prompt, mode, current, onProgress } = options;
  const chat = options.chat ?? defaultChat;
  const repairs = options.maxRepairs ?? LIMITS[mode].repairs;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort);
  // Each request gets its own time limit, of the model's time: waits for a rate limit push it back.
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  let timedOut = false;
  let deadline = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, deadline - Date.now());
  };

  const currentCode = current && printDefinition(current);
  const messages: ChatMessage[] = buildMessages({ prompt, mode, ...(current && { current }) });
  const attempts: Attempt[] = [];
  let target = options.target;
  let fellBack = false;
  let repairing: Stage | undefined;
  const fail = (kind: FailureKind, message: string, last?: Validation): GenerateResult => ({
    ok: false,
    kind,
    message,
    attempts,
    ...(last && { last }),
  });

  try {
    for (let attempt = 0; attempt <= repairs; ) {
      onProgress?.({ type: 'request', attempt, target, timeoutMs, ...(repairing && { repairing }) });
      const started = Date.now();
      deadline = started + timeoutMs;
      arm();
      let reply;
      try {
        reply = await chat(target.provider, target.model, messages, {
          mode,
          signal: controller.signal,
          ...(options.apiKey && { apiKey: options.apiKey }),
          ...(options.effort && { effort: options.effort }),
          onWait: (seconds) => {
            deadline += seconds * 1000;
            arm();
            onProgress?.({ type: 'waiting', seconds, target });
          },
        });
      } catch (error) {
        if (timedOut)
          return fail('timeout', `No answer from ${target.model.label} within ${Math.round(timeoutMs / 1000)} s`);
        const kind: ChatErrorKind =
          error instanceof ChatError ? error.kind : controller.signal.aborted ? 'aborted' : 'network';
        if ((kind === 'network' || kind === 'http') && options.fallback && !fellBack) {
          fellBack = true;
          onProgress?.({ type: 'fallback', from: target, to: options.fallback, reason: (error as Error).message });
          target = options.fallback;
          continue; // the same attempt, on the other model
        }
        return fail(kind, (error as Error).message);
      } finally {
        clearTimeout(timer);
      }
      const json = extractJson(reply.text);
      let validation = validateJson(json);
      // An edit that changes nothing has not done what was asked.
      if (validation.ok && currentCode && printDefinition(validation.definition) === currentCode)
        validation = {
          ok: false,
          stage: 'evaluate',
          code: validation.code,
          definition: validation.definition,
          errors: ['The code is unchanged; apply the requested change.'],
        };
      attempts.push({
        attempt,
        target,
        reply: reply.text,
        validation,
        ...(reply.usage && { usage: reply.usage }),
        ms: Date.now() - started,
      });
      onProgress?.({ type: 'checked', attempt, validation });
      if (validation.ok) return { ok: true, definition: validation.definition, code: validation.code, attempts };
      const previous = attempts.at(-2)?.validation;
      if (previous && previous.code !== undefined && previous.code === validation.code)
        return fail('repeated', 'The model returned the same code again', validation);
      if (attempt === repairs) {
        const unchanged = validation.errors[0]?.startsWith('The code is unchanged');
        return fail(unchanged ? 'unchanged' : validation.stage, validation.errors.join('\n'), validation);
      }
      messages.push(
        { role: 'assistant', content: reply.text },
        { role: 'user', content: repairMessage(validation.stage, validation.errors) },
      );
      repairing = validation.stage;
      attempt++;
    }
    return fail('evaluate', 'No attempts left');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
