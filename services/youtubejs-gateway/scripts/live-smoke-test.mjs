import { appendFileSync } from 'node:fs';

const gatewayUrl = (process.env.GATEWAY_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const gatewaySecret = process.env.GATEWAY_SECRET;
const kairoBaseUrl = process.env.KAIRO_BASE_URL?.replace(/\/+$/, '');
const queries = ['astronomy', 'lofi music', 'typescript tutorial'];
const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const allowedHosts = ['i.ytimg.com', 'ytimg.com', 'ggpht.com'];

if (!gatewaySecret) {
  throw new Error('GATEWAY_SECRET is required.');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateThumbnail(value, query) {
  if (value === null || value === undefined) return;
  const url = new URL(value);
  const hostAllowed = allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith('.' + host));
  assert(url.protocol === 'https:' && hostAllowed && !url.username && !url.password && !url.port,
    `Unsafe thumbnail URL returned for "${query}".`);
}

async function requestJson(url, headers, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (response.ok) return payload;
      lastError = new Error(`${label} returned HTTP ${response.status} (attempt ${attempt}/3).`);
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  throw lastError ?? new Error(`${label} failed without a response.`);
}

const reports = [];
for (const query of queries) {
  const url = new URL(gatewayUrl + '/api/search');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '10');
  const payload = await requestJson(url, { Accept: 'application/json', Authorization: 'Bearer ' + gatewaySecret }, 'Gateway search');
  assert(payload?.success === true, `Gateway search failed for "${query}".`);
  assert(payload?.meta?.provider === 'youtube.js', `Unexpected provider for "${query}".`);
  const videos = payload?.data?.videos;
  assert(Array.isArray(videos) && videos.length > 0, `No videos returned for "${query}".`);

  const seen = new Set();
  for (const video of videos) {
    assert(video && videoIdPattern.test(video.videoId), `Invalid video ID returned for "${query}".`);
    assert(typeof video.title === 'string' && video.title.trim().length > 0, `Missing video title for "${query}".`);
    assert(video.url === 'https://www.youtube.com/watch?v=' + video.videoId, `Invalid watch URL for "${query}".`);
    assert(!seen.has(video.videoId), `Duplicate video ID returned for "${query}".`);
    seen.add(video.videoId);
    validateThumbnail(video.thumbnailUrl, query);
  }
  reports.push({ query, count: videos.length, firstTitle: videos[0].title });
  console.log(`PASS gateway search "${query}": ${videos.length} videos; first result: ${videos[0].title}`);
}

if (kairoBaseUrl) {
  const proxyUrl = new URL(kairoBaseUrl + '/api/v1/youtube/innertube/search');
  proxyUrl.searchParams.set('q', 'astronomy');
  proxyUrl.searchParams.set('limit', '10');
  const payload = await requestJson(proxyUrl, { Accept: 'application/json' }, 'Kairo staging proxy');
  assert(payload?.success === true, 'Kairo proxy did not return success.');
  assert(payload?.meta?.provider === 'youtube.js', 'Kairo proxy did not identify youtube.js as its provider.');
  assert(Array.isArray(payload?.data?.videos) && payload.data.videos.length > 0, 'Kairo proxy returned no videos.');
  reports.push({ query: 'Kairo proxy: astronomy', count: payload.data.videos.length });
  console.log(`PASS Kairo proxy: ${payload.data.videos.length} videos returned from youtube.js`);
}

const summary = [
  '### YouTube.js live search smoke test',
  '',
  ...reports.map((item) => `- PASS — ${item.query}: ${item.count} videos${item.firstTitle ? ` (first: ${item.firstTitle})` : ''}`),
  '',
  'Validated video IDs, titles, canonical watch URLs, duplicate IDs, and allowed thumbnail hosts.',
  '',
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log('All YouTube.js live smoke tests passed.');
