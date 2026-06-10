import AiBackground from './components/AiBackground'
import AiLogo from './components/AiLogo'
import MergeFileList from './components/MergeFileList'
import { BranchMergeSkeleton, RepoDetailsSkeleton } from './components/RepoContentSkeleton'
import RepoPicker from './components/RepoPicker'
import { useMergeAgent } from './hooks/useMergeAgent'

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function Home() {
  const {
    repos,
    reposLoading,
    reposLoadingMore,
    reposHasMore,
    reposError,
    repoSearch,
    setRepoSearch,
    reposTotalCount,
    loadMoreRepos,
    recentRepos,
    selectedRepo,
    repoDetails,
    repoDetailsLoading,
    repoDetailsError,
    selectRepo,
    branches,
    branchesLoading,
    branchesError,
    setSourceBranch,
    setTargetBranch,
    input,
    setInput,
    msg,
    mergeFileChanges,
    pendingMergeSource,
    pendingMergeTarget,
    loading,
    showModal,
    sourceBranch,
    targetBranch,
    mergeSuccess,
    sendCommand,
    confirmMerge,
    cancelModal,
    reloadRepos,
  } = useMergeAgent()

  const detailsReady =
    selectedRepo &&
    !repoDetailsLoading &&
    repoDetails?.fullName === selectedRepo.fullName

  const branchesReady = selectedRepo && !branchesLoading

  const canMerge =
    selectedRepo &&
    !loading &&
    branchesReady &&
    ((sourceBranch && targetBranch) || input.trim().length > 0)

  return (
    <div className="home">
      <AiBackground />

      <header className="home__page-header">
        <div className="home__page-header-inner">
          <div className="home__hero">
            <AiLogo size="md" />
            <div>
              <h1 className="home__page-title">DevOps AI</h1>
              <p className="home__page-subtitle">
                AI-powered branch merges — select a repo, pick branches, and promote code
                across environments.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="home__shell">
        <aside className="home__sidebar">
          <section className="home__panel">
            <h2 className="home__panel-title">Repository</h2>
            <RepoPicker
              repos={repos}
              selectedRepo={selectedRepo}
              loading={reposLoading}
              loadingMore={reposLoadingMore}
              hasMore={reposHasMore}
              error={reposError}
              search={repoSearch}
              totalCount={reposTotalCount}
              onSearchChange={setRepoSearch}
              onSelect={(repo) => void selectRepo(repo)}
              onLoadMore={loadMoreRepos}
              onRetry={reloadRepos}
            />
          </section>

          {recentRepos.length > 0 && (
            <section className="home__panel">
              <h2 className="home__panel-title">Recent</h2>
              <ul className="home__recent-list">
                {recentRepos.map((repo) => (
                  <li key={repo.fullName}>
                    <button
                      type="button"
                      className={
                        selectedRepo?.fullName === repo.fullName
                          ? 'home__recent-item home__recent-item--active'
                          : 'home__recent-item'
                      }
                      onClick={() => void selectRepo(repo.fullName)}
                    >
                      <span className="home__recent-name">{repo.name}</span>
                      <span className="home__recent-owner">{repo.owner}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        <main className="home__main">
          {!selectedRepo ? (
            <div className="home__empty">
              <div className="home__empty-icon">⎇</div>
              <h2>Select a repository to get started</h2>
              <p>
                Choose a repo from the sidebar or pick one from your recent list to view
                details and run branch merges.
              </p>
            </div>
          ) : (
            <>
              {showModal && (
                <section
                  className="home__confirm-panel home__confirm-panel--with-files"
                  role="alert"
                >
                  <div className="home__confirm-content">
                    <h2 className="home__confirm-title">Confirm merge</h2>
                    <p className="home__confirm-repo">{selectedRepo.fullName}</p>
                    <p className="home__confirm-text">{msg}</p>
                    <MergeFileList
                      source={pendingMergeSource || sourceBranch}
                      target={pendingMergeTarget || targetBranch}
                      fileChanges={mergeFileChanges}
                    />
                  </div>
                  <div className="home__confirm-actions">
                    <button
                      type="button"
                      className="home__btn home__btn--success"
                      onClick={confirmMerge}
                      disabled={loading}
                    >
                      {loading ? 'Merging…' : 'Yes, merge'}
                    </button>
                    <button
                      type="button"
                      className="home__btn home__btn--ghost"
                      onClick={cancelModal}
                      disabled={loading}
                    >
                      Cancel
                    </button>
                  </div>
                </section>
              )}

              {msg && !showModal && (
                <div
                  className={
                    mergeSuccess
                      ? 'home__alert home__alert--success'
                      : 'home__alert home__alert--info'
                  }
                  role={mergeSuccess ? 'status' : undefined}
                >
                  {msg}
                </div>
              )}

              {!detailsReady ? (
                <RepoDetailsSkeleton />
              ) : repoDetailsError ? (
                <section className="home__panel home__panel--main">
                  <p className="home__message home__message--error">{repoDetailsError}</p>
                </section>
              ) : repoDetails ? (
                <section
                  key={`details-${selectedRepo.fullName}`}
                  className="home__panel home__panel--main home__fade-in"
                >
                  <div className="home__repo-header">
                    <div className="home__repo-header-text">
                      <h2 className="home__repo-title">{repoDetails.fullName}</h2>
                      {repoDetails.description ? (
                        <p className="home__repo-desc">{repoDetails.description}</p>
                      ) : (
                        <p className="home__repo-desc home__repo-desc--muted">
                          No description provided.
                        </p>
                      )}
                    </div>
                    <a
                      className="home__btn home__btn--outline"
                      href={repoDetails.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on GitHub
                    </a>
                  </div>

                  <div className="home__repo-stats">
                    <span className="home__stat">
                      {repoDetails.private ? 'Private' : 'Public'}
                    </span>
                    <span className="home__stat">Default: {repoDetails.defaultBranch}</span>
                    {repoDetails.language && (
                      <span className="home__stat">{repoDetails.language}</span>
                    )}
                    <span className="home__stat">★ {repoDetails.stars}</span>
                    <span className="home__stat">⑂ {repoDetails.forks}</span>
                    <span className="home__stat">Issues: {repoDetails.openIssues}</span>
                    <span className="home__stat">
                      Updated {formatUpdatedAt(repoDetails.updatedAt)}
                    </span>
                  </div>
                </section>
              ) : null}

              {!branchesReady ? (
                <BranchMergeSkeleton />
              ) : (
                <section
                  key={`merge-${selectedRepo.fullName}`}
                  className="home__panel home__panel--main home__fade-in"
                >
                  <h2 className="home__section-title">Branch merge</h2>
                  <p className="home__section-desc">
                    Promote changes by merging a source branch into a target branch.
                  </p>

                  {branchesError ? (
                    <p className="home__message home__message--error">{branchesError}</p>
                  ) : (
                    <div className="home__branch-grid">
                      <div className="home__field">
                        <label className="home__label" htmlFor="source-branch">
                          Source branch
                        </label>
                        <select
                          id="source-branch"
                          className="home__select"
                          value={sourceBranch}
                          onChange={(e) => setSourceBranch(e.target.value)}
                        >
                          <option value="">Select source…</option>
                          {branches.map((b) => (
                            <option key={b.name} value={b.name}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="home__branch-arrow" aria-hidden="true">
                        →
                      </div>

                      <div className="home__field">
                        <label className="home__label" htmlFor="target-branch">
                          Target branch
                        </label>
                        <select
                          id="target-branch"
                          className="home__select"
                          value={targetBranch}
                          onChange={(e) => setTargetBranch(e.target.value)}
                        >
                          <option value="">Select target…</option>
                          {branches.map((b) => (
                            <option key={b.name} value={b.name}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="home__divider-row">
                    <span className="home__divider-line" />
                    <span className="home__divider-text">or natural language</span>
                    <span className="home__divider-line" />
                  </div>

                  <div className="home__field">
                    <label className="home__label" htmlFor="merge-command">
                      Merge command
                    </label>
                    <input
                      id="merge-command"
                      className="home__input"
                      placeholder="e.g. merge development to tnqa"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      disabled={!branchesReady}
                    />
                  </div>

                  <div className="home__actions">
                    <button
                      type="button"
                      className="home__btn home__btn--primary"
                      onClick={sendCommand}
                      disabled={!canMerge}
                    >
                      {loading ? 'Running…' : 'Create merge PR'}
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
