'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="brit-login" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      {/* ═══ BRAND PANEL ═══ */}
      <section className="bl-brand">
        <div className="bl-bg" />
        <div className="bl-ghost" aria-hidden>B</div>

        <div className="bl-top">
          <div className="bl-crest">
            <img src="/brit_circle_black_gold.svg" alt="BRIT Sport Group" className="mark" />
            <span className="wordmark">
              {t('login_title')}
              <small>{t('login_brand_wordmark_sub')}</small>
            </span>
          </div>
        </div>

        <div className="bl-mid">
          <p className="bl-eyebrow">{t('login_brand_eyebrow')}</p>
          <h1>
            {t('login_brand_line1')}<br />
            {t('login_brand_line2')}
            {t('login_brand_line3') ? <><br />{t('login_brand_line3')}</> : null}
          </h1>
          <p className="bl-tagline">{t('login_brand_tagline')}</p>
        </div>

        <div className="bl-bot">
          <span><span className="dot" />{t('login_secure')}</span>
          <span>© BRIT Sport Group</span>
        </div>
      </section>

      {/* ═══ SIGN-IN PANE ═══ */}
      <section className="bl-pane">
        <button
          type="button"
          className="bl-lang"
          onClick={() => setLang(isRtl ? 'en' : 'he')}
        >
          {isRtl ? 'English' : 'עברית'}
        </button>

        <form className="bl-form" onSubmit={handleSubmit}>
          <div className="bl-mobile-crest">
            <img src="/brit_circle_black_gold.svg" alt="" className="mark" />
            <b>{t('login_title')}</b>
          </div>

          <p className="bl-kicker">{t('login_kicker')}</p>
          <h2>{t('login_heading')}</h2>
          <p className="bl-sub">{t('login_subtitle')}</p>
          <div className="bl-rule" />

          <div className="bl-field">
            <label htmlFor="bl-email">{t('login_email')}</label>
            <div className="bl-inputwrap">
              <input
                id="bl-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('login_email_placeholder')}
                autoComplete="username"
                dir="ltr"
                required
              />
            </div>
          </div>

          <div className="bl-field">
            <label htmlFor="bl-pw">{t('login_password')}</label>
            <div className="bl-inputwrap">
              <input
                id="bl-pw"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                dir="ltr"
                required
              />
              <button
                type="button"
                className="bl-peek"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('login_hide') : t('login_show')}
              >
                {showPassword ? t('login_hide') : t('login_show')}
              </button>
            </div>
          </div>

          {error && (
            <div className="bl-err" role="alert">
              <span aria-hidden>⚠</span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className={`bl-submit${loading ? ' loading' : ''}`}
            disabled={loading}
          >
            <span className="spin" aria-hidden />
            <span className="label">{loading ? t('login_signing_in') : t('login_sign_in')}</span>
            {!loading && <span className="arrow" aria-hidden>→</span>}
          </button>

          <p className="bl-hint">{t('login_hint')}</p>
        </form>
      </section>
    </div>
  );
}
