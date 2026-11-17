export interface RequirementInput {
  id: string;
  reqCode: string;
  title: string;
  priority: string;
  acceptanceCriteria: Array<{ criteriaCode: string; statement: string }>;
  businessRules: Array<{ ruleCode: string; statement: string }>;
}

export interface ScenarioInput {
  id: string;
  testCaseId: string;
  requirementIds: string[] | string;
  title: string;
  testType: string;
  priority: string;
  status: string;
}

export interface ExecutionResultInput {
  testCaseId: string | null;
  specFile: string;
  status: string;
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
  executionResult: 'PASSED' | 'FAILED' | 'SKIPPED' | 'TIMEDOUT' | 'NOT_EXECUTED';
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

function parseReqIds(val: string[] | string): string[] {
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function calculateCoverageAndTraceability(params: {
  requirements: RequirementInput[];
  scenarios: ScenarioInput[];
  latestResults: ExecutionResultInput[];
  automationSpecsByScenarioId?: Map<string, string>;
}): CoverageAuditReport {
  const validReqCodes = new Set(params.requirements.map((r) => r.reqCode));
  const resultByTc = new Map<string, ExecutionResultInput>();
  for (const res of params.latestResults) {
    if (res.testCaseId) {
      resultByTc.set(res.testCaseId.toUpperCase(), res);
    }
  }

  const normalizedScenarios = params.scenarios.map((s) => ({
    ...s,
    parsedReqIds: parseReqIds(s.requirementIds),
  }));

  const orphanScenarioIds = normalizedScenarios
    .filter((s) => !s.parsedReqIds.some((code) => validReqCodes.has(code)))
    .map((s) => s.testCaseId);

  const matrix: TraceabilityRow[] = [];
  const uncoveredReqCodes: string[] = [];
  const reqsMissingNegativeTests: string[] = [];

  for (const req of params.requirements) {
    const linkedScenarios = normalizedScenarios.filter((s) =>
      s.parsedReqIds.includes(req.reqCode)
    );

    if (linkedScenarios.length === 0) {
      uncoveredReqCodes.push(req.reqCode);
      matrix.push({
        reqCode: req.reqCode,
        requirementTitle: req.title,
        priority: req.priority,
        acceptanceCriteriaCount: req.acceptanceCriteria.length,
        businessRulesCount: req.businessRules.length,
        testCaseId: null,
        scenarioTitle: null,
        testType: null,
        scenarioStatus: null,
        specFile: null,
        executionResult: 'NOT_EXECUTED',
        coverageStatus: 'UNCOVERED',
      });
      continue;
    }

    const hasNegative = linkedScenarios.some((s) =>
      ['Negative', 'Boundary', 'Validation', 'Security'].includes(s.testType)
    );
    if (!hasNegative) {
      reqsMissingNegativeTests.push(req.reqCode);
    }

    for (const sc of linkedScenarios) {
      const exec = resultByTc.get(sc.testCaseId.toUpperCase());
      const mappedSpec =
        exec?.specFile || params.automationSpecsByScenarioId?.get(sc.id) || null;
      const execStatus = (exec?.status?.toUpperCase() || 'NOT_EXECUTED') as TraceabilityRow['executionResult'];

      matrix.push({
        reqCode: req.reqCode,
        requirementTitle: req.title,
        priority: req.priority,
        acceptanceCriteriaCount: req.acceptanceCriteria.length,
        businessRulesCount: req.businessRules.length,
        testCaseId: sc.testCaseId,
        scenarioTitle: sc.title,
        testType: sc.testType,
        scenarioStatus: sc.status,
        specFile: mappedSpec,
        executionResult: execStatus,
        coverageStatus: 'COVERED',
      });
    }
  }

  const totalRequirements = params.requirements.length;
  const coveredRequirements = totalRequirements - uncoveredReqCodes.length;
  const coveragePercentage =
    totalRequirements > 0 ? Math.round((coveredRequirements / totalRequirements) * 100) : 0;

  return {
    totalRequirements,
    coveredRequirements,
    uncoveredRequirements: uncoveredReqCodes.length,
    coveragePercentage,
    uncoveredReqCodes,
    reqsMissingNegativeTests,
    orphanScenarioIds,
    totalScenarios: params.scenarios.length,
    automatedScenarios: params.scenarios.filter((s) => s.status === 'AUTOMATED').length,
    matrix,
  };
}

function escapeCsvCell(val: string | number | null): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportTraceabilityCsv(rows: TraceabilityRow[]): string {
  const headers = [
    'Requirement ID',
    'Requirement Title',
    'Priority',
    'Acceptance Criteria',
    'Business Rules',
    'Test Case ID',
    'Scenario Title',
    'Test Type',
    'Scenario Status',
    'Automation Spec',
    'Execution Result',
    'Coverage Status',
  ];
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.reqCode,
        r.requirementTitle,
        r.priority,
        r.acceptanceCriteriaCount,
        r.businessRulesCount,
        r.testCaseId ?? 'UNMAPPED',
        r.scenarioTitle ?? 'No test scenario',
        r.testType ?? '-',
        r.scenarioStatus ?? '-',
        r.specFile ?? 'Not generated',
        r.executionResult,
        r.coverageStatus,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }
  return lines.join('\n');
}
