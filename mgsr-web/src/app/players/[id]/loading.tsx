export default function PlayerLoading() {
  return (
    <div className="min-h-screen bg-mgsr-dark flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6">
        <div className="w-14 h-14 border-2 border-mgsr-teal border-t-transparent rounded-full animate-spin" />
        <p className="text-mgsr-muted font-medium">Loading player...</p>
      </div>
    </div>
  );
}
