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

function repoPath() {
  const owner = process.env.OWNER;
  const repo = process.env.REPO;
  if (!owner || !repo) {
    throw new Error("Set OWNER and REPO in .env (GitHub owner/org and repository name)");
  }
  return `${owner}/${repo}`;
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

export async function createPR(source, target) {
  const path = repoPath();
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

export async function mergePR(prNumber) {
  const path = repoPath();
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