export const revalidate = 60;
export const maxDuration = 30;

export async function generateMetadata() {
  return {
    title: 'Access Required — BRIT Sport Group',
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
      style={{ background: '#081018' }}
    >
      <div className="text-center px-8">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 overflow-hidden"
          style={{ background: 'rgba(229,203,165,0.08)', border: '1px solid rgba(229,203,165,0.18)' }}
        >
          <img src="/brit_circle_black_gold.svg" alt="BRIT Sport Group" className="w-full h-full object-cover" />
        </div>
        <h1 className="font-display text-2xl font-bold text-[#F4F6F8] mb-3">
          Valid Link Required
        </h1>
        <p className="text-[#91A0AE] text-sm max-w-xs mx-auto">
          This page requires a unique share link from a BRIT Sport Group agent. Please contact your agent if you believe this is an error.
        </p>
      </div>
    </div>
  );
}
