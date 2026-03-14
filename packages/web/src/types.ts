export interface PackageResult {
  name: string;
  description: string;
  latestVersion: string;
  weeklyDownloads: number;
  githubStars: number;
  lastCommitDate: string | null;
  hasTypescriptSupport: string;
  overallScore: number;
  keywords: string[];
  license: string;
  homepageUrl: string;
  repositoryUrl: string;
}

export interface SearchResponse {
  results: PackageResult[];
  total: number;
  page: number;
  limit: number;
}
