import { ApiError, GoogleGenAI, Type, type Schema } from '@google/genai';
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
  AIRequestOptions,
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

export const DEFAULT_GEMINI_TIMEOUT_MS = 30000;
export const DEFAULT_GEMINI_MAX_RETRIES = 1;

const RETRYABLE_HTTP_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);

export class RequestTimeoutError extends Error {
  public readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = 'RequestTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export interface GeminiErrorLogEntry {
  provider: 'gemini';
  model: string;
  attempt: number;
  maxAttempts: number;
  durationMs: number;
  errorName: string;
  statusCode: number | null;
  errorMessage: string;
  retryable: boolean;
}

export interface GeminiProviderOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  fetch?: typeof fetch;
  logger?: (entry: GeminiErrorLogEntry) => void;
}

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

export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/([?&]key=)[^&\s"']+/gi, '$1[REDACTED]')
    .replace(/\bAIza[0-9A-Za-z_-]{10,}\b/g, '[REDACTED_API_KEY]')
    .slice(0, 500);
}

function createAbortError(reason?: unknown): Error {
  if (reason instanceof Error && reason.name === 'AbortError') {
    return reason;
  }
  const message =
    typeof reason === 'string' && reason.trim()
      ? reason
      : reason instanceof Error && reason.message
        ? reason.message
        : 'Gemini request was aborted by caller';
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

export function extractHttpStatusCode(err: unknown): number | null {
  if (!err || typeof err !== 'object') {
    return null;
  }
  const record = err as { status?: unknown; statusCode?: unknown; message?: unknown };
  if (typeof record.status === 'number' && Number.isFinite(record.status)) {
    return record.status;
  }
  if (typeof record.statusCode === 'number' && Number.isFinite(record.statusCode)) {
    return record.statusCode;
  }
  if (typeof record.message === 'string') {
    try {
      const parsed = JSON.parse(record.message) as { error?: { code?: unknown } };
      if (typeof parsed?.error?.code === 'number') {
        return parsed.error.code;
      }
    } catch {
      // Not a JSON ApiError body
    }
  }
  return null;
}

function isNetworkFailure(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const cause = (err as Error & { cause?: unknown }).cause;
  const causeCode =
    cause && typeof cause === 'object' && 'code' in cause
      ? String((cause as { code?: unknown }).code)
      : '';
  const directCode =
    'code' in err ? String((err as Error & { code?: unknown }).code) : '';

  if (RETRYABLE_NETWORK_CODES.has(directCode) || RETRYABLE_NETWORK_CODES.has(causeCode)) {
    return true;
  }

  const msg = err.message.toLowerCase();
  return (
    msg.includes('fetch failed') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('econnrefused') ||
    msg.includes('socket hang up')
  );
}

function normalizeGeminiAttemptError(
  rawErr: unknown,
  ctx: {
    timedOut: boolean;
    timeoutMs: number;
    modelName: string;
    externalSignal?: AbortSignal;
  }
): { error: Error; statusCode: number | null; retryable: boolean } {
  const err = rawErr instanceof Error ? rawErr : new Error(String(rawErr));

  // 1. Caller explicitly cancelled via external AbortSignal: never retry
  if (ctx.externalSignal?.aborted) {
    return {
      error: createAbortError(ctx.externalSignal.reason),
      statusCode: null,
      retryable: false,
    };
  }

  // 2. Request timed out (either our per-attempt AbortController timer or SDK httpOptions.timeout)
  if (
    ctx.timedOut ||
    err instanceof RequestTimeoutError ||
    err.name === 'RequestTimeoutError' ||
    err.name === 'TimeoutError' ||
    err.name === 'AbortError'
  ) {
    const timeoutErr =
      err instanceof RequestTimeoutError
        ? err
        : new RequestTimeoutError(
            `Gemini request timed out after ${ctx.timeoutMs}ms (model=${ctx.modelName})`,
            ctx.timeoutMs
          );
    return {
      error: timeoutErr,
      statusCode: null,
      retryable: true,
    };
  }

  // 3. HTTP / ApiError responses from Gemini API
  const statusCode =
    err instanceof ApiError ? err.status : extractHttpStatusCode(err);

  if (statusCode !== null) {
    const retryable = RETRYABLE_HTTP_STATUS_CODES.has(statusCode);
    return {
      error: err,
      statusCode,
      retryable,
    };
  }

  // 4. Malformed JSON or Zod schema mismatch: non-transient
  if (err instanceof SyntaxError || err instanceof z.ZodError) {
    return {
      error: err,
      statusCode: null,
      retryable: false,
    };
  }

  // 5. Transient network failures
  if (isNetworkFailure(err)) {
    return {
      error: err,
      statusCode: null,
      retryable: true,
    };
  }

  // 6. All other errors are non-retryable
  return {
    error: err,
    statusCode: null,
    retryable: false,
  };
}

async function waitWithAbort(delayMs: number, abortSignal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) {
    if (abortSignal?.aborted) {
      throw createAbortError(abortSignal.reason);
    }
    return;
  }
  await new Promise<void>((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(createAbortError(abortSignal.reason));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError(abortSignal?.reason));
    };
    const timer = setTimeout(() => {
      abortSignal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    abortSignal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class GeminiProvider implements AIProvider {
  public readonly providerName = 'gemini' as const;
  public readonly modelName: string;
  private readonly ai: GoogleGenAI;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly logger: (entry: GeminiErrorLogEntry) => void;

  constructor(options?: GeminiProviderOptions) {
    const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    this.modelName = options?.model || process.env.GEMINI_MODEL || 'gemini-4-hydrogen';
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_GEMINI_TIMEOUT_MS;
    this.maxRetries = Math.max(0, options?.maxRetries ?? DEFAULT_GEMINI_MAX_RETRIES);
    this.retryBaseDelayMs = options?.retryBaseDelayMs ?? 800;
    this.logger =
      options?.logger ??
      ((entry) => {
        console.error('[GeminiProvider] Request error', JSON.stringify(entry));
      });

    this.ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: this.timeoutMs,
        retryOptions: {
          attempts: 1,
        },
        headers: {
          'User-Agent': 'aistudio-build',
        },
        ...(options?.fetch ? { fetch: options.fetch } : {}),
      },
    });
  }

  private async callStructured<T>(params: {
    systemInstruction: string;
    prompt: string;
    responseSchema: Schema;
    parser: (rawObj: unknown) => T;
    abortSignal?: AbortSignal;
  }): Promise<T> {
    const totalAttempts = this.maxRetries + 1;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < totalAttempts; attempt++) {
      const attemptNumber = attempt + 1;
      const attemptStart = Date.now();
      const controller = new AbortController();
      let timedOut = false;

      if (params.abortSignal?.aborted) {
        const abortErr = createAbortError(params.abortSignal.reason);
        this.logger({
          provider: 'gemini',
          model: this.modelName,
          attempt: attemptNumber,
          maxAttempts: totalAttempts,
          durationMs: 0,
          errorName: abortErr.name,
          statusCode: null,
          errorMessage: sanitizeErrorMessage(abortErr.message),
          retryable: false,
        });
        throw abortErr;
      }

      const onExternalAbort = () => {
        controller.abort(params.abortSignal?.reason);
      };

      if (params.abortSignal) {
        params.abortSignal.addEventListener('abort', onExternalAbort, { once: true });
      }

      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort(
          new RequestTimeoutError(
            `Gemini request timed out after ${this.timeoutMs}ms (model=${this.modelName})`,
            this.timeoutMs
          )
        );
      }, this.timeoutMs);

      try {
        const response = await this.ai.models.generateContent({
          model: this.modelName,
          contents: params.prompt,
          config: {
            systemInstruction: params.systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: params.responseSchema,
            abortSignal: controller.signal,
          },
        });

        const text = response.text;
        if (!text || !text.trim()) {
          throw new Error('Gemini returned an empty response body');
        }

        const cleaned = stripCodeFences(text);
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(cleaned);
        } catch (parseErr) {
          const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          throw new SyntaxError(`Gemini returned malformed JSON: ${msg}`);
        }

        return params.parser(parsedJson);
      } catch (rawErr) {
        const durationMs = Date.now() - attemptStart;
        const normalized = normalizeGeminiAttemptError(rawErr, {
          timedOut,
          timeoutMs: this.timeoutMs,
          modelName: this.modelName,
          externalSignal: params.abortSignal,
        });

        lastError = normalized.error;

        this.logger({
          provider: 'gemini',
          model: this.modelName,
          attempt: attemptNumber,
          maxAttempts: totalAttempts,
          durationMs,
          errorName: normalized.error.name,
          statusCode: normalized.statusCode,
          errorMessage: sanitizeErrorMessage(normalized.error.message),
          retryable: normalized.retryable,
        });

        if (!normalized.retryable || attempt >= this.maxRetries) {
          throw normalized.error;
        }

        const backoffMs = this.retryBaseDelayMs * Math.pow(2, attempt);
        await waitWithAbort(backoffMs, params.abortSignal);
      } finally {
        clearTimeout(timer);
        if (params.abortSignal) {
          params.abortSignal.removeEventListener('abort', onExternalAbort);
        }
      }
    }

    throw lastError ?? new Error('Gemini request failed');
  }

  async analyzeRequirements(
    input: RequirementAnalysisInput,
    requestOptions?: AIRequestOptions
  ): Promise<RequirementAnalysis> {
    return this.callStructured({
      systemInstruction: REQUIREMENT_ANALYST_SYSTEM_PROMPT,
      prompt: buildRequirementAnalysisPrompt(input.rawText, input.applicationName),
      responseSchema: REQUIREMENT_ANALYSIS_RESPONSE_SCHEMA,
      parser: (raw) => RequirementAnalysisSchema.parse(raw),
      abortSignal: requestOptions?.abortSignal,
    });
  }

  async generateTestScenarios(
    input: TestPlanningInput,
    requestOptions?: AIRequestOptions
  ): Promise<TestScenarioItem[]> {
    const output = await this.callStructured({
      systemInstruction: TEST_PLANNING_SYSTEM_PROMPT,
      prompt: buildTestPlanningPrompt(input.analysis, input.applicationName),
      responseSchema: TEST_PLAN_RESPONSE_SCHEMA,
      abortSignal: requestOptions?.abortSignal,
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

  async generateAutomation(
    input: AutomationInput,
    requestOptions?: AIRequestOptions
  ): Promise<GeneratedAutomationOutput> {
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
      abortSignal: requestOptions?.abortSignal,
    });
  }

  async analyzeFailure(
    input: FailureInput,
    requestOptions?: AIRequestOptions
  ): Promise<FailureAnalysis> {
    return this.callStructured({
      systemInstruction: FAILURE_ANALYST_SYSTEM_PROMPT,
      prompt: buildFailureAnalysisPrompt(input),
      responseSchema: FAILURE_ANALYSIS_RESPONSE_SCHEMA,
      parser: (raw) => FailureAnalysisSchema.parse(raw),
      abortSignal: requestOptions?.abortSignal,
    });
  }
}
