import { Link } from 'react-router-dom';
import { EmptyState } from '../components/catalog';

export function AccountPage({ title }: { title: string }) {
  return (
    <>
      <header className="kc-page-head"><span className="kc-eyebrow">ACCOUNT</span><h1>{title}</h1></header>
      <EmptyState title="Sign-in is not set up yet">
        {title} belongs to an account, and accounts are not available yet. Nothing is stored in this browser as a substitute. You can still <Link className="kc-link" to="/search">search</Link> and browse the catalogue.
      </EmptyState>
    </>
  );
}

export function NotFoundPage() {
  return (
    <>
      <header className="kc-page-head"><span className="kc-eyebrow">404</span><h1>Page not found</h1></header>
      <EmptyState title="That page does not exist"><Link className="kc-link" to="/">Go to the home page</Link></EmptyState>
    </>
  );
}
