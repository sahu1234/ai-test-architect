import React, { useState } from 'react';
import { Play, Terminal } from 'lucide-react';
import type { FullProjectRecord } from '../types/platform';
import { api } from '../services/api';
import { StatusText } from './StatusText';

interface ExecutionViewProps {
  project: FullProjectRecord | null;
  providerMode: string;
  onRefreshProject: () => Promise<void>;
  onNavigate: (tab: string) => void;
}

export function ExecutionView({
  project,
  providerMode,
  onRefreshProject,
  onNavigate,
}: ExecutionViewProps) {
  const [browser, setBrowser] = useState<'chromium' | 'firefox' | 'webkit'>('chromium');
  const [headed, setHeaded] = useState(false);
  const [workers, setWorkers] = useState(1);
  const [retries, setRetries] = useState(0);
  const [running, setRunning] = useState(false);
  const [rawLog, setRawLog] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!project) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Select a project to run approved Playwright tests.
        </p>
      </div>
    );
  }

  const latestAutomation = project.generatedAutomations[0] || null;
  const isApproved = latestAutomation?.approvalStatus === 'APPROVED';

  async function handleRun() {
    if (!project || !latestAutomation) return;
    setError(null);
    setRunning(true);
    try {
      const res = await api.executeTests(project.id, {
        automationId: latestAutomation.id,
        browser,
        headed,
        workers,
        retries,
        providerMode,
      });
      setRawLog(res.rawLog);
      await onRefreshProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Controlled Playwright Test Execution</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Executes only human-approved Playwright TypeScript suites and captures real browser assertions, traces, screenshots, and reports.
            </p>
          </div>
          {latestAutomation && <StatusText status={latestAutomation.approvalStatus} />}
        </div>

        {!latestAutomation ? (
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
            No generated automation suite found. Generate and approve automation in the Automation tab first.
          </div>
        ) : !isApproved ? (
          <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-4">
            <span>
              Execution is gated until the generated suite passes Code Review approval.
            </span>
            <button
              type="button"
              onClick={() => onNavigate('automation')}
              className="px-3 py-1.5 rounded bg-amber-700 text-white font-medium shrink-0"
            >
              Review &amp; Approve Code
            </button>
          </div>
        ) : null}

        {error && (
          <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="exec-browser" className="block text-xs font-medium mb-1">
              Browser Engine
            </label>
            <select
              id="exec-browser"
              value={browser}
              onChange={(e) => setBrowser(e.target.value as 'chromium' | 'firefox' | 'webkit')}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="chromium">Chromium</option>
              <option value="firefox">Firefox</option>
              <option value="webkit">WebKit</option>
            </select>
          </div>

          <div>
            <label htmlFor="exec-workers" className="block text-xs font-medium mb-1">
              Parallel Workers
            </label>
            <input
              id="exec-workers"
              type="number"
              min={1}
              max={4}
              value={workers}
              onChange={(e) => setWorkers(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="exec-retries" className="block text-xs font-medium mb-1">
              Retries on Failure
            </label>
            <input
              id="exec-retries"
              type="number"
              min={0}
              max={2}
              value={retries}
              onChange={(e) => setRetries(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
            />
          </div>

          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-xs cursor-pointer py-2">
              <input
                type="checkbox"
                checked={headed}
                onChange={(e) => setHeaded(e.target.checked)}
              />
              Headed mode (when display available)
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={running || !isApproved}
            onClick={handleRun}
            data-testid="run-playwright-btn"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            {running ? 'Running Playwright Suite...' : 'Execute Approved Playwright Tests'}
          </button>

          {project.executionRuns.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="px-4 py-2.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Inspect Reports &amp; Traceability
            </button>
          )}
        </div>
      </section>

      {rawLog && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Terminal className="w-4 h-4" />
            Playwright Runner Output
          </div>
          <pre className="p-4 rounded-lg bg-slate-950 text-slate-200 text-xs font-mono overflow-x-auto max-h-72 whitespace-pre-wrap">
            {rawLog}
          </pre>
        </section>
      )}

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold">Execution History ({project.executionRuns.length})</h3>
        {project.executionRuns.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            No execution runs recorded for this project yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 pr-4">Run ID</th>
                  <th className="py-2 pr-4">Browser</th>
                  <th className="py-2 pr-4 text-right">Passed</th>
                  <th className="py-2 pr-4 text-right">Failed</th>
                  <th className="py-2 pr-4 text-right">Duration</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 text-right">Artifacts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {project.executionRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="py-2.5 pr-4 font-mono">{run.id.slice(-8)}</td>
                    <td className="py-2.5 pr-4">{run.browser}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{run.passedTests}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{run.failedTests}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {(run.durationMs / 1000).toFixed(2)}s
                    </td>
                    <td className="py-2.5 pr-4">
                      <StatusText status={run.status} />
                    </td>
                    <td className="py-2.5 text-right space-x-3">
                      {run.htmlReportPath && (
                        <a
                          href={run.htmlReportPath}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          HTML Report
                        </a>
                      )}
                      {run.junitReportPath && (
                        <a
                          href={run.junitReportPath}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          JUnit XML
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
