import { useState, useEffect, useRef } from 'react';
import type { PackageResult, SearchResponse } from './types';

interface UseSearchResult {
  results: PackageResult[];
  total: number;
  loading: boolean;
  query: string;
  setQuery: (q: string) => void;
}

export function useSearch(): UseSearchResult {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PackageResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setTotal(0);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: trimmed,
          page: '1',
          limit: '20',
          sort: 'relevance',
        });
        const res = await fetch(`/api/search?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Search failed');
        const data: SearchResponse = await res.json();
        if (!controller.signal.aborted) {
          setResults(data.results);
          setTotal(data.total);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setResults([]);
          setTotal(0);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return { results, total, loading, query, setQuery };
}
