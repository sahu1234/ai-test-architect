import type { AIProvider } from './ai-provider.interface.ts';
import { GeminiProvider } from './gemini-provider.ts';
import { MockAIProvider } from './mock-provider.ts';

export type ProviderMode = 'auto' | 'gemini' | 'mock';

export function hasConfiguredGeminiKey(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key.length > 10);
}

export function getAIProviderStatus() {
  const configuredMode = (process.env.AI_PROVIDER || 'auto').toLowerCase() as ProviderMode;
  const geminiKeyAvailable = hasConfiguredGeminiKey();
  const activeProvider =
    configuredMode === 'mock'
      ? 'mock'
      : configuredMode === 'gemini'
        ? 'gemini'
        : geminiKeyAvailable
          ? 'gemini'
          : 'mock';

  return {
    configuredMode,
    geminiKeyAvailable,
    activeProvider,
    modelName:
      activeProvider === 'gemini'
        ? process.env.GEMINI_MODEL || 'gemini-4-hydrogen'
        : 'deterministic-mock-v1',
  };
}

export function createAIProvider(overrideMode?: ProviderMode, overrideModel?: string): AIProvider {
  const mode = overrideMode || ((process.env.AI_PROVIDER || 'auto').toLowerCase() as ProviderMode);

  if (mode === 'mock') {
    return new MockAIProvider();
  }

  if (mode === 'gemini') {
    return new GeminiProvider({ model: overrideModel });
  }

  if (hasConfiguredGeminiKey()) {
    return new GeminiProvider({ model: overrideModel });
  }

  return new MockAIProvider();
}
