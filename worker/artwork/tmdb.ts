import type { FetchLike } from '../metadata/providers/http';

export type ArtworkLookup = {
  title: string;
  alternateTitles?: string[];
  year?: number | null;
  format?: string | null;
};

export type TmdbArtwork = {
  tmdbId: number;
  mediaType: 'tv' | 'movie';
  posterUrl: string | null;
  bannerUrl: string | null;
  /** Optional detail fields: omitted by older/custom test providers, populated by TMDB lookup. */
  overview?: string | null;
  rating?: number | null;
  genres?: string[];
  releaseYear?: number | null;
  episodeCount?: number | null;
};

export type ArtworkProvider = {
  readonly id: 'tmdb';
  lookup(input: ArtworkLookup, signal: AbortSignal): Promise<TmdbArtwork | null>;
  /** Optional season still lookup. Returns a map keyed by the season-local episode number. */
  episodeStills?(artwork: TmdbArtwork, input: ArtworkLookup, signal: AbortSignal): Promise<Record<number, string>>;
};

type SearchRecord = {
  id?: unknown;
  media_type?: unknown;
  adult?: unknown;
  name?: unknown;
  original_name?: unknown;
  title?: unknown;
  original_title?: unknown;
  first_air_date?: unknown;
  release_date?: unknown;
  poster_path?: unknown;
  backdrop_path?: unknown;
  popularity?: unknown;
  vote_count?: unknown;
};

type DetailRecord = {
  overview?: unknown;
  vote_average?: unknown;
  genres?: unknown;
  first_air_date?: unknown;
  release_date?: unknown;
  number_of_episodes?: unknown;
  poster_path?: unknown;
  backdrop_path?: unknown;
};

type ImageRecord = {
  file_path?: unknown;
  iso_639_1?: unknown;
  vote_average?: unknown;
  vote_count?: unknown;
  width?: unknown;
  height?: unknown;
};

type ImageCollection = { posters?: unknown; backdrops?: unknown };

const API = 'https://api.themoviedb.org/3';
const IMAGE = 'https://image.tmdb.org/t/p';
const normalize = (value: string): string => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}

function titleSimilarity(left: string, right: string): number {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.12 + 0.78;
  const edit = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const at = new Set(a.split(' '));
  const bt = new Set(b.split(' '));
  const overlap = [...at].filter((token) => bt.has(token)).length;
  const dice = (2 * overlap) / Math.max(1, at.size + bt.size);
  return Math.max(edit, dice * 0.94);
}

function imageUrl(path: unknown, size: 'w500' | 'w780' | 'w1280'): string | null {
  if (typeof path !== 'string' || !/^\/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|webp)$/i.test(path) || path.includes('..')) return null;
  return `${IMAGE}/${size}${path}`;
}

function chooseImage(records: unknown, size: 'w500' | 'w780' | 'w1280'): string | null {
  if (!Array.isArray(records)) return null;
  const candidates = records.filter((item): item is ImageRecord => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map((record) => {
      const url = imageUrl(record.file_path, size);
      const language = record.iso_639_1;
      const languageScore = size === 'w1280'
        ? (language === null ? 3 : language === 'en' ? 2 : typeof language === 'string' ? 1 : 0)
        : (language === 'en' ? 3 : language === null ? 2 : typeof language === 'string' ? 1 : 0);
      const votes = typeof record.vote_count === 'number' ? record.vote_count : 0;
      const rating = typeof record.vote_average === 'number' ? record.vote_average : 0;
      const width = typeof record.width === 'number' ? record.width : 0;
      const height = typeof record.height === 'number' ? record.height : 0;
      const ratio = width > 0 && height > 0 ? width / height : 0;
      const ratioScore = size === 'w1280' ? (ratio >= 1.5 && ratio <= 2.2 ? 0.25 : 0) : (ratio >= 0.55 && ratio <= 0.8 ? 0.25 : 0);
      return { url, score: languageScore + Math.min(votes, 100) / 1000 + rating / 100 + ratioScore };
    })
    .filter((entry): entry is { url: string; score: number } => entry.url !== null)
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.url ?? null;
}

function resultNames(record: SearchRecord): string[] {
  return [record.name, record.original_name, record.title, record.original_title]
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
}

function recordYear(record: SearchRecord): number | null {
  const date = typeof record.first_air_date === 'string' ? record.first_air_date : typeof record.release_date === 'string' ? record.release_date : '';
  const year = Number(date.slice(0, 4));
  return Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null;
}

function expectedType(format: string | null | undefined): 'tv' | 'movie' {
  return format?.toLowerCase() === 'movie' ? 'movie' : 'tv';
}

function scoreRecord(record: SearchRecord, input: ArtworkLookup, type: 'tv' | 'movie'): number {
  const names = resultNames(record);
  const targets = [input.title, ...(input.alternateTitles ?? [])].filter(Boolean);
  let score = 0;
  for (const name of names) for (const target of targets) score = Math.max(score, titleSimilarity(name, target));
  if (!score) return 0;
  if (typeof record.adult === 'boolean' && record.adult) return 0;
  if (record.media_type && record.media_type !== type) return 0;
  const year = recordYear(record);
  if (input.year && year) {
    const gap = Math.abs(input.year - year);
    score += gap === 0 ? 0.035 : gap === 1 ? 0.015 : gap === 2 ? -0.025 : gap === 3 ? -0.07 : -0.3;
  }
  return Math.max(0, Math.min(1, score));
}

function chooseResult(records: unknown[], input: ArtworkLookup, type: 'tv' | 'movie'): SearchRecord | null {
  const candidates = records.filter((item): item is SearchRecord => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map((record) => ({ record, score: scoreRecord(record, input, type) }))
    .filter((entry) => entry.score >= 0.73)
    .sort((a, b) => b.score - a.score
      || Number(b.record.vote_count ?? 0) - Number(a.record.vote_count ?? 0)
      || Number(b.record.popularity ?? 0) - Number(a.record.popularity ?? 0));
  return candidates[0]?.record ?? null;
}

type TmdbSeasonSummary = { season_number?: unknown; air_date?: unknown; episode_count?: unknown };
type TmdbSeasonEpisode = { episode_number?: unknown; still_path?: unknown };

function seasonHint(input: ArtworkLookup): number | null {
  const text = input.title;
  const patterns = [
    /\bseason\s*0*(\d{1,2})\b/i,
    /\bs\s*0*(\d{1,2})\b/i,
    /\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match ? Number(match[1]) : NaN;
    if (Number.isInteger(value) && value > 0 && value <= 50) return value;
  }
  return null;
}

function chooseSeason(seasons: unknown, input: ArtworkLookup): number | null {
  if (!Array.isArray(seasons)) return null;
  const valid = seasons.filter((item): item is TmdbSeasonSummary => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map((item) => ({
      number: typeof item.season_number === 'number' && Number.isInteger(item.season_number) ? item.season_number : -1,
      year: typeof item.air_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.air_date) ? Number(item.air_date.slice(0, 4)) : null,
      count: typeof item.episode_count === 'number' && Number.isFinite(item.episode_count) ? item.episode_count : 0,
    }))
    .filter((item) => item.number > 0 && item.count > 0);
  if (valid.length === 0) return null;

  const explicit = seasonHint(input);
  if (explicit !== null && valid.some((item) => item.number === explicit)) return explicit;

  if (input.year) {
    const byYear = [...valid].sort((a, b) => {
      const aGap = a.year === null ? Number.MAX_SAFE_INTEGER : Math.abs(a.year - input.year!);
      const bGap = b.year === null ? Number.MAX_SAFE_INTEGER : Math.abs(b.year - input.year!);
      return aGap - bGap || b.number - a.number;
    });
    if (byYear[0]?.year !== null && byYear[0]?.year !== undefined && Math.abs(byYear[0].year - input.year) <= 2) return byYear[0].number;
  }
  return valid.sort((a, b) => a.number - b.number)[0]?.number ?? null;
}

export function createTmdbArtworkProvider(fetchImpl: FetchLike, accessToken: string): ArtworkProvider {
  const token = accessToken.trim();
  return {
    id: 'tmdb',
    async lookup(input, signal) {
      if (!token || !input.title.trim()) return null;
      const type = expectedType(input.format);
      const names = [input.title, ...(input.alternateTitles ?? [])]
        .map((name) => name.trim()).filter((name, index, all) => name && all.findIndex((other) => normalize(other) === normalize(name)) === index)
        .slice(0, 3);

      let best: SearchRecord | null = null;
      let bestScore = 0;
      for (const name of names) {
        const url = new URL(`${API}/search/${type}`);
        url.searchParams.set('query', name.slice(0, 120));
        url.searchParams.set('include_adult', 'false');
        url.searchParams.set('language', 'en-US');
        url.searchParams.set('page', '1');
        let response: Response;
        try {
          response = await fetchImpl(url.toString(), {
            method: 'GET',
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
            signal,
          });
        } catch {
          throw new Error('TMDB request failed.');
        }
        if (response.status === 429) throw new Error('TMDB rate limit reached.');
        if (!response.ok) throw new Error(`TMDB returned HTTP ${response.status}.`);
        let body: unknown;
        try { body = await response.json(); } catch { throw new Error('TMDB returned invalid JSON.'); }
        const records = typeof body === 'object' && body !== null && Array.isArray((body as { results?: unknown }).results)
          ? (body as { results: unknown[] }).results : [];
        const candidate = chooseResult(records, { ...input, title: name }, type);
        if (candidate) {
          const candidateScore = scoreRecord(candidate, { ...input, title: name }, type);
          if (candidateScore > bestScore) { best = candidate; bestScore = candidateScore; }
          if (candidateScore >= 0.96) break;
        }
      }

      if (!best) return null;
      const id = Number(best.id);
      if (!Number.isSafeInteger(id) || id <= 0) return null;

      let posterUrl = imageUrl(best.poster_path, 'w500');
      let bannerUrl = imageUrl(best.backdrop_path, 'w1280');
      // Search results usually include a poster/backdrop. Ask the title's image endpoint
      // for alternate approved artwork when either slot is missing.
      if (!posterUrl || !bannerUrl) {
        const imagesUrl = new URL(`${API}/${type}/${id}/images`);
        imagesUrl.searchParams.set('include_image_language', 'en,null');
        try {
          const imagesResponse = await fetchImpl(imagesUrl.toString(), {
            method: 'GET',
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
            signal,
          });
          if (imagesResponse.ok) {
            const imagesBody: unknown = await imagesResponse.json();
            const images = typeof imagesBody === 'object' && imagesBody !== null ? imagesBody as ImageCollection : {};
            posterUrl ??= chooseImage(images.posters, 'w500');
            bannerUrl ??= chooseImage(images.backdrops, 'w1280');
          }
        } catch {
          // Keep the images already returned by search. The artwork layer must remain optional.
        }
      }
      // Search endpoints are useful for matching and images, but do not provide the
      // complete metadata needed by Kairo. Fetch the canonical TV/movie details record.
      let overview: string | null = null;
      let rating: number | null = null;
      let genres: string[] = [];
      let releaseYear: number | null = null;
      let episodeCount: number | null = null;
      const detailsUrl = new URL(`${API}/${type}/${id}`);
      detailsUrl.searchParams.set('language', 'en-US');
      try {
        const detailsResponse = await fetchImpl(detailsUrl.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
          signal,
        });
        if (detailsResponse.ok) {
          const rawDetails: unknown = await detailsResponse.json();
          const details: DetailRecord = typeof rawDetails === 'object' && rawDetails !== null && !Array.isArray(rawDetails)
            ? rawDetails as DetailRecord : {};
          if (typeof details.overview === 'string' && details.overview.trim()) overview = details.overview.trim();
          if (typeof details.vote_average === 'number' && Number.isFinite(details.vote_average)
            && details.vote_average >= 0 && details.vote_average <= 10) rating = details.vote_average;
          if (Array.isArray(details.genres)) {
            genres = details.genres
              .filter((genre): genre is { name: string } => typeof genre === 'object' && genre !== null
                && !Array.isArray(genre) && typeof (genre as { name?: unknown }).name === 'string')
              .map((genre) => genre.name.trim())
              .filter(Boolean);
          }
          releaseYear = recordYear(details as SearchRecord);
          if (type === 'tv' && typeof details.number_of_episodes === 'number'
            && Number.isInteger(details.number_of_episodes) && details.number_of_episodes >= 0) {
            episodeCount = details.number_of_episodes;
          }
          posterUrl ??= imageUrl(details.poster_path, 'w500');
          bannerUrl ??= imageUrl(details.backdrop_path, 'w1280');
        }
      } catch {
        // Details are additive: retain any matched artwork if the metadata request fails.
      }

      return { tmdbId: id, mediaType: type, posterUrl, bannerUrl, overview, rating, genres, releaseYear, episodeCount };
    },

    async episodeStills(artwork, input, signal) {
      if (artwork.mediaType !== 'tv' || !Number.isSafeInteger(artwork.tmdbId) || artwork.tmdbId <= 0) return {};
      const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
      try {
        const detailsUrl = new URL(`${API}/tv/${artwork.tmdbId}`);
        detailsUrl.searchParams.set('language', 'en-US');
        const detailsResponse = await fetchImpl(detailsUrl.toString(), { method: 'GET', headers, signal });
        if (!detailsResponse.ok) return {};
        const details: unknown = await detailsResponse.json();
        const seasons = typeof details === 'object' && details !== null ? (details as { seasons?: unknown }).seasons : undefined;
        const seasonNumber = chooseSeason(seasons, input);
        if (seasonNumber === null) return {};

        const seasonUrl = new URL(`${API}/tv/${artwork.tmdbId}/season/${seasonNumber}`);
        seasonUrl.searchParams.set('language', 'en-US');
        const seasonResponse = await fetchImpl(seasonUrl.toString(), { method: 'GET', headers, signal });
        if (!seasonResponse.ok) return {};
        const seasonBody: unknown = await seasonResponse.json();
        const rawEpisodes = typeof seasonBody === 'object' && seasonBody !== null ? (seasonBody as { episodes?: unknown }).episodes : undefined;
        if (!Array.isArray(rawEpisodes)) return {};
        const stills: Record<number, string> = {};
        for (const rawEpisode of rawEpisodes) {
          if (typeof rawEpisode !== 'object' || rawEpisode === null || Array.isArray(rawEpisode)) continue;
          const episode = rawEpisode as TmdbSeasonEpisode;
          const number = episode.episode_number;
          const still = imageUrl(episode.still_path, 'w780');
          if (typeof number === 'number' && Number.isInteger(number) && number > 0 && still) stills[number] = still;
        }
        return stills;
      } catch {
        // Episode artwork is optional and must never make the catalogue/episode API fail.
        return {};
      }
    },
  };
}

export { normalize as normalizeArtworkTitle, titleSimilarity };
