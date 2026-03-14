const GITHUB_API_URL = 'https://api.github.com';

export interface GitHubRepoInfo {
  stargazers_count: number;
  open_issues_count: number;
  pushed_at: string;
}

function getAuthHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'npmdex-index-service',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Parse a GitHub owner/repo from a repository URL.
 * Returns null if the URL is not a GitHub URL.
 */
export function parseGitHubRepo(repoUrl: string): { owner: string; repo: string } | null {
  // Handle various GitHub URL formats:
  //   https://github.com/owner/repo
  //   http://github.com/owner/repo
  //   git://github.com/owner/repo
  //   git+https://github.com/owner/repo
  //   github.com/owner/repo
  const match = repoUrl.match(/(?:github\.com)[/:]([^/]+)\/([^/#?]+)/);
  if (!match) return null;

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, '');
  if (!owner || !repo) return null;

  return { owner, repo };
}

/**
 * Fetch repository info from the GitHub REST API v3.
 * Returns null if the repo is not found or inaccessible.
 */
export async function fetchGitHubRepoInfo(
  owner: string,
  repo: string,
): Promise<GitHubRepoInfo | null> {
  const url = `${GITHUB_API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const res = await fetch(url, { headers: getAuthHeaders() });

  if (res.status === 404 || res.status === 403) {
    return null;
  }

  if (res.status === 429) {
    const resetHeader = res.headers.get('x-ratelimit-reset');
    const resetTime = resetHeader ? new Date(parseInt(resetHeader, 10) * 1000) : null;
    throw new Error(
      `GitHub API rate limit exceeded. Resets at: ${resetTime?.toISOString() ?? 'unknown'}`,
    );
  }

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as GitHubRepoInfo;
  return data;
}

/**
 * Check remaining rate limit. Returns { remaining, resetAt }.
 */
export async function checkRateLimit(): Promise<{ remaining: number; resetAt: Date }> {
  const res = await fetch(`${GITHUB_API_URL}/rate_limit`, { headers: getAuthHeaders() });
  if (!res.ok) {
    throw new Error(`Failed to check rate limit: ${res.status}`);
  }
  const data = (await res.json()) as {
    resources: { core: { remaining: number; reset: number } };
  };
  return {
    remaining: data.resources.core.remaining,
    resetAt: new Date(data.resources.core.reset * 1000),
  };
}
