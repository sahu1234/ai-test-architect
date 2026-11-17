import { prisma } from '../db/client.ts';
import { orchestrateFailureAnalysis } from '../ai-engine/orchestrator/ai-orchestrator.ts';
import type { ProviderMode } from '../ai-engine/providers/provider-factory.ts';
import { calculateCoverageAndTraceability } from '../coverage-engine/coverage.ts';

export async function generateProjectExecutiveReport(
  projectId: string,
  executionRunId: string,
  providerOverride?: ProviderMode
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      requirements: {
        include: { acceptanceCriteria: true, businessRules: true },
        orderBy: { reqCode: 'asc' },
      },
      testScenarios: { orderBy: { testCaseId: 'asc' } },
    },
  });
  if (!project) throw new Error('Project not found');

  const run = await prisma.executionRun.findUnique({
    where: { id: executionRunId },
    include: { results: true },
  });
  if (!run) throw new Error('Execution run not found');

  const coverage = calculateCoverageAndTraceability({
    requirements: project.requirements,
    scenarios: project.testScenarios,
    latestResults: run.results,
  });

  const aiResult = await orchestrateFailureAnalysis(
    projectId,
    {
      projectName: project.name,
      runSummary: {
        browser: run.browser,
        totalTests: run.totalTests,
        passedTests: run.passedTests,
        failedTests: run.failedTests,
        skippedTests: run.skippedTests,
        durationMs: run.durationMs,
      },
      results: run.results.map((r) => ({
        testCaseId: r.testCaseId,
        testTitle: r.testTitle,
        status: r.status,
        durationMs: r.durationMs,
        errorMessage: r.errorMessage,
      })),
      coverageSummary: {
        totalRequirements: coverage.totalRequirements,
        coveredRequirements: coverage.coveredRequirements,
        uncoveredReqCodes: coverage.uncoveredReqCodes,
        coveragePercent: coverage.coveragePercentage,
      },
    },
    providerOverride
  );

  const reportPayload = {
    ...aiResult.data,
    generatedByProvider: aiResult.provider,
    generatedByModel: aiResult.model,
    generatedAt: new Date().toISOString(),
  };

  await prisma.executionRun.update({
    where: { id: run.id },
    data: {
      executiveSummary: JSON.stringify(reportPayload),
    },
  });

  return reportPayload;
}
