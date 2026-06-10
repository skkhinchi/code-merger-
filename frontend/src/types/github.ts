export type GitHubRepo = {
  owner: string
  name: string
  fullName: string
  private: boolean
  description?: string | null
  language?: string | null
  updatedAt?: string | null
}

export type GitHubReposPage = {
  repos: GitHubRepo[]
  page: number
  perPage: number
  hasMore: boolean
  totalCount: number | null
}

export type GitHubRepoDetails = {
  owner: string
  name: string
  fullName: string
  description: string | null
  defaultBranch: string
  language: string | null
  stars: number
  forks: number
  openIssues: number
  private: boolean
  updatedAt: string | null
  htmlUrl: string
}

export type GitHubBranch = {
  name: string
}

export type MergeFileChange = {
  filename: string
  previousFilename: string | null
  status: string
  additions: number
  deletions: number
  changes: number
}

export type MergeFileSummary = {
  total: number
  added: number
  modified: number
  removed: number
  renamed: number
}

export type MergeFileChanges = {
  files: MergeFileChange[]
  summary: MergeFileSummary
  commits: number
}
