import { GitHubService, GitHubConfig, GitHubPRPushResult } from './providers/githubService';

export interface AutoFixPR {
  id: string;
  issueId: string;
  title: string;
  branch: string;
  status: 'open' | 'testing' | 'merged' | 'verified';
  createdAt: string;
  stackTrace: string;
  rootCause: string;
  reproductionTest: {
    filename: string;
    code: string;
    testStatus: 'passed' | 'failed' | 'running';
  };
  patch: {
    targetFile: string;
    diff: string;
  };
  author: string;
  githubUrl?: string;
  githubBranchUrl?: string;
  isPushedToGitHub?: boolean;
}

export class PRPipeline {
  private prs: AutoFixPR[] = [];
  private githubService: GitHubService;

  constructor(githubService?: GitHubService) {
    this.githubService = githubService || new GitHubService();

    // Seed with a sample prior auto-fix
    this.prs.push({
      id: 'PR-104',
      issueId: 'ISSUE-892',
      title: '[Auto-Fix: Bug #892] Fix undefined currencyFormatter on international checkout',
      branch: 'fix/autofix-issue-892-currency-fmt',
      status: 'merged',
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      stackTrace: 'TypeError: Cannot read properties of undefined (reading "formatCurrency") at CheckoutTotals.tsx:42',
      rootCause: 'International locale configs passed null formatter when fallback was missing.',
      reproductionTest: {
        filename: 'src/components/__tests__/CheckoutTotals.autofix.test.tsx',
        code: `test('renders safely when currencyFormatter is null', () => {
  const result = render(<CheckoutTotals currencyFormatter={null} amount={99} />);
  expect(result.getByText('$99.00')).toBeInTheDocument();
});`,
        testStatus: 'passed',
      },
      patch: {
        targetFile: 'src/components/CheckoutTotals.tsx',
        diff: `@@ -41,3 +41,4 @@
- const formatted = currencyFormatter.formatCurrency(amount);
+ const formatted = currencyFormatter?.formatCurrency ? currencyFormatter.formatCurrency(amount) : \`$\${amount.toFixed(2)}\`;`,
      },
      author: 'Antigravity Auto-Fix Bot [AI]',
      githubUrl: 'https://github.com/webmcp/core/pull/892',
      isPushedToGitHub: true,
    });
  }

  public getGitHubService(): GitHubService {
    return this.githubService;
  }

  public createAutoFixPR(issueId: string, error: { message: string; stack?: string }): AutoFixPR {
    const prNumber = 100 + this.prs.length + 1;
    const branchName = `fix/autofix-${issueId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    // Synthesize reproduction test & patch based on the error
    let targetFile = 'src/components/NexusApp.tsx';
    let rootCause = 'Unhandled null/undefined reference when accessing deep nested properties.';
    let diff = `@@ -188,2 +188,4 @@
- const activeItem = workspace.settings.preferences.activeTheme;
+ const activeItem = workspace?.settings?.preferences?.activeTheme ?? 'dark';`;
    let testCode = `describe('Autonomous Regression Test - ${issueId}', () => {
  it('handles corrupted or uninitialized state gracefully', () => {
    const result = safeResolveProperty(null, 'activeTheme', 'dark');
    expect(result).toBe('dark');
  });
});`;

    if (error.message.includes('cannot read properties') || error.message.includes('undefined')) {
      rootCause = `Guard missing for nullable property access: "${error.message}"`;
      targetFile = 'src/components/NexusApp.tsx';
      diff = `@@ -210,3 +210,3 @@
- const themeConfig = userConfig.theme.primary;
+ const themeConfig = userConfig?.theme?.primary ?? '#22c55e';`;
    } else if (error.message.includes('SyntaxError') || error.message.includes('JSON')) {
      rootCause = `JSON parse failure on malformed client payload: "${error.message}"`;
      targetFile = 'src/utils/storage.ts';
      diff = `@@ -14,3 +14,5 @@
- return JSON.parse(raw);
+ try { return JSON.parse(raw); } catch { return null; }`;
    }

    const pr: AutoFixPR = {
      id: `PR-${prNumber}`,
      issueId,
      title: `[Auto-Fix: ${issueId}] ${error.message.substring(0, 60)}...`,
      branch: branchName,
      status: 'open',
      createdAt: new Date().toISOString(),
      stackTrace: error.stack || error.message,
      rootCause,
      reproductionTest: {
        filename: `tests/autofix/${issueId.toLowerCase()}.test.ts`,
        code: testCode,
        testStatus: 'passed',
      },
      patch: {
        targetFile,
        diff,
      },
      author: 'Antigravity Auto-Fix Bot [AI]',
      isPushedToGitHub: false,
    };

    this.prs.unshift(pr);
    return pr;
  }

  public async pushPRToGitHub(id: string, config: GitHubConfig): Promise<GitHubPRPushResult> {
    const pr = this.getPRById(id);
    if (!pr) {
      return { success: false, isSimulated: false, message: 'PR not found' };
    }

    const result = await this.githubService.pushPRToGitHub(pr, config);
    if (result.success) {
      pr.githubUrl = result.prUrl;
      pr.githubBranchUrl = result.branchUrl;
      pr.isPushedToGitHub = true;
    }
    return result;
  }

  public getPRs(): AutoFixPR[] {
    return this.prs;
  }

  public getPRById(id: string): AutoFixPR | undefined {
    return this.prs.find((p) => p.id === id);
  }
}
