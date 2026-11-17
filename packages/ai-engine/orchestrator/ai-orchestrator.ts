import { prisma } from '../../db/client.ts';
import { createAIProvider, type ProviderMode } from '../providers/provider-factory.ts';
import type {
  AutomationInput,
  FailureInput,
  RequirementAnalysisInput,
  TestPlanningInput,
} from '../providers/ai-provider.interface.ts';

export async function runAgentWithLogging<T>(params: {
  projectId?: string;
  agentName: string;
  providerOverride?: ProviderMode;
  modelOverride?: string;
  execute: (provider: ReturnType<typeof createAIProvider>) => Promise<T>;
}): Promise<{ data: T; provider: 'gemini' | 'mock'; model: string; durationMs: number }> {
  const provider = createAIProvider(params.providerOverride, params.modelOverride);
  const start = Date.now();

  try {
    const data = await params.execute(provider);
    const durationMs = Date.now() - start;

    await prisma.aIExecutionLog.create({
      data: {
        projectId: params.projectId ?? null,
        agentName: params.agentName,
        provider: provider.providerName,
        model: provider.modelName,
        durationMs,
        success: true,
      },
    });

    return {
      data,
      provider: provider.providerName,
      model: provider.modelName,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const errorCode = err instanceof Error ? err.name : 'UNKNOWN_ERROR';

    await prisma.aIExecutionLog
      .create({
        data: {
          projectId: params.projectId ?? null,
          agentName: params.agentName,
          provider: provider.providerName,
          model: provider.modelName,
          durationMs,
          success: false,
          errorCode: errorCode.slice(0, 64),
        },
      })
      .catch(() => {});

    throw err;
  }
}

export async function orchestrateRequirementAnalysis(
  projectId: string,
  input: RequirementAnalysisInput,
  providerOverride?: ProviderMode
) {
  return runAgentWithLogging({
    projectId,
    agentName: 'RequirementAnalystAgent',
    providerOverride,
    execute: (provider) => provider.analyzeRequirements(input),
  });
}

export async function orchestrateTestPlanning(
  projectId: string,
  input: TestPlanningInput,
  providerOverride?: ProviderMode
) {
  return runAgentWithLogging({
    projectId,
    agentName: 'TestPlanningAgent',
    providerOverride,
    execute: (provider) => provider.generateTestScenarios(input),
  });
}

export async function orchestrateAutomationGeneration(
  projectId: string,
  input: AutomationInput,
  providerOverride?: ProviderMode
) {
  return runAgentWithLogging({
    projectId,
    agentName: 'PlaywrightCodeGeneratorAgent',
    providerOverride,
    execute: (provider) => provider.generateAutomation(input),
  });
}

export async function orchestrateFailureAnalysis(
  projectId: string,
  input: FailureInput,
  providerOverride?: ProviderMode
) {
  return runAgentWithLogging({
    projectId,
    agentName: 'ExecutiveFailureAnalystAgent',
    providerOverride,
    execute: (provider) => provider.analyzeFailure(input),
  });
}
