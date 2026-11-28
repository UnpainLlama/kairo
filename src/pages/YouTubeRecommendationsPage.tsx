import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccountScope } from '../hooks/useAccountScope';
import { readGuestRecommendationState, saveGuestRecommendationState } from '../lib/youtubeLocalLibrary';
import {
  DEFAULT_RECOMMENDATION_TUNING,
  type RecommendationTuning,
} from '../lib/youtubeRecommendations';

type Topic = {
  id: string;
  topic: string;
  kind: 'interest' | 'block';
  share: number;
  expiresAt: number | null;
};

type PresetId = 'balanced' | 'catch_up' | 'familiar' | 'explorer' | 'nostalgia';

const PRESETS: Array<{
  id: PresetId;
  name: string;
  description: string;
  tuning: Partial<RecommendationTuning>;
}> = [
  { id: 'balanced', name: 'Balanced', description: 'Recent uploads, familiar channels, new creators and occasional revisits.', tuning: {} },
  {
    id: 'catch_up',
    name: 'Catch up',
    description: 'Prioritize recent uploads from channels you already watch.',
    tuning: { shares: { subscriptions: 60, similar: 25, new: 8, throwback: 4, rewatch: 3 }, freshness: 75 },
  },
  {
    id: 'familiar',
    name: 'Familiar',
    description: 'Stay close to channels and topics you already know.',
    tuning: { shares: { subscriptions: 35, similar: 45, new: 8, throwback: 7, rewatch: 5 }, strictness: { similar: 60, new: 75, throwback: 60 }, newChannelCap: 1, shuffle: 30 },
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Give more room to creators you have not visited before.',
    tuning: { shares: { subscriptions: 15, similar: 20, new: 50, throwback: 12, rewatch: 3 }, strictness: { similar: 40, new: 30, throwback: 45 }, newChannelCap: 3, shuffle: 80 },
  },
  {
    id: 'nostalgia',
    name: 'Nostalgia',
    description: 'Bring back channels and videos you have not visited in a while.',
    tuning: { shares: { subscriptions: 15, similar: 15, new: 10, throwback: 40, rewatch: 20 }, throwbackYears: 0, freshness: 30 },
  },
];

function mergeTuning(value: unknown): RecommendationTuning {
  const raw = value && typeof value === 'object' ? value as Partial<RecommendationTuning> : {};
  return {
    ...DEFAULT_RECOMMENDATION_TUNING,
    ...raw,
    shares: { ...DEFAULT_RECOMMENDATION_TUNING.shares, ...(raw.shares ?? {}) },
    strictness: { ...DEFAULT_RECOMMENDATION_TUNING.strictness, ...(raw.strictness ?? {}) },
  };
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message ?? 'Recommendation settings could not be loaded.');
  }
  return payload.data ?? {};
}

export default function YouTubeRecommendationsPage() {
  const { accountId, resolved } = useAccountScope();
  const [tuning, setTuning] = useState<RecommendationTuning>(DEFAULT_RECOMMENDATION_TUNING);
  const [active, setActive] = useState<PresetId | 'custom'>('balanced');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicText, setTopicText] = useState('');
  const [topicKind, setTopicKind] = useState<'interest' | 'block'>('interest');
  const [topicShare, setTopicShare] = useState(8);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!resolved) return;
    setLoading(true);
    setError('');
    try {
      if (!accountId) {
        const guest = readGuestRecommendationState();
        setActive(PRESETS.some(item => item.id === guest.active) ? guest.active as PresetId : 'custom');
        setTuning(mergeTuning(guest.tuning));
        setTopics(guest.topics);
        return;
      }
      const [settingsResponse, topicsResponse] = await Promise.all([
        fetch('/api/v1/youtube/recommendations/settings', {
          credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
        }),
        fetch('/api/v1/youtube/recommendations/topics', {
          credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
        }),
      ]);
      const [settingsData, topicsData] = await Promise.all([readJson(settingsResponse), readJson(topicsResponse)]);
      const selection = settingsData.settings ?? {};
      setActive(PRESETS.some(item => item.id === selection.active) ? selection.active : 'custom');
      setTuning(mergeTuning(selection.tuning));
      setTopics(Array.isArray(topicsData.topics) ? topicsData.topics : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Recommendation settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [accountId, resolved]);

  useEffect(() => { void load(); }, [load]);

  const choosePreset = (id: PresetId) => {
    const preset = PRESETS.find(item => item.id === id);
    if (!preset) return;
    setActive(id);
    if (id === 'balanced') {
      setTuning(DEFAULT_RECOMMENDATION_TUNING);
      return;
    }
    setTuning(current => ({
      ...current,
      ...preset.tuning,
      shares: { ...current.shares, ...(preset.tuning.shares ?? {}) },
    }));
  };

  const change = <K extends keyof RecommendationTuning>(key: K, value: RecommendationTuning[K]) => {
    setActive('custom');
    setTuning(current => ({ ...current, [key]: value }));
  };

  const changeShare = (key: keyof RecommendationTuning['shares'], value: number) => {
    setActive('custom');
    setTuning(current => ({ ...current, shares: { ...current.shares, [key]: value } }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (!accountId) {
        saveGuestRecommendationState({ active, tuning: tuning as unknown as Record<string, unknown> });
      } else {
        const response = await fetch('/api/v1/youtube/recommendations/settings', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ active, tuning }),
        });
        await readJson(response);
      }
      setNotice('Recommendation settings saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Recommendation settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const addTopic = async () => {
    const topic = topicText.trim();
    if (topic.length < 2) return;
    setError('');
    setNotice('');
    try {
      if (!accountId) {
        const guest = readGuestRecommendationState();
        const item: Topic = {
          id: crypto.randomUUID(),
          topic,
          kind: topicKind,
          share: topicKind === 'interest' ? topicShare : 0,
          expiresAt: null,
        };
        const nextTopics = [item, ...guest.topics];
        saveGuestRecommendationState({ topics: nextTopics });
        setTopics(nextTopics);
      } else {
        const response = await fetch('/api/v1/youtube/recommendations/topics', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic, kind: topicKind, share: topicKind === 'interest' ? topicShare : 0, matchMode: 'words' }),
        });
        const data = await readJson(response);
        setTopics(current => [data.topic, ...current]);
      }
      setTopicText('');
      setNotice('Topic added.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Topic could not be added.');
    }
  };

  const removeTopic = async (id: string) => {
    try {
      if (!accountId) {
        const guest = readGuestRecommendationState();
        const nextTopics = guest.topics.filter(topic => topic.id !== id);
        saveGuestRecommendationState({ topics: nextTopics });
        setTopics(nextTopics);
      } else {
        const response = await fetch('/api/v1/youtube/recommendations/topics/' + encodeURIComponent(id), {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        await readJson(response);
        setTopics(current => current.filter(topic => topic.id !== id));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Topic could not be removed.');
    }
  };

  return (
    <section className="yt-page yt-recommendation-settings">
      <header className="yt-page-heading">
        <div>
          <span className="yt-eyebrow">YOUTUBE RECOMMENDATIONS</span>
          <h1>Feed settings</h1>
          <p>Choose the balance between familiar channels, similar videos, new creators and older interests.</p>
        </div>
        <Link to="/youtube" className="yt-button">Back to feed</Link>
      </header>

      {error && <div className="yt-notice" role="alert">{error}</div>}
      {notice && <div className="yt-notice" role="status">{notice}</div>}
      {loading && <div className="yt-loading" role="status">Loading recommendation settings…</div>}

      {!loading && (
        <>
          <section className="yt-recommendation-panel">
            <h2>Feed preset</h2>
            <div className="yt-recommendation-presets">
              {PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  className={active === preset.id ? 'active' : ''}
                  aria-pressed={active === preset.id}
                  onClick={() => choosePreset(preset.id)}
                >
                  <b>{preset.name}</b><small>{preset.description}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="yt-recommendation-panel">
            <h2>Feed balance</h2>
            <p>These are relative shares. Empty categories automatically give their share to the categories with available videos.</p>
            {([
              ['subscriptions', 'Recent uploads from channels you watch'],
              ['similar', 'Videos similar to your recent watches'],
              ['new', 'Videos from channels you have not watched'],
              ['throwback', 'Channels and interests you have not visited lately'],
              ['rewatch', 'Videos you watched before'],
            ] as Array<[keyof RecommendationTuning['shares'], string]>).map(([key, label]) => (
              <label className="yt-recommendation-control" key={key}>
                <span>{label}</span>
                <b>{tuning.shares[key]}%</b>
                <input type="range" min="0" max="100" value={tuning.shares[key]} onChange={event => changeShare(key, Number(event.target.value))} />
              </label>
            ))}
          </section>

          <section className="yt-recommendation-panel">
            <h2>Discovery and spacing</h2>
            <label className="yt-recommendation-control">
              <span>Channel spacing</span><b>{tuning.channelGap} videos</b>
              <input type="range" min="1" max="12" value={tuning.channelGap} onChange={event => change('channelGap', Number(event.target.value))} />
              <small>How many positions to leave between videos from the same channel.</small>
            </label>
            <label className="yt-recommendation-control">
              <span>Maximum videos from a new channel</span><b>{tuning.newChannelCap}</b>
              <input type="range" min="1" max="6" value={tuning.newChannelCap} onChange={event => change('newChannelCap', Number(event.target.value))} />
            </label>
            <label className="yt-recommendation-control">
              <span>Prefer newer uploads</span><b>{tuning.freshness}</b>
              <input type="range" min="0" max="100" value={tuning.freshness} onChange={event => change('freshness', Number(event.target.value))} />
            </label>
            <label className="yt-recommendation-control">
              <span>Shuffle variety</span><b>{tuning.shuffle}</b>
              <input type="range" min="0" max="100" value={tuning.shuffle} onChange={event => change('shuffle', Number(event.target.value))} />
            </label>

            <h3>Relevance strictness</h3>
            <p>Higher settings require closer matches before a candidate enters each category.</p>
            {([
              ['similar', 'Similar videos'],
              ['new', 'New channels'],
              ['throwback', 'Throwbacks'],
            ] as Array<[keyof RecommendationTuning['strictness'], string]>).map(([key, label]) => (
              <label className="yt-recommendation-control" key={key}>
                <span>{label}</span><b>{tuning.strictness[key]}</b>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={tuning.strictness[key]}
                  onChange={event => {
                    const value = Number(event.target.value);
                    setActive('custom');
                    setTuning(current => ({ ...current, strictness: { ...current.strictness, [key]: value } }));
                  }}
                />
              </label>
            ))}
          </section>

          <section className="yt-recommendation-panel">
            <h2>Time windows and filters</h2>
            <label className="yt-recommendation-control">
              <span>Recent interests window</span>
              <select value={tuning.recentDays} onChange={event => change('recentDays', Number(event.target.value) as RecommendationTuning['recentDays'])}>
                <option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option>
              </select>
            </label>
            <label className="yt-recommendation-control">
              <span>Throwback history range</span>
              <select value={tuning.throwbackYears} onChange={event => change('throwbackYears', Number(event.target.value) as RecommendationTuning['throwbackYears'])}>
                <option value="1">1 year</option><option value="3">3 years</option><option value="0">All history</option>
              </select>
            </label>
            <label className="yt-recommendation-control">
              <span>Wait before suggesting a rewatch</span>
              <select value={tuning.rewatchAfterDays} onChange={event => change('rewatchAfterDays', Number(event.target.value) as RecommendationTuning['rewatchAfterDays'])}>
                <option value="30">30 days</option><option value="60">60 days</option><option value="180">180 days</option><option value="365">1 year</option>
              </select>
            </label>
            <label className="yt-recommendation-control">
              <span>Hide recommendations after this many times shown</span>
              <select value={tuning.wornAfter} onChange={event => change('wornAfter', Number(event.target.value) as RecommendationTuning['wornAfter'])}>
                <option value="0">Never</option><option value="3">3 times</option><option value="6">6 times</option><option value="12">12 times</option>
              </select>
            </label>
            <label className="yt-recommendation-control">
              <span>Maximum upload age</span>
              <select value={tuning.maxAgeDays} onChange={event => change('maxAgeDays', Number(event.target.value) as RecommendationTuning['maxAgeDays'])}>
                <option value="0">Any age</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option><option value="1095">3 years</option>
              </select>
            </label>
            <label className="yt-recommendation-control">
              <span>Minimum video length (minutes)</span>
              <input type="number" min="0" max="600" value={tuning.minMinutes} onChange={event => change('minMinutes', Math.min(600, Math.max(0, Number(event.target.value) || 0)))} />
            </label>
            <label className="yt-recommendation-control">
              <span>Maximum video length (minutes, 0 means no limit)</span>
              <input type="number" min="0" max="600" value={tuning.maxMinutes} onChange={event => change('maxMinutes', Math.min(600, Math.max(0, Number(event.target.value) || 0)))} />
            </label>
          </section>

          <section className="yt-recommendation-panel">
            <h2>Interests and blocked topics</h2>
            <p>Interest topics add a separate recommendation category. Block topics are removed from results. Matching uses words from video titles and descriptions.</p>
            <div className="yt-recommendation-topic-form">
              <input value={topicText} onChange={event => setTopicText(event.target.value)} maxLength={100} placeholder="e.g. mechanical keyboards" aria-label="Topic" />
              <select value={topicKind} onChange={event => setTopicKind(event.target.value as 'interest' | 'block')} aria-label="Topic type">
                <option value="interest">Interest</option><option value="block">Block</option>
              </select>
              {topicKind === 'interest' && <label>Share <input type="number" min="0" max="35" value={topicShare} onChange={event => setTopicShare(Math.max(0, Math.min(35, Number(event.target.value) || 0)))} /></label>}
              <button type="button" onClick={() => void addTopic()} disabled={topicText.trim().length < 2}>Add topic</button>
            </div>
            <div className="yt-recommendation-topic-list">
              {topics.map(topic => (
                <div key={topic.id}>
                  <span><b>{topic.topic}</b><small>{topic.kind === 'interest' ? 'Interest · ' + topic.share + '% share' : 'Blocked topic'}</small></span>
                  <button type="button" onClick={() => void removeTopic(topic.id)}>Remove</button>
                </div>
              ))}
              {topics.length === 0 && <p>No topics added.</p>}
            </div>
          </section>

          <div className="yt-recommendation-save">
            <button type="button" className="yt-button yt-button-primary" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save feed settings'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
