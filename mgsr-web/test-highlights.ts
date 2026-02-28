import YouTube from 'youtube-sr';

function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

interface Video {
  id: string;
  title: string;
  channel: string;
  dur: number;
  views: number;
}

const TITLE_BLACKLIST = [
  'interview', 'press conference', 'reaction', 'news', 'transfer',
  'podcast', 'prediction', 'preview', 'debate', 'analysis show',
  'behind the scenes', 'training', 'arrival', 'medical', 'signing',
];

function filterVideo(v: Video, nameParts: string[], teamNorm: string, teamParts: string[]): boolean {
  const titleNorm = stripAccents(v.title);
  const channelNorm = stripAccents(v.channel);
  if (TITLE_BLACKLIST.some(bw => titleNorm.includes(bw))) return false;
  const matchedParts = nameParts.filter(part => titleNorm.includes(part));
  if (nameParts.length >= 2) {
    if (matchedParts.length >= 2) { /* ok */ }
    else if (matchedParts.length === 1) {
      const teamInTitle = teamNorm && (
        titleNorm.includes(teamNorm) || channelNorm.includes(teamNorm) ||
        teamParts.some(tp => titleNorm.includes(tp) || channelNorm.includes(tp))
      );
      if (!teamInTitle) return false;
    } else return false;
  } else {
    if (!nameParts.some(part => titleNorm.includes(part))) return false;
  }
  if (v.dur < 45 || v.dur > 2700) return false;
  return true;
}

function scoreVideo(v: Video, nameParts: string[], teamNorm: string, teamParts: string[]): number {
  let score = 0;
  const titleNorm = stripAccents(v.title);
  const channelNorm = stripAccents(v.channel);
  // Team match (+120)
  if (teamNorm) {
    const teamIn = titleNorm.includes(teamNorm) || channelNorm.includes(teamNorm) ||
      teamParts.some(tp => titleNorm.includes(tp));
    if (teamIn) score += 120;
  }
  // College penalty
  const cp = ['njcaa', 'naia', 'ncaa', 'college soccer', 'high school', 'water polo'];
  for (const c of cp) { if (titleNorm.includes(c) || channelNorm.includes(c)) { score -= 60; break; } }
  // Highlight keywords
  if (titleNorm.includes('highlight') || titleNorm.includes('jugadas') || titleNorm.includes('melhores')) score += 30;
  const good = ['goals', 'skills', 'assists', 'goles', 'gol', 'golazo', 'jugadas', 'compacto', 'mejores', 'crack'];
  for (const w of good) { if (titleNorm.includes(w)) score += 10; }
  // Name parts
  score += nameParts.filter(p => titleNorm.includes(p)).length * 15;
  // Duration
  if (v.dur >= 180 && v.dur <= 900) score += 20;
  // Views
  score += Math.min(30, Math.log10(Math.max(1, v.views)) * 5);
  return score;
}

async function test() {
  const playerName = 'Santiago González';
  const teamName = 'Sporting Cristal';
  const cleanTeam = teamName.replace(/^fc\s+|\s+fc$/gi, '').trim();
  const playerNorm = stripAccents(playerName);
  const nameParts = playerNorm.split(/\s+/).filter(p => p.length >= 3);
  const teamNorm = stripAccents(cleanTeam);
  const teamParts = teamNorm.split(/\s+/).filter(p => p.length >= 3);

  // Phase A: team-specific (always run all)
  const teamTiers = [
    `${playerName} ${cleanTeam} highlights goals skills`,
    `${playerName} ${cleanTeam} highlights`,
    `${playerName} ${cleanTeam} goles jugadas`,
  ];

  const seen = new Set<string>();
  const allResults: Video[] = [];

  console.log('=== PHASE A: Team-specific tiers (always run all) ===');
  for (const q of teamTiers) {
    console.log(`\n--- ${q} ---`);
    try {
      const results = await YouTube.search(q, { limit: 10, type: 'video' });
      let added = 0;
      for (const v of results) {
        const vid: Video = {
          id: v.id || '',
          title: v.title || '',
          channel: v.channel?.name || '',
          dur: Math.round((v.duration || 0) / 1000),
          views: v.views || 0,
        };
        if (!vid.id || seen.has(vid.id)) continue;
        if (!filterVideo(vid, nameParts, teamNorm, teamParts)) continue;
        seen.add(vid.id);
        allResults.push(vid);
        added++;
      }
      console.log(`  Found ${results.length} raw → ${added} new after filter → total: ${allResults.length}`);
    } catch (e: any) { console.log(`  ERROR: ${e.message}`); }
  }

  console.log(`\n=== After Phase A: ${allResults.length} total results ===`);

  // Phase B: broad (only if < 2 results)
  if (allResults.length < 2) {
    console.log('\n=== PHASE B: Broad tiers ===');
    const broadTiers = [
      `${playerName} highlights goals skills`,
      `${playerName} highlights`,
      `${playerName} goals`,
    ];
    for (const q of broadTiers) {
      console.log(`\n--- ${q} ---`);
      try {
        const results = await YouTube.search(q, { limit: 10, type: 'video' });
        let added = 0;
        for (const v of results) {
          const vid: Video = {
            id: v.id || '',
            title: v.title || '',
            channel: v.channel?.name || '',
            dur: Math.round((v.duration || 0) / 1000),
            views: v.views || 0,
          };
          if (!vid.id || seen.has(vid.id)) continue;
          if (!filterVideo(vid, nameParts, teamNorm, teamParts)) continue;
          seen.add(vid.id);
          allResults.push(vid);
          added++;
        }
        console.log(`  Found ${results.length} raw → ${added} new → total: ${allResults.length}`);
        if (allResults.length >= 2) break;
      } catch (e: any) { console.log(`  ERROR: ${e.message}`); }
    }
  } else {
    console.log('(Skipping Phase B — enough results from team tiers)');
  }

  // Score & sort
  const sorted = allResults
    .map(v => ({ ...v, score: scoreVideo(v, nameParts, teamNorm, teamParts) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  console.log(`\n=== FINAL TOP ${sorted.length} RESULTS ===`);
  for (const v of sorted) {
    const teamIn = stripAccents(v.title).includes('cristal') || stripAccents(v.channel).includes('cristal');
    console.log(`  ${teamIn ? '🏟️' : '  '} [score=${v.score}] [${v.dur}s] ${v.title}`);
    console.log(`       channel: ${v.channel} | views: ${v.views}`);
  }
}

test().catch(console.error);
