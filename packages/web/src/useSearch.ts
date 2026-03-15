import { useState, useEffect, useRef, useCallback } from 'react'
import type { PackageResult, SearchResponse, SortOption } from './types'

interface UseSearchResult {
  results: PackageResult[]
  total: number
  loading: boolean
  query: string
  setQuery: (q: string) => void
  sort: SortOption
  setSort: (s: SortOption) => void
  page: number
  setPage: (p: number) => void
  totalPages: number
  limit: number
}

const LIMIT = 20

export function useSearch(): UseSearchResult {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortOption>('relevance')
  const [page, setPage] = useState(1)
  const [results, setResults] = useState<PackageResult[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Reset page when query or sort changes
  const handleSetQuery = useCallback((q: string) => {
    setQuery(q)
    setPage(1)
  }, [])

  const handleSetSort = useCallback((s: SortOption) => {
    setSort(s)
    setPage(1)
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setTotal(0)
      return
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      try {
        const params = new URLSearchParams({
          q: trimmed,
          page: String(page),
          limit: String(LIMIT),
          sort,
        })
        const res = await fetch(`/api/search?${params}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error('Search failed')
        const data: SearchResponse = await res.json()
        if (!controller.signal.aborted) {
          setResults(data.results)
          setTotal(data.total)
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (!controller.signal.aborted) {
          setResults([])
          setTotal(0)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, sort, page])

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  return {
    results,
    total,
    loading,
    query,
    setQuery: handleSetQuery,
    sort,
    setSort: handleSetSort,
    page,
    setPage,
    totalPages,
    limit: LIMIT,
  }
}
