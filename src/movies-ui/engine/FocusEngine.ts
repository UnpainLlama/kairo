export type NavigationAction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'SELECT' | 'BACK';

export interface FocusPosition {
  rowIndex: number; // -1 = nav bar, 0+ = content rows
  tileIndex: number;
}

export interface RowDescriptor {
  id: string;
  tileCount: number;
}

export interface FocusEngineState {
  position: FocusPosition;
  rowMemory: Record<number, number>;
}

export type FocusChangeCallback = (
  prev: FocusPosition,
  next: FocusPosition,
  action: NavigationAction
) => void;

export class FocusEngine {
  private position: FocusPosition = { rowIndex: 0, tileIndex: 0 };
  private rowMemory: Record<number, number> = {};
  private rows: RowDescriptor[] = [];
  private navItemCount = 0;
  private navRestoreIndex = 0;
  private rowMemoryEnabled = true;
  private listeners: FocusChangeCallback[] = [];
  private selectListeners: Array<(pos: FocusPosition) => void> = [];
  private backListeners: Array<() => void> = [];

  getPosition(): FocusPosition {
    return { ...this.position };
  }

  getState(): FocusEngineState {
    return {
      position: { ...this.position },
      rowMemory: { ...this.rowMemory },
    };
  }

  getRows(): RowDescriptor[] {
    return this.rows;
  }

  setRows(rows: RowDescriptor[], clearMemory = false): void {
    this.rows = rows;
    if (clearMemory) {
      this.rowMemory = {};
    }
    // Clamp current position if rows changed
    if (this.position.rowIndex >= 0) {
      if (this.position.rowIndex >= rows.length) {
        this.position.rowIndex = Math.max(0, rows.length - 1);
      }
      if (rows.length > 0) {
        const maxTile = rows[this.position.rowIndex].tileCount - 1;
        if (this.position.tileIndex > maxTile) {
          this.position.tileIndex = Math.max(0, maxTile);
        }
      }
    }
  }

  setNavItemCount(count: number): void {
    this.navItemCount = count;
  }

  setNavRestoreIndex(index: number): void {
    this.navRestoreIndex = index;
  }

  setRowMemoryEnabled(enabled: boolean): void {
    this.rowMemoryEnabled = enabled;
  }

  setPosition(pos: FocusPosition): void {
    this.position = { ...pos };
  }

  onFocusChange(cb: FocusChangeCallback): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  onSelect(cb: (pos: FocusPosition) => void): () => void {
    this.selectListeners.push(cb);
    return () => {
      this.selectListeners = this.selectListeners.filter((l) => l !== cb);
    };
  }

  onBack(cb: () => void): () => void {
    this.backListeners.push(cb);
    return () => {
      this.backListeners = this.backListeners.filter((l) => l !== cb);
    };
  }

  navigate(action: NavigationAction): void {
    if (this.rows.length === 0 && this.position.rowIndex >= 0) return;

    if (action === 'SELECT') {
      this.selectListeners.forEach((cb) => cb(this.getPosition()));
      return;
    }

    if (action === 'BACK') {
      this.backListeners.forEach((cb) => cb());
      return;
    }

    const prev = this.getPosition();
    const next = this.computeNext(action);

    if (next.rowIndex === prev.rowIndex && next.tileIndex === prev.tileIndex) {
      return; // No movement — at edge
    }

    this.position = next;
    this.listeners.forEach((cb) => cb(prev, next, action));
  }

  private computeNext(action: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'): FocusPosition {
    const { rowIndex, tileIndex } = this.position;

    // Nav bar row (rowIndex === -1)
    if (rowIndex === -1) {
      switch (action) {
        case 'LEFT':
          return { rowIndex: -1, tileIndex: Math.max(0, tileIndex - 1) };
        case 'RIGHT':
          return { rowIndex: -1, tileIndex: Math.min(this.navItemCount - 1, tileIndex + 1) };
        case 'DOWN': {
          // Move from nav to first content row
          if (this.rows.length === 0) return { rowIndex: -1, tileIndex };
          const remembered = this.rowMemory[0] ?? 0;
          return {
            rowIndex: 0,
            tileIndex: Math.min(remembered, this.rows[0].tileCount - 1),
          };
        }
        case 'UP':
          return { rowIndex: -1, tileIndex }; // Already at top
      }
    }

    const currentRow = this.rows[rowIndex];

    switch (action) {
      case 'LEFT':
        return {
          rowIndex,
          tileIndex: Math.max(0, tileIndex - 1),
        };

      case 'RIGHT':
        return {
          rowIndex,
          tileIndex: Math.min(currentRow.tileCount - 1, tileIndex + 1),
        };

      case 'UP': {
        if (rowIndex === 0) {
          // Move to nav bar — use the stored nav index (active page)
          if (this.navItemCount > 0) {
            if (this.rowMemoryEnabled) this.rowMemory[0] = tileIndex;
            return { rowIndex: -1, tileIndex: this.navRestoreIndex };
          }
          return { rowIndex, tileIndex };
        }
        const upRow = rowIndex - 1;
        const upTarget = this.rows[upRow];
        if (this.rowMemoryEnabled) {
          this.rowMemory[rowIndex] = tileIndex;
          const remembered = this.rowMemory[upRow] ?? tileIndex;
          return {
            rowIndex: upRow,
            tileIndex: Math.min(remembered, upTarget.tileCount - 1),
          };
        }
        // No row memory: just clamp current column to new row
        return {
          rowIndex: upRow,
          tileIndex: Math.min(tileIndex, upTarget.tileCount - 1),
        };
      }

      case 'DOWN': {
        if (rowIndex >= this.rows.length - 1) return { rowIndex, tileIndex };
        const downRow = rowIndex + 1;
        const downTarget = this.rows[downRow];
        if (this.rowMemoryEnabled) {
          this.rowMemory[rowIndex] = tileIndex;
          const remembered = this.rowMemory[downRow] ?? tileIndex;
          return {
            rowIndex: downRow,
            tileIndex: Math.min(remembered, downTarget.tileCount - 1),
          };
        }
        // No row memory: just clamp current column to new row
        return {
          rowIndex: downRow,
          tileIndex: Math.min(tileIndex, downTarget.tileCount - 1),
        };
      }
    }
  }
}
