/**
 * Formation definitions for Shadow Teams.
 * Each position has (x, y) as percentage of pitch dimensions (0-100).
 * x: 0 = left touchline, 100 = right
 * y: 0 = top (our goal), 100 = bottom (opponent goal)
 */

export interface FormationPosition {
  code: string;
  x: number;
  y: number;
}

export interface FormationDef {
  id: string;
  label: string;
  positions: FormationPosition[];
}

export const FORMATIONS: FormationDef[] = [
  {
    id: '4-3-3',
    label: '4-3-3',
    positions: [
      { code: 'GK', x: 50, y: 6 },
      { code: 'LB', x: 15, y: 24 },
      { code: 'CB', x: 35, y: 24 },
      { code: 'CB', x: 65, y: 24 },
      { code: 'RB', x: 85, y: 24 },
      { code: 'CM', x: 30, y: 48 },
      { code: 'CM', x: 50, y: 48 },
      { code: 'CM', x: 70, y: 48 },
      { code: 'LW', x: 25, y: 78 },
      { code: 'ST', x: 50, y: 78 },
      { code: 'RW', x: 75, y: 78 },
    ],
  },
  {
    id: '4-4-2',
    label: '4-4-2',
    positions: [
      { code: 'GK', x: 50, y: 6 },
      { code: 'LB', x: 15, y: 24 },
      { code: 'CB', x: 35, y: 24 },
      { code: 'CB', x: 65, y: 24 },
      { code: 'RB', x: 85, y: 24 },
      { code: 'LM', x: 20, y: 50 },
      { code: 'CM', x: 40, y: 50 },
      { code: 'CM', x: 60, y: 50 },
      { code: 'RM', x: 80, y: 50 },
      { code: 'ST', x: 38, y: 82 },
      { code: 'ST', x: 62, y: 82 },
    ],
  },
  {
    id: '4-2-3-1',
    label: '4-2-3-1',
    positions: [
      { code: 'GK', x: 50, y: 6 },
      { code: 'LB', x: 15, y: 24 },
      { code: 'CB', x: 35, y: 24 },
      { code: 'CB', x: 65, y: 24 },
      { code: 'RB', x: 85, y: 24 },
      { code: 'DM', x: 38, y: 42 },
      { code: 'DM', x: 62, y: 42 },
      { code: 'LW', x: 25, y: 62 },
      { code: 'AM', x: 50, y: 62 },
      { code: 'RW', x: 75, y: 62 },
      { code: 'ST', x: 50, y: 84 },
    ],
  },
  {
    id: '3-5-2',
    label: '3-5-2',
    positions: [
      { code: 'GK', x: 50, y: 6 },
      { code: 'CB', x: 25, y: 22 },
      { code: 'CB', x: 50, y: 22 },
      { code: 'CB', x: 75, y: 22 },
      { code: 'LWB', x: 12, y: 48 },
      { code: 'CM', x: 35, y: 48 },
      { code: 'CM', x: 50, y: 48 },
      { code: 'CM', x: 65, y: 48 },
      { code: 'RWB', x: 88, y: 48 },
      { code: 'ST', x: 38, y: 80 },
      { code: 'ST', x: 62, y: 80 },
    ],
  },
];
