'use client';

import { useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function DirSync() {
  const { lang, isRtl } = useLanguage();

  useEffect(() => {
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lang === 'he' ? 'he' : 'en';
  }, [lang, isRtl]);

  return null;
}
