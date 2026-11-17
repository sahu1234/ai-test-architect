import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { z } from 'zod';
import {
  FailureAnalysisSchema,
  GeneratedAutomationOutputSchema,
  RequirementAnalysisSchema,
  TestPlanOutputSchema,
  type FailureAnalysis,
  type GeneratedAutomationOutput,
  type RequirementAnalysis,
  type TestScenarioItem,
} from '../schemas/ai-schemas.ts';
import {
  REQUIREMENT_ANALYST_SYSTEM_PROMPT,
  buildRequirementAnalysisPrompt,
} from '../prompts/requirement-analysis.prompt.ts';
import {
  TEST_PLANNING_SYSTEM_PROMPT,
  buildTestPlanningPrompt,
} from '../prompts/test-planning.prompt.ts';
import {
  AUTOMATION_GENERATOR_SYSTEM_PROMPT,
  buildAutomationGenerationPrompt,
} from '../prompts/automation-generation.prompt.ts';
import {
  FAILURE_ANALYST_SYSTEM_PROMPT,
  buildFailureAnalysisPrompt,
} from '../prompts/failure-analysis.prompt.ts';
import type {
  AIProvider,
  AutomationInput,
  FailureInput,
  RequirementAnalysisInput,
  TestPlanningInput,
} from './ai-provider.interface.ts';

const REQUIREMENT_ANALYSIS_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    actors: { type: Type.ARRAY, items: { type: Type.STRING } },
    workflows: { type: Type.ARRAY, items: { type: Type.STRING } },
    duplicateWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
    globalMissingInformation: { type: Type.ARRAY, items: { type: Type.STRING } },
    globalAmbiguities: { type: Type.ARRAY, items: { type: Type.STRING } },
    globalAssumptions: { type: Type.ARRAY, items: { type: Type.STRING } },
    requirements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          reqCode: { type: Type.STRING },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          category: { type: Type.STRING },
          priority: { type: Type.STRING },
          actors: { type: Type.ARRAY, items: { type: Type.STRING } },
          acceptanceCriteria: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                criteriaCode: { type: Type.STRING },
                statement: { type: Type.STRING },
                isTestable: { type: Type.BOOLEAN },
              },
              required: ['criteriaCode', 'statement', 'isTestable'],
            },
          },
          businessRules: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                ruleCode: { type: Type.STRING },
                statement: { type: Type.STRING },
                severity: { type: Type.STRING },
              },
              required: ['ruleCode', 'statement', 'severity'],
            },
          },
          missingInformation: { type: Type.ARRAY, items: { type: Type.STRING } },
          ambiguities: { type: Type.ARRAY, items: { type: Type.STRING } },
          assumptions: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['reqCode', 'title', 'description', 'category', 'priority'],
      },
    },
  },
  required: ['summary', 'requirements'],
};

const TEST_PLAN_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    scenarios: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          testCaseId: { type: Type.STRING },
          requirementIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          title: { type: Type.STRING },
          testType: { type: Type.STRING },
          priority: { type: Type.STRING },
          preconditions: { type: Type.ARRAY, items: { type: Type.STRING } },
          testSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
          testDataJson: {
            type: Type.STRING,
            description: 'JSON-serialized object of test input data for this scenario',
          },
          expectedResult: { type: Type.STRING },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          reasoning: { type: Type.STRING },
        },
        required: [
          'testCaseId',
          'requirementIds',
          'title',
          'testType',
          'priority',
          'testSteps',
          'expectedResult',
          'reasoning',
        ],
      },
    },
  },
  required: ['scenarios'],
};

const AUTOMATION_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    architectureNotes: { type: Type.STRING },
    files: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          relativePath: { type: Type.STRING },
          fileCategory: { type: Type.STRING },
          content: { type: Type.STRING },
          locators: { type: Type.ARRAY, items: { type: Type.STRING } },
          linkedReqIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['relativePath', 'fileCategory', 'content', 'locators', 'linkedReqIds'],
      },
    },
  },
  required: ['files'],
};

const FAILURE_ANALYSIS_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    overallSummary: { type: Type.STRING },
    criticalFailures: { type: Type.ARRAY, items: { type: Type.STRING } },
    potentialRootCauses: { type: Type.ARRAY, items: { type: Type.STRING } },
    failedWorkflows: { type: Type.ARRAY, items: { type: Type.STRING } },
    missingCoverage: { type: Type.ARRAY, items: { type: Type.STRING } },
    recommendedAdditionalTests: { type: Type.ARRAY, items: { type: Type.STRING } },
    suggestedRegressionSuite: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['overallSummary'],
};

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }
  return trimmed;
}

export class GeminiProvider implements AIProvider {
  public readonly providerName = 'gemini' as const;
  public readonly modelName: string;
  private readonly ai: GoogleGenAI;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options?: { apiKey?: string; model?: string; timeoutMs?: number; maxRetries?: number }) {
    const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    this.modelName = options?.model || process.env.GEMINI_MODEL || 'gemini-4-hydrogen';
    this.timeoutMs = options?.timeoutMs ?? 45000;
    this.maxRetries = options?.maxRetries ?? 2;
    this.ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  private async callStructured<T>(params: {
    systemInstruction: string;
    prompt: string;
    responseSchema: Schema;
    parser: (rawObj: unknown) => T;
  }): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await Promise.race([
          this.ai.models.generateContent({
            model: this.modelName,
            contents: params.prompt,
            config: {
              systemInstruction: params.systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: params.responseSchema,
            },
          }),
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener('abort', () => {
              reject(new Error(`Gemini request timed out after ${this.timeoutMs}ms`));
            });
          }),
        ]).finally(() => clearTimeout(timer));

        const text = response.text;
        if (!text) {
          throw new Error('Gemini returned an empty response body');
        }
        const cleaned = stripCodeFences(text);
        const parsedJson = JSON.parse(cleaned);
        return params.parser(parsedJson);
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isTransient =
          msg.includes('429') ||
          msg.includes('503') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('timed out') ||
          err instanceof SyntaxError ||
          err instanceof z.ZodError;

        if (!isTransient || attempt >= this.maxRetries) {
          break;
        }
        const backoffMs = 800 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async analyzeRequirements(input: RequirementAnalysisInput): Promise<RequirementAnalysis> {
    return this.callStructured({
      systemInstruction: REQUIREMENT_ANALYST_SYSTEM_PROMPT,
      prompt: buildRequirementAnalysisPrompt(input.rawText, input.applicationName),
      responseSchema: REQUIREMENT_ANALYSIS_RESPONSE_SCHEMA,
      parser: (raw) => RequirementAnalysisSchema.parse(raw),
    });
  }

  async generateTestScenarios(input: TestPlanningInput): Promise<TestScenarioItem[]> {
    const output = await this.callStructured({
      systemInstruction: TEST_PLANNING_SYSTEM_PROMPT,
      prompt: buildTestPlanningPrompt(input.analysis, input.applicationName),
      responseSchema: TEST_PLAN_RESPONSE_SCHEMA,
      parser: (raw) => {
        const obj = raw as { scenarios?: Array<Record<string, unknown>> };
        const normalized = {
          scenarios: (obj.scenarios ?? []).map((item) => {
            let testData: Record<string, unknown> = {};
            if (typeof item.testDataJson === 'string') {
              try {
                const parsed = JSON.parse(item.testDataJson);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  testData = parsed as Record<string, unknown>;
                }
              } catch {
                testData = { raw: item.testDataJson };
              }
            } else if (item.testData && typeof item.testData === 'object') {
              testData = item.testData as Record<string, unknown>;
            }
            return {
              ...item,
              testData,
            };
          }),
        };
        return TestPlanOutputSchema.parse(normalized);
      },
    });
    return output.scenarios;
  }

  async generateAutomation(input: AutomationInput): Promise<GeneratedAutomationOutput> {
    return this.callStructured({
      systemInstruction: AUTOMATION_GENERATOR_SYSTEM_PROMPT,
      prompt: buildAutomationGenerationPrompt({
        applicationName: input.applicationName,
        targetUrl: input.targetUrl,
        scenarios: input.scenarios,
        exploration: input.exploration,
      }),
      responseSchema: AUTOMATION_RESPONSE_SCHEMA,
      parser: (raw) => GeneratedAutomationOutputSchema.parse(raw),
    });
  }

  async analyzeFailure(input: FailureInput): Promise<FailureAnalysis> {
    return this.callStructured({
      systemInstruction: FAILURE_ANALYST_SYSTEM_PROMPT,
      prompt: buildFailureAnalysisPrompt(input),
      responseSchema: FAILURE_ANALYSIS_RESPONSE_SCHEMA,
      parser: (raw) => FailureAnalysisSchema.parse(raw),
    });
  }
}
