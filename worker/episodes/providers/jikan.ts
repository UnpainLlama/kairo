import { positiveInt } from '../../metadata/normalize';
import { ProviderError, type EpisodeLookup, type EpisodePage, type EpisodeProvider } from '../../metadata/types';
import { asString, isObject, providerFetch, readJson, USER_AGENT, type FetchLike } from '../../metadata/providers/http';
import { waitForJikanSlot } from '../../live/jikan';

const BASE = 'https://api.jikan.moe/v4';
const HOST = 'api.jikan.moe';

export function createJikanEpisodeProvider(fetchImpl: FetchLike, waitForSlot: () => Promise<void> = waitForJikanSlot): EpisodeProvider {
  async function get(malId: string, page: number, signal: AbortSignal): Promise<Record<string, unknown>> {
    const url = new URL(`${BASE}/anime/${malId}/episodes`);
    url.searchParams.set('page', String(page));
    await waitForSlot();
    const response = await providerFetch(fetchImpl, url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal,
    }, HOST);
    if (response.status === 404) throw new ProviderError('not_found', 'Jikan has no episode list for this title.');
    if (response.status === 400 || response.status === 422) throw new ProviderError('invalid_response', 'Jikan rejected the episode-list request.');
    if (!response.ok) throw new ProviderError('unavailable', `Jikan returned ${response.status}.`);
    const body = await readJson(response);
    if (!isObject(body)) throw new ProviderError('invalid_response', 'Jikan returned an unexpected episode-list body.');
    return body;
  }

  return {
    id: 'jikan',
    displayName: 'Jikan episode catalogue',
    termsVerified: false,
    async listEpisodes(lookup: EpisodeLookup, page: number, signal: AbortSignal): Promise<EpisodePage> {
      const malId = lookup.externalIds.mal;
      if (!malId || !/^\d+$/.test(malId)) throw new ProviderError('not_found', 'No MyAnimeList id is known for this title.');
      const body = await get(malId, page, signal);
      if (!Array.isArray(body.data)) throw new ProviderError('invalid_response', 'Jikan returned no episode array.');
      const items = body.data.flatMap((item) => {
        if (!isObject(item)) return [];
        const episodeNumber = positiveInt(item.mal_id);
        if (episodeNumber === null) return [];
        return [{
          episodeNumber,
          title: asString(item.title) ?? asString(item.title_romanji) ?? `Episode ${episodeNumber}`,
          airedAt: asString(item.aired),
          synopsis: '',
          durationSeconds: null,
        }];
      });
      const pagination = isObject(body.pagination) ? body.pagination : {};
      const pageItems = isObject(pagination.items) ? pagination.items : {};
      const total = typeof pageItems.total === 'number' && pageItems.total >= 0 ? pageItems.total : null;
      return { items, hasNextPage: pagination.has_next_page === true, total };
    },
  };
}
