'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AppLayout from '@/components/AppLayout';

interface Request {
  id: string;
  clubName?: string;
  clubLogo?: string;
  clubCountry?: string;
  contactName?: string;
  position?: string;
  quantity?: number;
  notes?: string;
  salaryRange?: string;
  transferFee?: string;
  status?: string;
  createdAt?: number;
}

export default function RequestsPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'fulfilled'>('pending');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Requests'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Request));
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRequests(list);
      setLoadingList(false);
    });
    return () => unsub();
  }, []);

  const filtered = requests.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return r.status !== 'fulfilled';
    return r.status === 'fulfilled';
  });

  const pendingCount = requests.filter((r) => r.status !== 'fulfilled').length;
  const fulfilledCount = requests.filter((r) => r.status === 'fulfilled').length;

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-mgsr-teal font-display">{t('loading')}</div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-mgsr-text tracking-tight">
              {t('requests_title')}
            </h1>
            <p className="text-mgsr-muted mt-1 text-sm">
              {pendingCount} {t('requests_pending')} • {fulfilledCount} {t('requests_fulfilled')}
            </p>
          </div>
          <div className="flex gap-2">
            {(['pending', 'fulfilled', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                  filter === f
                    ? 'bg-mgsr-teal text-mgsr-dark'
                    : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/30'
                }`}
              >
                {f === 'pending' ? t('requests_pending') : f === 'fulfilled' ? t('requests_fulfilled') : t('tasks_filter_all')}
              </button>
            ))}
          </div>
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse text-mgsr-muted">{t('requests_loading')}</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="relative overflow-hidden p-16 bg-mgsr-card/50 border border-mgsr-border rounded-2xl text-center">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(77,182,172,0.06)_0%,transparent_70%)]" />
            <p className="text-mgsr-muted text-lg relative">{t('requests_empty')}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.map((r, i) => (
              <div
                key={r.id}
                className={`p-5 rounded-xl border transition-all duration-300 animate-fade-in ${
                  r.status === 'fulfilled'
                    ? 'bg-mgsr-card/50 border-mgsr-border opacity-90'
                    : 'bg-mgsr-card border-mgsr-border hover:border-mgsr-teal/30'
                }`}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex items-start gap-4">
                  {r.clubLogo && (
                    <img
                      src={r.clubLogo}
                      alt=""
                      className="w-14 h-14 rounded-full object-cover bg-mgsr-dark ring-2 ring-mgsr-border shrink-0"
                    />
                  )}
                  {!r.clubLogo && (
                    <div className="w-14 h-14 rounded-full bg-mgsr-teal/20 flex items-center justify-center shrink-0">
                      <span className="text-xl font-display font-bold text-mgsr-teal">
                        {(r.clubName || '?')[0]}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-mgsr-text">{r.clubName || 'Unknown Club'}</p>
                    <p className="text-sm text-mgsr-muted mt-0.5">
                      {r.position} × {r.quantity ?? 1} • {r.clubCountry || '—'}
                    </p>
                    {r.contactName && (
                      <p className="text-sm text-mgsr-teal mt-1">
                        {t('requests_contact')}: {r.contactName}
                      </p>
                    )}
                    {r.notes && (
                      <p className="text-sm text-mgsr-muted mt-1 line-clamp-2">{r.notes}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {r.salaryRange && (
                        <span className="text-xs px-2.5 py-1 rounded-lg bg-mgsr-teal/20 text-mgsr-teal">
                          {t('requests_salary')}: {r.salaryRange}
                        </span>
                      )}
                      {r.transferFee && (
                        <span className="text-xs px-2.5 py-1 rounded-lg bg-mgsr-teal/20 text-mgsr-teal">
                          {t('requests_fee')}: {r.transferFee}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1.5 rounded-lg shrink-0 font-medium ${
                      r.status === 'fulfilled'
                        ? 'bg-mgsr-teal/30 text-mgsr-teal'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {r.status === 'fulfilled' ? t('requests_fulfilled') : t('requests_pending')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
