// Live AniList catalogue source (GraphQL, no key). Reuses the existing mapper and attribution from worker/metadata/providers/anilist.ts.
// Terms (docs.anilist.co/guide/terms-of-use): non-commercial or under $150/month; no use as storage or backup; no mass collection.
// So everything here is on demand, one page per request, and only ever held in the short-lived cache by service.ts.
import { positiveInt } from '../metadata/normalize';
import { ANILIST_ATTRIBUTION, mapAniListMedia } from '../metadata/providers/anilist';
import { asString, isObject, providerFetch, readJson, USER_AGENT, type FetchLike } from '../metadata/providers/http';
import { ProviderError } from '../metadata/types';
import { toLiveTitle } from './map';
import type { Ref } from './ids';
import type { BrowseQuery, CatalogSource, ListKind, LiveTitle, Paged } from './types';

const ENDPOINT = 'https://graphql.anilist.co';
const HOST = 'graphql.anilist.co';
const MAX_LIMIT = 50;

const FIELDS = `id idMal siteUrl isAdult title { romaji english native } synonyms description(asHtml: false) format status episodes season seasonYear
  startDate { year } genres averageScore coverImage { extraLarge large } bannerImage`;

const SORTS = { relevance: 'SEARCH_MATCH', popularity: 'POPULARITY_DESC', latest: 'START_DATE_DESC', rating: 'SCORE_DESC' } as const;
const FORMAT_IN = { series: ['TV', 'TV_SHORT'], movie: ['MOVIE'], ova: ['OVA'], ona: ['ONA'], special: ['SPECIAL'] } as const;
const STATUS = { airing: 'RELEASING', finished: 'FINISHED', upcoming: 'NOT_YET_RELEASED', hiatus: 'HIATUS' } as const;

type Vars = Record<string, unknown>;

/** Builds a Page query declaring only the variables that are set, so unset filters are never sent as null. */
export function buildPageQuery(filters: { name: string; gqlType: string; value: unknown; arg?: string }[], page: number, perPage: number): { query: string; variables: Vars } {
  const decl = ['$page: Int', '$perPage: Int'];
  const args: string[] = [];
  const variables: Vars = { page, perPage };
  for (const f of filters) {
    decl.push(`$${f.name}: ${f.gqlType}`);
    args.push(`${f.arg ?? f.name}: $${f.name}`);
    variables[f.name] = f.value;
  }
  const query = `query (${decl.join(', ')}) { Page(page: $page, perPage: $perPage) { pageInfo { total hasNextPage } media(type: ANIME, isAdult: false${args.length ? `, ${args.join(', ')}` : ''}) { ${FIELDS} } } }`;
  return { query, variables };
}

export function createAniListSource(fetchImpl: FetchLike, now: () => string = () => new Date().toISOString()): CatalogSource {
  async function gql(query: string, variables: Vars, signal: AbortSignal): Promise<Record<string, unknown>> {
    const res = await providerFetch(fetchImpl, ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ query, variables }),
      signal,
    }, HOST);
    const body = await readJson(res);
    const errors = isObject(body) && Array.isArray(body.errors) ? body.errors : [];
    const first = errors[0];
    if (res.status === 404 || (isObject(first) && first.status === 404)) throw new ProviderError('not_found', 'AniList has no matching title.');
    if (res.status === 400) throw new ProviderError('invalid_response', 'AniList rejected the query.');
    if (!res.ok || errors.length > 0) throw new ProviderError('unavailable', `AniList returned an error (${res.status}).`);
    if (!isObject(body) || !isObject(body.data)) throw new ProviderError('invalid_response', 'AniList returned no data object.');
    return body.data;
  }

  /** Maps raw media, dropping adult entries and any entry that does not parse. One bad item never fails a list. */
  function mapMany(raw: unknown[]): LiveTitle[] {
    const at = now();
    const out: LiveTitle[] = [];
    const seen = new Set<number>();
    for (const m of raw) {
      if (!isObject(m) || m.isAdult === true) continue;
      try {
        const meta = mapAniListMedia(m, at);
        const id = Number(meta.externalId);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(toLiveTitle(meta, 'anilist'));
      } catch { /* skip */ }
    }
    return out;
  }

  async function page(filters: Parameters<typeof buildPageQuery>[0], pageNo: number, limit: number, signal: AbortSignal): Promise<Paged> {
    const perPage = Math.min(Math.max(limit, 1), MAX_LIMIT);
    const { query, variables } = buildPageQuery(filters, pageNo, perPage);
    const data = await gql(query, variables, signal);
    const pg = isObject(data.Page) ? data.Page : null;
    if (!pg || !Array.isArray(pg.media)) throw new ProviderError('invalid_response', 'AniList returned no Page.');
    const info = isObject(pg.pageInfo) ? pg.pageInfo : {};
    const total = typeof info.total === 'number' && info.total >= 0 ? info.total : null;
    return { items: mapMany(pg.media), total, hasNextPage: info.hasNextPage === true, limit: perPage };
  }

  const byRefQuery = (ref: Ref, body: string) => ({
    query: `query ($id: Int) { Media(${ref.kind === 'a' ? 'id' : 'idMal'}: $id, type: ANIME) { ${body} } }`,
    variables: { id: ref.id } as Vars,
  });

  return {
    id: 'anilist',
    displayName: 'AniList',
    attribution: ANILIST_ATTRIBUTION,
    maxLimit: MAX_LIMIT,
    supports: (ref: Ref) => ref.kind === 'a' || ref.kind === 'm',

    async list(kind: ListKind, pageNo, limit, signal) {
      if (kind === 'featured') {
        // Fetch a wider page of trending titles and put the ones with banner art first, because the home hero is a wide banner.
        const wide = await page([{ name: 'sort', gqlType: '[MediaSort]', value: ['TRENDING_DESC'] }], 1, 30, signal);
        const withBanner = wide.items.filter((t) => t.card.bannerUrl);
        const rest = wide.items.filter((t) => !t.card.bannerUrl);
        const items = [...withBanner, ...rest].slice(0, Math.min(limit, 12));
        return { items, total: items.length, hasNextPage: false, limit: items.length };
      }
      if (kind === 'trending') return page([{ name: 'sort', gqlType: '[MediaSort]', value: ['TRENDING_DESC'] }], pageNo, limit, signal);
      return page([
        { name: 'status', gqlType: 'MediaStatus', value: 'RELEASING' },
        { name: 'sort', gqlType: '[MediaSort]', value: ['START_DATE_DESC'] },
      ], pageNo, limit, signal);
    },

    async browse(q: BrowseQuery, signal) {
      const f: Parameters<typeof buildPageQuery>[0] = [];
      const text = q.q?.trim();
      if (text) f.push({ name: 'search', gqlType: 'String', value: text.slice(0, 100) });
      if (q.genre) f.push({ name: 'genre', gqlType: 'String', value: q.genre });
      if (q.format) f.push({ name: 'format_in', gqlType: '[MediaFormat]', value: [...FORMAT_IN[q.format]] });
      if (q.status) f.push({ name: 'status', gqlType: 'MediaStatus', value: STATUS[q.status] });
      if (q.season) f.push({ name: 'season', gqlType: 'MediaSeason', value: q.season.toUpperCase() });
      if (q.year !== undefined) f.push({ name: 'seasonYear', gqlType: 'Int', value: q.year });
      const sort = q.sort === 'relevance' && !text ? 'POPULARITY_DESC' : SORTS[q.sort];
      f.push({ name: 'sort', gqlType: '[MediaSort]', value: [sort] });
      return page(f, q.page, q.limit, signal);
    },

    async genres(signal) {
      const data = await gql('query { GenreCollection }', {}, signal);
      const list = Array.isArray(data.GenreCollection) ? data.GenreCollection : null;
      if (!list) throw new ProviderError('invalid_response', 'AniList returned no genre list.');
      // AniList does not publish per-genre counts, so count is 0 and the UI omits it.
      return list.filter((g): g is string => typeof g === 'string' && g.trim() !== '' && !/^hentai$/i.test(g)).map((name) => ({ name, count: 0 }));
    },

    async byRef(ref, signal) {
      const { query, variables } = byRefQuery(ref, FIELDS);
      const data = await gql(query, variables, signal);
      const m = data.Media;
      if (!isObject(m) || m.isAdult === true) throw new ProviderError('not_found', 'AniList has no matching title.');
      return toLiveTitle(mapAniListMedia(m, now()), 'anilist');
    },

    async related(ref, limit, signal) {
      const n = Math.min(Math.max(limit, 1), 24);
      const { query, variables } = byRefQuery(ref, `relations { edges { node { type ${FIELDS} } } } recommendations(sort: RATING_DESC, perPage: ${n}) { nodes { mediaRecommendation { ${FIELDS} } } }`);
      const data = await gql(query, variables, signal);
      const m = data.Media;
      if (!isObject(m)) throw new ProviderError('not_found', 'AniList has no matching title.');
      const edges = isObject(m.relations) && Array.isArray(m.relations.edges) ? m.relations.edges : [];
      const nodes = isObject(m.recommendations) && Array.isArray(m.recommendations.nodes) ? m.recommendations.nodes : [];
      const raw: unknown[] = [
        ...edges.map((e) => (isObject(e) ? e.node : null)).filter((x) => isObject(x) && x.type === 'ANIME'),
        ...nodes.map((x) => (isObject(x) ? x.mediaRecommendation : null)),
      ];
      const selfId = positiveInt(m.id);
      return mapMany(raw).filter((t) => t.anilistId !== selfId && asString(t.card.title) !== null).slice(0, n);
    },
  };
}
