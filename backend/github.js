import axios from "axios";

const baseURL = "https://api.github.com";

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("Missing GITHUB_TOKEN in environment");
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function repoPath(owner, repo) {
  const resolvedOwner = owner ?? process.env.OWNER;
  const resolvedRepo = repo ?? process.env.REPO;
  if (!resolvedOwner || !resolvedRepo) {
    throw new Error("Repository owner and name are required");
  }
  return `${resolvedOwner}/${resolvedRepo}`;
}

function formatGithubAxiosError(err) {
  if (!axios.isAxiosError(err) || !err.response) {
    return err instanceof Error ? err.message : String(err);
  }
  const { status, data } = err.response;
  const ghMsg = data?.message ?? err.message;
  const errors = Array.isArray(data?.errors)
    ? data.errors.map((e) => e.message ?? JSON.stringify(e)).join("; ")
    : "";
  let hint = "";
  if (status === 404) {
    hint =
      " (404: repo not found, or token cannot access this private repo — GitHub hides private repos as 404. Check OWNER/REPO and token scopes.)";
  }
  return `GitHub ${status}: ${ghMsg}${errors ? ` — ${errors}` : ""}${hint}`;
}

function mapRepoSummary(r) {
  return {
    owner: r.owner?.login ?? "",
    name: r.name ?? "",
    fullName: r.full_name ?? "",
    private: Boolean(r.private),
    description: r.description ?? null,
    language: r.language ?? null,
    updatedAt: r.updated_at ?? r.pushed_at ?? null,
  };
}

/** @type {{ repos: ReturnType<typeof mapRepoSummary>[], expiresAt: number } | null} */
let userReposCache = null;
const USER_REPOS_CACHE_MS = 60_000;

async function fetchUserReposPage(page, perPage = 100) {
  const res = await axios.get(`${baseURL}/user/repos`, {
    headers: githubHeaders(),
    params: {
      per_page: perPage,
      page,
      sort: "updated",
      affiliation: "owner,collaborator,organization_member",
    },
  });
  return res.data ?? [];
}

async function getAllUserRepos() {
  const now = Date.now();
  if (userReposCache && userReposCache.expiresAt > now) {
    return userReposCache.repos;
  }

  const repos = [];
  let page = 1;
  while (page <= 15) {
    const batch = await fetchUserReposPage(page, 100);
    for (const r of batch) {
      repos.push(mapRepoSummary(r));
    }
    if (batch.length < 100) break;
    page += 1;
  }

  userReposCache = { repos, expiresAt: now + USER_REPOS_CACHE_MS };
  return repos;
}

export async function listRepos({ page = 1, perPage = 20, search = "" } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePerPage = Math.min(50, Math.max(5, Number(perPage) || 20));
  const query = String(search).trim().toLowerCase();

  try {
    if (query) {
      const all = await getAllUserRepos();
      const filtered = all.filter((r) => r.name.toLowerCase().includes(query));
      const start = (safePage - 1) * safePerPage;
      const repos = filtered.slice(start, start + safePerPage);
      return {
        repos,
        page: safePage,
        perPage: safePerPage,
        hasMore: start + safePerPage < filtered.length,
        totalCount: filtered.length,
      };
    }

    const batch = await fetchUserReposPage(safePage, safePerPage);
    return {
      repos: batch.map(mapRepoSummary),
      page: safePage,
      perPage: safePerPage,
      hasMore: batch.length === safePerPage,
      totalCount: null,
    };
  } catch (err) {
    throw new Error(formatGithubAxiosError(err));
  }
}

export async function getRepoDetails(owner, repo) {
  const path = repoPath(owner, repo);
  try {
    const res = await axios.get(`${baseURL}/repos/${path}`, {
      headers: githubHeaders(),
    });
    const r = res.data;
    return {
      owner: r.owner?.login ?? owner,
      name: r.name ?? repo,
      fullName: r.full_name ?? `${owner}/${repo}`,
      description: r.description ?? null,
      defaultBranch: r.default_branch ?? "main",
      language: r.language ?? null,
      stars: r.stargazers_count ?? 0,
      forks: r.forks_count ?? 0,
      openIssues: r.open_issues_count ?? 0,
      private: Boolean(r.private),
      updatedAt: r.updated_at ?? null,
      htmlUrl: r.html_url ?? `https://github.com/${path}`,
    };
  } catch (err) {
    throw new Error(formatGithubAxiosError(err));
  }
}

export async function listBranches(owner, repo) {
  const path = repoPath(owner, repo);
  try {
    const branches = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const res = await axios.get(`${baseURL}/repos/${path}/branches`, {
        headers: githubHeaders(),
        params: { per_page: perPage, page },
      });
      const batch = res.data ?? [];
      for (const b of batch) {
        branches.push({ name: b.name });
      }
      if (batch.length < perPage) break;
      page += 1;
      if (page > 10) break;
    }

    branches.sort((a, b) => a.name.localeCompare(b.name));
    return branches;
  } catch (err) {
    throw new Error(formatGithubAxiosError(err));
  }
}

export async function compareBranches(source, target, owner, repo) {
  const path = repoPath(owner, repo);
  const compareRef = `${encodeURIComponent(target)}...${encodeURIComponent(source)}`;
  try {
    const res = await axios.get(`${baseURL}/repos/${path}/compare/${compareRef}`, {
      headers: githubHeaders(),
    });
    const rawFiles = res.data?.files ?? [];
    const files = rawFiles
      .filter((f) => f.status && f.status !== "unchanged")
      .map((f) => ({
        filename: f.filename ?? "",
        previousFilename: f.previous_filename ?? null,
        status: f.status,
        additions: f.additions ?? 0,
        deletions: f.deletions ?? 0,
        changes: f.changes ?? 0,
      }));

    const summary = {
      total: files.length,
      added: files.filter((f) => f.status === "added").length,
      modified: files.filter((f) =>
        ["modified", "changed", "copied"].includes(f.status)
      ).length,
      removed: files.filter((f) => f.status === "removed").length,
      renamed: files.filter((f) => f.status === "renamed").length,
    };

    return {
      files,
      summary,
      commits: res.data?.total_commits ?? 0,
    };
  } catch (err) {
    throw new Error(formatGithubAxiosError(err));
  }
}

export async function createPR(source, target, owner, repo) {
  const path = repoPath(owner, repo);
  try {
    const res = await axios.post(
      `${baseURL}/repos/${path}/pulls`,
      {
        title: `Merge ${source} → ${target}`,
        head: source,
        base: target,
      },
      { headers: githubHeaders() }
    );
    return res.data;
  } catch (err) {
    throw new Error(formatGithubAxiosError(err));
  }
}

export async function mergePR(prNumber, owner, repo) {
  const path = repoPath(owner, repo);
  try {
    const res = await axios.put(
      `${baseURL}/repos/${path}/pulls/${prNumber}/merge`,
      {},
      { headers: githubHeaders() }
    );
    return res.data;
  } catch (err) {
    throw new Error(formatGithubAxiosError(err));
  }
}