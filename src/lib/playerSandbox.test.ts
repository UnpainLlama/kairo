import { describe, expect, it } from 'vitest';
import { PLAYER_IFRAME_SANDBOX } from './playerSandbox';

describe('third-party player iframe sandbox', () => {
  const tokens = PLAYER_IFRAME_SANDBOX.split(/\s+/);

  it('keeps the capabilities required by embedded video players', () => {
    expect(tokens).toContain('allow-scripts');
    expect(tokens).toContain('allow-same-origin');
    expect(tokens).toContain('allow-forms');
    expect(tokens).toContain('allow-presentation');
  });

  it('does not grant popup or top-level navigation privileges', () => {
    expect(tokens).not.toContain('allow-popups');
    expect(tokens).not.toContain('allow-popups-to-escape-sandbox');
    expect(tokens).not.toContain('allow-top-navigation');
    expect(tokens).not.toContain('allow-top-navigation-by-user-activation');
    expect(tokens).not.toContain('allow-downloads');
  });
});
