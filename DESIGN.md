# Design

Aurora glow over a midnight terminal.

One system for the app, the site, the screenshots and the film. Tokens live in exactly one
place — `src/app/globals.css` — and every component references a variable, never a hex, so
the surfaces cannot drift apart.

---

## Principle

The interface is an operations console, not a marketing page that happens to have data in
it. It should feel like a dark IDE: overwhelmingly achromatic, hairline borders, colour
reserved for two jobs only — **state** and **rare atmosphere**.

If a pixel is not carrying information or hierarchy, it should not be there.

---

## Surfaces

Elevation is expressed by surface, not by shadow.

| Level | Token | Value | Use |
|---|---|---|---|
| 0 | `--color-void` | `#0b0c0e` | Page floor, hero backdrop, app sidebar |
| 1 | `--color-abyss` | `#0e111b` | Primary canvas |
| 2 | `--color-deep-sea` | `#0d172b` | Cards, panels, inputs |
| 3 | `--color-cobalt` | `#12244f` | Spotlight only — never a page background |

Borders do the definition work: `--color-obsidian-edge` `#172540` on cards,
`--color-inkline` `#151e32` for nesting, `--color-sapphire-hairline` `#24375a` for
separators.

## Type

| Role | Token | Value | Use |
|---|---|---|---|
| Primary | `--color-quartz` | `#ffffff` | Headings, key values |
| Secondary | `--color-ash` | `#abaebb` | Body, labels |
| Tertiary | `--color-mist` | `#c7c9d1` | Supporting detail |
| Muted | `--color-slate` | `#3c3f44` | Disabled, timestamps |

Secondary text stays strictly achromatic. Never tint it.

## Accents

| Token | Value | Use |
|---|---|---|
| `--color-frosted-lilac` | `#85a6e9` | Focus ring, active markers |
| `--color-signal-blue` | `#2862d7` | Links, inline accent |
| `--color-pulse-violet` | `#305fbd` | Verifying state, code syntax |
| `--color-aurora-purple` | `#625fff` | Hero glow only |
| `--color-plasma-pink` | `#ff7dda` | Hero glow only |

## State

Muted on purpose. This is a console, not a traffic light — state reads through a small
indicator, never a filled block.

```
pass  #4ade80    fail  #f87171    warn  #fbbf24
```

State is never encoded by colour alone; every state also carries its label
(`PASSED`, `REPLACED`, `RATE_LIMIT`).

---

## The aurora

```css
background:
  radial-gradient(79.43% 95.88% at 38.94% -53.46%, rgba(98, 95, 255, .38), transparent),
  radial-gradient(27.99% 22.08% at 72.13% 103.46%, rgba(255, 125, 218, .33), transparent),
  #0b0c0e;
```

It appears in exactly three places: the landing hero, the final call to action, and the
film's brand frames. **Never** inside a card, a chart, a control or Mission Control. Its
whole value is that it is rare.

---

## Typography

| Role | Family | Weight | Where |
|---|---|---|---|
| Display | Figtree | 500 | Everything ≥ 32px, `-0.02em` |
| UI | Inter | 300 / 400 / 500 | Body, labels, buttons |
| Technical | IBM Plex Mono | 400 | Timestamps, event types, model ids, tokens, code |

Figtree owns the display register; Inter never appears at 32px or above. Body copy on a
dark canvas uses Inter 300–400 — low weight reads as precision, and bolding everything
destroys the hierarchy the scale is providing.

Mono is not decoration. It marks values that are machine-generated and exact: an event
type, a checkpoint id, a token count, a latency. If it can be counted, it is mono.

```
display      64 / 1    / -1.28px
heading-lg   48 / 1.13 / -0.96px
heading      36 / 1.13 / -0.72px
heading-sm   28 / 1.25 / -0.56px
subheading   20 / 1.38 / -0.54px
body         16 / 1.5  / -0.32px
```

Responsive via `clamp()`. Never force 64px onto a phone.

---

## Components

**Cards** — surface 2, 1px `#172540`, radius 12px, padding 24px.
**Highlight** — surface 3, reserved for one element per view at most.

**Primary action** — white fill, near-black text, fully rounded. White is *the* primary
action colour. Nothing competes with it, and a page has one.

**Secondary** — transparent, muted border, fully rounded.

Radii: `2px` code, `8px` inputs and nav, `12px` cards, `9999px` interactive pills. A data
card is never a pill.

---

## Motion

Motion communicates state change and nothing else.

```
micro feedback     120–180ms
panel transition   180–260ms
major state        300–500ms
```

Card hover lifts at most 1–2px and brightens its border. No springs, no loops, no parallax.
`prefers-reduced-motion` disables all of it via a global rule.

---

## Density

Marketing and console are deliberately different. The landing page uses an 80px section
rhythm. Mission Control does not — carrying marketing spacing into a live task table makes
it harder to read, not more premium. Table rows are 44–48px; panels use 20px padding.

---

## Rules

**Do**

- Reference tokens, never a raw hex.
- Let borders define cards; use shadow only for genuinely floating elements.
- Keep mono for machine-generated exact values.
- Show an empty state that says what is missing and how to produce it.

**Do not**

- Put the aurora in a card, a chart or a control.
- Use `--color-cobalt` as a page background.
- Tint secondary text.
- Use Inter above 32px, or Figtree below it.
- Render a metric that is not measured. If there is no run, the panel says so and gives
  the command that would produce one.

---

## The last rule is the important one

No placeholder metrics, anywhere, ever. Every number on the landing page comes from
`demo/canonical-run.json` — a real recorded mission — or the panel renders an explicit
"no recorded run yet" state with the command to create one.

A product whose entire argument is *don't trust a model that says it's done, check the
evidence* cannot have a hero section full of invented numbers.
