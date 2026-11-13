import { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setActivePage, type PageId } from '../state/slices/uiSlice';
import { setContent, setPageContent, switchPage, setSearchResults } from '../state/slices/contentSlice';
import { selectPageCache } from '../state/selectors';
import { PAGE_CONFIGS } from '../data/pageConfigs';
import { fetchRowsFromConfigs, fetchLogosProgressive } from '../data/tmdb';

export function usePageLoader() {
  const dispatch = useDispatch();
  const pageCache = useSelector(selectPageCache);
  const activePageRef = useRef<PageId>('home');

  const loadPage = useCallback(async (pageId: PageId) => {
    activePageRef.current = pageId;
    dispatch(setActivePage(pageId));

    if (pageId === 'search') {
      dispatch(setSearchResults([]));
      return;
    }
    if (pageId === 'myList' || pageId === 'settings') return;

    if (pageCache[pageId]) {
      dispatch(switchPage(pageId));
      return;
    }

    const configs = PAGE_CONFIGS[pageId as keyof typeof PAGE_CONFIGS];
    if (!configs) return;

    try {
      const fetchedRows = await fetchRowsFromConfigs(configs);
      if (fetchedRows.length > 0) {
        dispatch(setPageContent({ page: pageId, rows: fetchedRows }));
        dispatch(setContent(fetchedRows));
        fetchLogosProgressive(fetchedRows, (updated) => {
          dispatch(setPageContent({ page: pageId, rows: updated }));
          if (activePageRef.current === pageId) {
            dispatch(setContent(updated));
          }
        });
      }
    } catch {
      // Keep existing content on failure
    }
  }, [dispatch, pageCache]);

  return loadPage;
}
