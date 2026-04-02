export default function SharedRequestsLoading() {
  return (
    <div
      dir="ltr"
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        background: 'linear-gradient(170deg, #060810 0%, #0A0D15 30%, #0E1219 60%, #080B12 100%)',
      }}
    >
      {/* Noise texture */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          opacity: 0.035,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'repeat',
        }}
      />

      {/* Warm glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '-15%',
          right: '-5%',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center">
        {/* Logo pulse */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold select-none mb-10"
          style={{
            background: '#C9A84C',
            color: '#080A11',
            animation: 'logoPulse 2s ease-in-out infinite',
          }}
        >
          M
        </div>

        {/* Orbital loader */}
        <div className="relative w-20 h-20 mb-10">
          {/* Outer ring */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: '2px solid rgba(201,168,76,0.08)',
            }}
          />
          {/* Spinning arc */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: '2px solid transparent',
              borderTopColor: '#C9A84C',
              animation: 'spin 1.2s linear infinite',
            }}
          />
          {/* Inner ring */}
          <div
            className="absolute rounded-full"
            style={{
              inset: 8,
              border: '1.5px solid transparent',
              borderBottomColor: 'rgba(201,168,76,0.4)',
              animation: 'spin 1.8s linear infinite reverse',
            }}
          />
          {/* Center dot */}
          <div
            className="absolute rounded-full"
            style={{
              width: 6,
              height: 6,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: '#C9A84C',
              animation: 'dotGlow 2s ease-in-out infinite',
            }}
          />
        </div>

        {/* Text */}
        <p
          className="font-sans text-xs tracking-[0.3em] uppercase"
          style={{
            color: 'rgba(201,168,76,0.6)',
            animation: 'textFade 2s ease-in-out infinite',
          }}
        >
          Loading Requests
        </p>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes logoPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        @keyframes dotGlow {
          0%, 100% { opacity: 0.4; box-shadow: 0 0 6px rgba(201,168,76,0.3); }
          50% { opacity: 1; box-shadow: 0 0 16px rgba(201,168,76,0.6); }
        }
        @keyframes textFade {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
