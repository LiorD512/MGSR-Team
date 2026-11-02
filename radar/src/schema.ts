/** Versioned SQLite (libSQL/Turso) migrations. Append new migrations; never edit applied ones. */
export const MIGRATIONS: { id: number; name: string; sql: string[] }[] = [
  {
    id: 1,
    name: 'initial',
    sql: [
      `CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, version INTEGER NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL)`,

      `CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, host TEXT NOT NULL, country TEXT, languages TEXT, type TEXT NOT NULL,
        leagues TEXT, access_chosen TEXT NOT NULL DEFAULT 'RSS', feed_url TEXT, access_limitation TEXT, headline_only INTEGER NOT NULL DEFAULT 0,
        robots TEXT, status TEXT NOT NULL DEFAULT 'PROBATION', status_reason TEXT, status_changed_at INTEGER, status_changed_by TEXT,
        tier TEXT NOT NULL DEFAULT 'C', reliability INTEGER NOT NULL DEFAULT 50, tier_override TEXT,
        base_interval_min INTEGER NOT NULL DEFAULT 60, next_scan_at INTEGER NOT NULL DEFAULT 0, last_scan_at INTEGER, last_success_at INTEGER, last_error TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0, etag TEXT, last_modified TEXT,
        items_collected INTEGER NOT NULL DEFAULT 0, relevant_reports INTEGER NOT NULL DEFAULT 0, last_article_at INTEGER,
        provenance TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS ix_sources_due ON sources(status, next_scan_at)`,
      `CREATE INDEX IF NOT EXISTS ix_sources_country ON sources(country, status)`,

      `CREATE TABLE IF NOT EXISTS source_events (id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL, at INTEGER NOT NULL, kind TEXT NOT NULL, actor TEXT, detail TEXT)`,
      `CREATE INDEX IF NOT EXISTS ix_source_events ON source_events(source_id, at DESC)`,

      `CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY, source_id TEXT NOT NULL, outlet TEXT, canonical_url TEXT NOT NULL, link TEXT NOT NULL,
        title_orig TEXT NOT NULL, excerpt TEXT, lang TEXT, country TEXT, published_at INTEGER NOT NULL, collected_at INTEGER NOT NULL,
        content_hash TEXT, state TEXT NOT NULL DEFAULT 'COLLECTED', skip_reason TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
        gate_score REAL NOT NULL DEFAULT 0, priority REAL NOT NULL DEFAULT 0, headline_only INTEGER NOT NULL DEFAULT 0,
        analyzed_at INTEGER, prompt_ver TEXT, model_id TEXT, body_read INTEGER NOT NULL DEFAULT 0)`,
      `CREATE INDEX IF NOT EXISTS ix_articles_state ON articles(state, priority DESC, next_attempt_at)`,
      `CREATE INDEX IF NOT EXISTS ix_articles_source ON articles(source_id, collected_at DESC)`,
      `CREATE INDEX IF NOT EXISTS ix_articles_pub ON articles(published_at DESC)`,
      `CREATE INDEX IF NOT EXISTS ix_articles_hash ON articles(content_hash)`,

      `CREATE TABLE IF NOT EXISTS article_bodies (article_id TEXT PRIMARY KEY, body TEXT NOT NULL, expires_at INTEGER NOT NULL)`,

      `CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY, article_id TEXT NOT NULL, source_id TEXT NOT NULL, outlet TEXT, url TEXT NOT NULL,
        published_at INTEGER NOT NULL, collected_at INTEGER NOT NULL, lang TEXT, country TEXT,
        player_raw TEXT, player_latin TEXT, club_raw TEXT, club_latin TEXT, player_id TEXT, resolution_status TEXT NOT NULL DEFAULT 'UNRESOLVED', resolution_conf REAL NOT NULL DEFAULT 0,
        signals TEXT NOT NULL, claim_type TEXT, strength TEXT, attributed_to TEXT, verification TEXT NOT NULL DEFAULT 'RUMOR',
        evidence_quote TEXT, evidence_ok INTEGER NOT NULL DEFAULT 0, event_date INTEGER, historical INTEGER NOT NULL DEFAULT 0,
        sport TEXT, squad_type TEXT, role TEXT, star_player INTEGER NOT NULL DEFAULT 0,
        title_orig TEXT, headline_en TEXT, why TEXT, ai_actionable INTEGER NOT NULL DEFAULT 0, final INTEGER NOT NULL DEFAULT 0, drop_reason TEXT,
        needs_body INTEGER NOT NULL DEFAULT 0, origin_key TEXT, prompt_ver TEXT, model_id TEXT, headline_only INTEGER NOT NULL DEFAULT 0,
        fb_correct INTEGER NOT NULL DEFAULT 0, fb_incorrect INTEGER NOT NULL DEFAULT 0, fb_outdated INTEGER NOT NULL DEFAULT 0)`,
      `CREATE INDEX IF NOT EXISTS ix_reports_player ON reports(player_id, published_at DESC)`,
      `CREATE INDEX IF NOT EXISTS ix_reports_final ON reports(final, published_at DESC)`,
      `CREATE INDEX IF NOT EXISTS ix_reports_needs_body ON reports(needs_body, published_at DESC)`,

      `CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY, display_name TEXT NOT NULL, name_key TEXT NOT NULL, surname_key TEXT NOT NULL, aliases TEXT,
        tm_id TEXT, roster_player_id TEXT, on_shortlist INTEGER NOT NULL DEFAULT 0, dob TEXT, nationalities TEXT, position TEXT, foot TEXT, height_cm INTEGER,
        club_name TEXT, club_key TEXT, league TEXT, country TEXT, contract_expires INTEGER, contract_verified INTEGER NOT NULL DEFAULT 0, contract_source TEXT,
        photo_url TEXT, resolution_status TEXT NOT NULL DEFAULT 'UNRESOLVED', merge_log TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS ix_players_name ON players(name_key)`,
      `CREATE INDEX IF NOT EXISTS ix_players_surname ON players(surname_key, club_key)`,

      `CREATE TABLE IF NOT EXISTS opportunities (
        player_id TEXT PRIMARY KEY, score INTEGER NOT NULL, raw_score INTEGER NOT NULL, level TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0,
        score_delta_7d INTEGER NOT NULL DEFAULT 0, urgency TEXT NOT NULL, urgency_score INTEGER NOT NULL DEFAULT 0,
        categories TEXT, loan_available INTEGER NOT NULL DEFAULT 0, transfer_available INTEGER NOT NULL DEFAULT 0, no_recent_minutes INTEGER NOT NULL DEFAULT 0,
        in_roster INTEGER NOT NULL DEFAULT 0, on_shortlist INTEGER NOT NULL DEFAULT 0,
        top_headline TEXT, top_outlet TEXT, top_tier TEXT, best_verification TEXT, best_tier TEXT, report_count INTEGER NOT NULL DEFAULT 0, independent_origins INTEGER NOT NULL DEFAULT 0,
        action TEXT, explanation TEXT NOT NULL, config_version INTEGER NOT NULL,
        first_seen_at INTEGER NOT NULL, last_report_at INTEGER NOT NULL, last_change_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        display_name TEXT NOT NULL, club_name TEXT, country TEXT, league TEXT, position TEXT, age INTEGER, nationality TEXT, contract_expires INTEGER, search_text TEXT)`,
      `CREATE INDEX IF NOT EXISTS ix_opp_score ON opportunities(closed, score DESC)`,
      `CREATE INDEX IF NOT EXISTS ix_opp_country ON opportunities(country, score DESC)`,
      `CREATE INDEX IF NOT EXISTS ix_opp_change ON opportunities(last_change_at DESC)`,

      `CREATE TABLE IF NOT EXISTS score_history (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, at INTEGER NOT NULL, score INTEGER NOT NULL, level TEXT NOT NULL, components TEXT, config_version INTEGER)`,
      `CREATE INDEX IF NOT EXISTS ix_score_history ON score_history(player_id, at DESC)`,

      `CREATE TABLE IF NOT EXISTS timeline (
        id TEXT PRIMARY KEY, player_id TEXT NOT NULL, at INTEGER NOT NULL, reported_at INTEGER NOT NULL, kind TEXT NOT NULL, report_id TEXT,
        signals TEXT, verification TEXT, outlet TEXT, tier TEXT, url TEXT, headline_en TEXT, title_orig TEXT, quote TEXT, claim_type TEXT)`,
      `CREATE INDEX IF NOT EXISTS ix_timeline ON timeline(player_id, at DESC)`,

      `CREATE TABLE IF NOT EXISTS entity_review (id TEXT PRIMARY KEY, report_id TEXT, raw_name TEXT, raw_club TEXT, candidates TEXT, status TEXT NOT NULL DEFAULT 'OPEN', created_at INTEGER NOT NULL)`,

      `CREATE TABLE IF NOT EXISTS host_state (host TEXT PRIMARY KEY, blocked_until INTEGER NOT NULL DEFAULT 0, consecutive_blocks INTEGER NOT NULL DEFAULT 0, robots_txt TEXT, robots_fetched_at INTEGER)`,
      `CREATE TABLE IF NOT EXISTS jobs (name TEXT PRIMARY KEY, lease_until INTEGER NOT NULL DEFAULT 0, owner TEXT, last_start INTEGER, last_end INTEGER, last_status TEXT, summary TEXT)`,
      `CREATE TABLE IF NOT EXISTS quota_ledger (day TEXT NOT NULL, service TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0, tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0, usd REAL NOT NULL DEFAULT 0, PRIMARY KEY(day, service))`,
      `CREATE TABLE IF NOT EXISTS run_log (id INTEGER PRIMARY KEY AUTOINCREMENT, job TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER, status TEXT, summary TEXT)`,

      `CREATE TABLE IF NOT EXISTS alert_rules (user_id TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, type TEXT NOT NULL, player_id TEXT, title TEXT, body TEXT, score INTEGER, dedupe_key TEXT, read_at INTEGER)`,
      `CREATE INDEX IF NOT EXISTS ix_alerts_user ON alerts(user_id, created_at DESC)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_alerts_dedupe ON alerts(user_id, dedupe_key)`,
    ],
  },
  {
    // 3-day cadence: bigger runs, longer queue life. Updates DBs that were seeded with the old hourly-run defaults.
    id: 2,
    name: 'three_day_cadence',
    sql: [
      `UPDATE config SET json = json_set(json, '$.runEveryDays', 3, '$.maxItemsPerRun', 1500, '$.maxBodyReads', 30, '$.analysisExpiryDays', 7, '$.runBudgetMinutes', 40),
         version = version + 1, updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE key = 'pipeline'`,
      `UPDATE config SET json = json_set(json, '$.paidMaxRequestsPerRun', 250), version = version + 1, updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE key = 'llm'`,
    ],
  },
  {
    // UI redesign: shared agency marks (hidden / watchlist / contacted), club-vs-outlet country, run trigger.
    id: 3,
    name: 'ui_flags_country_source_trigger',
    sql: [
      `CREATE TABLE IF NOT EXISTS player_flags (player_id TEXT NOT NULL, flag TEXT NOT NULL, reason TEXT, by_email TEXT, at INTEGER NOT NULL, PRIMARY KEY (player_id, flag))`,
      `ALTER TABLE players ADD COLUMN country_source TEXT`,
      `ALTER TABLE run_log ADD COLUMN trigger TEXT`,
    ],
  },
  {
    // v3: every player is identified on Transfermarkt; original publisher URLs instead of Google News redirects.
    id: 4,
    name: 'tm_identity_publisher_urls',
    sql: [
      `ALTER TABLE players ADD COLUMN tm_url TEXT`,
      `ALTER TABLE players ADD COLUMN full_name TEXT`,
      `ALTER TABLE players ADD COLUMN age INTEGER`,
      `ALTER TABLE players ADD COLUMN market_value TEXT`,
      `ALTER TABLE players ADD COLUMN market_value_eur INTEGER`,
      `ALTER TABLE players ADD COLUMN club_tm_id TEXT`,
      `ALTER TABLE players ADD COLUMN club_crest TEXT`,
      `ALTER TABLE players ADD COLUMN loan_from TEXT`,
      `ALTER TABLE players ADD COLUMN height TEXT`,
      // CONFIRMED (club evidence) | PROBABLE (only one TM player with that full name) | UNIDENTIFIED | EXCLUDED ; NULL = not checked yet
      `ALTER TABLE players ADD COLUMN identity_status TEXT`,
      `ALTER TABLE players ADD COLUMN identity_conf REAL`,
      `ALTER TABLE players ADD COLUMN identity_checks TEXT`,
      `ALTER TABLE players ADD COLUMN identity_candidates TEXT`,
      `ALTER TABLE players ADD COLUMN excluded_reason TEXT`,
      `ALTER TABLE players ADD COLUMN tm_checked_at INTEGER`,
      `ALTER TABLE players ADD COLUMN tm_attempts INTEGER NOT NULL DEFAULT 0`,
      `CREATE INDEX IF NOT EXISTS ix_players_tm ON players(tm_id)`,
      `CREATE INDEX IF NOT EXISTS ix_players_identity ON players(identity_status)`,
      `ALTER TABLE reports ADD COLUMN publisher_url TEXT`,
      `ALTER TABLE reports ADD COLUMN publisher_host TEXT`,
      `ALTER TABLE reports ADD COLUMN link_attempts INTEGER NOT NULL DEFAULT 0`,
      `CREATE TABLE IF NOT EXISTS tm_cache (key TEXT PRIMARY KEY, json TEXT NOT NULL, fetched_at INTEGER NOT NULL)`,
    ],
  },
  {
    // more players / more data: football-only feeds, cheap headline triage, publisher URL on articles, agent, notifications, source quality
    id: 5,
    name: 'triage_agent_notify_quality',
    sql: [
      `ALTER TABLE sources ADD COLUMN football_only INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE sources ADD COLUMN items_seen INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE sources ADD COLUMN items_gated INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE articles ADD COLUMN triage INTEGER`,
      `ALTER TABLE articles ADD COLUMN publisher_url TEXT`,
      `CREATE INDEX IF NOT EXISTS ix_articles_triage ON articles(state, triage)`,
      `ALTER TABLE players ADD COLUMN agent TEXT`,
      `ALTER TABLE players ADD COLUMN agent_url TEXT`,
      `ALTER TABLE players ADD COLUMN notified_at INTEGER`,
      // players already on the screen are not announced again
      `UPDATE players SET notified_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE identity_status IN ('CONFIRMED','PROBABLE')`,
      // the triage step adds ~1 request per 60 headlines: allow more paid requests per run (the dollar caps still apply)
      `UPDATE config SET json = json_set(json, '$.paidMaxRequestsPerRun', 700), version = version + 1, updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE key = 'llm'`,
      `UPDATE config SET json = json_set(json, '$.maxBodyReads', 150, '$.runBudgetMinutes', 60), version = version + 1, updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE key = 'pipeline'`,
    ],
  },
  {
    id: 6,
    name: 'analysis_batch_10',
    sql: [`UPDATE config SET json = json_set(json, '$.batchSize', 10), version = version + 1, updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE key = 'pipeline'`],
  },
];
