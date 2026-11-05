'use client';

import { useEffect, useRef, useState } from 'react';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { DEFAULT_REQUEST_TIMEOUT_MS, generate, LIMITS, type Progress, type Target } from './generate';
import type { Mode } from './prompt';
import { modelKey, PROVIDERS, resolveModel, type Provider } from './providers';

const button =
  'rounded border border-dg-border px-2 py-0.5 text-xs hover:border-dg-steel-600 hover:text-dg-steel-600 disabled:opacity-40';
const field =
  'min-w-0 rounded border border-dg-border bg-white px-2 py-1 text-xs text-dg-ink focus:border-dg-steel-600 focus:outline-none';

const DEFAULT_MODEL = 'ovh/Qwen3.5-397B-A17B';
const DEFAULT_LIGHT_MODEL = 'llm7/codestral-latest';

/** Per-viewer settings; storage can be missing or blocked, so every access is guarded. */
const stored = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(`dg-ai:${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) window.localStorage.removeItem(`dg-ai:${key}`);
      else window.localStorage.setItem(`dg-ai:${key}`, value);
    } catch {
      // nothing kept: the setting lasts for this visit
    }
  },
};
function useStored(key: string, initial: string): [string, (value: string) => void] {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(stored.get(key) ?? initial), [key, initial]);
  return [value, (next) => (setValue(next), stored.set(key, next))];
}

/** The same provider's fallback model, tried once when the chosen one is busy. */
function fallbackFor({ provider, model }: Target): Target | undefined {
  const other = provider.models.find((m) => m.role === 'fallback' && m.id !== model.id);
  return other && { provider, model: other };
}

export type PromptFailure = { message: string; code?: string; range?: { from: number; to: number } };

/**
 * One line to describe a shape (or a change to the open one). The answer is checked like code typed in the Code
 * tab, fixed by the model when it fails, and only a working definition is committed (so Ctrl+Z undoes it).
 */
export function PromptBar({
  definition,
  onResult,
  onFailure,
}: {
  definition: Definition;
  onResult: (definition: Definition) => void;
  onFailure: (failure: PromptFailure) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useStored('mode', 'full');
  const [chosen, setChosen] = useStored(`model:${mode}`, mode === 'light' ? DEFAULT_LIGHT_MODEL : DEFAULT_MODEL);
  const [edit, setEdit] = useStored('edit', 'yes');
  const [key, setKey] = useState('');
  useEffect(() => setKey(stored.get('anthropic-key') ?? ''), []);
  const [timeoutText, setTimeoutText] = useStored('timeout', String(DEFAULT_REQUEST_TIMEOUT_MS / 1000));
  /** Seconds one request (an answer or a fix) may take before it is given up. */
  const timeoutSeconds = Math.min(
    600,
    Math.max(10, Math.round(Number(timeoutText)) || DEFAULT_REQUEST_TIMEOUT_MS / 1000),
  );
  const [status, setStatus] = useState<{ text: string; tone: 'busy' | 'warn' | 'done' | 'error' } | null>(null);
  const running = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);

  const target = resolveModel(chosen) ?? resolveModel(DEFAULT_MODEL)!;
  const needsKey = target.provider.needsKey && !key;
  const label = (t: Target) => t.model.label;

  /**
   * The request under way, for the ticking status: what it is, when it started and gives up, and the end of a
   * rate-limit wait inside it (the wait pushes the give-up time back).
   */
  const current = useRef<{
    what: string;
    model: string;
    started: number;
    end: number;
    limit: number;
    waited: number;
    waitEnd?: number;
  } | null>(null);
  const ticking = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const stopTicking = () => clearInterval(ticking.current);
  useEffect(() => stopTicking, []);
  /** Seconds before the end at which the status warns: the last quarter of the limit, 5 to 20 s. */
  const warnSeconds = (limit: number) => Math.min(20, Math.max(5, limit / 4));
  const tick = () => {
    const r = current.current;
    if (!r) return;
    const now = Date.now();
    if (r.waitEnd && now < r.waitEnd)
      return setStatus({
        text: `Waiting ${Math.ceil((r.waitEnd - now) / 1000)} s for ${r.model}’s free rate limit… (cancel stops)`,
        tone: 'busy',
      });
    const left = Math.max(0, Math.ceil((r.end - now) / 1000));
    if (left <= warnSeconds(r.limit))
      return setStatus({
        text: `${r.what} No answer yet; gives up in ${left} s (the timeout is set next to the model).`,
        tone: 'warn',
      });
    // The model's time so far: rate-limit waits left out.
    const elapsed = Math.floor((now - r.started - r.waited) / 1000);
    setStatus({ text: `${r.what} ${elapsed} s (gives up after ${r.limit} s)`, tone: 'busy' });
  };

  const describe = (event: Progress, repairs: number) => {
    if (event.type === 'request') {
      const what = event.repairing
        ? `Fixing a ${event.repairing} error (${event.attempt}/${repairs})…`
        : `Asking ${label(event.target)}…`;
      const started = Date.now();
      current.current = {
        what,
        model: label(event.target),
        started,
        end: started + event.timeoutMs,
        limit: Math.round(event.timeoutMs / 1000),
        waited: 0,
      };
    } else if (event.type === 'waiting' && current.current) {
      current.current.waitEnd = Date.now() + event.seconds * 1000;
      current.current.end += event.seconds * 1000;
      current.current.waited += event.seconds * 1000;
    } else if (event.type === 'fallback') {
      current.current = null;
      stopTicking();
      return setStatus({ text: `${label(event.from)} is unreachable; trying ${label(event.to)}…`, tone: 'busy' });
    } else return;
    stopTicking();
    tick();
    ticking.current = setInterval(tick, 500);
  };

  const run = async () => {
    if (!prompt.trim() || busy || needsKey) return;
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    const started = Date.now();
    const repairs = LIMITS[mode as Mode].repairs;
    const fallback = fallbackFor(target);
    const result = await generate({
      prompt: prompt.trim(),
      mode: mode as Mode,
      target,
      signal: controller.signal,
      onProgress: (event) => describe(event, repairs),
      requestTimeoutMs: timeoutSeconds * 1000,
      ...(edit === 'yes' && { current: definition }),
      ...(fallback && { fallback }),
      ...(target.provider.needsKey && { apiKey: key }),
    });
    running.current = null;
    current.current = null;
    stopTicking();
    setBusy(false);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (result.ok) {
      onResult(result.definition);
      const fixes = result.attempts.length - 1;
      setStatus({
        text: `Done in ${seconds} s${fixes ? ` after ${fixes} fix${fixes > 1 ? 'es' : ''}` : ''} · Ctrl+Z undoes it`,
        tone: 'done',
      });
      return;
    }
    if (result.kind === 'aborted') return setStatus(null);
    setStatus({ text: `No working definition: ${result.message.split('\n')[0]}`, tone: 'error' });
    const last = result.last;
    if (last && !last.ok && last.code)
      onFailure({ message: last.errors.join('\n'), code: last.code, ...(last.range && { range: last.range }) });
  };

  const group = (provider: Provider) => (
    <optgroup key={provider.id} label={provider.label}>
      {provider.models.map((m) => (
        <option key={m.id} value={modelKey(provider, m)}>
          {m.label}
        </option>
      ))}
    </optgroup>
  );

  return (
    <section aria-label='Prompt' className='space-y-1 rounded border border-dg-border bg-white/60 p-2'>
      <form
        className='flex flex-wrap items-center gap-2'
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <input
          aria-label='describe a shape'
          className={`${field} flex-1 basis-64`}
          placeholder={
            edit === 'yes'
              ? 'Describe a change, e.g. “make it 7-pointed”'
              : 'Describe a shape, e.g. “a gear with 12 teeth”'
          }
          value={prompt}
          disabled={busy}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <label
          className='flex items-center gap-1 text-xs text-dg-subtle'
          title='Change the open definition instead of starting over'
        >
          <input type='checkbox' checked={edit === 'yes'} onChange={(e) => setEdit(e.target.checked ? 'yes' : 'no')} />
          edit current
        </label>
        <select
          aria-label='model'
          className={field}
          value={modelKey(target.provider, target.model)}
          onChange={(e) => setChosen(e.target.value)}
        >
          {PROVIDERS.map(group)}
        </select>
        <label
          className='flex items-center gap-1 text-xs text-dg-subtle'
          title='How long one request (the first answer, or a fix) may take before it is given up; waits for a free rate limit do not count'
        >
          timeout
          <input
            type='number'
            aria-label='timeout in seconds per request'
            className={`${field} w-16`}
            min={10}
            max={600}
            step={10}
            value={timeoutText}
            disabled={busy}
            onChange={(e) => setTimeoutText(e.target.value)}
            onBlur={() => setTimeoutText(String(timeoutSeconds))}
          />
          s
        </label>
        <button
          type='button'
          className={button}
          aria-pressed={mode === 'light'}
          title='Light: a short prompt for small, fast models (one fix at most)'
          onClick={() => setMode(mode === 'light' ? 'full' : 'light')}
        >
          {mode === 'light' ? '● light' : '○ light'}
        </button>
        {busy ? (
          <button type='button' className={button} onClick={() => running.current?.abort()}>
            cancel
          </button>
        ) : (
          <button type='submit' className={button} disabled={!prompt.trim() || needsKey}>
            generate
          </button>
        )}
      </form>
      {target.provider.needsKey && (
        <label className='flex flex-wrap items-center gap-2 text-xs text-dg-subtle'>
          Anthropic API key (kept in this browser only, sent only to api.anthropic.com)
          <input
            type='password'
            autoComplete='off'
            className={`${field} w-64`}
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              stored.set('anthropic-key', e.target.value || null);
            }}
          />
        </label>
      )}
      <p className='text-xs' aria-live='polite'>
        {status ? (
          <span
            className={
              status.tone === 'error'
                ? 'text-red-600'
                : status.tone === 'warn'
                  ? 'text-amber-700'
                  : status.tone === 'done'
                    ? 'text-emerald-700'
                    : 'text-dg-subtle'
            }
          >
            {status.text}
          </span>
        ) : (
          <span className='text-dg-subtle'>
            {target.provider.logsPrompts
              ? 'Free endpoint, no key: prompts may be logged by the provider. Don’t include anything private.'
              : 'Runs on your Anthropic account.'}{' '}
            Each request gives up after {timeoutSeconds} s
            {mode === 'full' ? ' (an answer and up to 2 fixes)' : ' (an answer and 1 fix)'}.
          </span>
        )}
      </p>
    </section>
  );
}
