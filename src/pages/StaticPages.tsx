import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Clock, Heart, LogIn, LogOut, Search, Settings, Trash2, UserRound, Pause, Play, ArrowUpDown } from 'lucide-react';
import { EmptyState, LoadingState } from '../components/catalog';
import { useKairoAccount } from '../lib/AccountProvider';
import { historyPausedStorageKey, readWatchHistory, watchProgressStorageKey, writeWatchHistory } from '../lib/accountStorage';
import { signOutKairoAccount } from '../lib/authClient';
import { deleteMediaPlayback, listLocalMediaPlayback, syncMediaPlayback, writeLocalMediaPlayback, type MediaPlaybackSnapshot } from '../lib/mediaPlayback';

type AccountUser = { id: string; displayName: string; email: string | null; username?: string | null; role?: 'user' | 'admin'; emailVerifiedAt?: string | null };
type WatchEntry = { slug: string; title: string; posterUrl: string | null; episodeNumber: number; episodeTitle: string; progressKey: string; durationSeconds: number | null; updatedAt: number };
type AnimeLibraryRow = { animeId: string; slug: string; title: string; posterUrl: string | null; status: string; isFavorite: boolean | number };
function readHistory(userId: string | null): WatchEntry[] {
  return readWatchHistory<WatchEntry>(userId).filter((x) => x && typeof x.slug === 'string' && typeof x.title === 'string');
}
function progressOf(entry: WatchEntry): number {
  try { const seconds = Number(localStorage.getItem(entry.progressKey) || 0); return entry.durationSeconds && entry.durationSeconds > 0 ? Math.max(0, Math.min(100, seconds / entry.durationSeconds * 100)) : 0; }
  catch { return 0; }
}
function useCurrentUser() {
  const account = useKairoAccount();
  const user: AccountUser | null = account.status === 'signed-in' && account.accountId
    ? {
        id: account.accountId,
        displayName: account.displayName ?? 'Account',
        email: account.email,
        username: account.username,
        role: account.role ?? undefined,
      }
    : null;
  return {
    user,
    loaded: account.status === 'guest' || account.status === 'signed-in',
    unavailable: account.status === 'unavailable',
    retry: account.retry,
  };
}
async function syncWatchHistory(userId: string, options: { deleted?: Array<{ slug: string; episodeNumber: number }>; clear?: boolean } = {}): Promise<WatchEntry[] | null> {
  const localItems = readHistory(userId).slice(0, options.deleted?.length ? 99 : 100).map((item) => {
    let progressSeconds = 0;
    try { progressSeconds = Number(localStorage.getItem(item.progressKey) || 0); } catch { /* storage may be unavailable */ }
    return { ...item, progressSeconds: Number.isFinite(progressSeconds) ? Math.max(0, progressSeconds) : 0 };
  });
  try {
    const response = await fetch('/api/v1/me/history/sync', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: localItems, deleted: options.deleted ?? [], clear: options.clear === true }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const rows = payload?.data?.items;
    if (!payload?.success || !Array.isArray(rows)) return null;
    const synced: WatchEntry[] = rows.filter((row: any) =>
      row && typeof row.slug === 'string' && typeof row.title === 'string' &&
      Number.isInteger(Number(row.episodeNumber))
    ).map((row: any) => {
      const previous = localItems.find((item) => item.slug === row.slug && item.episodeNumber === Number(row.episodeNumber));
      const progressKey = previous?.progressKey ?? watchProgressStorageKey(userId, row.slug, Number(row.episodeNumber), 'sync');
      const seconds = Number(row.progressSeconds);
      try { localStorage.setItem(progressKey, String(Number.isFinite(seconds) ? Math.max(0, seconds) : 0)); } catch { /* storage may be unavailable */ }
      return {
        slug: row.slug, title: row.title, posterUrl: typeof row.posterUrl === 'string' ? row.posterUrl : null,
        episodeNumber: Number(row.episodeNumber), episodeTitle: typeof row.episodeTitle === 'string' ? row.episodeTitle : '',
        progressKey, durationSeconds: Number.isFinite(Number(row.durationSeconds)) ? Number(row.durationSeconds) : null,
        updatedAt: Number(row.updatedAt) || Date.now(),
      };
    });
    writeWatchHistory(userId, synced);
    window.dispatchEvent(new Event('kairo:history-change'));
    return synced;
  } catch {
    return null;
  }
}
export function ProfilePage() {
  const {user,loaded,unavailable,retry}=useCurrentUser();
  const [history,setHistory]=useState<WatchEntry[]>(()=>readHistory(null)); const [historyScope,setHistoryScope]=useState<string|null>(null); const [playbackItems,setPlaybackItems]=useState<MediaPlaybackSnapshot[]>([]); const [libraryCount,setLibraryCount]=useState<number|null>(null);
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;
    if(!user){setLibraryCount(0);return()=>{active=false};}
    const countFor=async(path:string):Promise<number|null>=>{
      try{
        const response=await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store'});
        const payload=response.ok?await response.json():null;
        return payload?.success&&Array.isArray(payload?.data?.items)?payload.data.items.length:null;
      }catch{return null;}
    };
    Promise.all([countFor('/api/v1/me/library'),countFor('/api/v1/me/movies/library')]).then(([anime,movies])=>{
      if(!active)return;
      setLibraryCount(anime===null&&movies===null?null:(anime??0)+(movies??0));
    });
    return()=>{active=false};
  },[user?.id]);
  useEffect(()=>{let active=true;const scope=user?.id??null;setHistoryScope(scope);setHistory(readHistory(scope));if(user?.id)syncWatchHistory(user.id).then(items=>{if(active&&items)setHistory(items)});return()=>{active=false}},[user?.id]);
  useEffect(()=>{const refresh=()=>setHistory(readHistory(user?.id??null));window.addEventListener('storage',refresh);window.addEventListener('kairo:history-change',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('kairo:history-change',refresh)}},[user?.id]);
  useEffect(()=>{
    if(historyScope!==(user?.id??null))return;
    let active=true;
    const mergePlayback=async()=>{
      const userId=user?.id??null;
      const local=listLocalMediaPlayback(userId);
      const byKey=new Map<string,MediaPlaybackSnapshot>();
      const remoteVersions=new Map<string,number>();
      for(const item of local)byKey.set(item.mediaType+':'+item.mediaKey,item);
      if(userId){
        try{
          const response=await fetch('/api/v1/me/playback?limit=100',{credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store'});
          const payload=response.ok?await response.json():null;
          if(payload?.success&&Array.isArray(payload?.data?.items)){
            for(const raw of payload.data.items){
              if(!raw||!['anime','movie','youtube'].includes(raw.mediaType)||typeof raw.mediaKey!=='string')continue;
              const remote:MediaPlaybackSnapshot={
                mediaType:raw.mediaType,mediaKey:raw.mediaKey,title:String(raw.title??''),
                artworkUrl:typeof raw.artworkUrl==='string'?raw.artworkUrl:null,
                progressSeconds:Number(raw.progressSeconds??0),
                durationSeconds:Number.isFinite(Number(raw.durationSeconds))&&Number(raw.durationSeconds)>0?Number(raw.durationSeconds):null,
                completed:raw.completed===true||Number(raw.completed)===1,
                playerState:raw.playerState&&typeof raw.playerState==='object'?raw.playerState:{},
                updatedAt:Number(raw.updatedAt??0),
              };
              const key=remote.mediaType+':'+remote.mediaKey;
              remoteVersions.set(key,remote.updatedAt);
              const previous=byKey.get(key);
              if(!previous||remote.updatedAt>=previous.updatedAt)byKey.set(key,remote);
            }
          }
        }catch{/* the local snapshot remains available */}
      }
      // Preserve older Anime history rows even if they predate the shared playback migration.
      for(const entry of history){
        let seconds=0;
        try{seconds=Number(localStorage.getItem(entry.progressKey)||0)}catch{/* storage may be unavailable */}
        if(!Number.isFinite(seconds)||seconds<0)seconds=0;
        const legacy:MediaPlaybackSnapshot={
          mediaType:'anime',mediaKey:`${entry.slug}:${entry.episodeNumber}`,title:entry.title,
          artworkUrl:entry.posterUrl,progressSeconds:seconds,durationSeconds:entry.durationSeconds,
          completed:Boolean(entry.durationSeconds&&seconds>=entry.durationSeconds-2),playerState:{},updatedAt:entry.updatedAt||0,
        };
        const key='anime:'+legacy.mediaKey;
        const previous=byKey.get(key);
        if(!previous||legacy.updatedAt>previous.updatedAt)byKey.set(key,legacy);
      }
      const merged=[...byKey.values()].filter(item=>item.title&&Number.isFinite(item.progressSeconds)&&(user?.role==='admin'||item.mediaType!=='youtube')).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,100);
      if(!active)return;
      setPlaybackItems(merged);
      for(const item of merged){
        writeLocalMediaPlayback(userId,item);
        const remoteTime=remoteVersions.get(item.mediaType+':'+item.mediaKey)??0;
        if(userId&&item.updatedAt>remoteTime)void syncMediaPlayback(userId,item);
      }
    };
    void mergePlayback();
    return()=>{active=false};
  },[user?.id,history,historyScope]);
  const watched=history.length; const completed=history.filter(x=>progressOf(x)>=95).length;
  async function logout(){
    setBusy(true);
    setError('');
    try {
      await signOutKairoAccount(user?.id, (url) => window.location.assign(url));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign out. Please try again.');
      setBusy(false);
    }
  }
  if(!loaded && !unavailable)return <LoadingState label="Loading profile"/>;
  if(unavailable)return <section className="kc-profile-page"><EmptyState title="Account status unavailable">Reconnect to Kairo to load this profile without mixing it with guest data. <button type="button" className="kc-link" onClick={retry}>Retry</button></EmptyState></section>;
  if(!user)return <section className="kc-profile-page"><div className="kc-profile-hero"><div className="kc-profile-avatar"><UserRound size={34}/></div><div><span className="kc-section-kicker">KAIRO ACCOUNT</span><h1>Your profile</h1><p>Use your approved Cloudflare Access email to sign in. Kairo links your account automatically; no second password is needed.</p></div><a className="kc-btn kc-btn-primary" href="/cdn-cgi/access/login"><LogIn size={15}/> Continue with approved email</a></div><EmptyState title="Your profile starts here">Once Cloudflare Access verifies your approved email, Kairo automatically restores your account and syncs activity across devices. Your local watch history remains available in guest mode.</EmptyState></section>;
  return <section className="kc-profile-page">
    <div className="kc-profile-hero"><div className="kc-profile-avatar"><UserRound size={34}/></div><div className="kc-profile-heading"><span className="kc-section-kicker">KAIRO ACCOUNT</span><h1>{user.displayName}</h1><p>{user.email ?? 'Authenticated through Cloudflare Access'}</p></div><Link className="kc-btn" to="/settings"><Settings size={15}/> Account settings</Link></div>
    <div className="kc-profile-stats">
      <article><span><Clock size={17}/></span><b>{watched}</b><small>Recent episodes</small></article>
      <article><span><Play size={17}/></span><b>{completed}</b><small>Completed episodes</small></article>
      <article><span><Heart size={17}/></span><b>{libraryCount===null?'—':libraryCount}</b><small>Anime &amp; Movies titles</small></article>
    </div>
    <div className="kc-profile-content">
      <div className="kc-profile-section-head"><div><span className="kc-section-kicker">YOUR ACTIVITY</span><h2>Continue watching</h2></div><Link className="kc-more" to="/history">Anime history <ArrowUpDown size={14}/></Link></div>
      {playbackItems.length? <div className="kc-profile-history">{playbackItems.slice(0,8).map(item=>{
        const href=item.mediaType==='anime'?'/watch/'+encodeURIComponent(item.mediaKey.slice(0,item.mediaKey.lastIndexOf(':'))) + '/' + item.mediaKey.slice(item.mediaKey.lastIndexOf(':')+1)
          :item.mediaType==='movie'?'/movies/'+encodeURIComponent(item.mediaKey)+'/watch':'/youtube/watch/'+encodeURIComponent(item.mediaKey);
        const percent=item.durationSeconds&&item.durationSeconds>0?Math.max(0,Math.min(100,item.progressSeconds/item.durationSeconds*100)):0;
        const label=item.mediaType==='anime'?'Anime':item.mediaType==='movie'?'Movie':'YouTube';
        const resume=Math.floor(item.progressSeconds);
        const stamp=`${Math.floor(resume/60)}:${String(resume%60).padStart(2,'0')}`;
        return <Link key={item.mediaType+':'+item.mediaKey} to={href} className="kc-profile-history-item"><span className="kc-history-art">{item.artworkUrl?<img src={item.artworkUrl} alt="" loading="lazy"/>:<UserRound size={20}/>}</span><span><b>{item.title}</b><small>{label} · {item.completed?'Completed':item.progressSeconds>0?'Resume at '+stamp:'Not started'}</small><i><span style={{width:`${percent}%`}}/></i></span></Link>
      })}</div>:<EmptyState title="Nothing watched yet">Start watching in Anime or Movies{user?.role==='admin'?' or YouTube':''} and your progress will appear here.</EmptyState>}
    </div>
    {error&&<p className="kc-auth-error" role="alert">{error}</p>}
    <div className="kc-profile-actions"><Link className="kc-btn" to="/settings"><Settings size={15}/> Settings</Link><button className="kc-btn kc-btn-danger" type="button" onClick={()=>void logout()} disabled={busy}><LogOut size={15}/>{busy?'Signing out…':'Sign out'}</button></div>
  </section>;
}
export function HistoryPage() {
  const {user,loaded,unavailable,retry}=useCurrentUser();
  const userId=user?.id??null;
  const [items,setItems]=useState<WatchEntry[]>(()=>readHistory(null)); const [query,setQuery]=useState(''); const [sort,setSort]=useState('recent');
  const [paused,setPaused]=useState(()=>{try{return localStorage.getItem(historyPausedStorageKey(null))==='true'}catch{return false}});
  const [confirmClear,setConfirmClear]=useState(false);
  const filtered=useMemo(()=>items.filter(x=>`${x.title} ${x.episodeTitle}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='progress'?progressOf(b)-progressOf(a):b.updatedAt-a.updatedAt),[items,query,sort]);
  function refresh(){setItems(readHistory(userId))}
  function togglePaused(){const next=!paused;setPaused(next);try{localStorage.setItem(historyPausedStorageKey(userId),String(next))}catch{}}
  function clearHistory(){writeWatchHistory(userId,[]);setItems([]);setConfirmClear(false);window.dispatchEvent(new Event('kairo:history-change'));void deleteMediaPlayback(userId,'anime');if(userId)void syncWatchHistory(userId,{clear:true})}
  function removeItem(item:WatchEntry){const next=items.filter(x=>x.slug!==item.slug||x.episodeNumber!==item.episodeNumber);writeWatchHistory(userId,next);setItems(next);window.dispatchEvent(new Event('kairo:history-change'));void deleteMediaPlayback(userId,'anime',`${item.slug}:${item.episodeNumber}`);if(userId)void syncWatchHistory(userId,{deleted:[{slug:item.slug,episodeNumber:item.episodeNumber}]})}
  useEffect(()=>{window.addEventListener('storage',refresh);window.addEventListener('kairo:history-change',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('kairo:history-change',refresh)}},[userId]);
  useEffect(()=>{if(!loaded)return;setItems(readHistory(userId));try{setPaused(localStorage.getItem(historyPausedStorageKey(userId))==='true')}catch{setPaused(false)}if(userId){let active=true;syncWatchHistory(userId).then(items=>{if(active&&items)setItems(items)});return()=>{active=false}}},[loaded,userId]);
  if(!loaded && !unavailable)return <LoadingState label="Loading history"/>;
  if(unavailable)return <section className="kc-history-page"><EmptyState title="Account status unavailable">Your history is locked until Kairo can verify the session, so account data cannot be mixed with guest data. <button type="button" className="kc-link" onClick={retry}>Retry</button></EmptyState></section>;
  return <section className="kc-history-page">
    <header className="kc-page-head"><span className="kc-section-kicker">YOUR ACTIVITY</span><h1>Watch history</h1><p>Guest history stays on this device; verified Kairo accounts sync history across devices automatically.</p></header>
    <div className="kc-history-toolbar"><label className="kc-history-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search your history…" aria-label="Search watch history"/></label><label className="kc-history-sort"><ArrowUpDown size={15}/><select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort history"><option value="recent">Last watched</option><option value="title">A–Z</option><option value="progress">Progress</option></select></label><button className={`kc-btn ${paused?'kc-btn-primary':''}`} onClick={togglePaused} type="button">{paused?<Play size={14}/>:<Pause size={14}/>} {paused?'Resume history':'Pause history'}</button><button className="kc-btn kc-btn-danger" type="button" onClick={()=>setConfirmClear(true)} disabled={!items.length}><Trash2 size={14}/> Clear</button></div>
    {paused&&<p className="kc-history-paused" role="status">History recording is paused. New episodes won’t be added until you resume.</p>}
    {confirmClear&&<div className="kc-history-confirm" role="alert"><span>Clear all watch history for this account on this browser and synced account?</span><button className="kc-btn kc-btn-danger" onClick={clearHistory}>Clear history</button><button className="kc-btn" onClick={()=>setConfirmClear(false)}>Cancel</button></div>}
    {filtered.length?<div className="kc-history-list">{filtered.map(item=>{const progress=progressOf(item);return <article className="kc-history-item" key={item.progressKey}><Link to={`/watch/${encodeURIComponent(item.slug)}/${item.episodeNumber}`} className="kc-history-poster">{item.posterUrl?<img src={item.posterUrl} alt="" loading="lazy"/>:<span>{item.title.slice(0,2).toUpperCase()}</span>}<i><span style={{width:`${progress}%`}}/></i></Link><div className="kc-history-copy"><span className="kc-section-kicker">{new Date(item.updatedAt).toLocaleDateString()}</span><Link to={`/watch/${encodeURIComponent(item.slug)}/${item.episodeNumber}`}><h2>{item.title}</h2></Link><p>Episode {item.episodeNumber}{item.episodeTitle?` · ${item.episodeTitle}`:''}</p><small>{progress>=95?'Watched':progress>0?`${Math.round(progress)}% watched`:'Not started'}</small></div><button type="button" className="kc-icon-btn" aria-label={`Remove ${item.title} episode ${item.episodeNumber} from history`} onClick={()=>removeItem(item)}><Trash2 size={16}/></button></article>})}</div>:<EmptyState title={query?'No matching history':'No watch history yet'}>{query?'Try a different anime title.':<>Start watching an episode and it will be saved here automatically. Browse <Link className="kc-link" to="/browse/trending">trending anime</Link> to find something to watch.</>}</EmptyState>}
  </section>;
}
export function AccountPage({ title }: { title: string }) {
  const location=useLocation();
  const {user,loaded,unavailable,retry}=useCurrentUser();
  const [youtubeConnected,setYoutubeConnected]=useState(false);
  const [youtubeLoaded,setYoutubeLoaded]=useState(false);
  const [youtubeBusy,setYoutubeBusy]=useState(false);
  const [youtubeError,setYoutubeError]=useState('');
  const [animeLibrary,setAnimeLibrary]=useState<AnimeLibraryRow[]>([]);
  const [animeLibraryLoaded,setAnimeLibraryLoaded]=useState(false);
  const [animeLibraryError,setAnimeLibraryError]=useState('');
  const [animeLibraryRetry,setAnimeLibraryRetry]=useState(0);
  const pendingConnect=new URLSearchParams(location.search).get('connect');
  const pendingConnectStarted=useRef<string|null>(null);
  useEffect(()=>{
    if(title!=='Settings'||!user||user.role!=='admin'||pendingConnect!=='youtube')return;
    if(pendingConnectStarted.current===pendingConnect)return;
    pendingConnectStarted.current=pendingConnect;
    window.location.assign('/api/v1/auth/youtube');
  },[title,user?.id,pendingConnect]);
  useEffect(()=>{
    let active=true;
    if(title!=='Settings'||!user||user.role!=='admin'){setYoutubeLoaded(true);return()=>{active=false};}
    fetch('/api/v1/auth/youtube/status',{credentials:'same-origin',headers:{Accept:'application/json'}})
      .then(r=>r.ok?r.json():null)
      .then(p=>{if(active&&p?.success)setYoutubeConnected(p.data?.connected===true)})
      .catch(()=>{if(active)setYoutubeError('Could not load YouTube connection status.')})
      .finally(()=>{if(active)setYoutubeLoaded(true)});
    return()=>{active=false};
  },[title,user?.id,location.key]);
  useEffect(()=>{
    let active=true;
    if(title!=='My Library'&&title!=='Favorites'){setAnimeLibraryLoaded(true);return()=>{active=false};}
    if(!user){setAnimeLibrary([]);setAnimeLibraryLoaded(true);return()=>{active=false};}
    setAnimeLibraryLoaded(false);
    setAnimeLibraryError('');
    fetch('/api/v1/me/library',{credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store'})
      .then(async response=>{
        const payload=await response.json().catch(()=>null);
        if(!response.ok||!payload?.success||!Array.isArray(payload?.data?.items))throw new Error(payload?.error?.message??'Could not load your Anime library.');
        if(active)setAnimeLibrary(payload.data.items as AnimeLibraryRow[]);
      })
      .catch(error=>{if(active)setAnimeLibraryError(error instanceof Error?error.message:'Could not load your Anime library.')})
      .finally(()=>{if(active)setAnimeLibraryLoaded(true)});
    return()=>{active=false};
  },[title,user?.id,animeLibraryRetry]);

  const filteredAnimeLibrary=title==='Favorites'
    ? animeLibrary.filter(item=>item.isFavorite===true||Number(item.isFavorite)===1)
    : animeLibrary;

  const youtubeStatus=new URLSearchParams(location.search).get('youtube');
  const youtubeMessages:Record<string,string>={
    connected:'YouTube is connected. Kairo can now request access to your subscriptions.',
    cancelled:'You cancelled the YouTube connection.',
    sign_in_required:'Authenticate with your approved Cloudflare Access email before connecting YouTube.',
    reauth_required:'Your Cloudflare Access session has expired. Authenticate again, then retry connecting YouTube.',
    invalid_response:'The YouTube authorization response could not be verified. Please try again.',
    expired:'The YouTube connection request expired. Please try again.',
    token_exchange_failed:'Google could not complete the YouTube authorization. Please try again.',
    invalid_grant:'Google did not grant the required YouTube read-only permission.',
    refresh_token_missing:'Google did not provide offline access. Please retry the connection.',
    failed:'YouTube could not be connected. Please try again.'
  };
  async function disconnectYouTube(){
    if(!window.confirm('Disconnect YouTube from this Kairo account?'))return;
    setYoutubeBusy(true);setYoutubeError('');
    try{
      const response=await fetch('/api/v1/auth/youtube/disconnect',{
        method:'POST',credentials:'same-origin',headers:{Accept:'application/json'}
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.success)throw new Error(payload?.error?.message??'Could not disconnect YouTube.');
      setYoutubeConnected(false);
    }catch(error){setYoutubeError(error instanceof Error?error.message:'Could not disconnect YouTube.')}
    finally{setYoutubeBusy(false)}
  }
  const isAnimeLibraryPage=title==='My Library'||title==='Favorites';
  return <><header className="kc-page-head"><h1>{title}</h1></header>
    {isAnimeLibraryPage&&unavailable?<EmptyState title="Account status unavailable">Kairo could not verify your account, so your personal library remains locked. <button type="button" className="kc-link" onClick={retry}>Retry</button></EmptyState>
    :isAnimeLibraryPage&&loaded&&!user?<EmptyState title="Sign in to view your library"><Link className="kc-link" to="/login">Continue with approved email</Link> to view your saved Anime titles.</EmptyState>
    :isAnimeLibraryPage&&!loaded&&!unavailable?<LoadingState label="Checking your account"/>
    :isAnimeLibraryPage&&user&&!animeLibraryLoaded?<LoadingState label="Loading your Anime library"/>
    :isAnimeLibraryPage&&animeLibraryError?<EmptyState title="Library unavailable">{animeLibraryError} <button type="button" className="kc-link" onClick={()=>setAnimeLibraryRetry(value=>value+1)}>Retry</button></EmptyState>
    :isAnimeLibraryPage&&user&&filteredAnimeLibrary.length===0?<EmptyState title={title==='Favorites'?'No favorites yet':'Your Anime library is empty'}>Open an Anime title and use its library controls to save it here. <Link className="kc-link" to="/browse/anime">Browse Anime</Link></EmptyState>
    :isAnimeLibraryPage&&user?<section className="kc-account-panel"><ul className="kc-anime-library-list">{filteredAnimeLibrary.map(item=><li key={item.animeId}><Link to={'/anime/'+encodeURIComponent(item.slug)}><strong>{item.title}</strong></Link><span>{item.status.replaceAll('_',' ')}{item.isFavorite===true||Number(item.isFavorite)===1?' · Favorite':''}</span></li>)}</ul></section>
    :title==='Settings'&&unavailable?<EmptyState title="Account status unavailable">Kairo could not verify your account. Your private settings remain locked. <button type="button" className="kc-link" onClick={retry}>Retry</button></EmptyState>
    :title==='Settings'&&loaded&&user?<section className="kc-account-panel">
      <h2>Account</h2><p>Signed in as <strong>{user.email ?? user.displayName}</strong> through Cloudflare Access.</p>
      {user.role==='admin'&&<><h3>YouTube</h3>
      <p>Connect YouTube separately to let Kairo read your subscriptions. This does not change how you sign in to Kairo.</p>
      {!youtubeLoaded?<p className="kc-auth-copy" role="status">Checking YouTube connection…</p>
        :youtubeConnected?<div><p className="kc-auth-copy" role="status">YouTube is connected.</p><button className="kc-btn" type="button" onClick={()=>void disconnectYouTube()} disabled={youtubeBusy}>{youtubeBusy?'Disconnecting…':'Disconnect YouTube'}</button></div>
        :<a className="kc-auth-google" href="/api/v1/auth/youtube"><span aria-hidden="true">▶</span>Connect YouTube</a>}
      {youtubeStatus&&<p role="status" className="kc-auth-copy">{youtubeMessages[youtubeStatus]??'YouTube connection status updated.'}</p>}
      {youtubeError&&<p role="alert" className="kc-auth-error">{youtubeError}</p>}</>}
    </section>
    :title==='Settings'&&loaded?<EmptyState title="Sign in to manage your account"><a className="kc-link" href="/cdn-cgi/access/login">Continue with approved email</a> to manage your account.</EmptyState>
    :<EmptyState title="Not available yet">{title} features are still being built. You can still <Link className="kc-link" to="/search">search</Link> and browse.</EmptyState>}
  </>;
}
export function AboutPage() {
  return <><header className="kc-page-head"><h1>About Kairo</h1><p>A personal anime, movies and video discovery catalogue.</p></header><section className="kc-about-panel" aria-labelledby="artwork-credit-title"><h2 id="artwork-credit-title">Artwork credits</h2><a className="kc-about-tmdb-logo" href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer"><img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg" alt="The Movie Database (TMDB)" loading="lazy" /></a><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p><p>Kairo uses TMDB for movie discovery and catalogue metadata, and may also use its artwork and supplementary metadata for anime where catalogue fields are missing. Movie playback is provided exclusively by CineSrc using the movie's TMDB identifier; TMDB does not supply playable streams.</p><a className="kc-link" href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">Visit The Movie Database</a><p><a className="kc-link" href="https://cinesrc.st/docs" target="_blank" rel="noopener noreferrer">CineSrc movie player documentation</a></p></section></>;
}
export function NotFoundPage() {
  return <><header className="kc-page-head"><h1>Page not found</h1></header><EmptyState title="That page doesn’t exist"><Link className="kc-link" to="/">Go to the home page</Link></EmptyState></>;
}
