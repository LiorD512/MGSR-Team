import type { Metadata, Viewport } from 'next';

export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};
import { Syne, Outfit, Instrument_Serif, Sora } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { PlatformProvider } from '@/contexts/PlatformContext';
import DirSync from '@/components/DirSync';
import PlatformSync from '@/components/PlatformSync';

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

export const metadata: Metadata = {
  title: 'MGSR Team',
  description: 'Football Agent CRM',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${syne.variable} ${outfit.variable} ${instrumentSerif.variable} ${sora.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <script src="https://accounts.google.com/gsi/client" async defer></script>
      </head>
      <body className="font-sans antialiased">
        <AuthProvider>
          <LanguageProvider>
            <PlatformProvider>
              <DirSync />
              <PlatformSync />
              {children}
            </PlatformProvider>
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
