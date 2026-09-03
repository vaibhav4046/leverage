'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Mission composer.
 *
 * Policy is expressed here, not inferred later: budget, quality and privacy are
 * explicit controls because they are the three things a user must be able to
 * guarantee. Everything else — which models, in what order, with what context — is
 * Leverage's job and is deliberately not exposed as a knob.
 */
const DEFAULT_GOAL =
  'Finish the forge-app receipt splitting library so the whole existing test suite passes. ' +
  'Do not modify any file under test/. Budget: $0. Quality: production.';

export default function NewMission() {
  const router = useRouter();
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [budget, setBudget] = useState(0);
  const [quality, setQuality] = useState(0.95);
  const [privacy, setPrivacy] = useState<'local-only' | 'prefer-local' | 'cloud-allowed'>(
    'prefer-local',
  );
  const [workers, setWorkers] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal,
          budgetMaxUsd: budget,
          qualityTarget: quality,
          privacy,
          maxWorkers: workers,
        }),
      });
      const body = (await res.json()) as { mission?: { mission: { id: string } }; error?: string };
      if (!res.ok) {
        setError(body.error ?? `Request failed (${res.status})`);
        return;
      }
      router.push(`/app/missions/${body.mission!.mission.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[820px] p-6">
      <h1 className="heading text-[28px] text-[var(--color-quartz)]">New mission</h1>
      <p className="mt-2 text-[15px] text-[var(--color-ash)]">
        State the outcome and the policy. Leverage compiles the plan and hires against it.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-6">
        <div>
          <label
            htmlFor="goal"
            className="mono block text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]"
          >
            What should Leverage accomplish?
          </label>
          <textarea
            id="goal"
            required
            minLength={8}
            maxLength={8000}
            rows={5}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="mt-2 w-full resize-y rounded-[8px] border border-[var(--color-obsidian-edge)] bg-[var(--color-deep-sea)] p-4 text-[15px] leading-relaxed text-[var(--color-quartz)] placeholder:text-[var(--color-slate)]"
            placeholder="Finish this application and verify it."
          />
        </div>

        <fieldset className="grid gap-4 md:grid-cols-2">
          <legend className="sr-only">Mission policy</legend>

          <Field label="Budget" hint={budget === 0 ? 'Zero-dollar mode: paid routes hard-blocked' : 'Hard ceiling on paid inference'}>
            <div className="flex gap-2">
              {[0, 0.5, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setBudget(v)}
                  aria-pressed={budget === v}
                  className="mono rounded-full border px-3 py-1.5 text-[12px] transition-colors"
                  style={{
                    borderColor: budget === v ? 'var(--color-quartz)' : 'var(--color-obsidian-edge)',
                    color: budget === v ? 'var(--color-quartz)' : 'var(--color-ash)',
                  }}
                >
                  ${v.toFixed(2)}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Quality target" hint="Minimum verified score to accept a task">
            <div className="flex gap-2">
              {[
                { v: 0.85, l: 'Balanced' },
                { v: 0.95, l: 'Production' },
                { v: 0.98, l: 'Critical' },
              ].map(({ v, l }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setQuality(v)}
                  aria-pressed={quality === v}
                  className="rounded-full border px-3 py-1.5 text-[12px] transition-colors"
                  style={{
                    borderColor: quality === v ? 'var(--color-quartz)' : 'var(--color-obsidian-edge)',
                    color: quality === v ? 'var(--color-quartz)' : 'var(--color-ash)',
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Privacy" hint="local-only never sends task content to a cloud model">
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as typeof privacy)}
              aria-label="Privacy mode"
              className="w-full rounded-[8px] border border-[var(--color-obsidian-edge)] bg-[var(--color-deep-sea)] px-3 py-2 text-[14px] text-[var(--color-quartz)]"
            >
              <option value="local-only">Local only</option>
              <option value="prefer-local">Prefer local</option>
              <option value="cloud-allowed">Cloud allowed</option>
            </select>
          </Field>

          <Field label="Parallelism" hint="Concurrent workers">
            <div className="flex gap-2">
              {[1, 2, 4].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setWorkers(v)}
                  aria-pressed={workers === v}
                  className="mono rounded-full border px-3 py-1.5 text-[12px] transition-colors"
                  style={{
                    borderColor: workers === v ? 'var(--color-quartz)' : 'var(--color-obsidian-edge)',
                    color: workers === v ? 'var(--color-quartz)' : 'var(--color-ash)',
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </Field>
        </fieldset>

        {error && (
          <p role="alert" className="text-[14px] text-[var(--color-state-fail)]">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Compiling…' : 'Compile mission'}
          </button>
          <span className="text-[13px] text-[var(--color-ash)]">
            Compiling does not start work. You start it from Mission Control.
          </span>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card p-4">
      <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
        {label}
      </div>
      <div className="mt-3">{children}</div>
      <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-slate)]">{hint}</p>
    </div>
  );
}
