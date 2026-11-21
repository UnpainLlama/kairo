import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AccountUnavailablePage from './AccountUnavailablePage';

describe('AccountUnavailablePage', () => {
  it('explains that account data is locked and offers an actionable retry', () => {
    const markup = renderToStaticMarkup(createElement(AccountUnavailablePage, { onRetry: vi.fn() }));

    expect(markup).toContain('Account status unavailable');
    expect(markup).toContain('Your account and guest data stay locked');
    expect(markup).toContain('Check your connection, then retry');
    expect(markup).toContain('>Retry</button>');
  });
});
