import { Innertube } from 'youtubei.js';

const cookie = process.env.YOUTUBE_COOKIE?.trim();
const maxPages = Math.min(5, Math.max(1, Number.parseInt(process.env.YOUTUBE_MAX_PAGES ?? '2', 10) || 2));
const jsonOutput = process.argv.includes('--json');

if (!cookie) {
  console.error('Missing YOUTUBE_COOKIE environment variable.');
  console.error('Set it in your local shell only. Do not paste it into chat, commit it, or add it to Kairo/Cloudflare.');
  process.exit(1);
}

function toPlainText(value) {
  if (value == null) return '';
  return typeof value.toString === 'function' ? value.toString() : String(value);
}

function normalizeVideo(video) {
  const videoId = video.video_id ?? video.id;
  const thumbnail = video.best_thumbnail?.url ?? video.thumbnails?.[0]?.url ?? null;

  return {
    videoId,
    title: toPlainText(video.title),
    channelTitle: toPlainText(video.author?.name),
    published: toPlainText(video.published),
    viewCount: toPlainText(video.short_view_count ?? video.view_count),
    duration: video.duration?.text ?? video.length_text?.toString?.() ?? null,
    isLive: Boolean(video.is_live),
    thumbnail,
    url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
    embedUrl: videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null
  };
}

try {
  console.log('Connecting to YouTube using YouTube.js…');
  const innertube = await Innertube.create({ cookie });
  console.log('Session initialized. Fetching subscriptions feed…');

  let feed = await innertube.getSubscriptionsFeed();
  const videosById = new Map();

  for (let page = 1; page <= maxPages; page += 1) {
    const videos = feed.videos ?? [];
    for (const video of videos) {
      const item = normalizeVideo(video);
      if (item.videoId) videosById.set(item.videoId, item);
    }

    console.log(`Fetched page ${page}: ${videos.length} videos (${videosById.size} unique total)`);

    if (page === maxPages || !feed.has_continuation) break;
    feed = await feed.getContinuation();
  }

  const videos = [...videosById.values()];
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify({ count: videos.length, videos }, null, 2)}\n`);
  } else {
    console.log('');
    if (videos.length === 0) {
      console.log('The subscriptions feed returned no video entries.');
    } else {
      console.table(videos.map(({ title, channelTitle, published, duration, isLive, url }) => ({
        title, channel: channelTitle, published, duration, live: isLive, url
      })));
    }
    console.log(`\nSuccess: retrieved ${videos.length} unique subscription videos.`);
    console.log('No feed data or account credentials were written to disk.');
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('\nYouTube.js feed request failed:', message);
  console.error('Common causes include an expired/incomplete cookie, account verification, or YouTube blocking the request IP.');
  process.exitCode = 1;
}
