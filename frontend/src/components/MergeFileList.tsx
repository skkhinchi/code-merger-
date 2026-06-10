import type { MergeFileChanges } from '../types/github'
import './MergeFileList.css'

const DISPLAY_LIMIT = 40

type MergeFileListProps = {
  source: string
  target: string
  fileChanges: MergeFileChanges | null
}

function statusLabel(status: string): string {
  switch (status) {
    case 'added':
      return 'Added'
    case 'removed':
      return 'Removed'
    case 'renamed':
      return 'Renamed'
    case 'modified':
    case 'changed':
      return 'Modified'
    default:
      return status
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'added':
      return 'merge-files__status--added'
    case 'removed':
      return 'merge-files__status--removed'
    case 'renamed':
      return 'merge-files__status--renamed'
    default:
      return 'merge-files__status--modified'
  }
}

export default function MergeFileList({ source, target, fileChanges }: MergeFileListProps) {
  if (!fileChanges) {
    return (
      <p className="merge-files__unavailable">
        File change summary unavailable for this merge.
      </p>
    )
  }

  const { files, summary, commits } = fileChanges
  const visible = files.slice(0, DISPLAY_LIMIT)
  const hiddenCount = files.length - visible.length

  if (summary.total === 0) {
    return (
      <p className="merge-files__empty">
        No file differences between <strong>{source}</strong> and{' '}
        <strong>{target}</strong> — branches may already be in sync.
      </p>
    )
  }

  return (
    <div className="merge-files">
      <p className="merge-files__intro">
        Merging <strong>{source}</strong> → <strong>{target}</strong>
        {commits > 0 && (
          <span className="merge-files__commits">
            {' '}
            · {commits} commit{commits === 1 ? '' : 's'}
          </span>
        )}
      </p>

      <div className="merge-files__summary">
        <span className="merge-files__pill merge-files__pill--total">
          {summary.total} file{summary.total === 1 ? '' : 's'}
        </span>
        {summary.added > 0 && (
          <span className="merge-files__pill merge-files__pill--added">
            +{summary.added} added
          </span>
        )}
        {summary.modified > 0 && (
          <span className="merge-files__pill merge-files__pill--modified">
            ~{summary.modified} modified
          </span>
        )}
        {summary.removed > 0 && (
          <span className="merge-files__pill merge-files__pill--removed">
            −{summary.removed} removed
          </span>
        )}
        {summary.renamed > 0 && (
          <span className="merge-files__pill merge-files__pill--renamed">
            ↪ {summary.renamed} renamed
          </span>
        )}
      </div>

      <ul className="merge-files__list">
        {visible.map((file) => (
          <li key={`${file.status}-${file.filename}`} className="merge-files__item">
            <span className={`merge-files__status ${statusClass(file.status)}`}>
              {statusLabel(file.status)}
            </span>
            <span className="merge-files__path" title={file.filename}>
              {file.status === 'renamed' && file.previousFilename ? (
                <>
                  <span className="merge-files__path-old">{file.previousFilename}</span>
                  <span className="merge-files__path-arrow"> → </span>
                  {file.filename}
                </>
              ) : (
                file.filename
              )}
            </span>
            {(file.additions > 0 || file.deletions > 0) && (
              <span className="merge-files__diff">
                <span className="merge-files__add">+{file.additions}</span>
                <span className="merge-files__del">−{file.deletions}</span>
              </span>
            )}
          </li>
        ))}
      </ul>

      {hiddenCount > 0 && (
        <p className="merge-files__more">and {hiddenCount} more file{hiddenCount === 1 ? '' : 's'}…</p>
      )}
    </div>
  )
}
