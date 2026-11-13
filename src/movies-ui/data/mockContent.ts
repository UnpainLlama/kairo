import type { RowData, TileData } from '../state/slices/contentSlice';

const TITLES = [
  'Midnight Protocol', 'Crimson Horizon', 'The Last Signal', 'Zero Day',
  'Phantom Thread', 'Dark Waters', 'Steel Rain', 'Neon Pulse',
  'The Cipher', 'Broken Arrow', 'Silent Code', 'Iron Veil',
  'Ember Falls', 'Ghost Circuit', 'Apex Predator', 'Quantum Drift',
  'Shadow Network', 'Cold Fusion', 'Binary Storm', 'Rogue Element',
  'Void Walker', 'Edge Runner', 'Frostbite', 'Solar Flare',
  'Dead Reckoning', 'Glass Fortress', 'Night Shift', 'Deep State',
  'Lost Signal', 'Blood Meridian', 'Thunderclap', 'Razor Wire',
  'Black Mirror', 'Fire Watch', 'Grave Orbit', 'Rust Belt',
  'High Tide', 'Low Orbit', 'Red Line', 'Blue Shift',
];

const GENRES = [
  'Action', 'Thriller', 'Sci-Fi', 'Drama', 'Mystery',
  'Horror', 'Crime', 'Adventure', 'Dystopian', 'Noir',
];

const RATINGS = ['TV-MA', 'TV-14', 'TV-PG', 'R', 'PG-13'];

const SYNOPSES = [
  'A gripping tale of survival in a world where trust is the most dangerous currency.',
  'When the unthinkable happens, one person must make an impossible choice.',
  'In the shadow of a crumbling empire, unlikely allies forge a desperate plan.',
  'A routine mission spirals into chaos when hidden truths surface.',
  'The line between hero and villain blurs in this pulse-pounding thriller.',
];

const ROW_TITLES = [
  'Trending Now',
  'Continue Watching',
  'New Releases',
  'Top 10 in Your Country',
  'Action & Adventure',
  'Because You Watched Midnight Protocol',
  'Critically Acclaimed',
  'Binge-Worthy',
  'Dark Thrillers',
  'Award Winners',
  'Hidden Gems',
  'Watch It Again',
];

let imageCounter = 0;

function makeTile(index: number): TileData {
  imageCounter++;
  return {
    id: `tile-${imageCounter}`,
    title: TITLES[index % TITLES.length],
    year: 2020 + (index % 6),
    rating: RATINGS[index % RATINGS.length],
    genre: GENRES[index % GENRES.length],
    synopsis: SYNOPSES[index % SYNOPSES.length],
    imageIndex: imageCounter,
  };
}

export function generateMockContent(): RowData[] {
  return ROW_TITLES.map((title, rowIdx) => {
    const tileCount = 10 + (rowIdx % 6); // 10-15 tiles per row
    const tiles: TileData[] = [];
    for (let i = 0; i < tileCount; i++) {
      tiles.push(makeTile(rowIdx * 15 + i));
    }
    return {
      id: `row-${rowIdx}`,
      title,
      tiles,
    };
  });
}

export function getTileImageUrl(imageIndex: number): string {
  // Deterministic placeholder images with different seeds
  return `https://picsum.photos/seed/${imageIndex}/230/130`;
}

export function getHeroImageUrl(): string {
  return `https://picsum.photos/seed/hero-main/1280/720`;
}
