export default function SharedRequestsLoading() {
  return (
    <div
      dir="ltr"
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: '#0A1018' }}
    >
      {/* Grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(77,182,172,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(77,182,172,0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          opacity: 0.5,
        }}
      />

      {/* Teal glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '-15%',
          right: '-5%',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(77,182,172,0.06) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center">
        {/* Logo pulse */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold select-none mb-10"
          style={{
            background: 'linear-gradient(135deg, #4DB6AC, #39D164)',
            color: '#0A1018',
            fontFamily: 'var(--font-display, Syne, sans-serif)',
            animation: 'logoPulse 2s ease-in-out infinite',
          }}
        >
          M
        </div>

        {/* Orbital loader */}
        <div className="relative w-20 h-20 mb-10">
          <div className="absolute inset-0 rounded-full" style={{ border: '2px solid rgba(77,182,172,0.08)' }} />
          <div className="absolute inset-0 rounded-full" style={{ border: '2px solid transparent', borderTopColor: '#4DB6AC', animation: 'spin 1.2s linear infinite' }} />
          <div className="absolute rounded-full" style={{ inset: 8, border: '1.5px solid transparent', borderBottomColor: 'rgba(77,182,172,0.4)', animation: 'spin 1.8s linear infinite reverse' }} />
          <div className="absolute rounded-full" style={{ width: 6, height: 6, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#4DB6AC', animation: 'dotGlow 2s ease-in-out infinite' }} />
        </div>

        {/* Text */}
        <p
          className="font-sans text-xs tracking-[0.3em] uppercase"
          style={{ color: 'rgba(77,182,172,0.6)', animation: 'textFade 2s ease-in-out infinite' }}
        >
          Loading Requests
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes logoPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        @keyframes dotGlow {
          0%, 100% { opacity: 0.4; box-shadow: 0 0 6px rgba(77,182,172,0.3); }
          50% { opacity: 1; box-shadow: 0 0 16px rgba(77,182,172,0.6); }
        }
        @keyframes textFade {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
