import { Link } from 'react-router-dom';
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
        <div className="kc-profile-id">
          <h1>Profile</h1>
          <p>Guest · accounts aren’t available yet</p>
        </div>
        <ul className="kc-stats" aria-label="Stats">
          <li><span><Clock size={16} aria-hidden="true" /></span><b>–</b><small>Watching</small></li>
          <li><span><Star size={16} aria-hidden="true" /></span><b>–</b><small>Episodes</small></li>
          <li><span><Heart size={16} aria-hidden="true" /></span><b>–</b><small>Mean score</small></li>
        </ul>
        <button type="button" className="kc-btn kc-btn-primary" disabled><LogIn size={15} aria-hidden="true" /> Sign in</button>
      </div>
    </div>
  );
}

export function HistoryPage() {
  return (
    <>
      <header className="kc-page-head"><h1>History</h1><p>Continue where you left off</p></header>
      <EmptyState title="No watch history">History needs an account, and accounts aren’t available yet. You can still <Link className="kc-link" to="/search">search</Link> or <Link className="kc-link" to="/browse/trending">see what’s trending</Link>.</EmptyState>
    </>
  );
}

export function AccountPage({ title }: { title: string }) {
  return (
    <>
      <header className="kc-page-head"><h1>{title}</h1></header>
      <EmptyState title="Not available yet">{title} belongs to an account, and accounts aren’t available yet. You can still <Link className="kc-link" to="/search">search</Link> and browse.</EmptyState>
    </>
  );
}


export function AboutPage() {
  return (
    <>
      <header className="kc-page-head">
        <h1>About Kairo</h1>
        <p>A personal anime discovery catalogue.</p>
      </header>
      <section className="kc-about-panel" aria-labelledby="artwork-credit-title">
        <h2 id="artwork-credit-title">Artwork credits</h2>
        <a className="kc-about-tmdb-logo" href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">
          <img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg" alt="The Movie Database (TMDB)" loading="lazy" />
        </a>
        <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        <p>TMDB can provide posters, landscape backdrops and supplementary title details such as a synopsis, rating, genres, release year and episode count when catalogue fields are missing. Kairo's title identity, episode lists and playback sources are supplied separately; TMDB may also provide episode still thumbnails.</p>
        <a className="kc-link" href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">Visit The Movie Database</a>
      </section>
    </>
  );
}

export function NotFoundPage() {
  return (
    <>
      <header className="kc-page-head"><h1>Page not found</h1></header>
      <EmptyState title="That page doesn’t exist"><Link className="kc-link" to="/">Go to the home page</Link></EmptyState>
    </>
  );
}
