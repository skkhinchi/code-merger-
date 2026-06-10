import { useEffect, useRef } from 'react'
import type { GitHubRepo } from '../types/github'
import './RepoPicker.css'

type RepoPickerProps = {
  repos: GitHubRepo[]
  selectedRepo: GitHubRepo | null
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  error: string
  search: string
  totalCount: number | null
  onSearchChange: (query: string) => void
  onSelect: (repo: GitHubRepo) => void
  onLoadMore: () => void
  onRetry: () => void
}

function repoInitial(name: string): string {
  return (name.charAt(0) || '?').toUpperCase()
}

function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days < 1) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export default function RepoPicker({
  repos,
  selectedRepo,
  loading,
  loadingMore,
  hasMore,
  error,
  search,
  totalCount,
  onSearchChange,
  onSelect,
  onLoadMore,
  onRetry,
}: RepoPickerProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = listRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || !hasMore || loading || loadingMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore()
      },
      { root, rootMargin: '80px', threshold: 0 },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore, onLoadMore, repos.length])

  return (
    <div className="repo-picker">
      <div className="repo-picker__search-wrap">
        <span className="repo-picker__search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          type="search"
          className="repo-picker__search"
          placeholder="Search repositories…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search repositories"
        />
      </div>

      {!error && (
        <p className="repo-picker__count">
          {loading && repos.length === 0
            ? 'Searching…'
            : totalCount != null
              ? `${repos.length} of ${totalCount} match${search ? ` "${search}"` : ''}`
              : `${repos.length} loaded${hasMore ? '+' : ''}`}
        </p>
      )}

      {error ? (
        <div className="repo-picker__error">
          <p>{error}</p>
          <button type="button" className="repo-picker__retry" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : (
        <div ref={listRef} className="repo-picker__list" role="listbox" aria-label="Repositories">
          {loading && repos.length === 0 ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="repo-picker__item repo-picker__item--skeleton" />
            ))
          ) : repos.length === 0 ? (
            <p className="repo-picker__empty">No repositories found.</p>
          ) : (
            repos.map((repo) => {
              const active = selectedRepo?.fullName === repo.fullName
              return (
                <button
                  key={repo.fullName}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={
                    active
                      ? 'repo-picker__item repo-picker__item--active'
                      : 'repo-picker__item'
                  }
                  onClick={() => onSelect(repo)}
                >
                  <span className="repo-picker__avatar" aria-hidden="true">
                    {repoInitial(repo.name)}
                  </span>
                  <span className="repo-picker__meta">
                    <span className="repo-picker__name-row">
                      <span className="repo-picker__name">{repo.name}</span>
                      <span
                        className={
                          repo.private
                            ? 'repo-picker__badge repo-picker__badge--private'
                            : 'repo-picker__badge'
                        }
                      >
                        {repo.private ? 'Private' : 'Public'}
                      </span>
                    </span>
                    <span className="repo-picker__owner">{repo.owner}</span>
                    {repo.description && (
                      <span className="repo-picker__desc">{repo.description}</span>
                    )}
                    <span className="repo-picker__tags">
                      {repo.language && (
                        <span className="repo-picker__tag">{repo.language}</span>
                      )}
                      {repo.updatedAt && (
                        <span className="repo-picker__tag">
                          {formatRelativeDate(repo.updatedAt)}
                        </span>
                      )}
                    </span>
                  </span>
                  {active && <span className="repo-picker__check" aria-hidden="true">✓</span>}
                </button>
              )
            })
          )}

          <div ref={sentinelRef} className="repo-picker__sentinel" />

          {loadingMore && (
            <div className="repo-picker__loading-more">
              <span className="repo-picker__spinner" />
              Loading more…
            </div>
          )}

          {!hasMore && repos.length > 0 && !loading && (
            <p className="repo-picker__end">All repositories loaded</p>
          )}
        </div>
      )}
    </div>
  )
}
