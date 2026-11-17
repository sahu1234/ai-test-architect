import React from 'react';
import { Moon, Shield, Sun } from 'lucide-react';
import type { AIProviderStatus } from '../types/platform';

interface SettingsViewProps {
  aiStatus: AIProviderStatus | null;
  providerMode: 'auto' | 'gemini' | 'mock';
  onChangeProviderMode: (mode: 'auto' | 'gemini' | 'mock') => void;
  limits: {
    maxUploadBytes: number;
    allowedFileTypes: string[];
    allowedOrigins: string;
    executionTimeoutMs: number;
  } | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function SettingsView({
  aiStatus,
  providerMode,
  onChangeProviderMode,
  limits,
  theme,
  onToggleTheme,
}: SettingsViewProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold">AI Provider &amp; Execution Mode</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Gemini API credentials are managed strictly server-side via environment configuration. Select whether requests use Gemini or the deterministic offline Demo Provider.
          </p>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500">Server-Side Gemini Key</span>
            <span className="font-medium">
              {aiStatus?.geminiKeyAvailable ? 'Configured' : 'Not Configured (Demo Mode Active)'}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500">Active Server Model</span>
            <span className="font-mono">{aiStatus?.modelName ?? 'deterministic-mock-v1'}</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium">Request Provider Mode</label>
          <div className="grid grid-cols-3 gap-2">
            {(['auto', 'gemini', 'mock'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                data-testid={`provider-mode-${mode}`}
                onClick={() => onChangeProviderMode(mode)}
                disabled={mode === 'gemini' && !aiStatus?.geminiKeyAvailable}
                className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  providerMode === mode
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40'
                }`}
              >
                {mode === 'auto'
                  ? 'Auto'
                  : mode === 'gemini'
                    ? 'Gemini Live'
                    : 'Deterministic Mock'}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-medium">Workspace Appearance</div>
            <div className="text-xs text-slate-500">Switch between Light and Dark enterprise themes.</div>
          </div>
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            {theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
          </button>
        </div>
      </section>

      <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h2 className="text-base font-semibold">Security Guardrails &amp; Limits</h2>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500">Max Requirement Upload Size</span>
            <span className="font-mono tabular-nums">
              {limits ? `${(limits.maxUploadBytes / (1024 * 1024)).toFixed(0)} MB` : '2 MB'}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500">Allowed Document Formats</span>
            <span className="font-mono">
              {limits?.allowedFileTypes.join(', ') ?? '.txt, .md, .pdf, .docx'}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500">Playwright Execution Timeout</span>
            <span className="font-mono tabular-nums">
              {limits ? `${limits.executionTimeoutMs / 1000}s` : '120s'}
            </span>
          </div>
          <div className="py-2">
            <span className="text-slate-500 block mb-1">Execution &amp; Origin Controls</span>
            <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400">
              <li>Human Code Review approval required before Playwright execution.</li>
              <li>Static AST &amp; security scan blocks eval, new Function, child_process, and env secret access.</li>
              <li>SSRF protection blocks cloud metadata endpoints and unapproved private networks.</li>
              <li>Generated files are constrained inside isolated generated-tests/ workspace directories.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
