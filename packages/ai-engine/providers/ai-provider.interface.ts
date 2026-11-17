import type {
  FailureAnalysis,
  GeneratedAutomationOutput,
  RequirementAnalysis,
  TestScenarioItem,
} from '../schemas/ai-schemas.ts';
import type { ExplorationContextForPrompt } from '../prompts/automation-generation.prompt.ts';

export interface RequirementAnalysisInput {
  rawText: string;
  applicationName: string;
}

export interface TestPlanningInput {
  analysis: RequirementAnalysis;
  applicationName: string;
}

export interface AutomationInput {
  applicationName: string;
  targetUrl: string;
  scenarios: TestScenarioItem[];
  exploration?: ExplorationContextForPrompt | null;
}

export interface FailureInput {
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
}

export interface AIRequestOptions {
  abortSignal?: AbortSignal;
}

export interface AIProvider {
  readonly providerName: 'gemini' | 'mock';
  readonly modelName: string;
  analyzeRequirements(
    input: RequirementAnalysisInput,
    requestOptions?: AIRequestOptions
  ): Promise<RequirementAnalysis>;
  generateTestScenarios(
    input: TestPlanningInput,
    requestOptions?: AIRequestOptions
  ): Promise<TestScenarioItem[]>;
  generateAutomation(
    input: AutomationInput,
    requestOptions?: AIRequestOptions
  ): Promise<GeneratedAutomationOutput>;
  analyzeFailure(
    input: FailureInput,
    requestOptions?: AIRequestOptions
  ): Promise<FailureAnalysis>;
}
