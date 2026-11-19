/** Small D1-backed rate limiter for expensive public API routes. Client identifiers are hashed before storage. */
export async function consumeRateLimit(
  db: D1Database,
  clientKey: string,
  bucket: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<boolean> {
  if (!clientKey || !bucket || !Number.isSafeInteger(limit) || limit < 1 ||
      !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new Error('Invalid rate-limit configuration.');
  }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`kairo:rate-limit:${bucket}:${clientKey}`),
  );
  const bucketKey = [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
  const row = await db.prepare(`
    INSERT INTO auth_rate_limits (bucket_key, window_started_at, attempts)
    VALUES (?, ?, 1)
    ON CONFLICT(bucket_key) DO UPDATE SET
      attempts = CASE
        WHEN window_started_at <= ? THEN 1
        ELSE attempts + 1
      END,
      window_started_at = CASE
        WHEN window_started_at <= ? THEN ?
        ELSE window_started_at
      END
    RETURNING attempts
  `).bind(bucketKey, now, now - windowMs, now - windowMs, now).first<{ attempts: number }>();
  return Number(row?.attempts ?? limit + 1) <= limit;
}
