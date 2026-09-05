import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Leverage · one frontier brain, an elastic workforce';

/**
 * Open Graph card, generated from the design system rather than screenshotted.
 *
 * A screenshot would drift the moment the page changes; this reads the same tokens
 * the site does, so the card and the product cannot disagree. Kept to system fonts
 * because loading Figtree here would add a network fetch to every card render for a
 * difference nobody sees at 1200x630.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background:
            'radial-gradient(80% 96% at 39% -53%, rgba(98,95,255,0.38) 0%, rgba(0,0,0,0) 100%),' +
            'radial-gradient(28% 22% at 72% 103%, rgba(255,125,218,0.33) 0%, rgba(0,0,0,0) 100%),' +
            '#0b0c0e',
          color: '#ffffff',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              border: '2px solid #85a6e9',
              display: 'flex',
            }}
          />
          <div style={{ fontSize: 26, letterSpacing: '-0.02em', color: '#c7c9d1' }}>Leverage</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 84, lineHeight: 1.02, letterSpacing: '-0.03em', fontWeight: 500 }}>
            One frontier brain.
          </div>
          <div
            style={{
              fontSize: 84,
              lineHeight: 1.02,
              letterSpacing: '-0.03em',
              fontWeight: 500,
              color: '#85a6e9',
            }}
          >
            An elastic workforce.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 24, color: '#abaebb', maxWidth: 620, lineHeight: 1.4 }}>
            Hire the models you already pay for. Verify every result. Replace the worker, not the
            project.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 15, color: '#abaebb', letterSpacing: '0.08em' }}>
              ACTUAL PAID INFERENCE
            </div>
            <div style={{ fontSize: 62, color: '#4ade80', letterSpacing: '-0.02em', fontWeight: 500 }}>
              $0.00
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
