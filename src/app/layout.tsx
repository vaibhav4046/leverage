import type { Metadata } from 'next';
import { Instrument_Serif, Manrope, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

/**
 * Typography.
 *
 * A serif headline over a technical console is the point. Inter is the default in
 * every AI builder and component library, which is exactly why a page set in it
 * reads as unstyled rather than neutral; the same is true of the geometric sans
 * that usually replaces it. Instrument Serif carries the editorial weight, Manrope
 * does the reading, IBM Plex Mono does the machine talking. Three voices, each with
 * a job.
 */
const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-display-serif',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  // Falling back to localhost meant every shared link rendered a broken preview
  // card, because the deployed environment never set NEXT_PUBLIC_APP_URL. The
  // deployed origin is the correct default; local dev overrides it via the env var.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'https://useleverage.vercel.app'),
  ),
  title: 'Leverage · Give your best model a workforce',
  description:
    'Leverage gives Claude, Codex and other MCP hosts a dynamic workforce of local, free and connected models, then verifies the work and replaces workers that fail.',
  icons: { icon: '/icon.svg' },
  openGraph: {
    title: 'Leverage · One frontier brain. An elastic workforce.',
    description:
      'Keep your best model as the strategist. Leverage recruits cheaper models underneath it, runs work in parallel, replaces workers that fail and verifies every result.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Leverage · One frontier brain. An elastic workforce.',
    description: 'An intelligence resource manager for MCP hosts. Zero-dollar mode means zero.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrument.variable} ${manrope.variable} ${plexMono.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:text-black"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
