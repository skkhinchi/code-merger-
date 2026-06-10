import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { apiBaseUrl } from '../config'
import { formatApiError } from '../utils/apiError'
import type {
  GitHubBranch,
  GitHubRepo,
  GitHubRepoDetails,
  GitHubReposPage,
  MergeFileChanges,
} from '../types/github'
import { addRecentRepo, getRecentRepos } from '../utils/recentRepos'

export type { GitHubBranch, GitHubRepo, GitHubRepoDetails }

const PAGE_SIZE = 15
const SEARCH_DEBOUNCE_MS = 350

type CommandResponse = {
  message: string
  source?: string
  target?: string
  owner?: string
  repo?: string
  fileChanges?: MergeFileChanges | null
}

function handleAxiosError(e: unknown): string {
  return formatApiError(e)
}

function resolveRepo(
  repoOrName: GitHubRepo | string,
  repos: GitHubRepo[],
  recentRepos: GitHubRepo[],
): GitHubRepo | null {
  if (typeof repoOrName !== 'string') return repoOrName

  if (!repoOrName) return null

  return (
    repos.find((r) => r.fullName === repoOrName) ??
    recentRepos.find((r) => r.fullName === repoOrName) ??
    (() => {
      const [owner, ...rest] = repoOrName.split('/')
      const name = rest.join('/')
      if (!owner || !name) return null
      return { owner, name, fullName: repoOrName, private: false }
    })()
  )
}

export function useMergeAgent() {
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [reposPage, setReposPage] = useState(1)
  const [reposHasMore, setReposHasMore] = useState(true)
  const [reposLoading, setReposLoading] = useState(true)
  const [reposLoadingMore, setReposLoadingMore] = useState(false)
  const [reposError, setReposError] = useState('')
  const [repoSearch, setRepoSearch] = useState('')
  const [reposTotalCount, setReposTotalCount] = useState<number | null>(null)

  const [recentRepos, setRecentRepos] = useState<GitHubRepo[]>(() => getRecentRepos())

  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [repoDetails, setRepoDetails] = useState<GitHubRepoDetails | null>(null)
  const [repoDetailsLoading, setRepoDetailsLoading] = useState(false)
  const [repoDetailsError, setRepoDetailsError] = useState('')

  const [branches, setBranches] = useState<GitHubBranch[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [branchesError, setBranchesError] = useState('')

  const [sourceBranch, setSourceBranch] = useState('')
  const [targetBranch, setTargetBranch] = useState('')
  const [input, setInput] = useState('')

  const [msg, setMsg] = useState('')
  const [mergeFileChanges, setMergeFileChanges] = useState<MergeFileChanges | null>(null)
  const [pendingMergeSource, setPendingMergeSource] = useState('')
  const [pendingMergeTarget, setPendingMergeTarget] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mergeSuccess, setMergeSuccess] = useState(false)

  const fetchIdRef = useRef(0)
  const repoLoadIdRef = useRef(0)

  const fetchRepos = useCallback(async (page: number, search: string, append: boolean) => {
    const baseUrl = apiBaseUrl()
    if (!baseUrl) {
      setReposError('Missing API URL. Set VITE_API_URL or run in dev mode.')
      setReposLoading(false)
      return
    }

    const fetchId = ++fetchIdRef.current

    if (append) {
      setReposLoadingMore(true)
    } else {
      setRepos([])
      setReposLoading(true)
      setReposError('')
      setReposHasMore(true)
      setReposTotalCount(null)
    }

    try {
      const res = await axios.get<GitHubReposPage>(`${baseUrl}/github/repos`, {
        params: {
          page,
          per_page: PAGE_SIZE,
          ...(search.trim() ? { search: search.trim() } : {}),
        },
      })

      if (fetchId !== fetchIdRef.current) return

      const batch = res.data.repos ?? []
      setRepos((prev) => {
        if (!append) return batch
        const seen = new Set(prev.map((r) => r.fullName))
        const merged = [...prev, ...batch.filter((r) => !seen.has(r.fullName))]
        return merged
      })
      setReposPage(page)
      setReposHasMore(Boolean(res.data.hasMore))
      setReposTotalCount(res.data.totalCount ?? null)
    } catch (e) {
      if (fetchId !== fetchIdRef.current) return
      setReposError(handleAxiosError(e))
      if (!append) setRepos([])
    } finally {
      if (fetchId === fetchIdRef.current) {
        setReposLoading(false)
        setReposLoadingMore(false)
      }
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchRepos(1, repoSearch, false)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [repoSearch, fetchRepos])

  const loadMoreRepos = useCallback(() => {
    if (reposLoading || reposLoadingMore || !reposHasMore) return
    void fetchRepos(reposPage + 1, repoSearch, true)
  }, [fetchRepos, repoSearch, reposPage, reposHasMore, reposLoading, reposLoadingMore])

  const reloadRepos = useCallback(() => {
    void fetchRepos(1, repoSearch, false)
  }, [fetchRepos, repoSearch])

  const selectRepo = async (repoOrName: GitHubRepo | string) => {
    const repo = resolveRepo(repoOrName, repos, recentRepos)

    if (!repo) {
      setSelectedRepo(null)
      setRepoDetails(null)
      setRepoDetailsError('')
      setBranches([])
      setSourceBranch('')
      setTargetBranch('')
      setInput('')
      setMsg('')
      setMergeSuccess(false)
      return
    }

    const loadId = ++repoLoadIdRef.current

    setSelectedRepo(repo)
    setRecentRepos(addRecentRepo(repo))
    setSourceBranch('')
    setTargetBranch('')
    setInput('')
    setMsg('')
    setMergeSuccess(false)
    setRepoDetailsError('')
    setBranchesError('')
    setRepoDetailsLoading(true)
    setBranchesLoading(true)

    const baseUrl = apiBaseUrl()
    if (!baseUrl) {
      const err = 'Missing API URL. Set VITE_API_URL or run in dev mode.'
      setBranchesError(err)
      setRepoDetailsError(err)
      setRepoDetailsLoading(false)
      setBranchesLoading(false)
      return
    }

    const detailsUrl = `${baseUrl}/github/repos/${repo.owner}/${repo.name}`
    const branchesUrl = `${baseUrl}/github/repos/${repo.owner}/${repo.name}/branches`

    void axios
      .get<{ repo: GitHubRepoDetails }>(detailsUrl)
      .then((res) => {
        if (loadId !== repoLoadIdRef.current) return
        setRepoDetails(res.data.repo)
        setRepoDetailsError('')
      })
      .catch((e) => {
        if (loadId !== repoLoadIdRef.current) return
        setRepoDetailsError(handleAxiosError(e))
      })
      .finally(() => {
        if (loadId === repoLoadIdRef.current) setRepoDetailsLoading(false)
      })

    void axios
      .get<{ branches: GitHubBranch[] }>(branchesUrl)
      .then((res) => {
        if (loadId !== repoLoadIdRef.current) return
        setBranches(res.data.branches ?? [])
        setBranchesError('')
      })
      .catch((e) => {
        if (loadId !== repoLoadIdRef.current) return
        setBranchesError(handleAxiosError(e))
      })
      .finally(() => {
        if (loadId === repoLoadIdRef.current) setBranchesLoading(false)
      })
  }

  const sendCommand = async () => {
    const baseUrl = apiBaseUrl()
    if (!baseUrl) {
      setMsg('Missing API URL. Set VITE_API_URL or run in dev mode.')
      return
    }
    if (!selectedRepo) {
      setMsg('Select a repository first.')
      return
    }

    const hasBranches = sourceBranch && targetBranch
    const hasInput = input.trim().length > 0
    if (!hasBranches && !hasInput) {
      setMsg('Pick source and target branches, or enter a merge command.')
      return
    }

    setLoading(true)
    setMergeSuccess(false)
    setMergeFileChanges(null)
    setPendingMergeSource('')
    setPendingMergeTarget('')
    try {
      const body: Record<string, string> = {
        owner: selectedRepo.owner,
        repo: selectedRepo.name,
      }
      if (hasBranches) {
        body.source = sourceBranch
        body.target = targetBranch
      }
      if (hasInput) {
        body.input = input.trim()
      }

      const res = await axios.post<CommandResponse>(`${baseUrl}/command`, body)
      setMsg(res.data.message)
      setMergeFileChanges(res.data.fileChanges ?? null)
      setPendingMergeSource(res.data.source ?? sourceBranch)
      setPendingMergeTarget(res.data.target ?? targetBranch)
      setShowModal(true)
    } catch (e) {
      setMsg(handleAxiosError(e))
    } finally {
      setLoading(false)
    }
  }

  const confirmMerge = async () => {
    const baseUrl = apiBaseUrl()
    if (!baseUrl) {
      setMsg('Missing API URL. Set VITE_API_URL or run in dev mode.')
      return
    }
    setLoading(true)
    try {
      const res = await axios.post<CommandResponse>(`${baseUrl}/confirm`)
      setMsg(res.data.message)
      setMergeSuccess(true)
      setShowModal(false)
    } catch (e) {
      setMergeSuccess(false)
      setMsg(handleAxiosError(e))
    } finally {
      setLoading(false)
    }
  }

  const cancelModal = () => {
    setShowModal(false)
    setMergeFileChanges(null)
    setPendingMergeSource('')
    setPendingMergeTarget('')
  }

  return {
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
    sourceBranch,
    setSourceBranch,
    targetBranch,
    setTargetBranch,
    input,
    setInput,
    msg,
    mergeFileChanges,
    pendingMergeSource,
    pendingMergeTarget,
    loading,
    showModal,
    mergeSuccess,
    sendCommand,
    confirmMerge,
    cancelModal,
    reloadRepos,
  }
}
