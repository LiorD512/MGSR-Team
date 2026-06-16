import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BRIT Sport Group — Mandate Signing',
  description: 'Sign your representation mandate with BRIT Sport Group.',
  openGraph: {
    title: 'BRIT Sport Group — Mandate Signing',
    description: 'Sign your representation mandate with BRIT Sport Group.',
    images: [{ url: 'https://mgsrfa.com/og-image.png', width: 1200, height: 630, alt: 'BRIT Sport Group' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BRIT Sport Group — Mandate Signing',
    description: 'Sign your representation mandate with BRIT Sport Group.',
    images: ['https://mgsrfa.com/og-image.png'],
  },
};

export default function SignMandateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
