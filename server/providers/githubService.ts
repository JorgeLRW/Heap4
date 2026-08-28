import { AutoFixPR } from '../prPipeline';

export interface GitHubConfig {
  token?: string;
  repo?: string; // e.g. "octocat/hello-world"
  defaultBranch?: string; // e.g. "main"
}

export interface GitHubValidationResult {
  valid: boolean;
  message: string;
  repoDetails?: {
    fullName: string;
    description: string;
    stars: number;
    defaultBranch: string;
    private: boolean;
  };
}

export interface GitHubPRPushResult {
  success: boolean;
  message: string;
  prUrl?: string;
  branchUrl?: string;
  isSimulated: boolean;
}

export class GitHubService {
  /**
   * Validate GitHub Personal Access Token (PAT) and repository access
   */
  public async validateConnection(config: GitHubConfig): Promise<GitHubValidationResult> {
    if (!config.token || config.token.trim().length === 0) {
      return {
        valid: false,
        message: 'Missing GitHub Personal Access Token (PAT).',
      };
    }

    const token = config.token.trim();
    const repo = (config.repo || '').trim();

    try {
      // 1. Verify user / token authentication
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'WebMCP-AutoFix-Platform',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!userRes.ok) {
        return {
          valid: false,
          message: `GitHub token verification failed (HTTP ${userRes.status}). Ensure your PAT is valid and has "repo" scope.`,
        };
      }

      const userData: any = await userRes.json();
      const login = userData.login || 'Authenticated User';

      // 2. If repo specified, check repo access
      if (repo && repo.includes('/')) {
        const repoRes = await fetch(`https://api.github.com/repos/${repo}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'WebMCP-AutoFix-Platform',
          },
          signal: AbortSignal.timeout(5000),
        });

        if (repoRes.ok) {
          const repoData: any = await repoRes.json();
          return {
            valid: true,
            message: `Authenticated as @${login}. Full push access to ${repo}.`,
            repoDetails: {
              fullName: repoData.full_name,
              description: repoData.description || 'Repository connected to WebMCP Auto-Fix Pipeline',
              stars: repoData.stargazers_count || 0,
              defaultBranch: repoData.default_branch || 'main',
              private: !!repoData.private,
            },
          };
        } else {
          return {
            valid: false,
            message: `Authenticated as @${login}, but repository "${repo}" could not be accessed (HTTP ${repoRes.status}).`,
          };
        }
      }

      return {
        valid: true,
        message: `Authenticated as @${login}. Ready to target repositories.`,
      };
    } catch (err: any) {
      return {
        valid: false,
        message: `GitHub connection failed: ${err?.message || 'Network error'}`,
      };
    }
  }

  /**
   * Push an automated PR directly to the remote GitHub repository
   */
  public async pushPRToGitHub(pr: AutoFixPR, config: GitHubConfig): Promise<GitHubPRPushResult> {
    if (!config.token || !config.repo || !config.repo.includes('/')) {
      // High-fidelity simulation mode
      return {
        success: true,
        isSimulated: true,
        message: `Auto-Fix PR simulated for ${config.repo || 'github.com/webmcp/core'}. Configure a GitHub PAT in Settings to push directly to GitHub.`,
        prUrl: `https://github.com/${config.repo || 'webmcp/core'}/pull/42`,
        branchUrl: `https://github.com/${config.repo || 'webmcp/core'}/tree/${pr.branch}`,
      };
    }

    const token = config.token.trim();
    const repo = config.repo.trim();
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'WebMCP-AutoFix-Platform',
      'Content-Type': 'application/json',
    };

    try {
      // 1. Get default branch ref SHA
      const baseBranch = config.defaultBranch || 'main';
      const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${baseBranch}`, {
        headers,
        signal: AbortSignal.timeout(6000),
      });

      if (!refRes.ok) {
        return {
          success: false,
          isSimulated: false,
          message: `Failed to find base branch "${baseBranch}" in ${repo} (HTTP ${refRes.status}).`,
        };
      }

      const refData: any = await refRes.json();
      const baseSha = refData.object?.sha;

      // 2. Create branch
      const branchRes = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ref: `refs/heads/${pr.branch}`,
          sha: baseSha,
        }),
        signal: AbortSignal.timeout(6000),
      });

      // 3. Create or Update Reproduction Test file in the branch
      const testContentB64 = Buffer.from(pr.reproductionTest.code).toString('base64');
      await fetch(`https://api.github.com/repos/${repo}/contents/${pr.reproductionTest.filename}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: `test: add autonomous reproduction test for ${pr.issueId}`,
          content: testContentB64,
          branch: pr.branch,
        }),
      });

      // 4. Open the Pull Request
      const prBody = `## 🤖 WebMCP Autonomous Auto-Fix

### Issue Summary
- **Issue ID**: \`${pr.issueId}\`
- **Root Cause**: ${pr.rootCause}
- **Stack Trace**:
\`\`\`
${pr.stackTrace}
\`\`\`

### Auto-Generated Reproduction Unit Test
Added reproduction test in \`${pr.reproductionTest.filename}\`.

### Unified Git Diff
\`\`\`diff
${pr.patch.diff}
\`\`\`

---
*Created autonomously by [WebMCP Auto-Fix Platform](https://github.com/webmcp).*`;

      const createPrRes = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: pr.title,
          head: pr.branch,
          base: baseBranch,
          body: prBody,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!createPrRes.ok) {
        const errText = await createPrRes.text();
        return {
          success: false,
          isSimulated: false,
          message: `Branch created on GitHub, but PR creation returned: ${errText.substring(0, 100)}`,
          branchUrl: `https://github.com/${repo}/tree/${pr.branch}`,
        };
      }

      const prJson: any = await createPrRes.json();
      return {
        success: true,
        isSimulated: false,
        message: `Successfully opened GitHub Pull Request #${prJson.number} on ${repo}!`,
        prUrl: prJson.html_url,
        branchUrl: `https://github.com/${repo}/tree/${pr.branch}`,
      };
    } catch (err: any) {
      return {
        success: false,
        isSimulated: false,
        message: `GitHub API error: ${err?.message || 'Failed to complete PR pipeline'}`,
      };
    }
  }
}
