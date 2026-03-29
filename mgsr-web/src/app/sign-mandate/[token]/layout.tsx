import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MGSR Football Agency — Mandate Signing',
  description: 'Sign your representation mandate with MGSR Football Agency.',
  openGraph: {
    title: 'MGSR Football Agency — Mandate Signing',
    description: 'Sign your representation mandate with MGSR Football Agency.',
    images: [{ url: 'https://mgsrfa.com/og-image.png', width: 1200, height: 630, alt: 'MGSR Football Agency' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MGSR Football Agency — Mandate Signing',
    description: 'Sign your representation mandate with MGSR Football Agency.',
    images: ['https://mgsrfa.com/og-image.png'],
  },
};

export default function SignMandateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
