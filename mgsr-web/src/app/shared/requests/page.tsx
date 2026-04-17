export const revalidate = 60;
export const maxDuration = 30;

export async function generateMetadata() {
  return {
    title: 'Access Required — MGSR Team',
    description: 'A valid share link is required to view recruitment requests.',
  };
}

export default async function SharedRequestsPage() {
  // Global /shared/requests route is disabled — all access must go through
  // unique per-recipient tokens at /shared/requests/[token].
  return (
    <div
      dir="ltr"
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#0A1018' }}
    >
      <div className="text-center px-8">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-bold text-[#E8EAED] mb-3">
          Valid Link Required
        </h1>
        <p className="text-[#6B7B8D] text-sm max-w-xs mx-auto">
          This page requires a unique share link from an MGSR agent. Please contact your agent if you believe this is an error.
        </p>
      </div>
    </div>
  );
}
