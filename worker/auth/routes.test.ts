import { describe, expect, it } from 'vitest';
import { registerAuthRoutes } from './routes';

function registeredRoutes() {
  const routes = new Map<string, (context: any) => Promise<Response> | Response>();
  registerAuthRoutes({
    get: (route: string, handler: any) => routes.set(`GET ${route}`, handler),
    post: (route: string, handler: any) => routes.set(`POST ${route}`, handler),
    delete: (route: string, handler: any) => routes.set(`DELETE ${route}`, handler),
    use: () => undefined,
  } as any);
  return routes;
}

describe('Access-native Kairo authentication', () => {
  it('does not register public registration or username/password login routes', async () => {
    const routes = registeredRoutes();
    expect(routes.has('POST /api/v1/auth/register')).toBe(false);

    const login = routes.get('POST /api/v1/auth/login');
    expect(login).toBeDefined();
    const response = await login!({
      header: () => undefined,
      get: (name: string) => name === 'requestId' ? 'auth-test-request' : undefined,
      json: (body: unknown, status = 200) => new Response(JSON.stringify(body), {
        status, headers: { 'Content-Type': 'application/json' },
      }),
    });
    const payload = await response.json() as { success: boolean; error?: { code: string } };

    expect(response.status).toBe(410);
    expect(payload).toMatchObject({
      success: false,
      error: { code: 'ACCESS_SIGN_IN_ONLY' },
    });
  });

  it('keeps the administrator-only YouTube connection routes registered separately', () => {
    const routes = registeredRoutes();
    expect(routes.has('GET /api/v1/auth/youtube')).toBe(true);
  });
});
