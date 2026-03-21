'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

interface MandateDoc {
  token: string;
  passportDetails: { firstName?: string; lastName?: string; dateOfBirth?: string; passportNumber?: string; nationality?: string };
  effectiveDate: number;
  expiryDate: number;
  validLeagues: string[];
  agentName: string;
  fifaLicenseId: string;
  status: string;
  playerSignature: string | null;
  playerSignedAt: number | null;
  agentSignature: string | null;
  agentSignedAt: number | null;
  createdAt: number;
}

const SIGNING_LINK_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

function formatDate(ts: number): string {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export default function SignMandatePage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<MandateDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<'player' | 'agent' | null>(null);
  const [signing, setSigning] = useState(false);
  const [signSuccess, setSignSuccess] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/mandate/${encodeURIComponent(token)}`);
      if (res.status === 404) throw new Error('Signing link not found or expired');
      if (res.status === 410) {
        const body = await res.json();
        throw new Error(body.error || 'This signing link has expired.');
      }
      if (!res.ok) throw new Error('Failed to load mandate data');
      const { data: docData } = await res.json();
      setData(docData as MandateDoc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Canvas drawing handlers
  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getCanvasPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  /** Trim canvas to the bounding box of drawn strokes (non-transparent pixels) */
  const getTrimmedSignatureDataUrl = (): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height);
    const { data: px } = imageData;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = px[(y * width + x) * 4 + 3];
        if (alpha > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX) return canvas.toDataURL('image/png'); // fallback if nothing drawn
    // Add small padding around strokes
    const pad = 6;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    const trimW = maxX - minX + 1;
    const trimH = maxY - minY + 1;
    const trimmed = document.createElement('canvas');
    trimmed.width = trimW;
    trimmed.height = trimH;
    const tCtx = trimmed.getContext('2d')!;
    tCtx.drawImage(canvas, minX, minY, trimW, trimH, 0, 0, trimW, trimH);
    return trimmed.toDataURL('image/png');
  };

  /** Preview the mandate PDF (unsigned) in a new tab */
  const handlePreviewPdf = async () => {
    if (!data) return;
    setPreviewing(true);
    try {
      const res = await fetch('/api/mandate/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passportDetails: data.passportDetails,
          effectiveDate: data.effectiveDate,
          expiryDate: data.expiryDate,
          validLeagues: data.validLeagues,
          agentName: data.agentName,
          fifaLicenseId: data.fifaLicenseId,
        }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch { /* ignore */ } finally {
      setPreviewing(false);
    }
  };

  const handleSign = async () => {
    if (!activeRole || !canvasRef.current || !hasDrawn || !data) return;
    setSigning(true);
    setError(null);

    try {
      const signatureDataUrl = getTrimmedSignatureDataUrl() || canvasRef.current.toDataURL('image/png');

      const res = await fetch(`/api/mandate/${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: activeRole, signature: signatureDataUrl }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Signing failed');
      }

      setSignSuccess(`${activeRole === 'player' ? 'Player' : 'Agent'} signature recorded successfully!`);
      setActiveRole(null);
      clearCanvas();
      fetchData(); // refresh status
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed');
    } finally {
      setSigning(false);
    }
  };

  const handleDownloadSigned = async () => {
    if (!data || downloading) return;
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch('/api/mandate/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passportDetails: data.passportDetails,
          effectiveDate: data.effectiveDate,
          expiryDate: data.expiryDate,
          validLeagues: data.validLeagues,
          agentName: data.agentName,
          fifaLicenseId: data.fifaLicenseId,
          playerSignature: data.playerSignature ?? null,
          agentSignature: data.agentSignature ?? null,
          playerSignedAt: data.playerSignedAt ?? null,
          agentSignedAt: data.agentSignedAt ?? null,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const playerFullName = [data.passportDetails?.firstName, data.passportDetails?.lastName].filter(Boolean).join('_') || 'Player';
      a.download = `Mandate_${playerFullName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Signed.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-mgsr-teal border-t-transparent rounded-full animate-spin" />
          <p className="text-mgsr-teal font-display font-semibold text-lg tracking-tight">Loading mandate…</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-mgsr-card rounded-2xl border border-mgsr-border p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-mgsr-red/15 flex items-center justify-center">
            <svg className="w-7 h-7 text-mgsr-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-display font-bold text-mgsr-text mb-2">Link Not Found</h1>
          <p className="text-mgsr-muted text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const playerName = [data.passportDetails?.firstName, data.passportDetails?.lastName].filter(Boolean).join(' ') || '—';
  const playerSigned = !!data.playerSignature;
  const agentSigned = !!data.agentSignature;
  const fullySigned = playerSigned && agentSigned;

  // Compute remaining time for signing link
  const expiresAt = data.createdAt ? data.createdAt + SIGNING_LINK_TTL_MS : 0;
  const remainingMs = expiresAt ? Math.max(0, expiresAt - Date.now()) : 0;
  const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
  const remainingMinutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  return (
    <div dir="ltr" className="min-h-screen bg-mgsr-dark text-mgsr-text">
      <div className="max-w-2xl mx-auto py-6 sm:py-10 px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-mgsr-teal/15 flex items-center justify-center">
              <svg className="w-5 h-5 text-mgsr-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <span className="font-display font-bold text-mgsr-teal tracking-tight text-sm">MGSR<span className="text-mgsr-muted font-normal ml-1">Group</span></span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-mgsr-text mb-1 tracking-tight">
            Football Agent Mandate
          </h1>
          <p className="text-mgsr-muted text-sm">Digital Signing</p>
        </div>

        {/* Expiry notice — only show if not fully signed */}
        {!fullySigned && expiresAt > 0 && (
          <div className={`mb-4 px-4 py-3 rounded-xl text-center text-sm ${
            remainingHours < 6
              ? 'bg-mgsr-red/10 border border-mgsr-red/25 text-mgsr-red'
              : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted'
          }`}>
            <svg className="w-4 h-4 inline-block mr-1.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            This signing link expires in <strong>{remainingHours}h {remainingMinutes}m</strong>
          </div>
        )}

        {/* Mandate Summary Card */}
        <div className="bg-mgsr-card rounded-2xl border border-mgsr-border p-6 mb-4">
          <h2 className="text-xs font-semibold text-mgsr-muted uppercase tracking-widest mb-4">
            Mandate Details
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] text-mgsr-muted mb-0.5">Player</p>
              <p className="text-mgsr-text font-medium text-sm">{playerName}</p>
            </div>
            <div>
              <p className="text-[11px] text-mgsr-muted mb-0.5">Agent</p>
              <p className="text-mgsr-text font-medium text-sm">{data.agentName}</p>
              {data.fifaLicenseId && (
                <p className="text-[11px] text-mgsr-muted mt-0.5">FIFA License: {data.fifaLicenseId}</p>
              )}
            </div>
            <div>
              <p className="text-[11px] text-mgsr-muted mb-0.5">Effective</p>
              <p className="text-mgsr-text font-medium text-sm">
                {formatDate(data.effectiveDate)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-mgsr-muted mb-0.5">Expires</p>
              <p className="text-mgsr-text font-medium text-sm">
                {formatDate(data.expiryDate)}
              </p>
            </div>
            {data.validLeagues.length > 0 && (
              <div className="col-span-2">
                <p className="text-[11px] text-mgsr-muted mb-0.5">Valid Leagues</p>
                <p className="text-mgsr-text text-sm">{data.validLeagues.join(', ')}</p>
              </div>
            )}
          </div>

        </div>

        {/* Preview PDF button — prominent standalone card */}
        <button
          onClick={handlePreviewPdf}
          disabled={previewing}
          className="mb-4 w-full flex items-center justify-center gap-3 px-5 py-4 rounded-2xl bg-mgsr-teal/10 border-2 border-mgsr-teal/40 text-mgsr-teal hover:bg-mgsr-teal/20 hover:border-mgsr-teal/60 transition-all text-sm font-semibold"
        >
          {previewing ? (
            <div className="w-5 h-5 border-2 border-mgsr-teal border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
          Preview Mandate PDF Before Signing
        </button>

        {/* Signing Status */}
        <div className="bg-mgsr-card rounded-2xl border border-mgsr-border p-6 mb-4">
          <h2 className="text-xs font-semibold text-mgsr-muted uppercase tracking-widest mb-4">
            Signatures
          </h2>
          <div className="space-y-3">
            <div className={`flex items-center justify-between p-3 rounded-xl border transition ${
              playerSigned
                ? 'border-mgsr-teal/30 bg-mgsr-teal/5'
                : 'border-mgsr-border'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  playerSigned ? 'bg-mgsr-teal text-mgsr-dark' : 'bg-mgsr-border text-mgsr-muted'
                }`}>
                  {playerSigned ? '✓' : '1'}
                </div>
                <div>
                  <p className="text-mgsr-text text-sm font-medium">Player Signature</p>
                  {data.playerSignedAt && (
                    <p className="text-[11px] text-mgsr-muted">
                      Signed {formatDateTime(data.playerSignedAt)}
                    </p>
                  )}
                </div>
              </div>
              {!playerSigned && (
                <button
                  onClick={() => { setActiveRole('player'); setSignSuccess(null); clearCanvas(); }}
                  className="px-4 py-2 rounded-lg bg-mgsr-teal text-mgsr-dark text-sm font-semibold hover:bg-mgsr-teal/90 transition"
                >
                  Sign Now
                </button>
              )}
            </div>

            <div className={`flex items-center justify-between p-3 rounded-xl border transition ${
              agentSigned
                ? 'border-mgsr-teal/30 bg-mgsr-teal/5'
                : 'border-mgsr-border'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  agentSigned ? 'bg-mgsr-teal text-mgsr-dark' : 'bg-mgsr-border text-mgsr-muted'
                }`}>
                  {agentSigned ? '✓' : '2'}
                </div>
                <div>
                  <p className="text-mgsr-text text-sm font-medium">Agent Signature</p>
                  {data.agentSignedAt && (
                    <p className="text-[11px] text-mgsr-muted">
                      Signed {formatDateTime(data.agentSignedAt)}
                    </p>
                  )}
                </div>
              </div>
              {!agentSigned && (
                <button
                  onClick={() => { setActiveRole('agent'); setSignSuccess(null); clearCanvas(); }}
                  className="px-4 py-2 rounded-lg bg-mgsr-teal text-mgsr-dark text-sm font-semibold hover:bg-mgsr-teal/90 transition"
                >
                  Sign Now
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Success message */}
        {signSuccess && (
          <div className="mb-4 p-4 rounded-xl bg-mgsr-teal/10 border border-mgsr-teal/25 text-mgsr-teal text-sm text-center">
            {signSuccess}
          </div>
        )}

        {/* Fully signed banner */}
        {fullySigned && (
          <div className="mb-4 p-6 rounded-2xl bg-mgsr-teal/10 border border-mgsr-teal/25 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-mgsr-teal/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-mgsr-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-mgsr-teal font-display font-bold text-lg">Mandate Fully Signed</h3>
            <p className="text-mgsr-muted text-sm mt-1">
              Both parties have signed. You can download the final PDF below.
            </p>
            <button
              onClick={handleDownloadSigned}
              disabled={downloading}
              className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloading ? (
                <div className="w-4 h-4 border-2 border-mgsr-dark border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              )}
              {downloading ? 'Generating PDF…' : 'Download Signed PDF'}
            </button>
          </div>
        )}

        {/* Error */}
        {error && data && (
          <div className="mb-4 p-4 rounded-xl bg-mgsr-red/10 border border-mgsr-red/25 text-mgsr-red text-sm text-center">
            {error}
          </div>
        )}

        {/* Signature canvas */}
        {activeRole && (
          <div className="bg-mgsr-card rounded-2xl border border-mgsr-border p-6">
            <h2 className="text-mgsr-text font-display font-semibold mb-1">
              {activeRole === 'player' ? 'Player' : 'Agent'} Signature
            </h2>
            <p className="text-mgsr-muted text-sm mb-4">
              Draw your signature below using your finger or mouse
            </p>

            <div className="relative rounded-xl overflow-hidden border-2 border-dashed border-mgsr-border bg-white">
              <canvas
                ref={canvasRef}
                width={600}
                height={200}
                className="w-full h-[150px] sm:h-[200px] cursor-crosshair touch-none"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
              />
              {!hasDrawn && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-gray-400 text-sm">Draw your signature here</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-4 gap-3">
              <button
                onClick={clearCanvas}
                className="px-4 py-2.5 rounded-xl border border-mgsr-border text-mgsr-muted hover:bg-mgsr-border/30 transition text-sm"
              >
                Clear
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => { setActiveRole(null); clearCanvas(); }}
                  className="px-4 py-2.5 rounded-xl border border-mgsr-border text-mgsr-muted hover:bg-mgsr-border/30 transition text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSign}
                  disabled={!hasDrawn || signing}
                  className="px-6 py-2.5 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                >
                  {signing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-mgsr-dark border-t-transparent rounded-full animate-spin" />
                      Signing…
                    </>
                  ) : (
                    `Confirm ${activeRole === 'player' ? 'Player' : 'Agent'} Signature`
                  )}
                </button>
              </div>
            </div>

            <p className="text-mgsr-muted text-xs mt-4">
              By signing, you agree to the terms of this Football Agent Mandate.
              Your signature and timestamp will be recorded for verification.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 pt-6 border-t border-mgsr-border text-center space-y-2">
          <p className="text-mgsr-muted text-[11px] leading-relaxed max-w-lg mx-auto">
            MGSR is a licensed football agency operating in full compliance with FIFA regulations. No personal data submitted in this process is stored or retained in our systems.
          </p>
          <p className="text-mgsr-muted text-xs">MGSR Group — Football Agent Mandate Digital Signing</p>
        </div>
      </div>
    </div>
  );
}
