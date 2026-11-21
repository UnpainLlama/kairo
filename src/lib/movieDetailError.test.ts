import { describe, expect, it } from 'vitest';
import { movieDetailErrorPresentation } from './movieDetailError';

describe('movie detail error presentation', () => {
  it('shows a not-found message for missing Movies IDs', () => {
    expect(movieDetailErrorPresentation({
      status: 404,
      code: 'MOVIE_NOT_FOUND',
      message: 'The requested movie was not found.',
    })).toEqual({
      title: 'Movie not found',
      message: 'This movie could not be found. Check the link or choose another title.',
    });
  });

  it('recognizes resource not found envelopes', () => {
    expect(movieDetailErrorPresentation({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'The requested resource was not found.',
    }).title).toBe('Movie not found');
  });

  it('keeps disabled and provider failures distinct from not-found', () => {
    expect(movieDetailErrorPresentation({
      status: 503,
      code: 'MOVIES_DISABLED',
      message: 'Movies metadata is not enabled.',
    }).title).toBe('Movies are not available yet');
    expect(movieDetailErrorPresentation({
      status: 503,
      code: 'MOVIES_UNAVAILABLE',
      message: 'Movie discovery is temporarily unavailable.',
    })).toEqual({
      title: 'Something went wrong',
      message: 'Movie discovery is temporarily unavailable.',
    });
  });

  it('treats an empty detail result as not found', () => {
    expect(movieDetailErrorPresentation(null).title).toBe('Movie not found');
  });
});
