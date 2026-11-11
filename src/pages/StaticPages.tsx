import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Clock, Heart, LogIn, Settings, Star, UserRound } from 'lucide-react';
import { EmptyState } from '../components/catalog';

export function ProfilePage() {
  return (
    <div className="kc-profile">
      <div className="kc-profile-banner">
        <button type="button" className="kc-icon-btn" disabled aria-label="Profile settings" title="Profile settings"><Settings size={16} aria-hidden="true" /></button>
      </div>
      <div className="kc-profile-row">
        <div className="kc-avatar-box"><UserRound size={44} strokeWidth={1.6} aria-hidden="true" /></div>
        <div className="kc-profile-id"><h1>Profile</h1><p>Sign in to view your Kairo profile.</p></div>
        <ul className="kc-stats" aria-label="Stats">
          <li><span><Clock size={16} aria-hidden="true" /></span><b>–</b><small>Watching</small></li>
          <li><span><Star size={16} aria-hidden="true" /></span><b>–</b><small>Episodes</small></li>
          <li><span><Heart size={16} aria-hidden="true" /></span><b>–</b><small>Mean score</small></li>
        </ul>
        <Link className="kc-btn kc-btn-primary" to="/login"><LogIn size={15} aria-hidden="true" /> Sign in</Link>
      </div>
    </div>
  );
}
export function HistoryPage() {
  return <><header className="kc-page-head"><h1>History</h1><p>Continue where you left off</p></header><EmptyState title="No watch history">History needs an account. You can still <Link className="kc-link" to="/search">search</Link> or <Link className="kc-link" to="/browse/trending">see what’s trending</Link>.</EmptyState></>;
}
export function AccountPage({ title }: { title: string }) {
  const location=useLocation();const [user,setUser]=useState<{id:string;displayName:string;email:string|null}|null>(null);const [loaded,setLoaded]=useState(false);
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
