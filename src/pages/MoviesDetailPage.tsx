import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { TitleDetail } from '../components/TitleDetail';
import { MyListProvider } from '../lib/useMyList';
import '../styles-netflix.css';

/** Full-page version of the title details (shared links, search suggestions, middle-click). */
export default function MoviesDetailPage() {
  const { externalId = '' } = useParams();
  return (
    <MyListProvider>
      <div className="nf nf-bleed nf-detail-page">
        <Link to="/movies" className="nf-back"><ArrowLeft size={18} aria-hidden="true" /> Browse</Link>
        <div className="nf-modal"><TitleDetail key={externalId} externalId={externalId} /></div>
      </div>
    </MyListProvider>
  );
}
