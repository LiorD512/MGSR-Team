export interface DeepDiveQuery {
  position?: string;
  league?: string;
  nationality?: string;
  ageRange?: { min: number; max: number };
  valueRange?: { min: number; max: number };
  tags?: string[];
}

const POSITIONS = [
  'Goalkeeper',
  'Center-Back',
  'Left-Back',
  'Right-Back',
  'Defensive Midfield',
  'Central Midfield',
  'Attacking Midfield',
  'Left Winger',
  'Right Winger',
  'Second Striker',
  'Centre-Forward',
];

const LEAGUES = [
  'Premier League',
  'La Liga',
  'Serie A',
  'Bundesliga',
  'Ligue 1',
  'Primeira Liga',
  'Eredivisie',
  'Jupiler Pro League',
  'Championship',
  'Serie B',
  'Super Lig',
  'Russian Premier League',
  'Allsvenskan',
  'Eliteserien',
  'Greek Super League',
];

const NATIONALITIES = [
  'Argentina',
  'Brazil',
  'France',
  'Germany',
  'Spain',
  'Italy',
  'Portugal',
  'Netherlands',
  'Belgium',
  'Poland',
  'Ukraine',
  'England',
  'Scotland',
  'Colombia',
  'Mexico',
  'Turkey',
  'Greece',
  'Serbia',
  'Norway',
  'Sweden',
  'Denmark',
];

const SPECIAL_THEMES = [
  {
    name: 'Hidden Gems',
    description: 'Undervalued talents in less popular leagues',
    filter: (p: DeepDiveQuery) => {
      p.league = LEAGUES[Math.floor(Math.random() * LEAGUES.length)];
      p.valueRange = { min: 100_000, max: 1_500_000 };
      p.tags = ['underexposed', 'rising-star'];
    },
  },
  {
    name: 'Young Phenoms',
    description: 'Players under 21 with exceptional potential',
    filter: (p: DeepDiveQuery) => {
      p.ageRange = { min: 16, max: 21 };
      p.position = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
      p.valueRange = { min: 0, max: 3_000_000 };
      p.tags = ['high-potential', 'young'];
    },
  },
  {
    name: 'Experienced Warriors',
    description: 'Battle-tested players over 28 with proven quality',
    filter: (p: DeepDiveQuery) => {
      p.ageRange = { min: 28, max: 40 };
      p.valueRange = { min: 500_000, max: 15_000_000 };
      p.tags = ['experience', 'leadership'];
    },
  },
  {
    name: 'Peak Performance',
    description: 'Players in their prime (24-28) with best value',
    filter: (p: DeepDiveQuery) => {
      p.ageRange = { min: 24, max: 28 };
      p.position = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
      p.league = LEAGUES[Math.floor(Math.random() * LEAGUES.length)];
      p.valueRange = { min: 1_000_000, max: 8_000_000 };
    },
  },
  {
    name: 'European Outliers',
    description: 'Top talents from unexpected European corners',
    filter: (p: DeepDiveQuery) => {
      const uncommonNations = ['Croatia', 'Slovenia', 'Hungary', 'Czech Republic', 'Romania', 'Bulgaria'];
      p.nationality = uncommonNations[Math.floor(Math.random() * uncommonNations.length)];
      p.position = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
      p.tags = ['underexposed-nation'];
    },
  },
  {
    name: 'Rising Stars',
    description: 'Players whose market value is rapidly increasing',
    filter: (p: DeepDiveQuery) => {
      p.ageRange = { min: 19, max: 25 };
      p.valueRange = { min: 500_000, max: 5_000_000 };
      p.tags = ['momentum', 'rising'];
    },
  },
  {
    name: 'Niche Specialists',
    description: 'Rare positions with limited market supply',
    filter: (p: DeepDiveQuery) => {
      const niche = ['Defensive Midfield', 'Attacking Midfield', 'Second Striker'];
      p.position = niche[Math.floor(Math.random() * niche.length)];
      p.valueRange = { min: 200_000, max: 4_000_000 };
      p.tags = ['specialist', 'rare-role'];
    },
  },
];

export function generateRandomDeepDive(): { theme: string; query: DeepDiveQuery; description: string } {
  const theme = SPECIAL_THEMES[Math.floor(Math.random() * SPECIAL_THEMES.length)];
  const query: DeepDiveQuery = {};

  theme.filter(query);

  return {
    theme: theme.name,
    query,
    description: theme.description,
  };
}

export function formatDeepDiveQuery(query: DeepDiveQuery): string {
  const parts: string[] = [];

  if (query.position) parts.push(query.position);
  if (query.nationality) parts.push(`from ${query.nationality}`);
  if (query.league) parts.push(`in ${query.league}`);

  if (query.ageRange) {
    if (query.ageRange.min === query.ageRange.max) {
      parts.push(`age ${query.ageRange.min}`);
    } else {
      parts.push(`ages ${query.ageRange.min}-${query.ageRange.max}`);
    }
  }

  if (query.valueRange) {
    const minM = (query.valueRange.min / 1_000_000).toFixed(1);
    const maxM = (query.valueRange.max / 1_000_000).toFixed(1);
    if (query.valueRange.min === 0) {
      parts.push(`under €${maxM}M`);
    } else {
      parts.push(`€${minM}M-${maxM}M`);
    }
  }

  if (query.tags?.length) {
    parts.push(`[${query.tags.join(', ')}]`);
  }

  return parts.join(' | ');
}

export function decomposeDeepDiveIntoSearchParams(query: DeepDiveQuery): Record<string, string> {
  const params: Record<string, string> = {};

  if (query.position) params['pos'] = query.position;
  if (query.nationality) params['nat'] = query.nationality;
  if (query.league) params['league'] = query.league;

  if (query.ageRange) {
    if (query.ageRange.min > 0) params['age_min'] = String(query.ageRange.min);
    if (query.ageRange.max > 0) params['age_max'] = String(query.ageRange.max);
  }

  if (query.valueRange) {
    if (query.valueRange.min > 0) params['value_min'] = String(Math.round(query.valueRange.min / 1000)) + 'k';
    if (query.valueRange.max > 0) params['value_max'] = String(Math.round(query.valueRange.max / 1000)) + 'k';
  }

  return params;
}
