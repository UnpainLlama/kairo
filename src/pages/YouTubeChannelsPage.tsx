import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Youtube } from 'lucide-react';

type SavedChannel = { channelId: string; title: string; description: string; thumbnailUrl: string | null; addedAt?: string };

export default function YouTubeChannelsPage() {
  const [channels, setChannels] = useState<SavedChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/youtube/channels', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not load your channels.');
      setChannels(payload.data?.channels ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your channels.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const removeChannel = async (channelId: string) => {
    setRemoving(channelId);
    setError(null);
    try {
      const response = await fetch('/api/v1/youtube/channels/' + encodeURIComponent(channelId), { method: 'DELETE', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not remove this channel.');
      setChannels(items => items.filter(item => item.channelId !== channelId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove this channel.');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <section className="yt-page">
      <header className="yt-page-heading">
        <div><span className="yt-eyebrow">YOUR COLLECTION</span><h1>Your channels</h1><p>These are the creators that shape your Kairo video feed.</p></div>
        <Link to="/youtube/search" className="kc-btn kc-btn-primary"><Plus size={16} /> Add channels</Link>
      </header>
      <div className="yt-channel-count"><b>{channels.length}</b> channels selected</div>
      {error && <div className="yt-notice" role="alert">{error}</div>}
      {loading && <div className="yt-loading" role="status">Loading your channels…</div>}
      {!loading && channels.length === 0 && <div className="yt-empty"><Youtube size={28} /><h3>Your channel list is empty</h3><p>Search for creators and add them to your feed. You can change this list whenever you like.</p><Link to="/youtube/search" className="kc-btn kc-btn-primary">Find channels <Plus size={15} /></Link></div>}
      {!loading && channels.length > 0 && <div className="yt-managed-channels">
        {channels.map(channel => <article className="yt-managed-channel" key={channel.channelId}>
          <span className="yt-managed-avatar">{channel.thumbnailUrl ? <img src={channel.thumbnailUrl} alt="" loading="lazy" /> : channel.title.slice(0, 1)}</span>
          <div className="yt-managed-copy"><h2>{channel.title}</h2><p>{channel.description || 'YouTube channel'}</p></div>
          <button type="button" className="kc-btn yt-remove-button" disabled={removing === channel.channelId} onClick={() => void removeChannel(channel.channelId)} aria-label={'Remove ' + channel.title}>
            <Trash2 size={16} />{removing === channel.channelId ? 'Removing…' : 'Remove'}
          </button>
        </article>)}
      </div>}
    </section>
  );
}
