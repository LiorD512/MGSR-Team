import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-mgsr-dark flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-mgsr-teal mb-2">404</h1>
        <p className="text-mgsr-muted mb-6">Page not found</p>
        <Link
          href="/dashboard"
          className="px-6 py-3 rounded-lg bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
