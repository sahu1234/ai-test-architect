import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Code2,
  Compass,
  Download,
  FileCode,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { FullProjectRecord } from '../types/platform';
import { api } from '../services/api';
import { StatusText } from './StatusText';

interface AutomationViewProps {
  project: FullProjectRecord | null;
  providerMode: string;
  onRefreshProject: () => Promise<void>;
  onNavigate: (tab: string) => void;
}

export function AutomationView({
  project,
  providerMode,
  onRefreshProject,
  onNavigate,
}: AutomationViewProps) {
  const [subTab, setSubTab] = useState<'explorer' | 'code' | 'review'>('explorer');
  const [targetUrl, setTargetUrl] = useState(project?.applicationUrl || '');
  const [demoQuickRole, setDemoQuickRole] = useState<string>('');
  const [exploring, setExploring] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (project?.applicationUrl) {
      setTargetUrl(project.applicationUrl);
    }
  }, [project?.id, project?.applicationUrl]);

  if (!project) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Select a project to explore the target application and generate Playwright automation.
        </p>
      </div>
    );
  }

  const latestExploration = project.explorations[0] || null;
  const latestAutomation = project.generatedAutomations[0] || null;
  const files = latestAutomation?.files ?? [];
  const activeFile = files.find((f) => f.id === selectedFileId) || files[0] || null;
  const approvedScenariosCount = project.testScenarios.filter(
    (s) => s.status === 'APPROVED' || s.status === 'AUTOMATED'
  ).length;

  const interactiveEls = latestExploration
    ? (JSON.parse(latestExploration.interactiveJson) as Array<{
        tag: string;
        testId: string | null;
        label: string | null;
        text: string | null;
        recommendedLocator: string;
      }>)
    : [];

  const inspectedUrls = latestExploration
    ? (JSON.parse(latestExploration.inspectedUrlsJson) as string[])
    : [];

  const validationObj = latestAutomation?.validationReport
    ? (JSON.parse(latestAutomation.validationReport) as {
        passed: boolean;
        checkedFiles: number;
        errorCount: number;
        warningCount: number;
        issues: Array<{ severity: string; file: string; message: string }>;
      })
    : null;

  async function handleExplore() {
    if (!project) return;
    setError(null);
    setNotice(null);
    setExploring(true);
    try {
      const res = await api.exploreApplication(project.id, {
        targetUrl,
        demoAuthQuickRole: demoQuickRole || null,
      });
      setNotice(`Explored "${res.exploration.pageTitle}" and captured accessible DOM locators.`);
      await onRefreshProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Application exploration failed');
    } finally {
      setExploring(false);
    }
  }

  async function handleGenerateAutomation() {
    if (!project) return;
    setError(null);
    setNotice(null);
    setGenerating(true);
    try {
      const res = await api.generateAutomation(project.id, { providerMode });
      setNotice(
        `Generated ${res.automation.files.length} Playwright files via ${res.meta.provider} (${res.meta.model}). Validation: ${res.validation.passed ? 'PASSED' : 'FAILED'}.`
      );
      setSelectedFileId(res.automation.files[0]?.id ?? null);
      setSubTab('code');
      await onRefreshProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Automation generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function handleReviewDecision(decision: 'APPROVED' | 'REJECTED') {
    if (!latestAutomation) return;
    setError(null);
    setNotice(null);
    setReviewing(true);
    try {
      await api.reviewAutomation(latestAutomation.id, {
        decision,
        reviewNotes: reviewNotes || undefined,
      });
      setNotice(
        decision === 'APPROVED'
          ? 'Automation suite approved for Playwright test execution.'
          : 'Automation suite marked as REJECTED.'
      );
      await onRefreshProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review update failed');
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setSubTab('explorer')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              subTab === 'explorer'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            Application Explorer
          </button>
          <button
            type="button"
            onClick={() => setSubTab('code')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              subTab === 'code'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Generated Automation ({files.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('review')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              subTab === 'review'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Code Review Gate
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGenerateAutomation}
            disabled={generating || approvedScenariosCount === 0}
            data-testid="generate-automation-btn"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {generating
              ? 'Generating POM Suite...'
              : `Generate Automation (${approvedScenariosCount} Approved)`}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-sm text-emerald-800 dark:text-emerald-300">
          {notice}
        </div>
      )}

      {subTab === 'explorer' && (
        <div className="space-y-6">
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold">Playwright Application Explorer (Agent 3)</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Safely navigates to the approved origin, extracts accessible roles/labels/testIds, and captures a DOM snapshot without exposing secrets to AI models.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="http://127.0.0.1:3000/demo-insurance"
                className="md:col-span-6 px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <select
                aria-label="Controlled demo role"
                value={demoQuickRole}
                onChange={(e) => setDemoQuickRole(e.target.value)}
                className="md:col-span-3 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">Inspect Entry View (Unauthenticated)</option>
                <option value="customer">Explore Authenticated Customer Portal</option>
                <option value="adjuster">Explore Authenticated Adjuster Portal</option>
              </select>
              <button
                type="button"
                onClick={handleExplore}
                disabled={exploring}
                data-testid="explore-app-btn"
                className="md:col-span-3 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 disabled:opacity-50"
              >
                <Compass className="w-3.5 h-3.5" />
                {exploring ? 'Exploring DOM...' : 'Explore Application'}
              </button>
            </div>
          </section>

          {latestExploration ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">{latestExploration.pageTitle}</h3>
                    <div className="text-xs font-mono text-slate-500">
                      {inspectedUrls.join(' · ')}
                    </div>
                  </div>
                  <StatusText status={latestExploration.status} />
                </div>

                <pre className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono whitespace-pre-wrap">
                  {latestExploration.domSummary}
                </pre>

                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2 pr-3">Tag</th>
                        <th className="py-2 pr-3">Label / Text</th>
                        <th className="py-2">Recommended Playwright Locator</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {interactiveEls.map((el, idx) => (
                        <tr key={idx}>
                          <td className="py-2 pr-3 font-mono text-slate-500">{el.tag}</td>
                          <td className="py-2 pr-3 truncate max-w-[180px]">
                            {el.label || el.text || el.testId || '-'}
                          </td>
                          <td className="py-2 font-mono text-blue-700 dark:text-blue-400">
                            {el.recommendedLocator}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold">Captured Browser Screenshot</h3>
                {latestExploration.screenshotPath ? (
                  <img
                    src={latestExploration.screenshotPath}
                    alt={`Playwright exploration capture of ${latestExploration.pageTitle}`}
                    referrerPolicy="no-referrer"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 object-contain"
                  />
                ) : (
                  <p className="text-xs text-slate-500 py-8 text-center">
                    No screenshot captured.
                  </p>
                )}
              </section>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500">
              Click &ldquo;Explore Application&rdquo; to inspect live interactive elements and resilient Playwright locators.
            </div>
          )}
        </div>
      )}

      {subTab === 'code' && (
        <div className="space-y-6">
          {!latestAutomation ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500">
              Approve scenarios in Test Plans, then click &ldquo;Generate Automation&rdquo; to produce Page Object Models, fixtures, and TypeScript specs.
            </div>
          ) : (
            <>
              {validationObj && (
                <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {validationObj.passed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <ShieldAlert className="w-5 h-5 text-red-600" />
                    )}
                    <div className="text-xs">
                      <div className="font-semibold">
                        Static Validation Agent (Agent 5): {validationObj.passed ? 'PASSED' : 'FAILED'}
                      </div>
                      <div className="text-slate-500 tabular-nums">
                        {validationObj.checkedFiles} files checked · {validationObj.errorCount} errors ·{' '}
                        {validationObj.warningCount} warnings
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/api/projects/${project.id}/automation/${latestAutomation.id}/download`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Suite Bundle
                    </a>
                    <button
                      type="button"
                      onClick={() => setSubTab('review')}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    >
                      Proceed to Code Review
                    </button>
                  </div>
                </section>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <aside className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-semibold text-slate-500 px-2 pb-1">
                    generated-tests/
                  </div>
                  {files.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setSelectedFileId(f.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono flex items-center justify-between gap-2 ${
                        activeFile?.id === f.id
                          ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2 truncate">
                        <FileCode className="w-3.5 h-3.5 shrink-0" />
                        {f.relativePath}
                      </span>
                      <span className="text-[11px] text-slate-400 shrink-0">{f.fileCategory}</span>
                    </button>
                  ))}
                </aside>

                <section className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                  {activeFile && (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                        <span className="text-xs font-mono font-semibold">
                          {activeFile.relativePath}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          Linked Reqs: {(JSON.parse(activeFile.linkedReqIds) as string[]).join(', ') || 'Shared'}
                        </span>
                      </div>
                      <pre className="p-4 rounded-lg bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto max-h-[540px] leading-relaxed">
                        {activeFile.content}
                      </pre>
                    </>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      )}

      {subTab === 'review' && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
          {!latestAutomation ? (
            <p className="text-sm text-slate-500 text-center py-8">
              No automation suite available for review yet.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">Human Code Review &amp; Approval Gate</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Unreviewed model-generated Playwright code is never executed automatically. Inspect locators, validation status, and requirement traceability before approving.
                  </p>
                </div>
                <StatusText status={latestAutomation.approvalStatus} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500 mb-1">Files Generated</div>
                  <div className="text-lg font-semibold tabular-nums">{files.length}</div>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500 mb-1">Static Validation</div>
                  <div className="pt-1">
                    <StatusText status={latestAutomation.validationStatus} />
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500 mb-1">Workspace Directory</div>
                  <div className="font-mono text-[11px] truncate">{latestAutomation.workspaceDir}</div>
                </div>
              </div>

              <div>
                <label htmlFor="review-notes" className="block text-xs font-medium mb-1">
                  Reviewer Notes
                </label>
                <textarea
                  id="review-notes"
                  rows={2}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Verified Page Object locators, test isolation, and REQ-XXX mappings."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={reviewing || latestAutomation.validationStatus !== 'PASSED'}
                  onClick={() => handleReviewDecision('APPROVED')}
                  data-testid="approve-automation-btn"
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Approve Automation Suite for Execution
                </button>
                <button
                  type="button"
                  disabled={reviewing}
                  onClick={() => handleReviewDecision('REJECTED')}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  Reject Suite
                </button>
                {latestAutomation.approvalStatus === 'APPROVED' && (
                  <button
                    type="button"
                    onClick={() => onNavigate('execution')}
                    className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Proceed to Test Execution
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
