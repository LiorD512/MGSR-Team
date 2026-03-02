/**
 * Normalized base URL for football-scout-server.
 * Strips trailing slash to avoid double-slash URLs (e.g. ...com//recruitment) which return 404.
 */
export function getScoutBaseUrl(): string {
  const url =
    process.env.SCOUT_SERVER_URL || 'https://football-scout-server-l38w.onrender.com';
  return url.trim().replace(/\/$/, '');
}
