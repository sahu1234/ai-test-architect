import { ApiError } from '@google/genai';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GEMINI_MAX_RETRIES,
  DEFAULT_GEMINI_TIMEOUT_MS,
  GeminiProvider,
  RequestTimeoutError,
  type GeminiErrorLogEntry,
} from '../../packages/ai-engine/providers/gemini-provider.ts';

function createGeminiSuccessResponse(payload: unknown): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ text: typeof payload === 'string' ? payload : JSON.stringify(payload) }],
          },
          finishReason: 'STOP',
        },
      ],
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

function createGeminiApiErrorResponse(
  status: number,
  apiStatus: string,
  message: string
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: status,
        message,
        status: apiStatus,
      },
    }),
    {
      status,
      statusText: apiStatus,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

const VALID_REQUIREMENT_ANALYSIS = {
  summary: 'Authentication and account lock requirements for Veridian Insurance.',
  actors: ['Registered Customer'],
  workflows: ['Customer Login'],
  duplicateWarnings: [],
  globalMissingInformation: [],
  globalAmbiguities: [],
  globalAssumptions: [],
  requirements: [
    {
      reqCode: 'REQ-001',
      title: 'Customer Login',
      description: 'Registered customers must authenticate with email and password.',
      category: 'Functional',
      priority: 'High',
      actors: ['Registered Customer'],
      acceptanceCriteria: [
        {
          criteriaCode: 'AC-001',
          statement: 'Valid credentials allow portal login.',
          isTestable: true,
        },
      ],
      businessRules: [
        {
          ruleCode: 'BR-001',
          statement: 'Locked accounts must be denied login.',
          severity: 'Mandatory',
        },
      ],
      missingInformation: [],
      ambiguities: [],
      assumptions: [],
    },
  ],
};

const SAMPLE_INPUT = {
  applicationName: 'Veridian Insurance',
  rawText: 'Registered customers must log in with email and password. Locked accounts cannot log in.',
};

describe('GeminiProvider Unit Tests (Mocked HTTP Transport)', () => {
  it('parses a successful Gemini structured JSON response and sends timeout header', async () => {
    let capturedTimeoutHeader: string | null = null;
    let capturedSignalPresent = false;

    const mockFetch: typeof fetch = async (_input, init) => {
      const headers = new Headers(init?.headers);
      capturedTimeoutHeader = headers.get('X-Server-Timeout');
      capturedSignalPresent = Boolean(init?.signal);
      return createGeminiSuccessResponse(VALID_REQUIREMENT_ANALYSIS);
    };

    const provider = new GeminiProvider({
      apiKey: 'test-gemini-key-secret-12345',
      model: 'gemini-4-hydrogen',
      fetch: mockFetch,
    });

    const result = await provider.analyzeRequirements(SAMPLE_INPUT);

    expect(DEFAULT_GEMINI_TIMEOUT_MS).toBe(30000);
    expect(DEFAULT_GEMINI_MAX_RETRIES).toBe(1);
    expect(capturedTimeoutHeader).toBe('30');
    expect(capturedSignalPresent).toBe(true);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].reqCode).toBe('REQ-001');
  });

  it('cancels the underlying HTTP request immediately via AbortSignal without retrying', async () => {
    let calls = 0;
    let observedAbortInFetch = false;
    const logs: GeminiErrorLogEntry[] = [];
    const externalController = new AbortController();

    const mockFetch: typeof fetch = (_input, init) => {
      calls++;
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error('Expected AbortSignal to be passed to fetch'));
          return;
        }
        const onAbort = () => {
          observedAbortInFetch = true;
          const abortErr = new Error('The operation was aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      });
    };

    const provider = new GeminiProvider({
      apiKey: 'test-gemini-key-secret-12345',
      timeoutMs: 5000,
      maxRetries: 1,
      retryBaseDelayMs: 5,
      fetch: mockFetch,
      logger: (entry) => logs.push(entry),
    });

    setTimeout(() => externalController.abort('Cancelled by caller'), 25);

    await expect(
      provider.analyzeRequirements(SAMPLE_INPUT, { abortSignal: externalController.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(observedAbortInFetch).toBe(true);
    expect(calls).toBe(1);
    expect(logs).toHaveLength(1);
    expect(logs[0].retryable).toBe(false);
    expect(logs[0].errorName).toBe('AbortError');
  });

  it('aborts hanging requests on timeout, throws RequestTimeoutError, and stops after retry limit', async () => {
    let calls = 0;
    let abortedSignals = 0;
    const logs: GeminiErrorLogEntry[] = [];

    const mockFetch: typeof fetch = (_input, init) => {
      calls++;
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error('Expected AbortSignal to be passed to fetch'));
          return;
        }
        const onAbort = () => {
          abortedSignals++;
          const abortErr = new Error('Request aborted due to timeout');
          abortErr.name = 'AbortError';
          reject(abortErr);
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      });
    };

    const provider = new GeminiProvider({
      apiKey: 'test-gemini-key-secret-12345',
      timeoutMs: 40,
      retryBaseDelayMs: 5,
      fetch: mockFetch,
      logger: (entry) => logs.push(entry),
    });

    await expect(provider.analyzeRequirements(SAMPLE_INPUT)).rejects.toBeInstanceOf(
      RequestTimeoutError
    );

    // Default maxRetries=1 => 2 total attempts (initial + 1 retry), SDK retries disabled (attempts=1)
    expect(calls).toBe(2);
    expect(abortedSignals).toBe(2);
    expect(logs).toHaveLength(2);
    expect(logs[0].attempt).toBe(1);
    expect(logs[1].attempt).toBe(2);
    expect(logs[0].errorName).toBe('RequestTimeoutError');
    expect(logs[0].retryable).toBe(true);
  });

  it('retries HTTP 429 RESOURCE_EXHAUSTED once and succeeds on recovery, or surfaces ApiError(429) at limit', async () => {
    let calls = 0;
    const mockFetchRecover: typeof fetch = async () => {
      calls++;
      if (calls === 1) {
        return createGeminiApiErrorResponse(429, 'RESOURCE_EXHAUSTED', 'Quota exceeded');
      }
      return createGeminiSuccessResponse(VALID_REQUIREMENT_ANALYSIS);
    };

    const providerRecover = new GeminiProvider({
      apiKey: 'test-gemini-key-secret-12345',
      retryBaseDelayMs: 5,
      fetch: mockFetchRecover,
      logger: () => {},
    });

    const recovered = await providerRecover.analyzeRequirements(SAMPLE_INPUT);
    expect(calls).toBe(2);
    expect(recovered.requirements[0].reqCode).toBe('REQ-001');

    let exhaustedCalls = 0;
    const mockFetchAlways429: typeof fetch = async () => {
      exhaustedCalls++;
      return createGeminiApiErrorResponse(429, 'RESOURCE_EXHAUSTED', 'Rate limit exceeded');
    };

    const providerExhausted = new GeminiProvider({
      apiKey: 'test-gemini-key-secret-12345',
      retryBaseDelayMs: 5,
      fetch: mockFetchAlways429,
      logger: () => {},
    });

    await expect(providerExhausted.analyzeRequirements(SAMPLE_INPUT)).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && err.status === 429
    );
    expect(exhaustedCalls).toBe(2);
  });

  it('retries HTTP 503 UNAVAILABLE within retry limits and preserves ApiError(503) if still failing', async () => {
    let calls = 0;
    const logs: GeminiErrorLogEntry[] = [];

    const mockFetch503: typeof fetch = async () => {
      calls++;
      return createGeminiApiErrorResponse(503, 'UNAVAILABLE', 'Service temporarily unavailable');
    };

    const provider = new GeminiProvider({
      apiKey: 'test-gemini-key-secret-12345',
      retryBaseDelayMs: 5,
      fetch: mockFetch503,
      logger: (entry) => logs.push(entry),
    });

    await expect(provider.analyzeRequirements(SAMPLE_INPUT)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ApiError &&
        err.status === 503 &&
        err.message.includes('Service temporarily unavailable')
    );

    expect(calls).toBe(2);
    expect(logs).toHaveLength(2);
    expect(logs[0].statusCode).toBe(503);
    expect(logs[0].model).toBe('gemini-4-hydrogen');
  });

  it('fails fast without retrying on invalid API key (400/403) and never logs secrets or prompts', async () => {
    let calls = 0;
    const logs: GeminiErrorLogEntry[] = [];
    const secretApiKey = 'AIzaSyFakeSecretKeyDoNotLeak123456';

    const mockFetchInvalidKey: typeof fetch = async () => {
      calls++;
      return createGeminiApiErrorResponse(
        400,
        'INVALID_ARGUMENT',
        `API key not valid for key=${secretApiKey}`
      );
    };

    const provider = new GeminiProvider({
      apiKey: secretApiKey,
      retryBaseDelayMs: 5,
      fetch: mockFetchInvalidKey,
      logger: (entry) => logs.push(entry),
    });

    await expect(provider.analyzeRequirements(SAMPLE_INPUT)).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && err.status === 400
    );

    expect(calls).toBe(1);
    expect(logs).toHaveLength(1);
    expect(logs[0].statusCode).toBe(400);
    expect(logs[0].retryable).toBe(false);
    const serializedLog = JSON.stringify(logs[0]);
    expect(serializedLog).not.toContain(secretApiKey);
    expect(serializedLog).not.toContain(SAMPLE_INPUT.rawText);
  });

  it('fails fast without retrying on invalid model (404 NOT_FOUND)', async () => {
    let calls = 0;
    const logs: GeminiErrorLogEntry[] = [];

    const mockFetch404: typeof fetch = async () => {
      calls++;
      return createGeminiApiErrorResponse(
        404,
        'NOT_FOUND',
        'models/non-existent-model is not found'
      );
    };

    const provider = new GeminiProvider({
      apiKey: 'test-gemini-key-secret-12345',
      model: 'non-existent-model',
      retryBaseDelayMs: 5,
      fetch: mockFetch404,
      logger: (entry) => logs.push(entry),
    });

    await expect(provider.analyzeRequirements(SAMPLE_INPUT)).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && err.status === 404
    );

    expect(calls).toBe(1);
    expect(logs[0].model).toBe('non-existent-model');
    expect(logs[0].statusCode).toBe(404);
    expect(logs[0].retryable).toBe(false);
  });

  it('throws SyntaxError without retrying on malformed JSON responses', async () => {
    let calls = 0;

    const mockFetchMalformedJson: typeof fetch = async () => {
      calls++;
      return createGeminiSuccessResponse('{"summary": "broken json"');
    };

    const provider = new GeminiProvider({
      apiKey: 'test-gemini-key-secret-12345',
      retryBaseDelayMs: 5,
      fetch: mockFetchMalformedJson,
      logger: () => {},
    });

    await expect(provider.analyzeRequirements(SAMPLE_INPUT)).rejects.toBeInstanceOf(SyntaxError);
    expect(calls).toBe(1);
  });

  it('respects configurable maxRetries and retries transient network errors up to the exact limit', async () => {
    let calls = 0;
    const logs: GeminiErrorLogEntry[] = [];

    const mockFetchNetworkFail: typeof fetch = async () => {
      calls++;
      const err = new TypeError('fetch failed');
      (err as TypeError & { cause?: unknown }).cause = { code: 'ECONNRESET' };
      throw err;
    };

    const provider = new GeminiProvider({
      apiKey: 'test-gemini-key-secret-12345',
      maxRetries: 1,
      retryBaseDelayMs: 5,
      fetch: mockFetchNetworkFail,
      logger: (entry) => logs.push(entry),
    });

    await expect(provider.analyzeRequirements(SAMPLE_INPUT)).rejects.toThrow('fetch failed');
    expect(calls).toBe(2);
    expect(logs).toHaveLength(2);
    expect(logs[0].attempt).toBe(1);
    expect(logs[0].maxAttempts).toBe(2);
    expect(logs[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(logs[0].errorName).toBe('TypeError');
    expect(logs[0].statusCode).toBeNull();
    expect(logs[1].attempt).toBe(2);
  });
});
