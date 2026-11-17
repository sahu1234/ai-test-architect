import React, { useMemo, useState } from 'react';
import { Download, ExternalLink, FileSpreadsheet, Sparkles } from 'lucide-react';
import type { CoverageAuditReport, FullProjectRecord } from '../types/platform';
import { api } from '../services/api';
import { StatusText } from './StatusText';

interface ReportsViewProps {
  project: FullProjectRecord | null;
  coverage: CoverageAuditReport | null;
  providerMode: string;
  onRefreshProject: () => Promise<void>;
}

export function ReportsView({
  project,
  coverage,
  providerMode,
  onRefreshProject,
}: ReportsViewProps) {
  const [subTab, setSubTab] = useState<'execution' | 'traceability'>('execution');
  const [reqFilter, setReqFilter] = useState('');
  const [execFilter, setExecFilter] = useState('ALL');
  const [covFilter, setCovFilter] = useState('ALL');
  const [summarizing, setSummarizing] = useState(false);

  const latestRun = project?.executionRuns[0] || null;

  const filteredMatrix = useMemo(() => {
    const rows = coverage?.matrix ?? [];
    return rows.filter((r) => {
      const q = reqFilter.trim().toLowerCase();
      const matchesQ =
        !q ||
        r.reqCode.toLowerCase().includes(q) ||
        (r.testCaseId ?? '').toLowerCase().includes(q) ||
        r.requirementTitle.toLowerCase().includes(q);
      const matchesExec = execFilter === 'ALL' || r.executionResult === execFilter;
      const matchesCov = covFilter === 'ALL' || r.coverageStatus === covFilter;
      return matchesQ && matchesExec && matchesCov;
    });
  }, [coverage, reqFilter, execFilter, covFilter]);

  if (!project) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Select a project to inspect execution reports and requirement traceability.
        </p>
      </div>
    );
  }

  const executiveObj = latestRun?.executiveSummary
    ? (JSON.parse(latestRun.executiveSummary) as {
        overallSummary: string;
        criticalFailures: string[];
        potentialRootCauses: string[];
        failedWorkflows: string[];
        missingCoverage: string[];
        recommendedAdditionalTests: string[];
        suggestedRegressionSuite: string[];
        generatedByProvider?: string;
        generatedByModel?: string;
      })
    : null;

  const passPercentage =
    latestRun && latestRun.totalTests > 0
      ? Math.round((latestRun.passedTests / latestRun.totalTests) * 100)
      : 0;

  async function handleGenerateExecutiveSummary() {
    if (!latestRun) return;
    setSummarizing(true);
    try {
      await api.generateExecutiveSummary(latestRun.id, providerMode);
      await onRefreshProject();
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setSubTab('execution')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              subTab === 'execution'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Execution Reports &amp; Executive AI Summary
          </button>
          <button
            type="button"
            onClick={() => setSubTab('traceability')}
            data-testid="traceability-tab-btn"
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              subTab === 'traceability'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Requirement Traceability Matrix
          </button>
        </div>
      </div>

      {subTab === 'execution' && (
        <div className="space-y-6">
          {!latestRun ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500">
              No execution reports available yet. Run approved tests in the Execution tab.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Total Tests</div>
                  <div className="text-xl font-semibold tabular-nums mt-1">
                    {latestRun.totalTests}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Passed</div>
                  <div className="text-xl font-semibold tabular-nums text-emerald-600 mt-1">
                    {latestRun.passedTests}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Failed</div>
                  <div className="text-xl font-semibold tabular-nums text-red-600 mt-1">
                    {latestRun.failedTests}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Pass Rate</div>
                  <div className="text-xl font-semibold tabular-nums mt-1">{passPercentage}%</div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Duration</div>
                  <div className="text-xl font-semibold tabular-nums mt-1">
                    {(latestRun.durationMs / 1000).toFixed(2)}s
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Req. Coverage</div>
                  <div className="text-xl font-semibold tabular-nums mt-1">
                    {coverage?.coveragePercentage ?? 0}%
                  </div>
                </div>
              </div>

              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">Playwright Test Results ({latestRun.browser})</h2>
                    <div className="flex flex-wrap gap-4 text-xs mt-1">
                      {latestRun.htmlReportPath && (
                        <a
                          href={latestRun.htmlReportPath}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          HTML Report <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {latestRun.jsonReportPath && (
                        <a
                          href={latestRun.jsonReportPath}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          JSON Results <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {latestRun.junitReportPath && (
                        <a
                          href={latestRun.junitReportPath}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          JUnit XML <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <StatusText status={latestRun.status} />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2 pr-3">TC ID</th>
                        <th className="py-2 pr-3">Test Name</th>
                        <th className="py-2 pr-3">Spec File</th>
                        <th className="py-2 pr-3 text-right">Duration</th>
                        <th className="py-2 pr-3">Result</th>
                        <th className="py-2">Evidence / Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {latestRun.results.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2.5 pr-3 font-mono font-semibold">
                            {r.testCaseId ?? '-'}
                          </td>
                          <td className="py-2.5 pr-3 font-medium">{r.testTitle}</td>
                          <td className="py-2.5 pr-3 font-mono text-slate-500">{r.specFile}</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{r.durationMs}ms</td>
                          <td className="py-2.5 pr-3">
                            <StatusText status={r.status} />
                          </td>
                          <td className="py-2.5 space-x-2">
                            {r.errorMessage && (
                              <span className="text-red-600 dark:text-red-400 block max-w-md truncate">
                                {r.errorMessage}
                              </span>
                            )}
                            {r.screenshotPath && (
                              <a
                                href={r.screenshotPath}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                Screenshot
                              </a>
                            )}
                            {r.tracePath && (
                              <a
                                href={r.tracePath}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                Trace
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">Executive QA Summary</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      AI synthesis grounded strictly in deterministic Playwright execution results and requirement coverage.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={summarizing}
                    onClick={handleGenerateExecutiveSummary}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {summarizing ? 'Generating...' : 'Regenerate Executive Summary'}
                  </button>
                </div>

                {executiveObj ? (
                  <div className="space-y-4 text-sm">
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                      {executiveObj.overallSummary}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="font-semibold mb-1">Missing Coverage &amp; Risk Gaps</div>
                        <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400">
                          {executiveObj.missingCoverage.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="font-semibold mb-1">Recommended Additional Tests</div>
                        <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400">
                          {executiveObj.recommendedAdditionalTests.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    {executiveObj.generatedByProvider && (
                      <div className="text-xs text-slate-400 font-mono">
                        Generated by {executiveObj.generatedByProvider} ({executiveObj.generatedByModel})
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Click &ldquo;Regenerate Executive Summary&rdquo; to analyze this run.
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {subTab === 'traceability' && coverage && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">
                Requirement-to-Test Traceability Matrix
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Requirements: {coverage.coveredRequirements}/{coverage.totalRequirements} covered ({coverage.coveragePercentage}%) · Uncovered: {coverage.uncoveredRequirements} · Orphan Scenarios: {coverage.orphanScenarioIds.length}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/api/projects/${project.id}/traceability/export?format=csv`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export CSV
              </a>
              <a
                href={`/api/projects/${project.id}/traceability/export?format=json`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="search"
              value={reqFilter}
              onChange={(e) => setReqFilter(e.target.value)}
              placeholder="Filter by REQ ID, TC ID, or title..."
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <select
              aria-label="Filter by execution status"
              value={execFilter}
              onChange={(e) => setExecFilter(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="ALL">All Execution Statuses</option>
              <option value="PASSED">PASSED</option>
              <option value="FAILED">FAILED</option>
              <option value="NOT_EXECUTED">NOT EXECUTED</option>
            </select>
            <select
              aria-label="Filter by coverage status"
              value={covFilter}
              onChange={(e) => setCovFilter(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="ALL">All Coverage Statuses</option>
              <option value="COVERED">COVERED</option>
              <option value="UNCOVERED">UNCOVERED</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 pr-3">Requirement</th>
                  <th className="py-2 pr-3">AC / BR</th>
                  <th className="py-2 pr-3">Test Case</th>
                  <th className="py-2 pr-3">Automation Spec</th>
                  <th className="py-2 pr-3">Coverage</th>
                  <th className="py-2">Execution Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredMatrix.map((row, idx) => (
                  <tr key={`${row.reqCode}-${row.testCaseId ?? 'none'}-${idx}`}>
                    <td className="py-2.5 pr-3">
                      <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {row.reqCode}
                      </span>
                      <div className="text-slate-700 dark:text-slate-300">{row.requirementTitle}</div>
                    </td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-500">
                      {row.acceptanceCriteriaCount} AC · {row.businessRulesCount} BR
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="font-mono font-semibold">{row.testCaseId ?? '—'}</span>
                      <div className="text-slate-500 truncate max-w-xs">
                        {row.scenarioTitle ?? 'No linked scenario'}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-slate-500">
                      {row.specFile ?? 'Not generated'}
                    </td>
                    <td className="py-2.5 pr-3">
                      <StatusText status={row.coverageStatus} />
                    </td>
                    <td className="py-2.5">
                      <StatusText status={row.executionResult} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
