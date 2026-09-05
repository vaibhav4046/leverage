# Contributing

Leverage is small on purpose: a control plane whose every claim is backed by a test,
a recorded mission or a command whose output is in the repository. Contributions keep
that standard.

## Before you open a pull request

```bash
npm run verify        # typecheck, lint, 88 tests, production build
```

CI runs the same four commands on every push and pull request. A change to scheduling,
verification, policy or the proof pack comes with a test in `tests/`; the invariants
file is the place for a rule the control plane must never break.

## What a good change looks like

- **Evidence over description.** If a change alters what a mission records, re-run the
  recorded mission (`npm run mission -- --inject-429 --out=demo/canonical-run.json`) and
  commit the new record with the change.
- **No new paid path by default.** Zero-dollar mode filters before scoring. A change
  that lets a paid route into a zero-budget auction is a bug, not a feature.
- **Failures stay loud.** A worker failure is a checkpoint and a replacement, never a
  silent retry. A check that did not run is `skipped`, never `pass`.
- **Plain copy.** No em-dashes in user-facing text, no numbers without a source.

## Reporting

Bugs and ideas go through the issue templates. A security concern goes to the contact
in `SECURITY.md`, not to a public issue.
