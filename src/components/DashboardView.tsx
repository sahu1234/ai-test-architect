import React from 'react';
import {
  ArrowRight,
  ExternalLink,
  FolderPlus,
  Play,
  Sparkles,
} from 'lucide-react';
import type { ExecutionRunRecord, ProjectSummary } from '../types/platform';
import { StatusText } from './StatusText';

interface DashboardViewProps {
  metrics: {
    totalProjects: number;
    totalRequirements: number;
    generatedTestCases: number;
    automatedTestCases: number;
    requirementCoveragePercent: number;
    lastExecutionStatus: string;
  } | null;
  projects: ProjectSummary[];
  recentRuns: ExecutionRunRecord[];
  activeProjectId: string | null;
  loading: boolean;
  onSelectProject: (projectId: string) => void;
  onNavigate: (tab: string) => void;
  onBootstrapDemo: () => void;
  bootstrapping: boolean;
}

export function DashboardView({
  metrics,
  projects,
  recentRuns,
  activeProjectId,
  loading,
  onSelectProject,
  onNavigate,
  onBootstrapDemo,
  bootstrapping,
}: DashboardViewProps) {
  if (loading && !metrics) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-24 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse"
            />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
      </div>
    );
  }

  const statItems = [
    { label: 'Total Projects', value: metrics?.totalProjects ?? 0 },
    { label: 'Total Requirements', value: metrics?.totalRequirements ?? 0 },
    { label: 'Generated Test Cases', value: metrics?.generatedTestCases ?? 0 },
    { label: 'Automated Specs', value: metrics?.automatedTestCases ?? 0 },
    { label: 'Req. Coverage', value: `${metrics?.requirementCoveragePercent ?? 0}%` },
    {
      label: 'Last Execution',
      value: <StatusText status={metrics?.lastExecutionStatus ?? 'NO_RUNS'} />,
    },
  ];

  return (
    <div className="space-y-8">
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Requirement-to-Playwright Quality Engineering
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Analyze business requirements, synthesize risk-based test plans, inspect live DOMs with Playwright, generate reviewed Page Object Models, and trace deterministic test runs to requirements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onBootstrapDemo}
            disabled={bootstrapping}
            data-testid="bootstrap-demo-btn"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {bootstrapping ? 'Creating Demo Suite...' : 'Load Veridian Insurance Demo'}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('projects')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            Create Project
          </button>
          <a
            href="/demo-insurance"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
          >
            Open Target Demo App
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </section>

      <section aria-label="Platform Metrics" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statItems.map((item) => (
          <div
            key={item.label}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-2"
          >
            <span className="text-xs text-slate-500 dark:text-slate-400">{item.label}</span>
            <div className="text-xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {item.value}
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Projects</h2>
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              Manage all
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {projects.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                No testing projects created yet. Load the Veridian Insurance Demo or create a custom project.
              </p>
              <button
                type="button"
                onClick={onBootstrapDemo}
                disabled={bootstrapping}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Create Veridian Insurance Demo Project
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 pr-4">Project</th>
                    <th className="py-2 pr-4 text-right">Reqs</th>
                    <th className="py-2 pr-4 text-right">Scenarios</th>
                    <th className="py-2 pr-4">Last Run</th>
                    <th className="py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {projects.map((p) => {
                    const isSelected = p.id === activeProjectId;
                    return (
                      <tr
                        key={p.id}
                        className={
                          isSelected
                            ? 'bg-blue-50/60 dark:bg-blue-950/20'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }
                      >
                        <td className="py-3 pr-4">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {p.name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate max-w-xs">
                            {p.applicationName} · {p.environment}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums font-mono text-xs">
                          {p.requirementCount ?? 0}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums font-mono text-xs">
                          {p.scenarioCount ?? 0}
                        </td>
                        <td className="py-3 pr-4">
                          <StatusText status={p.lastRunStatus ?? 'NONE'} />
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectProject(p.id);
                              onNavigate('requirements');
                            }}
                            className="px-3 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 whitespace-nowrap"
                          >
                            {isSelected ? 'Open Workspace' : 'Select'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Recent Test Runs</h2>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              View reports
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {recentRuns.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Play className="w-6 h-6 mx-auto text-slate-400" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No Playwright executions recorded yet.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentRuns.map((run) => (
                <div key={run.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {run.project?.name || 'Project Run'}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {run.browser} · {run.passedTests}/{run.totalTests} passed ·{' '}
                      {(run.durationMs / 1000).toFixed(2)}s
                    </div>
                  </div>
                  <StatusText status={run.status} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
