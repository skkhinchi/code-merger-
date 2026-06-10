import type { GitHubRepo } from '../types/github'

const STORAGE_KEY = 'merge-agent-recent-repos'
const MAX_RECENT = 6

export function getRecentRepos(): GitHubRepo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is GitHubRepo =>
        typeof r === 'object' &&
        r !== null &&
        typeof r.owner === 'string' &&
        typeof r.name === 'string' &&
        typeof r.fullName === 'string' &&
        typeof r.private === 'boolean',
    )
  } catch {
    return []
  }
}

export function addRecentRepo(repo: GitHubRepo): GitHubRepo[] {
  const next = [
    repo,
    ...getRecentRepos().filter((r) => r.fullName !== repo.fullName),
  ].slice(0, MAX_RECENT)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
