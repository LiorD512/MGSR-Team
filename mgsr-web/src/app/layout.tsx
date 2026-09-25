import type { Metadata, Viewport } from 'next';

// Required: pages use Firebase Auth/Firestore via context providers,
// which need browser APIs and cannot be statically prerendered.
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};
import { Syne, Outfit, Instrument_Serif, Sora, Oswald, Manrope, DM_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { PlatformProvider } from '@/contexts/PlatformContext';
import DirSync from '@/components/DirSync';
import PlatformSync from '@/components/PlatformSync';
import AppConfigInit from '@/components/AppConfigInit';

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument-serif',
  display: 'swap',
});

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  display: 'swap',
});

// Men dashboard "light management room" redesign fonts
const oswald = Oswald({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-oswald',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-manrope',
  display: 'swap',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
});

// Hebrew companion for the men dashboard redesign — covers display/body/mono
// roles in RTL so Hebrew text no longer falls back to a plain system font.
// Loaded via a plain stylesheet <link> (see <head>) instead of next/font/google:
// the build-time Google font loader crashes on Heebo in some CI/Vercel
// environments (@next/font loader null-match on the fetched CSS). The
// --font-heebo CSS variable is defined in globals.css so usage is unchanged.

export const metadata: Metadata = {
  title: 'BRIT Sport Group',
  description: 'Football Agent CRM',
  icons: {
    icon: [
      { url: '/favicon-32x32.png?v=20260620', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png?v=20260620', sizes: '16x16', type: 'image/png' },
      { url: '/brit_circle_black_gold.svg?v=20260620', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon-32x32.png?v=20260620',
    apple: '/apple-touch-icon.png?v=20260620',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${syne.variable} ${outfit.variable} ${instrumentSerif.variable} ${sora.variable} ${oswald.variable} ${manrope.variable} ${dmMono.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        {/* Heebo (Hebrew/Latin) — loaded via stylesheet instead of next/font/google;
            the build-time loader crashes on Heebo in some environments. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&display=swap"
        />
        <script src="https://accounts.google.com/gsi/client" async defer></script>
      </head>
      <body className="font-sans antialiased">
        <AuthProvider>
          <LanguageProvider>
            <PlatformProvider>
              <DirSync />
              <PlatformSync />
              <AppConfigInit />
              {children}
            </PlatformProvider>
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
