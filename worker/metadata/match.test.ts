import { describe, it, expect } from 'vitest';
import { classify, pickBest, scoreMatch, type MatchSubject } from './match';

const s = (o: Partial<MatchSubject>): MatchSubject => ({ ids: {}, titles: [], year: null, format: null, episodeCount: null, ...o });

describe('scoreMatch', () => {
  it('treats a shared external id as certain, and a conflicting id for the same provider as certainly different', () => {
    expect(scoreMatch(s({ ids: { mal: '1' } }), s({ ids: { mal: '1', anilist: '9' } }))).toBe(1);
    expect(scoreMatch(s({ ids: { mal: '1' }, titles: ['Same'] }), s({ ids: { mal: '2' }, titles: ['Same'] }))).toBe(0);
  });
  it('accepts exact title + same year, and rejects title alone', () => {
    const a = s({ titles: ['Death Note'], year: 2006, format: 'series' });
    expect(classify(scoreMatch(a, s({ titles: ['death note'], year: 2006, format: 'series', episodeCount: 37 })))).toBe('match');
    expect(classify(scoreMatch(s({ titles: ['Death Note'] }), s({ titles: ['Death Note'] })))).toBe('ambiguous');
  });
  it('does not merge a movie with a series, or titles years apart', () => {
    expect(classify(scoreMatch(s({ titles: ['Haikyu'], year: 2014, format: 'series' }), s({ titles: ['Haikyu'], year: 2014, format: 'movie' })))).not.toBe('match');
    expect(scoreMatch(s({ titles: ['Haikyu'], year: 2014 }), s({ titles: ['Haikyu'], year: 2020 }))).toBe(0);
  });
  it('picks the best candidate but refuses ties', () => {
    const subject = s({ titles: ['Mushishi'], year: 2005, format: 'series' });
    const good = { n: 'a', m: s({ titles: ['Mushishi'], year: 2005, format: 'series' }) };
    const other = { n: 'b', m: s({ titles: ['Other'], year: 2005 }) };
    expect(pickBest(subject, [other, good], (c) => c.m)?.candidate.n).toBe('a');
    const twin = { n: 'c', m: s({ titles: ['Mushishi'], year: 2005, format: 'series' }) };
    expect(pickBest(subject, [good, twin], (c) => c.m)).toBeNull();
  });
});
