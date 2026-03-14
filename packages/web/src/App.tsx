import { useSearch } from './useSearch';
import { PackageCard } from './PackageCard';
import type { SortOption } from './types';
import './styles.css';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'score', label: 'Score' },
  { value: 'stars', label: 'Stars' },
  { value: 'updated', label: 'Recently Updated' },
];

export function App() {
  const { results, total, loading, query, setQuery, sort, setSort, page, setPage, totalPages } =
    useSearch();

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">npmdex</h1>
        <p className="tagline">Better npm package search</p>
      </header>

      <div className="search-container">
        <input
          type="text"
          className="search-input"
          placeholder="Search packages..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {query.trim() && (
        <div className="toolbar">
          <div className="sort-control">
            <label htmlFor="sort-select" className="sort-label">
              Sort by
            </label>
            <select
              id="sort-select"
              className="sort-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <main className="results-container">
        {loading && (
          <div className="spinner-container">
            <div className="spinner" />
          </div>
        )}

        {!loading && query.trim() && results.length === 0 && (
          <div className="empty-state">No packages found for &ldquo;{query.trim()}&rdquo;</div>
        )}

        {!loading && !query.trim() && (
          <div className="empty-state">Start typing to search npm packages</div>
        )}

        {!loading && results.length > 0 && (
          <>
            <p className="results-count">
              {total.toLocaleString()} package{total !== 1 ? 's' : ''} found
            </p>
            <div className="results-list">
              {results.map((pkg) => (
                <PackageCard key={pkg.name} pkg={pkg} />
              ))}
            </div>

            {totalPages > 1 && (
              <nav className="pagination" aria-label="Search results pages">
                <button className="page-btn" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                  Previous
                </button>
                <span className="page-info">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="page-btn"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </main>
    </div>
  );
}
