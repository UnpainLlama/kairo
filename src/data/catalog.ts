import type { AnimeItem } from '../types';

// Fictional demo catalogue entries. Replace with records from an authorized metadata provider.
export const demoCatalog: AnimeItem[] = [
  { id: 'a1', slug: 'afterglow-atlas', title: 'Afterglow Atlas', subtitle: 'A map of worlds that only appear at dusk', year: 2026, format: 'Series', episodes: '12 eps', rating: '9.1', genres: ['Adventure', 'Fantasy'], palette: 'poster-violet', posterMark: 'ATLAS', featured: true },
  { id: 'a2', slug: 'neon-samurai-club', title: 'Neon Samurai Club', subtitle: 'The city never sleeps twice', year: 2025, format: 'Series', episodes: '24 eps', rating: '8.8', genres: ['Action', 'Sci-Fi'], palette: 'poster-cyan', posterMark: 'N/S' },
  { id: 'a3', slug: 'paper-moon-radio', title: 'Paper Moon Radio', subtitle: 'Messages from the other side of summer', year: 2026, format: 'Movie', episodes: '1 film', rating: '9.3', genres: ['Drama', 'Mystery'], palette: 'poster-rose', posterMark: 'MOON' },
  { id: 'a4', slug: 'the-quiet-comet', title: 'The Quiet Comet', subtitle: 'Every orbit brings them closer', year: 2024, format: 'Series', episodes: '13 eps', rating: '8.7', genres: ['Romance', 'Drama'], palette: 'poster-gold', posterMark: 'COMET' },
  { id: 'a5', slug: 'wildflower-protocol', title: 'Wildflower Protocol', subtitle: 'Nature has its own secret language', year: 2026, format: 'Series', episodes: '10 eps', rating: '8.9', genres: ['Fantasy', 'Slice of Life'], palette: 'poster-green', posterMark: 'WILD' },
  { id: 'a6', slug: 'zero-hour-parade', title: 'Zero Hour Parade', subtitle: 'One last song before the timeline resets', year: 2025, format: 'Series', episodes: '11 eps', rating: '8.5', genres: ['Thriller', 'Sci-Fi'], palette: 'poster-orange', posterMark: 'ZERO' },
  { id: 'a7', slug: 'blue-hour-archive', title: 'Blue Hour Archive', subtitle: 'The memories we leave in the rain', year: 2023, format: 'Series', episodes: '22 eps', rating: '9.0', genres: ['Mystery', 'Drama'], palette: 'poster-blue', posterMark: 'BLUE' },
  { id: 'a8', slug: 'honey-and-hexes', title: 'Honey & Hexes', subtitle: 'A very unusual neighborhood', year: 2026, format: 'Series', episodes: '8 eps', rating: '8.6', genres: ['Comedy', 'Fantasy'], palette: 'poster-pink', posterMark: 'H+H' },
];
