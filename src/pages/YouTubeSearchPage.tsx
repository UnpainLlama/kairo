import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, Check, Plus, Search, Youtube } from 'lucide-react';

type ChannelResult = { channelId: string; title: string; description: string; thumbnailUrl: string | null; url: string; isAdded: boolean };
type SearchError = { code: string; message: string };

export default function YouTubeSearchPage() {
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [channels, setChannels] = useState<ChannelResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<SearchError | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const searchFor = useCallback(async (term: string) => {
    if (term.length < 2 || term.length > 80) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    setSearched(true);
    try {
      const response = await fetch('/api/v1/youtube/channels/search?q=' + encodeURIComponent(term), { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw { code: payload?.error?.code ?? 'YOUTUBE_SEARCH_UNAVAILABLE', message: payload?.error?.message ?? 'YouTube search is unavailable.' };
      setChannels(payload.data?.channels ?? []);
    } catch (caught) {
      const issue = caught as { code?: string; message?: string };
      setError({ code: issue.code ?? 'YOUTUBE_SEARCH_UNAVAILABLE', message: issue.message ?? 'YouTube search is unavailable.' });
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const search = (event?: FormEvent) => {
    event?.preventDefault();
    void searchFor(query.trim());
  };

  useEffect(() => {
    const term = (new URLSearchParams(location.search).get('q') ?? '').trim().slice(0, 80);
    if (term.length < 2) return;
    setQuery(term);
    void searchFor(term);
  }, [location.search, searchFor]);

  const addChannel = async (channel: ChannelResult) => {
    setAdding(channel.channelId);
    setNotice(null);
    try {
      const response = await fetch('/api/v1/youtube/channels', {
        method: 'POST', credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channel.channelId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not add this channel.');
      setChannels(items => items.map(item => item.channelId === channel.channelId ? { ...item, isAdded: true } : item));
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not add this channel.');
    } finally {
      setAdding(null);
    }
  };

  const needsLogin = error?.code === 'AUTH_REQUIRED';

  return (
    <section className="yt-page">
      <header className="yt-page-heading">
        <div><span className="yt-eyebrow">DISCOVER CREATORS</span><h1>Search YouTube</h1><p>Search public channels and add the ones you want in your Kairo feed.</p></div>
      </header>

      <form className="yt-search-form" onSubmit={search} role="search">
        <Search size={19} aria-hidden="true" />
        <input aria-label="Search YouTube channels" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search public channels, creators or topics…" maxLength={80} />
        <button type="submit" className="yt-button yt-button-primary" disabled={loading || query.trim().length < 2}>{loading ? 'Searching…' : 'Search'}</button>
      </form>
      <div className="yt-search-tip"><span>Try a topic</span>{['technology', 'gaming', 'anime', 'music', 'science'].map(term => <button key={term} type="button" onClick={() => setQuery(term)}>{term}</button>)}</div>

      {error && <div className="yt-notice" role="alert"><div><b>{error.message}</b>
        {needsLogin && <p><Link to="/login">Sign in</Link> to search and save channels.</p>}
        {!needsLogin && <p>Check your connection and try again.</p>}
      </div></div>}
      {notice && <div className="yt-notice" role="status">{notice}</div>}

      {loading && <div className="yt-loading" role="status">Searching YouTube channels…</div>}
      {!loading && searched && !error && channels.length === 0 && <div className="yt-empty"><Search size={26} /><h3>No channels found</h3><p>Try a different channel name or topic.</p></div>}
      {!loading && channels.length > 0 && <div className="yt-results">
        <div className="yt-section-heading"><div><h2>Channel results</h2><p>{channels.length} channels found</p></div></div>
        {channels.map(channel => <article className="yt-result-card" key={channel.channelId}>
          <a href={channel.url} target="_blank" rel="noopener noreferrer" className="yt-result-avatar" aria-label={'Open ' + channel.title + ' on YouTube'}>
            {channel.thumbnailUrl ? <img src={channel.thumbnailUrl} alt="" loading="lazy" /> : <Youtube size={26} />}
          </a>
          <div className="yt-result-copy"><h3><a href={channel.url} target="_blank" rel="noopener noreferrer">{channel.title} <ArrowUpRight size={13} /></a></h3><p>{channel.description || 'YouTube channel'}</p></div>
          <button type="button" className={`yt-button ${channel.isAdded ? 'yt-button-added' : 'yt-button-primary'}`} disabled={channel.isAdded || adding === channel.channelId} onClick={() => void addChannel(channel)}>
            {channel.isAdded ? <><Check size={15} /> Added</> : adding === channel.channelId ? 'Adding…' : <><Plus size={15} /> Add to feed</>}
          </button>
        </article>)}
      </div>}
    </section>
  );
}
