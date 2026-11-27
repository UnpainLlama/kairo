/**
 * Sandbox policy for third-party playback frames.
 *
 * Scripts, same-origin APIs, forms and presentation are retained so embedded
 * players continue to work. Popups and top-level navigation are deliberately
 * not granted, preventing ad click-throughs from opening tabs or leaving Kairo.
 */
export const PLAYER_IFRAME_SANDBOX = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-presentation',
].join(' ');
