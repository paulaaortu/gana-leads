import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="center">
      <h2>Página no encontrada</h2>
      <Link to="/">Volver al listado</Link>
    </div>
  );
}