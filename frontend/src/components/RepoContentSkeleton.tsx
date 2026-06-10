import './RepoContentSkeleton.css'

export function RepoDetailsSkeleton() {
  return (
    <section className="repo-skeleton repo-skeleton--panel" aria-hidden="true">
      <div className="repo-skeleton__header">
        <div className="repo-skeleton__lines">
          <div className="repo-skeleton__bar repo-skeleton__bar--title" />
          <div className="repo-skeleton__bar repo-skeleton__bar--desc" />
          <div className="repo-skeleton__bar repo-skeleton__bar--desc-short" />
        </div>
        <div className="repo-skeleton__bar repo-skeleton__bar--btn" />
      </div>
      <div className="repo-skeleton__stats">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="repo-skeleton__chip" />
        ))}
      </div>
      <div className="repo-skeleton__loader-row">
        <span className="repo-skeleton__spinner" />
        <span className="repo-skeleton__loader-text">Loading repository details…</span>
      </div>
    </section>
  )
}

export function BranchMergeSkeleton() {
  return (
    <section className="repo-skeleton repo-skeleton--panel" aria-hidden="true">
      <div className="repo-skeleton__bar repo-skeleton__bar--section" />
      <div className="repo-skeleton__bar repo-skeleton__bar--subtitle" />
      <div className="repo-skeleton__branch-grid">
        <div className="repo-skeleton__field">
          <div className="repo-skeleton__bar repo-skeleton__bar--label" />
          <div className="repo-skeleton__bar repo-skeleton__bar--select" />
        </div>
        <div className="repo-skeleton__field">
          <div className="repo-skeleton__bar repo-skeleton__bar--label" />
          <div className="repo-skeleton__bar repo-skeleton__bar--select" />
        </div>
      </div>
      <div className="repo-skeleton__loader-row">
        <span className="repo-skeleton__spinner" />
        <span className="repo-skeleton__loader-text">Loading branches…</span>
      </div>
    </section>
  )
}
