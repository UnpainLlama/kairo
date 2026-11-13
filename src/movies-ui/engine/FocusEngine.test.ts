import { describe, it, expect } from 'vitest';
import { FocusEngine, type FocusPosition, type NavigationAction } from './FocusEngine';

const mkRows = (counts: number[]) =>
  counts.map((c, i) => ({ id: `row-${i}`, tileCount: c }));

const setup = (rows: number[], navItems = 6) => {
  const e = new FocusEngine();
  e.setNavItemCount(navItems);
  e.setRows(mkRows(rows));
  return e;
};

const nav = (e: FocusEngine, ...actions: NavigationAction[]) => {
  actions.forEach((a) => e.navigate(a));
  return e.getPosition();
};

describe('FocusEngine — horizontal navigation', () => {
  it('moves right within row bounds', () => {
    const e = setup([5]);
    expect(nav(e, 'RIGHT')).toEqual({ rowIndex: 0, tileIndex: 1 });
    expect(nav(e, 'RIGHT', 'RIGHT')).toEqual({ rowIndex: 0, tileIndex: 3 });
  });

  it('clamps at right edge', () => {
    const e = setup([3]);
    nav(e, 'RIGHT', 'RIGHT', 'RIGHT', 'RIGHT', 'RIGHT');
    expect(e.getPosition()).toEqual({ rowIndex: 0, tileIndex: 2 });
  });

  it('clamps at left edge', () => {
    const e = setup([3]);
    nav(e, 'LEFT', 'LEFT');
    expect(e.getPosition()).toEqual({ rowIndex: 0, tileIndex: 0 });
  });
});

describe('FocusEngine — vertical navigation', () => {
  it('moves down through rows', () => {
    const e = setup([5, 5, 5]);
    expect(nav(e, 'DOWN')).toEqual({ rowIndex: 1, tileIndex: 0 });
    expect(nav(e, 'DOWN')).toEqual({ rowIndex: 2, tileIndex: 0 });
  });

  it('clamps at bottom row', () => {
    const e = setup([5, 5]);
    nav(e, 'DOWN', 'DOWN', 'DOWN');
    expect(e.getPosition().rowIndex).toBe(1);
  });

  it('moves up to nav bar from row 0', () => {
    const e = setup([5, 5]);
    expect(nav(e, 'UP')).toEqual({ rowIndex: -1, tileIndex: 0 });
  });

  it('preserves column when moving vertically with row memory', () => {
    const e = setup([10, 10, 10]);
    nav(e, 'RIGHT', 'RIGHT', 'RIGHT'); // col 3
    nav(e, 'DOWN');
    expect(e.getPosition()).toEqual({ rowIndex: 1, tileIndex: 3 });
  });

  it('clamps column to shorter target row', () => {
    const e = setup([10, 2, 10]);
    nav(e, 'RIGHT', 'RIGHT', 'RIGHT', 'RIGHT', 'RIGHT'); // col 5
    nav(e, 'DOWN');
    expect(e.getPosition()).toEqual({ rowIndex: 1, tileIndex: 1 });
  });
});

describe('FocusEngine — page transitions (the My-List → Home regression)', () => {
  it('rebuilds rows cleanly when swapping from a 2-row page back to a 12-row page', () => {
    // Start on a content page: 12 rows × 20 tiles
    const e = setup([20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 18]);
    nav(e, 'DOWN', 'DOWN', 'RIGHT', 'RIGHT'); // {2,2}

    // Switch to MyList-like state: 2 rows × 1 tile, position reset
    e.setRows(mkRows([1, 1]), true);
    e.setPosition({ rowIndex: 0, tileIndex: 0 });
    expect(nav(e, 'DOWN')).toEqual({ rowIndex: 1, tileIndex: 0 });
    expect(nav(e, 'RIGHT')).toEqual({ rowIndex: 1, tileIndex: 0 }); // no col 1

    // Switch back to content page rows
    e.setRows(mkRows([20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 18]), true);
    e.setPosition({ rowIndex: 0, tileIndex: 0 });

    // Should be able to move freely again
    expect(nav(e, 'RIGHT')).toEqual({ rowIndex: 0, tileIndex: 1 });
    expect(nav(e, 'DOWN')).toEqual({ rowIndex: 1, tileIndex: 1 });
    expect(nav(e, 'DOWN', 'DOWN', 'DOWN')).toEqual({ rowIndex: 4, tileIndex: 1 });
    nav(e, 'RIGHT', 'RIGHT', 'RIGHT', 'RIGHT', 'RIGHT');
    expect(e.getPosition().tileIndex).toBe(6);
  });

  it('clamps stale position when shrinking row count', () => {
    const e = setup([20, 20, 20]);
    nav(e, 'DOWN', 'DOWN', 'RIGHT', 'RIGHT', 'RIGHT'); // {2,3}
    e.setRows(mkRows([2])); // shrink dramatically
    expect(e.getPosition().rowIndex).toBe(0);
    expect(e.getPosition().tileIndex).toBeLessThanOrEqual(1);
  });

  it('survives setRows with empty array then a real array (initial-load race)', () => {
    const e = new FocusEngine();
    e.setNavItemCount(6);
    e.setRows([]); // initial mount before content arrives
    e.setRows(mkRows([20, 20, 20])); // content arrives
    expect(nav(e, 'RIGHT')).toEqual({ rowIndex: 0, tileIndex: 1 });
    expect(nav(e, 'DOWN')).toEqual({ rowIndex: 1, tileIndex: 1 });
  });

  it('does not retain row memory across clearMemory=true', () => {
    const e = setup([10, 10, 10]);
    nav(e, 'RIGHT', 'RIGHT', 'RIGHT', 'RIGHT', 'RIGHT'); // col 5
    nav(e, 'DOWN'); // row memory: row 0 = 5
    e.setRows(mkRows([10, 10, 10]), true); // clear memory
    e.setPosition({ rowIndex: 0, tileIndex: 0 });
    nav(e, 'DOWN');
    // No memory → should land on col 0, not col 5
    expect(e.getPosition()).toEqual({ rowIndex: 1, tileIndex: 0 });
  });
});

describe('FocusEngine — nav bar interactions', () => {
  it('moves between nav items', () => {
    const e = setup([5, 5]);
    nav(e, 'UP'); // to nav
    expect(e.getPosition()).toEqual({ rowIndex: -1, tileIndex: 0 });
    nav(e, 'RIGHT', 'RIGHT', 'RIGHT');
    expect(e.getPosition()).toEqual({ rowIndex: -1, tileIndex: 3 });
  });

  it('clamps nav at right edge', () => {
    const e = setup([5], 6);
    nav(e, 'UP');
    for (let i = 0; i < 20; i++) e.navigate('RIGHT');
    expect(e.getPosition()).toEqual({ rowIndex: -1, tileIndex: 5 });
  });

  it('returns from nav to row 0 on DOWN', () => {
    const e = setup([5, 5]);
    nav(e, 'UP', 'RIGHT', 'RIGHT'); // nav idx 2
    nav(e, 'DOWN');
    expect(e.getPosition().rowIndex).toBe(0);
  });
});

describe('FocusEngine — onFocusChange notifications', () => {
  it('fires for each successful move and skips no-ops', () => {
    const e = setup([3, 3]);
    const calls: Array<[FocusPosition, FocusPosition, NavigationAction]> = [];
    e.onFocusChange((p, n, a) => calls.push([p, n, a]));
    nav(e, 'RIGHT', 'RIGHT'); // 2 moves
    nav(e, 'RIGHT'); // clamped — no fire
    nav(e, 'DOWN'); // 1 move
    expect(calls.length).toBe(3);
    expect(calls[0][2]).toBe('RIGHT');
    expect(calls[2][2]).toBe('DOWN');
  });
});
