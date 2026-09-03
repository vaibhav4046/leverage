'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Page, PageHead } from '@/components/app/shell';
import { IconLocal, IconCloud, IconShield, IconBudget } from '@/components/icons';

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

const PRIVACY_OPTIONS = [
  { v: 'local-only', l: 'Local only', icon: IconLocal, hint: 'Task content never reaches a cloud model.' },
  { v: 'prefer-local', l: 'Prefer local', icon: IconShield, hint: 'Local first; free cloud routes when local cannot serve.' },
  { v: 'cloud-allowed', l: 'Cloud allowed', icon: IconCloud, hint: 'Any eligible route, still bound by the budget.' },
] as const;

export function MissionComposer({ readOnly }: { readOnly: boolean }) {
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

  const activePrivacy = PRIVACY_OPTIONS.find((o) => o.v === privacy)!;

  return (
    <Page>
      <div className="mx-auto max-w-[880px]">
        <PageHead
          eyebrow="Compose"
          title="New mission"
          lede="State the outcome and the policy. Leverage compiles the plan and hires against it — compiling does not start work."
        />

        {readOnly ? (
          <div
            className="mt-6 flex items-start gap-3 rounded-[10px] border px-4 py-3.5"
            style={{ borderColor: 'rgba(133,166,233,0.4)', background: 'rgba(133,166,233,0.07)' }}
          >
            <IconShield size={18} className="mt-0.5 shrink-0 text-[var(--color-frosted-lilac)]" />
            <p className="text-[13.5px] leading-relaxed text-[var(--color-mist)]">
              This deployment is a <strong className="font-normal text-[var(--color-quartz)]">read-only public demo</strong>.
              You can compose a mission here to see how policy is expressed, but compiling is
              refused — executing one needs a local repository to write into and a local model pool
              to hire from. The recorded runs under Missions are real.
            </p>
          </div>
        ) : null}

        <form onSubmit={submit} className="mt-8 space-y-5">
          <div className="surface-card p-5">
            <label
              htmlFor="goal"
              className="mono block text-[11px] uppercase tracking-[0.1em] text-[var(--color-ash)]"
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
              className="mt-3 w-full resize-y rounded-[9px] border border-[var(--color-obsidian-edge)] bg-[var(--color-void)] p-4 text-[15px] leading-relaxed text-[var(--color-quartz)] outline-none transition-colors placeholder:text-[var(--color-slate)] focus:border-[var(--color-frosted-lilac)]"
              placeholder="Finish this application and verify it."
            />
            <p className="mono mt-2.5 text-[11.5px] text-[var(--color-ash)] opacity-75">
              {goal.length.toLocaleString()} / 8,000 characters
            </p>
          </div>

          <fieldset className="grid gap-3.5 md:grid-cols-2">
            <legend className="sr-only">Mission policy</legend>

            <Field
              label="Budget"
              icon={<IconBudget size={16} />}
              hint={
                budget === 0
                  ? 'Zero-dollar mode. Paid routes are removed from the pool, not out-ranked.'
                  : 'A hard ceiling. Headroom is reserved before a call, never checked after.'
              }
            >
              <Segmented
                options={[0, 0.5, 5].map((v) => ({ key: String(v), label: `$${v.toFixed(2)}` }))}
                value={String(budget)}
                onChange={(k) => setBudget(Number(k))}
                mono
              />
            </Field>

            <Field
              label="Quality target"
              hint="The minimum verified score a task must reach before it counts as done."
            >
              <Segmented
                options={[
                  { key: '0.85', label: 'Balanced' },
                  { key: '0.95', label: 'Production' },
                  { key: '0.98', label: 'Critical' },
                ]}
                value={String(quality)}
                onChange={(k) => setQuality(Number(k))}
              />
            </Field>

            <Field
              label="Privacy"
              icon={<activePrivacy.icon size={16} />}
              hint={activePrivacy.hint}
            >
              <Segmented
                options={PRIVACY_OPTIONS.map((o) => ({ key: o.v, label: o.l }))}
                value={privacy}
                onChange={(k) => setPrivacy(k as typeof privacy)}
              />
            </Field>

            <Field label="Parallelism" hint="How many workers may hold a task at the same time.">
              <Segmented
                options={[1, 2, 4].map((v) => ({ key: String(v), label: String(v) }))}
                value={String(workers)}
                onChange={(k) => setWorkers(Number(k))}
                mono
              />
            </Field>
          </fieldset>

          {error ? (
            <p
              role="alert"
              className="rounded-[9px] border px-4 py-3 text-[13.5px] leading-relaxed"
              style={{
                borderColor: 'rgba(248,113,113,0.45)',
                background: 'rgba(248,113,113,0.08)',
                color: 'var(--color-state-fail)',
              }}
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3.5 border-t border-[var(--color-obsidian-edge)] pt-5">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Compiling…' : 'Compile mission'}
            </button>
            <span className="text-[13px] text-[var(--color-ash)]">
              Compiling does not start work. You start it from Mission Control.
            </span>
          </div>
        </form>
      </div>
    </Page>
  );
}

/**
 * A segmented control.
 *
 * Written once here because four ad-hoc copies of "row of pill buttons" is exactly
 * how a console drifts out of alignment with itself.
 */
function Segmented({
  options,
  value,
  onChange,
  mono = false,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  mono?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1.5 rounded-[10px] border border-[var(--color-obsidian-edge)] bg-[var(--color-void)] p-1">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className={[
              'rounded-[7px] px-3 py-1.5 text-[12.5px] transition-colors',
              mono ? 'mono tabular-nums' : '',
              active
                ? 'bg-[var(--color-cobalt)] text-[var(--color-quartz)]'
                : 'text-[var(--color-ash)] hover:text-[var(--color-mist)]',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({
  label,
  hint,
  icon,
  children,
}: {
  label: string;
  hint: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card flex flex-col p-5">
      <div className="mono flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] text-[var(--color-ash)]">
        {icon ? <span className="text-[var(--color-slate)]">{icon}</span> : null}
        {label}
      </div>
      <div className="mt-3.5">{children}</div>
      <p className="mt-3.5 text-[12.5px] leading-relaxed text-[var(--color-ash)]">{hint}</p>
    </div>
  );
}
