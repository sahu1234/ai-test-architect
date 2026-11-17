import { describe, expect, it } from 'vitest';
import { hasConfiguredGeminiKey } from '../../packages/ai-engine/providers/provider-factory.ts';
import { GeminiProvider } from '../../packages/ai-engine/providers/gemini-provider.ts';

const runGemini = hasConfiguredGeminiKey() && process.env.RUN_GEMINI_TESTS === 'true';

describe.skipIf(!runGemini)('Optional Live Gemini Provider Integration', () => {
  it('analyzes a sample requirement using Gemini structured JSON output', async () => {
    const provider = new GeminiProvider();
    const analysis = await provider.analyzeRequirements({
      applicationName: 'Veridian Insurance',
      rawText: 'Registered customers must log in with email and password. Locked accounts cannot log in.',
    });
    expect(analysis.requirements.length).toBeGreaterThanOrEqual(1);
    expect(analysis.requirements[0].reqCode).toMatch(/^REQ-\d{3}$/);
  });
});
