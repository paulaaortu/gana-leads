interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

export default function Pagination({ page, pageSize, total, onPage }: Props) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <nav className="pagination" aria-label="Paginación">
      <span aria-live="polite">
        {from}–{to} de {total}
      </span>
      <div>
        <button disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
        <span className="page-info"> Página {page} de {lastPage} </span>
        <button disabled={page >= lastPage} onClick={() => onPage(page + 1)}>Siguiente</button>
      </div>
    </nav>
  );
}