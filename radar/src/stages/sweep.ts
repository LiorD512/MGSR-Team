import type { Db } from '../db.js';
import { all, run } from '../db.js';
import type { RadarConfig } from '../config.js';
import { scoreAll } from './score.js';
import { DAY, log, now } from '../util.js';

/**
 * Nightly maintenance (spec R2.5, R19.3, R22.6): re-score everyone (time decay / expiry / archive), flag silent sources,
 * and apply the free-storage retention policy so the database stays far below the free-plan limit.
 */
export async function sweep(db: Db, cfg: RadarConfig) {
  const t = now();
  const out: Record<string, unknown> = {};
  out.score = await scoreAll(db, cfg); // decay + archiving

  // inactive sources: approved but nothing published for 30 days (never auto-deleted)
  const inactive = await run(db, `UPDATE sources SET status='INACTIVE', status_reason='No new articles for 30 days', status_changed_at=?, status_changed_by='system'
    WHERE status='APPROVED' AND last_article_at IS NOT NULL AND last_article_at < ? AND last_success_at IS NOT NULL AND last_success_at > ?`, [t, t - 30 * DAY, t - 2 * DAY]);
  out.inactiveSources = inactive.rowsAffected;

  // retention (free-storage defaults, spec R19.3)
  out.deletedRawBodies = (await run(db, 'DELETE FROM article_bodies WHERE expires_at < ?', [t])).rowsAffected;
  const R = cfg.retention;
  out.deletedNonFinalReports = (await run(db, `DELETE FROM reports WHERE final = 0 AND published_at < ? AND signals NOT LIKE '%TRANSFER_COMPLETED%' AND signals NOT LIKE '%RETURNED_TO_SQUAD%'
      AND signals NOT LIKE '%RENEWED_CONTRACT%' AND signals NOT LIKE '%DENIED_BY_CLUB%' AND signals NOT LIKE '%INJURED%'`, [t - R.nonFinalReportDays * DAY])).rowsAffected;
  out.clearedExcerpts = (await run(db, 'UPDATE articles SET excerpt = NULL WHERE excerpt IS NOT NULL AND published_at < ?', [t - R.excerptDays * DAY])).rowsAffected;
  // The article archive (headline + original URL + outlet + date, NO text) is kept R.articleDays so articles can be re-analysed later.
  out.deletedArticles = (await run(db, `DELETE FROM articles WHERE published_at < ? AND id NOT IN (SELECT article_id FROM reports WHERE final = 1)`, [t - Math.max(R.articleDays, cfg.pipeline.intakeDays + 1) * DAY])).rowsAffected;
  // storage guard for the free database: if the archive grows past maxArticleRows, drop the oldest rows (never ones backing a scored report)
  const total = Number((await all<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM articles'))[0]?.n ?? 0);
  out.articleRows = total;
  if (total > R.maxArticleRows) {
    out.trimmedOldest = (await run(db, `DELETE FROM articles WHERE id IN (SELECT id FROM articles WHERE id NOT IN (SELECT article_id FROM reports WHERE final = 1) ORDER BY published_at ASC LIMIT ?)`, [total - R.maxArticleRows])).rowsAffected;
  }
  out.deletedAlerts = (await run(db, 'DELETE FROM alerts WHERE created_at < ?', [t - 90 * DAY])).rowsAffected;
  out.deletedScoreHistory = (await run(db, 'DELETE FROM score_history WHERE at < ?', [t - 365 * DAY])).rowsAffected;
  out.deletedPlayersWithoutData = (await run(db, `DELETE FROM players WHERE id NOT IN (SELECT DISTINCT player_id FROM reports WHERE player_id IS NOT NULL) AND created_at < ?`, [t - 7 * DAY])).rowsAffected;

  const size = await all<{ page_count: number; page_size: number }>(db, 'PRAGMA page_count').catch(() => []);
  out.pageCount = size[0] ? (size[0] as any).page_count : null;
  log.info('sweep done', out);
  return out;
}
