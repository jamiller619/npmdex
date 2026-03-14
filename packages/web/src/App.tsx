import { useSearch } from './useSearch';
import { PackageCard } from './PackageCard';
import './styles.css';

export function App() {
  const { results, total, loading, query, setQuery } = useSearch();

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
          </>
        )}
      </main>
    </div>
  );
}
