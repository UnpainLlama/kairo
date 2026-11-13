export const ROW_BUFFER = 3;        // rows to render above/below focused row
export const TILE_BUFFER = 2;       // tiles to render beyond visible edges
export const VISIBLE_TILES = 6;     // approximate tiles visible in viewport
export const TILE_STEP = 238;       // tile width (230) + gap (8)
export const DETAIL_BUTTON_COUNT = 3;
export const HERO_BUTTON_COUNT = 2; // Play, Add to List

// On-screen keyboard grid for search — every row has KEYBOARD_COLS items
export const KEYBOARD_COLS = 7;
export const KEYBOARD_GRID = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G',
  'H', 'I', 'J', 'K', 'L', 'M', 'N',
  'O', 'P', 'Q', 'R', 'S', 'T', 'U',
  'V', 'W', 'X', 'Y', 'Z', '0', '1',
  '2', '3', '4', '5', '6', '7', '8',
  '9', 'SPACE', '-', '.', '\'', 'DEL', 'CLR',
];
