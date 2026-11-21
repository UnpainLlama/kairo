import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccountProvider } from './AccountProvider';

describe('AccountProvider initial bootstrap gate', () => {
  it('does not mount protected page children before the first /me lookup completes', () => {
    const markup = renderToStaticMarkup(createElement(
      AccountProvider,
      null,
      createElement('div', { id: 'protected-page' }, 'Protected page content'),
    ));

    expect(markup).toContain('Checking your Kairo session');
    expect(markup).not.toContain('protected-page');
    expect(markup).not.toContain('Protected page content');
  });
});
