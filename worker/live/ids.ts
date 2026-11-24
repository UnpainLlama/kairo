// Stable ids and slugs for live (database-free) titles.
// New live catalogue results use MyAnimeList IDs ("m1535").
// A slug is a readable prefix plus the id: "death-note-a1535". Only the trailing id matters when resolving.
export type RefKind = 'a' | 'm' | 'h';
export type Ref = { kind: RefKind; id: number; /** Provider slug for hianime references, when present in the public route. */ slug?: string };

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

/** Accepts provider ids such as a1535, m1535, h8 or slugs such as death-note-8-h8. */
export function parseRef(raw: string | undefined): Ref | null {
  if (raw === undefined) return null;
  const m = /^(?:([a-z0-9-]+)-)?([amh])(\d{1,9})$/.exec(raw);
  if (!m) return null;
  const id = Number(m[3]);
  if (id <= 0) return null;
  const kind = m[2] as RefKind;
  return kind === 'h' ? { kind, id, ...(m[1] ? { slug: m[1] } : {}) } : { kind, id };
}


/**
 * Convert a D1 cross-provider mapping into a live-catalogue ref for independent
 * episode discovery. MAL-native IDs are preferred.
 */
export function providerRefFromMappings(
  mappings: readonly { provider: string; externalId: string }[],
  preferredProviders: readonly string[] = ['mal'],
): string | null {
  for (const provider of preferredProviders) {
    const prefix = provider === 'anilist' ? 'a' : provider === 'mal' ? 'm' : null;
    if (!prefix) continue;
    const raw = mappings.find((item) => item.provider.toLowerCase() === provider)?.externalId;
    if (raw && /^[1-9][0-9]{0,8}$/.test(raw)) return prefix + raw;
  }
  return null;
}
