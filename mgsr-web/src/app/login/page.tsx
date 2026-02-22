'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, user } = useAuth();
  const { t, isRtl, setLang } = useLanguage();
  const router = useRouter();

  if (user) {
    router.replace('/dashboard');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="min-h-screen bg-mgsr-dark flex items-center justify-center p-4 relative overflow-hidden"
    >
      {/* Language toggle - RTL: button on left */}
      <button
        onClick={() => setLang(isRtl ? 'en' : 'he')}
        className={`absolute top-4 sm:top-6 px-3 py-1.5 rounded-lg text-sm text-mgsr-muted hover:text-mgsr-teal hover:bg-mgsr-teal/10 transition z-20 ${isRtl ? 'left-4 sm:left-6' : 'right-4 sm:right-6'}`}
      >
        {isRtl ? 'English' : 'עברית'}
      </button>
      {/* Background atmosphere */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(77,182,172,0.12)_0%,transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,rgba(77,182,172,0.06)_0%,transparent_50%)]" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.03%22/%3E%3C/svg%3E')] opacity-30" />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-mgsr-card border border-mgsr-border rounded-2xl p-8 shadow-2xl shadow-black/30">
          <h1 className="text-3xl font-display font-bold text-mgsr-teal tracking-tight mb-2">
            {t('login_title')}
          </h1>
          <p className="text-mgsr-muted mb-8">{t('login_subtitle')}</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-mgsr-muted mb-2">
                {t('login_email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-mgsr-teal/60 focus:ring-1 focus:ring-mgsr-teal/30 transition"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-mgsr-muted mb-2">
                {t('login_password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-mgsr-teal/60 focus:ring-1 focus:ring-mgsr-teal/30 transition"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="text-sm text-mgsr-red bg-mgsr-red/10 px-4 py-2 rounded-lg">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 disabled:opacity-50 disabled:cursor-not-allowed transition hover:scale-[1.01] active:scale-[0.99]"
            >
              {loading ? t('login_signing_in') : t('login_sign_in')}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-sm text-mgsr-muted">
          {t('login_hint')}
        </p>
      </div>
    </div>
  );
}
