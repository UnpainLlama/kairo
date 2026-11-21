import type { ApiError } from './api';

export type MovieDetailError = Pick<ApiError, 'status' | 'code' | 'message'> | null;

export function movieDetailErrorPresentation(error: MovieDetailError) {
  if (error?.code === 'MOVIES_DISABLED') {
    return {
      title: 'Movies are not available yet',
      message: error.message,
    };
  }
  if (!error || error.status === 404 || error.code === 'MOVIE_NOT_FOUND' || error.code === 'RESOURCE_NOT_FOUND') {
    return {
      title: 'Movie not found',
      message: 'This movie could not be found. Check the link or choose another title.',
    };
  }
  return {
    title: 'Something went wrong',
    message: error.message,
  };
}
