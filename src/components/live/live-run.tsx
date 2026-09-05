'use client';

import { useEffect, useRef, useState } from 'react';
import { MissionControl } from '@/components/mission/mission-control';
import { IconPlay } from '@/components/icons';
import type { MissionEvent } from '@/core/types';
import type { MissionSnapshot } from '@/core/mission';

/**
 * One button. A real mission runs on this deployment, and its events arrive here
 * as they happen. When it finishes, the finished snapshot renders through the
 * same mission view every recorded run uses, so what a visitor just watched and
 * what the recorded evidence looks like are one and the same thing.
 */
type Phase = 'idle' | 'running' | 'done' | 'error';

interface Live {
  missionId?: string;
  creditsBefore?: number;
  creditsAfter?: number | null;
  startedAt?: number;
  events: MissionEvent[];
  snapshot?: MissionSnapshot;
  error?: string;
  timedOut?: boolean;
}

const TONE: Record<string, string> = {
  'task.completed': 'var(--color-state-pass)',
  'verification.passed': 'var(--color-state-pass)',
  'mission.completed': 'var(--color-state-pass)',
  'worker.failed': 'var(--color-state-fail)',
  'task.failed': 'var(--color-state-fail)',
  'mission.failed': 'var(--color-state-fail)',
  'checkpoint.created': 'var(--color-frosted-lilac)',
  'handoff.started': 'var(--color-frosted-lilac)',
  'handoff.completed': 'var(--color-frosted-lilac)',
  'worker.hired': 'var(--color-quartz)',
};

function parseFrames(buffer: string): { frames: { event: string; data: string }[]; rest: string } {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  const frames = parts
    .map((chunk) => {
      let event = 'message';
      const data: string[] = [];
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trim());
      }
      return { event, data: data.join('\n') };
    })
    .filter((f) => f.data.length > 0);
  return { frames, rest };
}

export function LiveRun({ enabled }: { enabled: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [live, setLive] = useState<Live>({ events: [] });
  const [now, setNow] = useState(Date.now());
  const feedRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (phase !== 'running') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [live.events.length]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('running');
    setLive({ events: [], startedAt: Date.now() });
    let res: Response;
    try {
      res = await fetch('/api/v1/live/run', { method: 'POST', signal: controller.signal });
    } catch (err) {
      setLive((l) => ({ ...l, error: (err as Error).message }));
      setPhase('error');
      return;
    }
    if (!res.ok || !res.body) {
      let message = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string; retryAfterSeconds?: number };
        message = body.error ?? message;
        if (body.retryAfterSeconds) message += ` Try again in ${Math.ceil(body.retryAfterSeconds / 60)} min.`;
      } catch {
        /* keep the status */
      }
      setLive((l) => ({ ...l, error: message }));
      setPhase('error');
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { frames, rest } = parseFrames(buffer);
        buffer = rest;
        for (const frame of frames) {
          let data: unknown;
          try {
            data = JSON.parse(frame.data);
          } catch {
            continue;
          }
          if (frame.event === 'mission') {
            const e = data as MissionEvent;
            setLive((l) => ({ ...l, events: [...l.events, e] }));
          } else if (frame.event === 'live.started') {
            const d = data as { missionId: string; creditsBefore: number };
            setLive((l) => ({ ...l, missionId: d.missionId, creditsBefore: d.creditsBefore }));
          } else if (frame.event === 'live.finished') {
            const d = data as { snapshot: MissionSnapshot; creditsBefore: number; creditsAfter: number | null };
            setLive((l) => ({ ...l, snapshot: d.snapshot, creditsBefore: d.creditsBefore, creditsAfter: d.creditsAfter }));
            setPhase('done');
          } else if (frame.event === 'live.timeout') {
            setLive((l) => ({ ...l, timedOut: true }));
          } else if (frame.event === 'live.error') {
            const d = data as { message?: string };
            setLive((l) => ({ ...l, error: d.message ?? 'unknown error' }));
            setPhase('error');
          }
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setLive((l) => ({ ...l, error: (err as Error).message }));
        setPhase('error');
      }
    }
    setPhase((p) => (p === 'running' ? 'error' : p));
  };

  const elapsed = live.startedAt ? Math.max(0, Math.round((now - live.startedAt) / 1000)) : 0;
  const hired = live.events.filter((e) => e.type === 'worker.hired');
  const passed = live.events.filter((e) => e.type === 'task.completed').length;
  const snapshot = live.snapshot;

  if (!enabled) {
    return (
      <div className="glass p-6 text-[15px] leading-relaxed text-[var(--color-ash)]">
        Live runs are switched off on this deployment. The recorded missions are the evidence here;
        a local clone runs missions with <span className="mono">npm run mission</span>.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {phase === 'idle' && (
        <div className="glass p-6 md:p-8">
          <p className="max-w-[52rem] text-[16px] font-light leading-relaxed text-[var(--color-mist)]">
            Press the button and a mission starts on this deployment, now. The workspace is a fresh
            copy of the fixture in this function&rsquo;s temp directory. Workers are hired from the
            hosted pool by the auction and executed as RocketRide pipelines. Each task is verified by
            the fixture&rsquo;s own tests before it can pass. Nothing is recorded or replayed; you are
            watching the real event log as it is written.
          </p>
          <p className="mt-3 max-w-[52rem] text-[13px] leading-relaxed text-[var(--color-ash)]">
            Bounded on purpose: the goal is fixed, one run per visitor every ten minutes, one at a
            time per instance, cancelled if you leave, and stopped at four and a half minutes. It
            usually takes one to three.
          </p>
          <button type="button" onClick={start} className="btn-primary mt-6 inline-flex items-center gap-2">
            <IconPlay size={15} />
            Run a real mission now
          </button>
        </div>
      )}

      {phase !== 'idle' && (
        <div className="glass p-5 md:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
                {phase === 'running' ? 'Running now' : phase === 'done' ? 'Finished' : 'Stopped'}
              </div>
              <div className="mono mt-1 text-[15px] text-[var(--color-quartz)]">{live.missionId ?? '…'}</div>
            </div>
            <div className="mono flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-[var(--color-mist)]">
              <span>{elapsed}s</span>
              <span>{hired.length} hired</span>
              <span>{passed} passed</span>
              {typeof live.creditsBefore === 'number' && (
                <span>
                  credits {live.creditsBefore}
                  {typeof live.creditsAfter === 'number' ? ` → ${live.creditsAfter}` : ''}
                </span>
              )}
            </div>
          </div>

          {live.error && (
            <div className="mono mt-4 rounded-[10px] border border-[var(--color-state-fail)] px-4 py-3 text-[13px] text-[var(--color-state-fail)]">
              {live.error}
            </div>
          )}
          {live.timedOut && (
            <div className="mono mt-4 text-[12.5px] text-[var(--color-ash)]">
              Wall clock reached; the mission was cancelled rather than left running.
            </div>
          )}

          <div
            ref={feedRef}
            className="mt-5 max-h-[22rem] overflow-y-auto rounded-[12px] border border-[var(--color-obsidian-edge)] bg-[rgba(14,17,27,0.7)] p-4"
            aria-live="polite"
          >
            {live.events.length === 0 && phase === 'running' && (
              <div className="mono text-[12.5px] text-[var(--color-ash)]">Preparing the workspace and sweeping the workforce…</div>
            )}
            {live.events.map((e) => (
              <div key={e.seq} className="mono grid grid-cols-[4.5rem_1fr] gap-3 py-[3px] text-[12.5px] leading-snug">
                <span className="text-[var(--color-ash)]">{(e.elapsedMs / 1000).toFixed(1)}s</span>
                <span style={{ color: TONE[e.type] ?? 'var(--color-mist)' }}>
                  <span className="text-[var(--color-ash)]">{e.type} </span>
                  {e.message}
                </span>
              </div>
            ))}
          </div>

          {phase !== 'running' && (
            <button type="button" onClick={() => { setPhase('idle'); setLive({ events: [] }); }} className="mono mt-4 text-[12.5px] text-[var(--color-frosted-lilac)]">
              Reset
            </button>
          )}
        </div>
      )}

      {snapshot && (
        <div>
          <div className="mono mb-3 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
            Your run, in the same view every recorded mission uses
          </div>
          <MissionControl initial={snapshot} readOnly readOnlyLabel="your run · view only" />
        </div>
      )}
    </div>
  );
}
