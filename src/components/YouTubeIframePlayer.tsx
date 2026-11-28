type Props = { videoId: string; title: string };

export default function YouTubeIframePlayer({ videoId, title }: Props) {
  const validVideoId = /^[A-Za-z0-9_-]{11}$/.test(videoId);
  if (!validVideoId) {
    return <div className="yt-iframe-player" role="alert">This YouTube video ID is invalid.</div>;
  }

  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&rel=0`;

  return (
    <div className="yt-iframe-player">
      <iframe
        className="yt-iframe-host"
        src={embedUrl}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
