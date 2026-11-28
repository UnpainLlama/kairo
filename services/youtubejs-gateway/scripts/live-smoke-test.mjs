import { appendFileSync, writeFileSync } from 'node:fs';

const gatewayUrl = (process.env.GATEWAY_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const gatewaySecret = process.env.GATEWAY_SECRET;
const kairoBaseUrl = process.env.KAIRO_BASE_URL?.replace(/\/+$/, '');
const queries = (process.env.SMOKE_QUERIES?.split('|').map((query) => query.trim()).filter(Boolean)) ?? ['astronomy', 'lofi music', 'typescript tutorial'];
const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const allowedHosts = ['i.ytimg.com', 'ytimg.com', 'ggpht.com'];

if (!gatewaySecret) throw new Error('GATEWAY_SECRET is required.');

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
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
  }
  throw lastError ?? new Error(`${label} failed without a response.`);
}

const reports = [];

const unauthenticated = await fetch(gatewayUrl + '/api/search?q=astronomy&limit=5');
const unauthenticatedPayload = await unauthenticated.json().catch(() => null);
assert(unauthenticated.status === 401 && unauthenticatedPayload?.error?.code === 'UNAUTHORIZED',
  'Gateway search must reject requests without the bearer secret.');

const invalidQueryUrl = new URL(gatewayUrl + '/api/search');
invalidQueryUrl.searchParams.set('q', 'x');
const invalidQuery = await fetch(invalidQueryUrl, {
  headers: { Authorization: 'Bearer ' + gatewaySecret },
});
const invalidQueryPayload = await invalidQuery.json().catch(() => null);
assert(invalidQuery.status === 400 && invalidQueryPayload?.error?.code === 'VALIDATION_ERROR',
  'Gateway search must reject invalid queries.');
console.log('PASS gateway access controls: missing bearer token and invalid query rejected');
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

const comparisons = [];
if (kairoBaseUrl) {
  const proxyUrl = new URL(kairoBaseUrl + '/api/v1/youtube/innertube/search');
  proxyUrl.searchParams.set('q', 'astronomy');
  proxyUrl.searchParams.set('limit', '10');
  const experimental = await requestJson(proxyUrl, { Accept: 'application/json' }, 'Kairo YouTube.js proxy');
  assert(experimental?.success === true, 'Kairo proxy did not return success.');
  assert(experimental?.meta?.provider === 'youtube.js', 'Kairo proxy did not identify youtube.js as its provider.');
  const experimentalVideos = experimental?.data?.videos;
  assert(Array.isArray(experimentalVideos) && experimentalVideos.length > 0, 'Kairo proxy returned no videos.');
  reports.push({ query: 'Kairo proxy: astronomy', count: experimentalVideos.length });
  console.log(`PASS Kairo proxy: ${experimentalVideos.length} videos returned from youtube.js`);

  // One official Data API search is used as a reference point; this consumes normal Data API quota.
  if (process.env.SKIP_OFFICIAL_COMPARISON !== 'true') {
  try {
    const officialUrl = new URL(kairoBaseUrl + '/api/v1/youtube/videos/search');
    officialUrl.searchParams.set('q', 'astronomy');
    officialUrl.searchParams.set('order', 'relevance');
    officialUrl.searchParams.set('duration', 'any');
    const official = await requestJson(officialUrl, { Accept: 'application/json' }, 'Official YouTube Data API reference search');
    const officialVideos = official?.data?.videos;
    assert(official?.success === true && Array.isArray(officialVideos), 'Official API reference search returned an unexpected payload.');
    const officialIds = new Set(officialVideos.map((video) => video.videoId).filter((id) => typeof id === 'string'));
    const experimentalIds = new Set(experimentalVideos.map((video) => video.videoId));
    const overlap = [...experimentalIds].filter((id) => officialIds.has(id)).length;
    comparisons.push({
      query: 'astronomy',
      youtubeJsCount: experimentalVideos.length,
      officialCount: officialVideos.length,
      overlap,
      youtubeJsTop: experimentalVideos.slice(0, 5).map((video) => video.title),
      officialTop: officialVideos.slice(0, 5).map((video) => video.title),
    });
    console.log(`REFERENCE comparison astronomy: YouTube.js ${experimentalVideos.length}, official API ${officialVideos.length}, shared IDs ${overlap}`);
  } catch (error) {
    comparisons.push({ query: 'astronomy', warning: error instanceof Error ? error.message : String(error) });
    console.log('WARNING official Data API comparison unavailable: ' + (error instanceof Error ? error.message : String(error)));
  }
  }
}

const report = { generatedAt: new Date().toISOString(), reports, comparisons };
writeFileSync('youtubejs-live-smoke-report.json', JSON.stringify(report, null, 2) + '\n');

const summary = [
  '### YouTube.js live search smoke test',
  '',
  ...reports.map((item) => `- PASS — ${item.query}: ${item.count} videos${item.firstTitle ? ` (first: ${item.firstTitle})` : ''}`),
  '',
  ...comparisons.map((item) => item.warning
    ? `- WARNING — Official API comparison unavailable: ${item.warning}`
    : `- Reference comparison — astronomy: YouTube.js ${item.youtubeJsCount}, official API ${item.officialCount}, shared video IDs ${item.overlap}`),
  '',
  ...comparisons.filter((item) => item.youtubeJsTop).flatMap((item) => [
    '**YouTube.js top five:**',
    ...item.youtubeJsTop.map((title, index) => `${index + 1}. ${title}`),
    '**Official Data API top five:**',
    ...item.officialTop.map((title, index) => `${index + 1}. ${title}`),
    '',
  ]),
  'Validated video IDs, titles, canonical watch URLs, duplicate IDs, and allowed thumbnail hosts.',
  '',
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log('All YouTube.js live smoke tests passed.');
