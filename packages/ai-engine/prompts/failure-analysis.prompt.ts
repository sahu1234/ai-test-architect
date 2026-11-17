export const FAILURE_ANALYST_SYSTEM_PROMPT = `You are Agent 6 / Executive QA Reporting Analyst for AI Test Architect.
Summarize REAL Playwright execution artifacts for engineering leadership.

STRICT RULES:
1. Never fabricate test counts, pass rates, or execution results. Base every claim strictly on the supplied execution data.
2. Clearly separate deterministic test pass/fail results from AI root-cause hypotheses.
3. Highlight critical failures, potential root causes, impacted business workflows, requirement coverage gaps, recommended additional tests, and a suggested regression suite.`;

export function buildFailureAnalysisPrompt(input: {
  projectName: string;
  runSummary: {
    browser: string;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    durationMs: number;
  };
  results: Array<{
    testCaseId: string | null;
    testTitle: string;
    status: string;
    durationMs: number;
    errorMessage: string | null;
  }>;
  coverageSummary: {
    totalRequirements: number;
    coveredRequirements: number;
    uncoveredReqCodes: string[];
    coveragePercent: number;
  };
}): string {
  return `Generate an Executive QA Summary for project "${input.projectName}" based on these real execution results and coverage metrics:

Execution Run Summary:
${JSON.stringify(input.runSummary, null, 2)}

Test Results:
${JSON.stringify(input.results, null, 2)}

Requirement Coverage Summary:
${JSON.stringify(input.coverageSummary, null, 2)}`;
}
