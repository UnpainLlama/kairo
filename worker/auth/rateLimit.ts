async function getBucketKey(clientKey:string,bucket:string):Promise<string>{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`kairo:rate-limit:${bucket}:${clientKey}`));return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');}
function validateRateLimit(clientKey:string,bucket:string,limit:number,windowMs:number):void{if(!clientKey||!bucket||!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(windowMs)||windowMs<1)throw new Error('Invalid rate-limit configuration.');}
export async function consumeRateLimit(db:D1Database,clientKey:string,bucket:string,limit:number,windowMs:number,now=Date.now()):Promise<boolean>{
  validateRateLimit(clientKey,bucket,limit,windowMs);const key=await getBucketKey(clientKey,bucket);
  const row=await db.prepare(`INSERT INTO auth_rate_limits(bucket_key,window_started_at,attempts) VALUES(?,?,1)
    ON CONFLICT(bucket_key) DO UPDATE SET attempts=CASE WHEN window_started_at<=? THEN 1 ELSE attempts+1 END,
    window_started_at=CASE WHEN window_started_at<=? THEN ? ELSE window_started_at END RETURNING attempts`)
    .bind(key,now,now-windowMs,now-windowMs,now).first<{attempts:number}>();
  return Number(row?.attempts??limit+1)<=limit;
}
/** Check an account/IP bucket without consuming an attempt. */
export async function isRateLimited(db:D1Database,clientKey:string,bucket:string,limit:number,windowMs:number,now=Date.now()):Promise<boolean>{
  validateRateLimit(clientKey,bucket,limit,windowMs);const key=await getBucketKey(clientKey,bucket);
  const row=await db.prepare('SELECT window_started_at AS windowStartedAt,attempts FROM auth_rate_limits WHERE bucket_key=? LIMIT 1').bind(key).first<{windowStartedAt:number;attempts:number}>();
  return Boolean(row&&Number(row.windowStartedAt)>now-windowMs&&Number(row.attempts)>=limit);
}
/** Only failed credentials increment the bucket, so successful use releases the IP/username pair. */
export async function recordRateLimitFailure(db:D1Database,clientKey:string,bucket:string,windowMs:number,now=Date.now()):Promise<void>{
  validateRateLimit(clientKey,bucket,1,windowMs);const key=await getBucketKey(clientKey,bucket);
  await db.prepare(`INSERT INTO auth_rate_limits(bucket_key,window_started_at,attempts) VALUES(?,?,1)
    ON CONFLICT(bucket_key) DO UPDATE SET attempts=CASE WHEN window_started_at<=? THEN 1 ELSE attempts+1 END,
    window_started_at=CASE WHEN window_started_at<=? THEN ? ELSE window_started_at END`).bind(key,now,now-windowMs,now-windowMs,now).run();
}
export async function clearRateLimit(db:D1Database,clientKey:string,bucket:string):Promise<void>{const key=await getBucketKey(clientKey,bucket);await db.prepare('DELETE FROM auth_rate_limits WHERE bucket_key=?').bind(key).run();}
