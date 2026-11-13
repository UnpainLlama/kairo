import { useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import type { RootState } from '../state/store';
import { FocusEngine } from '../engine/FocusEngine';
import { InputManager } from '../engine/InputManager';
import { setFocus } from '../state/slices/focusSlice';
import {
  openDetail,
  closeDetail,
  setDetailButtonIndex,
  setActivePage,
  setNavFocused,
  setNavIndex,
  appendSearchChar,
  deleteSearchChar,
  clearSearchQuery,
  setHeroFocused,
  setHeroButtonIndex,
  setDetailZone,
  setDetailSeasonIndex,
  setDetailEpisodeIndex,
} from '../state/slices/uiSlice';
import {
  setContent,
  setPageContent,
  switchPage,
  setSearchResults,
} from '../state/slices/contentSlice';
import { setLastNavAction, toggleTrailerMute, toggleTrailerPaused, setTrailerPaused, setTileTrailerPlaying, setActiveTrailer } from '../state/slices/trailerSlice';
import { toggleWatchlist, clearWatchlist } from '../state/slices/watchlistSlice';
import { clearAllAppData } from '../state/persistence';
import {
  selectRows,
  selectDetailOverlay,
  selectActivePage,
  selectNavFocused,
  selectNavIndex,
  selectSearchQuery,
  selectSearchResults,
  selectPageCache,
  selectHeroFocused,
  selectHeroButtonIndex,
  selectWatchlist,
} from '../state/selectors';
import { DETAIL_BUTTON_COUNT, HERO_BUTTON_COUNT, KEYBOARD_GRID, KEYBOARD_COLS } from '../utils/constants';
import { NAV_ITEMS } from '../data/pageConfigs';
import { PAGE_CONFIGS } from '../data/pageConfigs';
import { fetchRowsFromConfigs, fetchLogosProgressive, searchTmdb, getCachedSeasons, getCachedEpisodes } from '../data/tmdb';
import { generateMockContent } from '../data/mockContent';
import type { PageId } from '../state/slices/uiSlice';

const KEYBOARD_ROW_COUNT = Math.ceil(KEYBOARD_GRID.length / KEYBOARD_COLS);

function buildKeyboardRows() {
  const rows: { id: string; tileCount: number }[] = [];
  for (let r = 0; r < KEYBOARD_ROW_COUNT; r++) {
    const startIdx = r * KEYBOARD_COLS;
    const keysInRow = KEYBOARD_GRID.slice(startIdx, startIdx + KEYBOARD_COLS);
    rows.push({ id: `kb-row-${r}`, tileCount: keysInRow.length });
  }
  return rows;
}

export function useInputNavigation() {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const rows = useSelector(selectRows);
  const overlay = useSelector(selectDetailOverlay);
  const activePage = useSelector(selectActivePage);
  const navFocused = useSelector(selectNavFocused);
  const navIndex = useSelector(selectNavIndex);
  const searchQuery = useSelector(selectSearchQuery);
  const searchResults = useSelector(selectSearchResults);
  const pageCache = useSelector(selectPageCache);

  const heroFocused = useSelector(selectHeroFocused);
  const heroButtonIndex = useSelector(selectHeroButtonIndex);
  const watchlist = useSelector(selectWatchlist);

  const watchlistRef = useRef(watchlist);
  watchlistRef.current = watchlist;

  // Build engine row descriptors for the My List page
  const buildMyListRows = useCallback(() => {
    const state = store.getState();
    const profileId = state.profile.currentProfileId;
    const items = profileId ? (state.watchlist.byProfile[profileId] ?? []) : [];
    const row0 = items.length > 0
      ? { id: 'mylist-items', tileCount: items.length }
      : { id: 'mylist-cta', tileCount: 1 };
    return [row0, { id: 'mylist-clear', tileCount: 1 }];
  }, [store]);

  // Build engine row descriptors for a content page from current store state.
  // Always reads fresh from the store — never from a render-stale ref —
  // so navigation right after a page switch always sees the correct row shape.
  const buildContentRowsForPage = useCallback((pageId: PageId): Array<{id:string;tileCount:number}> => {
    const state = store.getState();
    const cached = state.content.pages[pageId];
    const rows = cached && cached.length > 0 ? cached : state.content.rows;
    return rows.map((r) => ({ id: r.id, tileCount: r.tiles.length }));
  }, [store]);

  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const activePageRef = useRef(activePage);
  activePageRef.current = activePage;
  const navFocusedRef = useRef(navFocused);
  navFocusedRef.current = navFocused;
  const navIndexRef = useRef(navIndex);
  navIndexRef.current = navIndex;
  const heroFocusedRef = useRef(heroFocused);
  heroFocusedRef.current = heroFocused;
  const heroButtonIndexRef = useRef(heroButtonIndex);
  heroButtonIndexRef.current = heroButtonIndex;
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;
  const pageCacheRef = useRef(pageCache);
  pageCacheRef.current = pageCache;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const searchResultsRef = useRef(searchResults);
  searchResultsRef.current = searchResults;

  const engineRef = useRef<FocusEngine | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const searchTimerRef = useRef<number | null>(null);

  const loadPage = useCallback(async (pageId: PageId) => {
    if (pageCacheRef.current[pageId]) {
      dispatch(switchPage(pageId));
      return;
    }

    if (pageId === 'myList' || pageId === 'search' || pageId === 'settings') return;

    const configs = PAGE_CONFIGS[pageId];
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
      } else {
        dispatch(setContent(generateMockContent()));
      }
    } catch {
      dispatch(setContent(generateMockContent()));
    }
  }, [dispatch]);

  const triggerSearch = useCallback((query: string) => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = window.setTimeout(async () => {
      if (query.trim()) {
        const results = await searchTmdb(query);
        dispatch(setSearchResults(results));
        // Update engine rows to include search results
        if (engineRef.current && activePageRef.current === 'search') {
          const kbRows = buildKeyboardRows();
          const resultRows = results.map((r) => ({ id: r.id, tileCount: r.tiles.length }));
          engineRef.current.setRows([...kbRows, ...resultRows]);
        }
        // Progressive logo loading for search results
        if (results.length > 0) {
          fetchLogosProgressive(results, (updated) => {
            if (activePageRef.current === 'search') {
              dispatch(setSearchResults(updated));
            }
          });
        }
      } else {
        dispatch(setSearchResults([]));
        // Reset engine to keyboard-only rows
        if (engineRef.current && activePageRef.current === 'search') {
          engineRef.current.setRows(buildKeyboardRows());
        }
      }
    }, 500);
  }, [dispatch]);

  // Engine + InputManager initialization — runs once
  useEffect(() => {
    const engine = new FocusEngine();
    const input = new InputManager();
    engineRef.current = engine;
    inputRef.current = input;

    engine.setNavItemCount(NAV_ITEMS.length);
    const activeIdx = NAV_ITEMS.findIndex((n) => n.id === activePageRef.current);
    engine.setNavRestoreIndex(activeIdx >= 0 ? activeIdx : 0);

    // Set initial rows based on current page
    if (activePageRef.current === 'search') {
      engine.setRows(buildKeyboardRows(), true);
      engine.setRowMemoryEnabled(false);
    } else if (activePageRef.current === 'myList') {
      engine.setRows(buildMyListRows(), true);
    } else {
      engine.setRows(buildContentRowsForPage(activePageRef.current));
      // Start on hero for content pages
      dispatch(setHeroFocused(true));
    }

    engine.onFocusChange((prev, next, action) => {
      // Track nav direction for directional shrink animations
      if (action === 'UP' || action === 'DOWN' || action === 'LEFT' || action === 'RIGHT') {
        dispatch(setLastNavAction(action));
        // Clear pause on any navigation so new tiles can auto-play
        dispatch(setTrailerPaused(false));
      }

      const page = activePageRef.current;
      const isContentPage = page !== 'search' && page !== 'myList';

      // Intercept: nav → row 0 on content pages → land on hero instead
      if (isContentPage && prev.rowIndex === -1 && next.rowIndex === 0 && action === 'DOWN') {
        engine.setPosition(prev); // revert engine position
        dispatch(setNavFocused(false));
        dispatch(setHeroFocused(true));
        dispatch(setTileTrailerPlaying(false));
        dispatch(setActiveTrailer(null));
        return;
      }

      // Intercept: row 0 → nav on content pages → land on hero instead
      if (isContentPage && prev.rowIndex === 0 && next.rowIndex === -1 && action === 'UP') {
        engine.setPosition(prev); // revert engine position
        dispatch(setHeroFocused(true));
        dispatch(setTileTrailerPlaying(false));
        dispatch(setActiveTrailer(null));
        return;
      }

      if (next.rowIndex === -1) {
        dispatch(setNavFocused(true));
        dispatch(setNavIndex(next.tileIndex));
      } else {
        dispatch(setNavFocused(false));
        dispatch(setFocus({ rowIndex: next.rowIndex, tileIndex: next.tileIndex }));
      }
    });

    engine.onSelect((pos) => {
      const ov = overlayRef.current;
      if (ov.open) return;

      if (pos.rowIndex === -1) {
        const navItem = NAV_ITEMS[pos.tileIndex];
        if (navItem) {
          dispatch(setActivePage(navItem.id));
          engine.setNavRestoreIndex(pos.tileIndex);
          if (navItem.id !== 'myList' && navItem.id !== 'search') {
            loadPage(navItem.id);
          }
          if (navItem.id === 'search') {
            dispatch(setSearchResults([]));
            dispatch(clearSearchQuery());
          }
          dispatch(setNavFocused(false));
          dispatch(setHeroFocused(false));

          // Content pages: land on hero. Other pages: land on row 0.
          const isContentPage = navItem.id !== 'search' && navItem.id !== 'myList';
          if (isContentPage) {
            dispatch(setHeroFocused(true));
            // Keep engine at row 0 so DOWN from hero moves to row 0
            engine.setPosition({ rowIndex: 0, tileIndex: 0 });
          } else {
            dispatch(setFocus({ rowIndex: 0, tileIndex: 0 }));
            engine.setPosition({ rowIndex: 0, tileIndex: 0 });
          }

          if (navItem.id === 'search') {
            engine.setRows(buildKeyboardRows(), true);
            engine.setRowMemoryEnabled(false);
            input.setRawKeyCallback((key: string) => {
              if (key === 'Backspace') {
                dispatch(deleteSearchChar());
                const newQuery = searchQueryRef.current.slice(0, -1);
                triggerSearch(newQuery);
              } else {
                dispatch(appendSearchChar(key.toLowerCase()));
                const newQuery = searchQueryRef.current + key.toLowerCase();
                triggerSearch(newQuery);
              }
            });
          } else if (navItem.id === 'myList') {
            engine.setRows(buildMyListRows(), true);
            engine.setRowMemoryEnabled(true);
            input.setRawKeyCallback(null);
          } else {
            // Read row shape directly from the store (never from render-stale refs)
            // so the engine has correct row counts immediately after page switch.
            engine.setRows(buildContentRowsForPage(navItem.id), true);
            engine.setRowMemoryEnabled(true);
            input.setRawKeyCallback(null);
          }
        }
        return;
      }

      // Handle search keyboard grid SELECT
      if (activePageRef.current === 'search') {
        if (pos.rowIndex < KEYBOARD_ROW_COUNT) {
          const keyIndex = pos.rowIndex * KEYBOARD_COLS + pos.tileIndex;
          const key = KEYBOARD_GRID[keyIndex];
          if (key !== undefined) {
            if (key === 'DEL') {
              dispatch(deleteSearchChar());
              const newQuery = searchQueryRef.current.slice(0, -1);
              triggerSearch(newQuery);
            } else if (key === 'CLR') {
              dispatch(clearSearchQuery());
              dispatch(setSearchResults([]));
              // Reset engine to keyboard-only
              engine.setRows(buildKeyboardRows());
            } else if (key === 'SPACE') {
              dispatch(appendSearchChar(' '));
              const newQuery = searchQueryRef.current + ' ';
              triggerSearch(newQuery);
            } else {
              dispatch(appendSearchChar(key.toLowerCase()));
              const newQuery = searchQueryRef.current + key.toLowerCase();
              triggerSearch(newQuery);
            }
          }
          return;
        }
        // Search result tile selected
        const resultRowIdx = pos.rowIndex - KEYBOARD_ROW_COUNT;
        const resultRow = searchResultsRef.current[resultRowIdx];
        const tile = resultRow?.tiles[pos.tileIndex];
        if (tile) { dispatch(openDetail(tile)); dispatch(setTrailerPaused(true)); }
        return;
      }

      // My List page
      if (activePageRef.current === 'myList') {
        // Row 1 = Clear All Saved Data button
        if (pos.rowIndex === 1) {
          const profileId = store.getState().profile.currentProfileId;
          if (profileId) dispatch(clearWatchlist(profileId));
          clearAllAppData();
          return;
        }
        // Row 0: tiles (if list non-empty) or Browse CTA (if empty)
        const items = watchlistRef.current;
        if (items.length > 0) {
          const tile = items[pos.tileIndex];
          if (tile) { dispatch(openDetail(tile)); dispatch(setTrailerPaused(true)); }
          return;
        }
        // Empty → Browse Content
        dispatch(setActivePage('home'));
        engine.setNavRestoreIndex(0);
        loadPage('home');
        dispatch(setFocus({ rowIndex: 0, tileIndex: 0 }));
        engine.setPosition({ rowIndex: 0, tileIndex: 0 });
        return;
      }

      // Normal tile select — read fresh from store, never from a render-stale ref
      const currentRows = store.getState().content.rows;
      const row = currentRows[pos.rowIndex];
      const tile = row?.tiles[pos.tileIndex];
      if (tile) { dispatch(openDetail(tile)); dispatch(setTrailerPaused(true)); }
    });

    engine.onBack(() => {
      if (overlayRef.current.open) {
        dispatch(closeDetail()); dispatch(setTrailerPaused(false));
      } else if (activePageRef.current === 'settings') {
        // BACK from settings page returns to home
        dispatch(setActivePage('home'));
        loadPage('home');
      }
    });

    input.start((action) => {
      // Read overlay state directly from the store every action so back-to-back
      // dispatches always see the latest values (overlayRef only updates on render).
      const ov = store.getState().ui.detailOverlay;
      if (ov.open) {
        const isTvShow = ov.tile?.mediaType === 'tv';
        const tvId = ov.tile?.tmdbId;
        const seasons = isTvShow && tvId ? getCachedSeasons(tvId) : [];
        const episodes = isTvShow && tvId ? getCachedEpisodes(tvId, seasons[ov.seasonIndex]?.seasonNumber ?? 1) : [];
        const hasSeasons = seasons.length > 0;
        const hasEpisodes = episodes.length > 0;

        if (action === 'BACK') {
          dispatch(closeDetail()); dispatch(setTrailerPaused(false));
          return;
        }

        // --- ZONE: BUTTONS (Play / Add / Like) ---
        if (ov.zone === 'buttons') {
          if (action === 'LEFT') {
            dispatch(setDetailButtonIndex(Math.max(0, ov.buttonIndex - 1)));
          } else if (action === 'RIGHT') {
            dispatch(setDetailButtonIndex(Math.min(DETAIL_BUTTON_COUNT - 1, ov.buttonIndex + 1)));
          } else if (action === 'DOWN' && hasSeasons) {
            dispatch(setDetailZone('seasons'));
          } else if (action === 'SELECT') {
            if (ov.buttonIndex === 1 && ov.tile) {
              const profileId = store.getState().profile.currentProfileId;
              if (profileId) dispatch(toggleWatchlist({ profileId, tile: ov.tile }));
            }
          }
          return;
        }

        // --- ZONE: SEASONS (tab row) ---
        if (ov.zone === 'seasons') {
          if (action === 'LEFT') {
            dispatch(setDetailSeasonIndex(Math.max(0, ov.seasonIndex - 1)));
          } else if (action === 'RIGHT') {
            dispatch(setDetailSeasonIndex(Math.min(seasons.length - 1, ov.seasonIndex + 1)));
          } else if (action === 'UP') {
            dispatch(setDetailZone('buttons'));
          } else if (action === 'DOWN' && hasEpisodes) {
            dispatch(setDetailZone('episodes'));
            dispatch(setDetailEpisodeIndex(0));
          } else if (action === 'SELECT' && hasEpisodes) {
            dispatch(setDetailZone('episodes'));
            dispatch(setDetailEpisodeIndex(0));
          }
          return;
        }

        // --- ZONE: EPISODES (vertical list) ---
        if (ov.zone === 'episodes') {
          if (action === 'UP') {
            if (ov.episodeIndex === 0) {
              dispatch(setDetailZone('seasons'));
            } else {
              dispatch(setDetailEpisodeIndex(ov.episodeIndex - 1));
            }
          } else if (action === 'DOWN') {
            dispatch(setDetailEpisodeIndex(Math.min(episodes.length - 1, ov.episodeIndex + 1)));
          }
          return;
        }
      }

      // Hero focused — handle navigation between hero buttons
      if (heroFocusedRef.current) {
        const page = activePageRef.current;
        const isContentPage = page !== 'search' && page !== 'myList';
        if (isContentPage) {
          if (action === 'LEFT') {
            dispatch(setHeroButtonIndex(Math.max(0, heroButtonIndexRef.current - 1)));
          } else if (action === 'RIGHT') {
            dispatch(setHeroButtonIndex(Math.min(HERO_BUTTON_COUNT - 1, heroButtonIndexRef.current + 1)));
          } else if (action === 'DOWN') {
            // Leave hero → go to first content row
            dispatch(setHeroFocused(false));
            dispatch(setFocus({ rowIndex: 0, tileIndex: 0 }));
            engine.setPosition({ rowIndex: 0, tileIndex: 0 });
          } else if (action === 'UP') {
            // Leave hero → go to nav
            dispatch(setHeroFocused(false));
            dispatch(setNavFocused(true));
            dispatch(setNavIndex(engine.getPosition().rowIndex === -1 ? engine.getPosition().tileIndex : 0));
            const navIdx = NAV_ITEMS.findIndex((n) => n.id === activePageRef.current);
            dispatch(setNavIndex(navIdx >= 0 ? navIdx : 0));
            engine.setPosition({ rowIndex: -1, tileIndex: navIdx >= 0 ? navIdx : 0 });
          } else if (action === 'SELECT') {
            // Hero button pressed — no-op for now (Play / Add to List)
          } else if (action === 'BACK') {
            // Leave hero → go to nav
            dispatch(setHeroFocused(false));
            dispatch(setNavFocused(true));
            const navIdx = NAV_ITEMS.findIndex((n) => n.id === activePageRef.current);
            dispatch(setNavIndex(navIdx >= 0 ? navIdx : 0));
            engine.setPosition({ rowIndex: -1, tileIndex: navIdx >= 0 ? navIdx : 0 });
          }
          return;
        }
      }

      engine.navigate(action);
    });

    // Set up raw key callback if starting on search page
    if (activePageRef.current === 'search') {
      input.setRawKeyCallback((key: string) => {
        if (key === 'Backspace') {
          dispatch(deleteSearchChar());
          const newQuery = searchQueryRef.current.slice(0, -1);
          triggerSearch(newQuery);
        } else {
          dispatch(appendSearchChar(key.toLowerCase()));
          const newQuery = searchQueryRef.current + key.toLowerCase();
          triggerSearch(newQuery);
        }
      });
    }

    // Global M key for mute, P key for pause
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') {
        dispatch(toggleTrailerMute());
      } else if (e.key === 'p' || e.key === 'P') {
        dispatch(toggleTrailerPaused());
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);

    return () => {
      input.dispose();
      window.removeEventListener('keydown', handleGlobalKeys);
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [dispatch, loadPage, triggerSearch, buildMyListRows, buildContentRowsForPage]); // Engine created once; rows synced via separate effect

  // Sync engine rows when content rows change (for content pages only)
  useEffect(() => {
    if (!engineRef.current) return;
    // Only update rows for content pages — search/myList manage their own rows
    if (activePageRef.current !== 'search' && activePageRef.current !== 'myList') {
      engineRef.current.setRows(
        rows.map((r) => ({ id: r.id, tileCount: r.tiles.length }))
      );
    }
  }, [rows]);

  // Sync engine rows on My List when watchlist changes
  useEffect(() => {
    if (!engineRef.current) return;
    if (activePageRef.current === 'myList') {
      engineRef.current.setRows(buildMyListRows());
    }
  }, [watchlist, buildMyListRows]);

  return engineRef;
}
