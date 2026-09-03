import type { Metadata } from 'next';
import { Figtree, Inter, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-figtree',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: 'Leverage — Give your best model a workforce',
  description:
    'Leverage gives Claude, Codex and other MCP hosts a dynamic workforce of local, free and connected models, then verifies the work and replaces workers that fail.',
  icons: { icon: '/icon.svg' },
  openGraph: {
    title: 'Leverage — One frontier brain. An elastic workforce.',
    description:
      'Keep your best model as the strategist. Leverage recruits cheaper models underneath it, runs work in parallel, replaces workers that fail and verifies every result.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Leverage — One frontier brain. An elastic workforce.',
    description: 'An intelligence resource manager for MCP hosts. Zero-dollar mode means zero.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${inter.variable} ${plexMono.variable}`}>
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
