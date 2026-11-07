// Stable ids and slugs for live (database-free) titles.
// A title id is a provider letter plus that provider's numeric id: "a1535" (AniList) or "m1535" (MyAnimeList, served by Jikan).
// A slug is a readable prefix plus the id: "death-note-a1535". Only the trailing id matters when resolving.
export type RefKind = 'a' | 'm';
export type Ref = { kind: RefKind; id: number };

export function slugify(title: string): string {
  const s = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return s === '' ? 'anime' : s;
}

export const makeId = (kind: RefKind, id: number): string => `${kind}${id}`;
export const makeSlug = (title: string, kind: RefKind, id: number): string => `${slugify(title)}-${kind}${id}`;

/** Accepts "a1535", "m1535" or "death-note-a1535". Anything else is null. */
export function parseRef(raw: string | undefined): Ref | null {
  if (raw === undefined) return null;
  const m = /^(?:[a-z0-9-]*-)?([am])(\d{1,9})$/.exec(raw);
  if (!m) return null;
  const id = Number(m[2]);
  return id > 0 ? { kind: m[1] as RefKind, id } : null;
}
