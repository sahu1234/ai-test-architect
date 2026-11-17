import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { hasConfiguredGeminiKey } from '../../packages/ai-engine/providers/provider-factory.ts';
import {
  extractHttpStatusCode,
  GeminiProvider,
  sanitizeErrorMessage,
} from '../../packages/ai-engine/providers/gemini-provider.ts';

const runGemini = hasConfiguredGeminiKey() && process.env.RUN_GEMINI_TESTS === 'true';

describe.skipIf(!runGemini)('Optional Live Gemini Provider Integration', () => {
  it(
    'analyzes a sample requirement using Gemini structured JSON output',
    async () => {
      const provider = new GeminiProvider();
      expect(provider.providerName).toBe('gemini');

      try {
        const analysis = await provider.analyzeRequirements({
          applicationName: 'Veridian Insurance',
          rawText:
            'Registered customers must log in with email and password. Locked accounts cannot log in.',
        });

        expect(analysis.summary.trim().length).toBeGreaterThan(0);
        expect(analysis.requirements.length).toBeGreaterThanOrEqual(1);
        for (const req of analysis.requirements) {
          expect(req.reqCode).toMatch(/^REQ-\d{3}$/);
        }
      } catch (err) {
        const errorName = err instanceof Error ? err.name : 'Error';
        const statusCode = extractHttpStatusCode(err);
        const rawMessage = err instanceof Error ? err.message : String(err);
        const message = sanitizeErrorMessage(rawMessage);
        throw new Error(
          `Gemini integration failed [model=${provider.modelName}, status=${statusCode ?? 'N/A'}, error=${errorName}]: ${message}`,
          { cause: err }
        );
      }
    },
    75000
  );
});
