import { describe, expect, it } from 'vitest';
import { createHiAnimeSource } from './hianime';
import { parseRef } from './ids';

const signal = new AbortController().signal;
const searchHtml = `<div class="flw-item"><div class="film-poster"><img data-src="https://cdn.test/death-note.jpg"></div><div class="film-detail"><h3><a class="film-name" href="/watch/death-note-8" title="Death Note">Death Note</a></h3><div class="fd-infor"><span class="fdi-item">TV</span><span class="fdi-item">37 eps</span><span class="fdi-item">2006</span></div></div></div>`;
const detailHtml = `<h2 class="film-name">Death Note</h2><div class="anisc-info"><div class="item">TV</div><div class="item">Released: 2006</div><div class="item">Status: Completed</div><a href="/genre/Psychological">Psychological</a><a href="/genre/Supernatural">Supernatural</a></div><div class="film-description">A student discovers a notebook that changes everything.</div><div class="anisc-poster"><img src="https://cdn.test/death-note-poster.jpg"></div><div class="film-stats"><span>Score: 8.6</span><span>37 eps</span></div>`;

const response = (html: string) => new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });

describe('HiAnime catalogue source', () => {
  it('uses hianime.at search and normalizes search cards', async () => {
    const calls: string[] = [];
    const source = createHiAnimeSource(async (url) => { calls.push(url); return response(searchHtml); }, 'https://hianime.at');
    const page = await source.browse({ q: 'Death Note', sort: 'relevance', page: 1, limit: 24 }, signal);
    expect(calls[0]).toBe('https://hianime.at/search?keyword=Death%20Note&page=1');
    expect(page.items[0]?.card).toMatchObject({ id: 'h8', slug: 'death-note-8-h8', title: 'Death Note', posterUrl: 'https://cdn.test/death-note.jpg', format: 'series', releaseYear: 2006, episodeCount: 37 });
    expect(page.items[0]?.url).toBe('https://hianime.at/watch/death-note-8');
  });

  it('resolves a detail route by its slug and parses synopsis, genres and score', async () => {
    const calls: string[] = [];
    const source = createHiAnimeSource(async (url) => { calls.push(url); return response(detailHtml); }, 'https://hianime.at');
    const ref = parseRef('death-note-8-h8');
    expect(ref).toEqual({ kind: 'h', id: 8, slug: 'death-note-8' });
    const title = await source.byRef(ref!, signal);
    expect(calls[0]).toBe('https://hianime.at/watch/death-note-8');
    expect(title.card).toMatchObject({ id: 'h8', title: 'Death Note', synopsis: 'A student discovers a notebook that changes everything.', status: 'finished', rating: 8.6, genres: ['Psychological', 'Supernatural'] });
  });

  it('rotates to the next configured mirror when the preferred mirror fails', async () => {
    const calls: string[] = [];
    const source = createHiAnimeSource(async (url) => {
      calls.push(url);
      if (url.startsWith('https://hianime.at')) return new Response('blocked', { status: 403 });
      return response(searchHtml);
    }, 'https://hianime.at');
    const page = await source.list('featured', 1, 12, signal);
    expect(calls[0]?.startsWith('https://hianime.at/most-popular')).toBe(true);
    expect(calls[1]?.startsWith('https://hianimez.to/most-popular')).toBe(true);
    expect(page.items[0]?.card.id).toBe('h8');
  });
});
