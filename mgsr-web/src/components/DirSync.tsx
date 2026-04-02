'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

export default function DirSync() {
  const pathname = usePathname();
  const { lang, isRtl } = useLanguage();

  useEffect(() => {
    if (pathname?.startsWith('/p/') || pathname?.startsWith('/sign-mandate/') || pathname?.startsWith('/shared/')) {
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = 'en';
      return;
    }
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lang === 'he' ? 'he' : 'en';
  }, [pathname, lang, isRtl]);

  return null;
}
