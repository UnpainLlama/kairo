import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Clock, Heart, LogIn, LogOut, Search, Settings, Trash2, UserRound, Pause, Play, ArrowUpDown } from 'lucide-react';
import { EmptyState, LoadingState } from '../components/catalog';

type AccountUser = { id: string; displayName: string; email: string | null; emailVerifiedAt?: string | null };
type WatchEntry = { slug: string; title: string; posterUrl: string | null; episodeNumber: number; episodeTitle: string; progressKey: string; durationSeconds: number | null; updatedAt: number };
const HISTORY_KEY = 'kairo-watch-history';
const PAUSED_KEY = 'kairo-history-paused';
function readHistory(): WatchEntry[] {
  try { const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(value) ? value.filter((x) => x && typeof x.slug === 'string' && typeof x.title === 'string') : []; }
  catch { return []; }
}
function progressOf(entry: WatchEntry): number {
  try { const seconds = Number(localStorage.getItem(entry.progressKey) || 0); return entry.durationSeconds && entry.durationSeconds > 0 ? Math.max(0, Math.min(100, seconds / entry.durationSeconds * 100)) : 0; }
  catch { return 0; }
}
function useCurrentUser() {
  const [user,setUser]=useState<AccountUser|null>(null); const [loaded,setLoaded]=useState(false);
  useEffect(()=>{let active=true;fetch('/api/v1/me',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(p=>{if(active)setUser(p?.data?.user??null)}).catch(()=>{if(active)setUser(null)}).finally(()=>{if(active)setLoaded(true)});return()=>{active=false}},[]);
  return {user,loaded};
}
async function signOut() {
  const response=await fetch('/api/v1/auth/logout',{method:'POST',credentials:'same-origin',headers:{Accept:'application/json'}});
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload?.success) throw new Error(payload?.error?.message??'Could not sign out. Please try again.');
  window.dispatchEvent(new Event('kairo:auth-change'));
}
export function ProfilePage() {
  const {user,loaded}=useCurrentUser(); const navigate=useNavigate();
  const [history,setHistory]=useState<WatchEntry[]>(()=>readHistory()); const [libraryCount,setLibraryCount]=useState<number|null>(null);
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;fetch('/api/v1/me/library',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(p=>{if(active)setLibraryCount(Array.isArray(p?.data?.items)?p.data.items.length:0)}).catch(()=>{if(active)setLibraryCount(null)});return()=>{active=false}},[user?.id]);
  useEffect(()=>{const refresh=()=>setHistory(readHistory());window.addEventListener('storage',refresh);window.addEventListener('kairo:history-change',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('kairo:history-change',refresh)}},[]);
  const watched=history.length; const completed=history.filter(x=>progressOf(x)>=95).length;
  async function logout(){setBusy(true);setError('');try{await signOut();navigate('/login',{replace:true})}catch(e){setError(e instanceof Error?e.message:'Sign out failed.')}finally{setBusy(false)}}
  if(!loaded)return <LoadingState label="Loading profile"/>;
  if(!user)return <section className="kc-profile-page"><div className="kc-profile-hero"><div className="kc-profile-avatar"><UserRound size={34}/></div><div><span className="kc-section-kicker">KAIRO ACCOUNT</span><h1>Your profile</h1><p>Sign in to keep your Kairo account and viewing activity together.</p></div><Link className="kc-btn kc-btn-primary" to="/login"><LogIn size={15}/> Sign in</Link></div><EmptyState title="Your profile starts here">Create an account or sign in to manage your profile. Your local watch history remains available on this device.</EmptyState></section>;
  return <section className="kc-profile-page">
    <div className="kc-profile-hero"><div className="kc-profile-avatar"><UserRound size={34}/></div><div className="kc-profile-heading"><span className="kc-section-kicker">KAIRO ACCOUNT</span><h1>{user.displayName}</h1><p>{user.email??'Email not available'}</p></div><Link className="kc-btn" to="/settings"><Settings size={15}/> Account settings</Link></div>
    <div className="kc-profile-stats">
      <article><span><Clock size={17}/></span><b>{watched}</b><small>Recent episodes</small></article>
      <article><span><Play size={17}/></span><b>{completed}</b><small>Completed episodes</small></article>
      <article><span><Heart size={17}/></span><b>{libraryCount===null?'—':libraryCount}</b><small>Library titles</small></article>
    </div>
    <div className="kc-profile-content">
      <div className="kc-profile-section-head"><div><span className="kc-section-kicker">YOUR ACTIVITY</span><h2>Continue watching</h2></div><Link className="kc-more" to="/history">View history <ArrowUpDown size={14}/></Link></div>
      {history.length? <div className="kc-profile-history">{history.slice(0,4).map(item=><Link key={item.progressKey} to={`/watch/${encodeURIComponent(item.slug)}/${item.episodeNumber}`} className="kc-profile-history-item"><span className="kc-history-art">{item.posterUrl?<img src={item.posterUrl} alt="" loading="lazy"/>:<UserRound size={20}/>}</span><span><b>{item.title}</b><small>Episode {item.episodeNumber}{item.episodeTitle? ` · ${item.episodeTitle}`:''}</small><i><span style={{width:`${progressOf(item)}%`}}/></i></span></Link>)}</div>:<EmptyState title="Nothing watched yet">Start an episode and it will appear here.</EmptyState>}
    </div>
    {error&&<p className="kc-auth-error" role="alert">{error}</p>}
    <div className="kc-profile-actions"><Link className="kc-btn" to="/settings"><Settings size={15}/> Settings</Link><button className="kc-btn kc-btn-danger" type="button" onClick={()=>void logout()} disabled={busy}><LogOut size={15}/>{busy?'Signing out…':'Sign out'}</button></div>
  </section>;
}
export function HistoryPage() {
  const [items,setItems]=useState<WatchEntry[]>(()=>readHistory()); const [query,setQuery]=useState(''); const [sort,setSort]=useState('recent');
  const [paused,setPaused]=useState(()=>{try{return localStorage.getItem(PAUSED_KEY)==='true'}catch{return false}});
  const [confirmClear,setConfirmClear]=useState(false);
  const filtered=useMemo(()=>items.filter(x=>`${x.title} ${x.episodeTitle}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='progress'?progressOf(b)-progressOf(a):b.updatedAt-a.updatedAt),[items,query,sort]);
  function refresh(){setItems(readHistory())}
  function togglePaused(){const next=!paused;setPaused(next);try{localStorage.setItem(PAUSED_KEY,String(next))}catch{}}
  function clearHistory(){try{localStorage.removeItem(HISTORY_KEY)}catch{}setItems([]);setConfirmClear(false);window.dispatchEvent(new Event('kairo:history-change'))}
  function removeItem(item:WatchEntry){const next=items.filter(x=>x.progressKey!==item.progressKey);try{localStorage.setItem(HISTORY_KEY,JSON.stringify(next))}catch{}setItems(next);window.dispatchEvent(new Event('kairo:history-change'))}
  useEffect(()=>{window.addEventListener('storage',refresh);window.addEventListener('kairo:history-change',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('kairo:history-change',refresh)}},[]);
  return <section className="kc-history-page">
    <header className="kc-page-head"><span className="kc-section-kicker">YOUR ACTIVITY</span><h1>Watch history</h1><p>Pick up where you left off. History is stored in this browser on this device.</p></header>
    <div className="kc-history-toolbar"><label className="kc-history-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search your history…" aria-label="Search watch history"/></label><label className="kc-history-sort"><ArrowUpDown size={15}/><select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort history"><option value="recent">Last watched</option><option value="title">A–Z</option><option value="progress">Progress</option></select></label><button className={`kc-btn ${paused?'kc-btn-primary':''}`} onClick={togglePaused} type="button">{paused?<Play size={14}/>:<Pause size={14}/>} {paused?'Resume history':'Pause history'}</button><button className="kc-btn kc-btn-danger" type="button" onClick={()=>setConfirmClear(true)} disabled={!items.length}><Trash2 size={14}/> Clear</button></div>
    {paused&&<p className="kc-history-paused" role="status">History recording is paused. New episodes won’t be added until you resume.</p>}
    {confirmClear&&<div className="kc-history-confirm" role="alert"><span>Clear all watch history from this browser?</span><button className="kc-btn kc-btn-danger" onClick={clearHistory}>Clear history</button><button className="kc-btn" onClick={()=>setConfirmClear(false)}>Cancel</button></div>}
    {filtered.length?<div className="kc-history-list">{filtered.map(item=>{const progress=progressOf(item);return <article className="kc-history-item" key={item.progressKey}><Link to={`/watch/${encodeURIComponent(item.slug)}/${item.episodeNumber}`} className="kc-history-poster">{item.posterUrl?<img src={item.posterUrl} alt="" loading="lazy"/>:<span>{item.title.slice(0,2).toUpperCase()}</span>}<i><span style={{width:`${progress}%`}}/></i></Link><div className="kc-history-copy"><span className="kc-section-kicker">{new Date(item.updatedAt).toLocaleDateString()}</span><Link to={`/watch/${encodeURIComponent(item.slug)}/${item.episodeNumber}`}><h2>{item.title}</h2></Link><p>Episode {item.episodeNumber}{item.episodeTitle?` · ${item.episodeTitle}`:''}</p><small>{progress>=95?'Watched':progress>0?`${Math.round(progress)}% watched`:'Not started'}</small></div><button type="button" className="kc-icon-btn" aria-label={`Remove ${item.title} episode ${item.episodeNumber} from history`} onClick={()=>removeItem(item)}><Trash2 size={16}/></button></article>})}</div>:<EmptyState title={query?'No matching history':'No watch history yet'}>{query?'Try a different anime title.':<>Start watching an episode and it will be saved here automatically. Browse <Link className="kc-link" to="/browse/trending">trending anime</Link> to find something to watch.</>}</EmptyState>}
  </section>;
}
export function AccountPage({ title }: { title: string }) {
  const location=useLocation();const [user,setUser]=useState<AccountUser|null>(null);const [loaded,setLoaded]=useState(false);
  useEffect(()=>{let active=true;fetch('/api/v1/me',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(p=>{if(active)setUser(p?.data?.user??null)}).catch(()=>{if(active)setUser(null)}).finally(()=>{if(active)setLoaded(true)});return()=>{active=false}},[location.key]);
  const status=new URLSearchParams(location.search).get('google');
  const messages:Record<string,string>={connected:'Google has been connected to your Kairo account.',already_linked:'That Google account is already connected to a different Kairo account.',another_account_linked:'A different Google account is already connected here.'};
  return <><header className="kc-page-head"><h1>{title}</h1></header>
    {title==='Settings'&&loaded&&user?<section className="kc-account-panel"><h2>Account</h2><p>Signed in as <strong>{user.displayName}</strong> · {user.email}</p><h3>Connected sign-in methods</h3><p>Connect Google as an additional way to sign in. You’ll be asked to sign in again first if your current session is older than 15 minutes.</p><a className="kc-auth-google" href="/api/v1/auth/google?intent=link"><span aria-hidden="true">G</span>Connect Google</a>{status&&<p role="status" className="kc-auth-copy">{messages[status]??'Google account linking status updated.'}</p>}</section>
    :title==='Settings'&&loaded?<EmptyState title="Sign in to manage your account"><Link className="kc-link" to="/login">Sign in</Link> to connect Google and manage your account.</EmptyState>
    :<EmptyState title="Not available yet">{title} features are still being built. You can still <Link className="kc-link" to="/search">search</Link> and browse.</EmptyState>}
  </>;
}
export function AboutPage() {
  return <><header className="kc-page-head"><h1>About Kairo</h1><p>A personal anime discovery catalogue.</p></header><section className="kc-about-panel" aria-labelledby="artwork-credit-title"><h2 id="artwork-credit-title">Artwork credits</h2><a className="kc-about-tmdb-logo" href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer"><img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg" alt="The Movie Database (TMDB)" loading="lazy" /></a><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p><p>TMDB can provide posters, landscape backdrops and supplementary title details such as a synopsis, rating, genres, release year and episode count when catalogue fields are missing. Kairo's title identity, episode lists and playback sources are supplied separately; TMDB may also provide episode still thumbnails.</p><a className="kc-link" href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">Visit The Movie Database</a></section></>;
}
export function NotFoundPage() {
  return <><header className="kc-page-head"><h1>Page not found</h1></header><EmptyState title="That page doesn’t exist"><Link className="kc-link" to="/">Go to the home page</Link></EmptyState></>;
}
