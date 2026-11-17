import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Bot,
  CheckSquare,
  ExternalLink,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Menu,
  Moon,
  Play,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import DemoInsuranceApp from './demo-insurance/DemoInsuranceApp';
import { DashboardView } from './components/DashboardView';
import { ProjectsView } from './components/ProjectsView';
import { RequirementsView } from './components/RequirementsView';
import { TestPlansView } from './components/TestPlansView';
import { AutomationView } from './components/AutomationView';
import { ExecutionView } from './components/ExecutionView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { api } from './services/api';
import type {
  AIProviderStatus,
  CoverageAuditReport,
  ExecutionRunRecord,
  FullProjectRecord,
  ProjectSummary,
} from './types/platform';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'requirements', label: 'Requirements', icon: FileText },
  { id: 'test-plans', label: 'Test Plans', icon: CheckSquare },
  { id: 'automation', label: 'Automation', icon: Bot },
  { id: 'execution', label: 'Execution', icon: Play },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

export default function App() {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/demo-insurance')) {
    return <DemoInsuranceApp />;
  }

  return <ArchitectPlatform />;
}

function ArchitectPlatform() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('ata-theme') === 'dark') {
      return 'dark';
    }
    return 'light';
  });

  const [providerMode, setProviderMode] = useState<'auto' | 'gemini' | 'mock'>('auto');
  const [aiStatus, setAiStatus] = useState<AIProviderStatus | null>(null);
  const [limits, setLimits] = useState<{
    maxUploadBytes: number;
    allowedFileTypes: string[];
    allowedOrigins: string;
    executionTimeoutMs: number;
  } | null>(null);

  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [metrics, setMetrics] = useState<{
    totalProjects: number;
    totalRequirements: number;
    generatedTestCases: number;
    automatedTestCases: number;
    requirementCoveragePercent: number;
    lastExecutionStatus: string;
  } | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [recentRuns, setRecentRuns] = useState<ExecutionRunRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<FullProjectRecord | null>(null);
  const [coverage, setCoverage] = useState<CoverageAuditReport | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('ata-theme', theme);
  }, [theme]);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const [dash, settings] = await Promise.all([api.getDashboard(), api.getSettings()]);
      setMetrics(dash.metrics);
      setProjects(dash.projects);
      setRecentRuns(dash.recentRuns);
      setAiStatus(settings.ai);
      setLimits(settings.limits);

      setActiveProjectId((prev) => {
        if (prev && dash.projects.some((p) => p.id === prev)) return prev;
        return dash.projects[0]?.id ?? null;
      });
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const loadActiveProject = useCallback(async (projectId: string | null) => {
    if (!projectId) {
      setActiveProject(null);
      setCoverage(null);
      return;
    }
    try {
      const data = await api.getProject(projectId);
      setActiveProject(data.project);
      setCoverage(data.coverage);
    } catch {
      setActiveProject(null);
      setCoverage(null);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    loadActiveProject(activeProjectId);
  }, [activeProjectId, loadActiveProject]);

  async function refreshAll() {
    await loadDashboard();
    if (activeProjectId) {
      await loadActiveProject(activeProjectId);
    }
  }

  async function handleBootstrapDemo() {
    setGlobalError(null);
    setBootstrapping(true);
    try {
      const { project } = await api.bootstrapDemoProject(window.location.origin);
      await loadDashboard();
      setActiveProjectId(project.id);
      setActiveTab('requirements');
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to create demo project');
    } finally {
      setBootstrapping(false);
    }
  }

  const activeNavLabel = NAV_ITEMS.find((n) => n.id === activeTab)?.label ?? 'Dashboard';

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-base font-bold tracking-tight whitespace-nowrap">
            AI Test Architect
          </span>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden p-1 text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary Sidebar">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`nav-${item.id}`}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileNavOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
          <div className="text-slate-500 dark:text-slate-400">
            Provider:{' '}
            <span className="font-mono text-slate-800 dark:text-slate-200">
              {providerMode === 'mock'
                ? 'Mock Demo'
                : aiStatus?.activeProvider === 'gemini'
                  ? aiStatus.modelName
                  : 'Deterministic Mock'}
            </span>
          </div>
          <a
            href="/demo-insurance"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            Veridian Insurance Demo
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-1.5 rounded-md border border-slate-200 dark:border-slate-700"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
              <span>AI Test Architect</span>
              <span className="mx-2">/</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {activeNavLabel}
              </span>
              {activeProject && (
                <>
                  <span className="mx-2">/</span>
                  <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                    {activeProject.name}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {projects.length > 0 && (
              <select
                aria-label="Active project"
                value={activeProjectId ?? ''}
                onChange={(e) => setActiveProjectId(e.target.value)}
                className="hidden sm:block max-w-[220px] px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 truncate"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              aria-label="Toggle theme"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-[1360px] w-full mx-auto space-y-6">
          {globalError && (
            <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
              {globalError}
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              metrics={metrics}
              projects={projects}
              recentRuns={recentRuns}
              activeProjectId={activeProjectId}
              loading={dashboardLoading}
              onSelectProject={setActiveProjectId}
              onNavigate={setActiveTab}
              onBootstrapDemo={handleBootstrapDemo}
              bootstrapping={bootstrapping}
            />
          )}

          {activeTab === 'projects' && (
            <ProjectsView
              projects={projects}
              activeProjectId={activeProjectId}
              onSelectProject={setActiveProjectId}
              onRefresh={refreshAll}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'requirements' && (
            <RequirementsView
              project={activeProject}
              providerMode={providerMode}
              onRefreshProject={refreshAll}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'test-plans' && (
            <TestPlansView
              project={activeProject}
              providerMode={providerMode}
              onRefreshProject={refreshAll}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'automation' && (
            <AutomationView
              project={activeProject}
              providerMode={providerMode}
              onRefreshProject={refreshAll}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'execution' && (
            <ExecutionView
              project={activeProject}
              providerMode={providerMode}
              onRefreshProject={refreshAll}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              project={activeProject}
              coverage={coverage}
              providerMode={providerMode}
              onRefreshProject={refreshAll}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              aiStatus={aiStatus}
              providerMode={providerMode}
              onChangeProviderMode={setProviderMode}
              limits={limits}
              theme={theme}
              onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            />
          )}
        </main>
      </div>
    </div>
  );
}
