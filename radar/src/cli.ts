#!/usr/bin/env node
import { openDb, migrate, all, one } from './db.js';
import { loadConfig, seedConfig } from './config.js';
import { seedSources } from './sources.js';
import { runPipeline } from './pipeline.js';
import { scoreAll } from './stages/score.js';
import { resolveLinks } from './stages/links.js';
import { identify } from './stages/identify.js';
import { Llm } from './llm.js';
import { importPoc } from './import-poc.js';
import { sweep } from './stages/sweep.js';
import { Quota } from './quota.js';
import { log } from './util.js';

const [cmd, ...rest] = process.argv.slice(2);
const db = openDb();

async function main() {
  switch (cmd) {
    case 'migrate': await migrate(db); break;
    case 'seed': await migrate(db); await seedConfig(db, rest.includes('--force')); log.info('sources', await seedSources(db)); break;
    case 'run': {
      const out = await runPipeline(db, { skipCollect: rest.includes('--no-collect'), skipAnalyze: rest.includes('--no-analyze'), skipEnrich: rest.includes('--no-enrich') });
      if (!out) process.exitCode = 0;
      break;
    }
    case 'identify': {
      // backfill / re-run: original links + Transfermarkt identity for existing players, then rescore
      await migrate(db); await seedConfig(db); const cfg = await loadConfig(db);
      const deadline = Date.now() + cfg.pipeline.runBudgetMinutes * 60_000;
      if (rest.includes('--reset')) await db.execute(`UPDATE players SET identity_status = NULL, tm_attempts = 0 WHERE identity_status IN ('UNIDENTIFIED')`);
      log.info('links', await resolveLinks(db, cfg, deadline));
      log.info('identify', await identify(db, cfg, new Llm(cfg, new Quota(db, cfg)), deadline));
      log.info('scored', await scoreAll(db, cfg));
      break;
    }
    case 'score': { await migrate(db); const cfg = await loadConfig(db); log.info('scored', await scoreAll(db, cfg)); break; }
    case 'sweep': { await migrate(db); await seedConfig(db); const cfg = await loadConfig(db); await sweep(db, cfg); break; }
    case 'import-poc': {
      await migrate(db); await seedConfig(db); await seedSources(db);
      const cfg = await loadConfig(db);
      const file = rest[0] ?? '../radar-poc/mockdata.json';
      log.info('imported', await importPoc(db, cfg, file));
      log.info('scored', await scoreAll(db, cfg));
      break;
    }
    case 'status': {
      await migrate(db);
      const cfg = await loadConfig(db);
      console.log(JSON.stringify({
        counts: await one(db, `SELECT (SELECT COUNT(*) FROM sources) sources, (SELECT COUNT(*) FROM articles) articles, (SELECT COUNT(*) FROM reports) reports, (SELECT COUNT(*) FROM reports WHERE final=1) final_reports,
          (SELECT COUNT(*) FROM players) players, (SELECT COUNT(*) FROM opportunities) opportunities, (SELECT COUNT(*) FROM articles WHERE state='COLLECTED') queued`),
        quota: await new Quota(db, cfg).summary(),
        top: await all(db, 'SELECT display_name, club_name, country, score, level, closed, independent_origins FROM opportunities ORDER BY closed, score DESC LIMIT 40'),
      }, null, 2));
      break;
    }
    default:
      console.log('usage: radar <migrate|seed [--force]|identify [--reset]|run [--no-collect --no-analyze --no-enrich]|score|sweep|import-poc [file]|status>');
  }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { log.error(e instanceof Error ? e.stack ?? e.message : String(e)); process.exit(1); });
