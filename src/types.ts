export type AnimeItem = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  year: number;
  format: string;
  episodes: string;
  rating: string;
  genres: string[];
  palette: string;
  posterMark: string;
  featured?: boolean;
};

export type ThemeName = 'astral-plum' | 'sakura-ember' | 'ocean-circuit' | 'moonlit-jade';
