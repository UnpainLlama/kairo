import { Hono } from 'hono';
import { registerYouTubeAuthRoutes } from './youtube';

const fail = (c: any, status: number, code: string, message: string) =>
  c.json({ success: false, error: { code, message }, meta: { requestId: c.get('requestId') } }, status);

/**
 * Kairo no longer accepts a second username/password login.
 * Cloudflare Access verifies the approved email at the perimeter; /api/v1/me
 * creates the internal Kairo session automatically from that signed identity.
 */
export function registerAuthRoutes(app: Hono<any>) {
  app.post('/api/v1/auth/login', (c: any) => {
    c.header('Cache-Control', 'no-store');
    return fail(c, 410, 'ACCESS_SIGN_IN_ONLY', 'Kairo sign-in uses your approved Cloudflare Access email. No separate Kairo username or password is required.');
  });

  registerYouTubeAuthRoutes(app);
}
