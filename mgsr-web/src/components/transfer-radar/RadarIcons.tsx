/** Inline SVG icons (the site's mono font has no arrow / check glyphs). */
const P: Record<string, React.ReactNode> = {
  ok: <path d="M5 12l5 5 9-10" />,
  warn: <path d="M12 8v5M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  ext: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  save: <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
};
export function Ico({ name }: { name: keyof typeof P | string }) {
  return name === 'search'
    ? <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{P.search}</svg>
    : <svg viewBox="0 0 24 24" className="tr3-ico" aria-hidden="true">{P[name]}</svg>;
}
const A: Record<string, React.ReactNode> = {
  ext: <path d="M7 17L17 7M9 7h8v8" />, fwd: <path d="M5 12h14M13 6l6 6-6 6" />, down: <path d="M12 5v14M6 13l6 6 6-6" />, x: <path d="M6 6l12 12M18 6L6 18" />,
};
export function Arr({ name }: { name: 'ext' | 'fwd' | 'down' | 'x' }) {
  return <svg className={`tr3-arr ${name === 'fwd' ? 'flip' : ''}`} viewBox="0 0 24 24" aria-hidden="true">{A[name]}</svg>;
}
