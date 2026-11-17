export interface AIProviderStatus {
  configuredMode: 'auto' | 'gemini' | 'mock';
  geminiKeyAvailable: boolean;
  activeProvider: 'gemini' | 'mock';
  modelName: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  applicationName: string;
  applicationUrl: string;
  environment: string;
  browserPreference: string;
  requirementCount?: number;
  scenarioCount?: number;
  lastRunStatus?: string;
  updatedAt: string;
}

export interface AcceptanceCriteriaItem {
  id: string;
  criteriaCode: string;
  statement: string;
  isTestable: boolean;
}

export interface BusinessRuleItem {
  id: string;
  ruleCode: string;
  statement: string;
  severity: string;
}

export interface RequirementItem {
  id: string;
  reqCode: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  actorsJson: string;
  ambiguitiesJson: string;
  assumptionsJson: string;
  missingInfoJson: string;
  status: string;
  acceptanceCriteria: AcceptanceCriteriaItem[];
  businessRules: BusinessRuleItem[];
}

export interface RequirementDocumentItem {
  id: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  rawText: string;
  analysisJson: string | null;
  analysisNotes: string | null;
  status: string;
  createdAt: string;
}

export interface TestScenarioRecord {
  id: string;
  testCaseId: string;
  requirementIds: string;
  title: string;
  testType: string;
  priority: string;
  preconditions: string;
  testSteps: string;
  testData: string;
  expectedResult: string;
  tags: string;
  reasoning: string;
  status: string;
}

export interface ExplorationRecord {
  id: string;
  targetUrl: string;
  pageTitle: string;
  inspectedUrlsJson: string;
  formsJson: string;
  interactiveJson: string;
  navigationJson: string;
  domSummary: string;
  screenshotPath: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

export interface AutomationFileRecord {
  id: string;
  relativePath: string;
  fileCategory: string;
  content: string;
  locatorsJson: string;
  linkedReqIds: string;
}

export interface GeneratedAutomationRecord {
  id: string;
  workspaceDir: string;
  scenarioIdsJson: string;
  validationStatus: string;
  validationReport: string | null;
  approvalStatus: string;
  approvedBy: string | null;
  approvedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  files: AutomationFileRecord[];
}

export interface ExecutionResultRecord {
  id: string;
  testCaseId: string | null;
  testTitle: string;
  specFile: string;
  browser: string;
  status: string;
  durationMs: number;
  errorMessage: string | null;
  stackTrace: string | null;
  screenshotPath: string | null;
  tracePath: string | null;
  videoPath: string | null;
}

export interface ExecutionRunRecord {
  id: string;
  projectId: string;
  browser: string;
  headed: boolean;
  workers: number;
  retries: number;
  status: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  durationMs: number;
  htmlReportPath: string | null;
  jsonReportPath: string | null;
  junitReportPath: string | null;
  executiveSummary: string | null;
  createdAt: string;
  results: ExecutionResultRecord[];
  project?: { id: string; name: string };
}

export interface TraceabilityRow {
  reqCode: string;
  requirementTitle: string;
  priority: string;
  acceptanceCriteriaCount: number;
  businessRulesCount: number;
  testCaseId: string | null;
  scenarioTitle: string | null;
  testType: string | null;
  scenarioStatus: string | null;
  specFile: string | null;
  executionResult: string;
  coverageStatus: 'COVERED' | 'UNCOVERED';
}

export interface CoverageAuditReport {
  totalRequirements: number;
  coveredRequirements: number;
  uncoveredRequirements: number;
  coveragePercentage: number;
  uncoveredReqCodes: string[];
  reqsMissingNegativeTests: string[];
  orphanScenarioIds: string[];
  totalScenarios: number;
  automatedScenarios: number;
  matrix: TraceabilityRow[];
}

export interface FullProjectRecord extends ProjectSummary {
  requirementDocuments: RequirementDocumentItem[];
  requirements: RequirementItem[];
  testScenarios: TestScenarioRecord[];
  explorations: ExplorationRecord[];
  generatedAutomations: GeneratedAutomationRecord[];
  executionRuns: ExecutionRunRecord[];
}
