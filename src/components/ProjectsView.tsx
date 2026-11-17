import React, { useState } from 'react';
import { FolderPlus, Trash2 } from 'lucide-react';
import type { ProjectSummary } from '../types/platform';
import { api } from '../services/api';
import { StatusText } from './StatusText';

interface ProjectsViewProps {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onRefresh: () => Promise<void>;
  onNavigate: (tab: string) => void;
}

export function ProjectsView({
  projects,
  activeProjectId,
  onSelectProject,
  onRefresh,
  onNavigate,
}: ProjectsViewProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [applicationName, setApplicationName] = useState('');
  const [applicationUrl, setApplicationUrl] = useState(`${window.location.origin}/demo-insurance`);
  const [environment, setEnvironment] = useState('local');
  const [browserPreference, setBrowserPreference] = useState('chromium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { project } = await api.createProject({
        name,
        description,
        applicationName,
        applicationUrl,
        environment,
        browserPreference,
      });
      setName('');
      setDescription('');
      setApplicationName('');
      await onRefresh();
      onSelectProject(project.id);
      onNavigate('requirements');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await api.deleteProject(id);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <FolderPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h2 className="text-base font-semibold">Create Testing Project</h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
          Configure the target application origin, environment, and default Playwright browser.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label htmlFor="proj-name" className="block text-xs font-medium mb-1">
              Project Name
            </label>
            <input
              id="proj-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Policyholder Claims QA Suite"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div>
            <label htmlFor="proj-desc" className="block text-xs font-medium mb-1">
              Project Description
            </label>
            <textarea
              id="proj-desc"
              rows={2}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Automated E2E regression suite covering FNOL and claims review."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div>
            <label htmlFor="app-name" className="block text-xs font-medium mb-1">
              Application Name
            </label>
            <input
              id="app-name"
              type="text"
              required
              value={applicationName}
              onChange={(e) => setApplicationName(e.target.value)}
              placeholder="Veridian P&C Insurance Portal"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div>
            <label htmlFor="app-url" className="block text-xs font-medium mb-1">
              Target Application URL
            </label>
            <input
              id="app-url"
              type="url"
              required
              value={applicationUrl}
              onChange={(e) => setApplicationUrl(e.target.value)}
              placeholder="http://127.0.0.1:3000/demo-insurance"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="proj-env" className="block text-xs font-medium mb-1">
                Environment
              </label>
              <select
                id="proj-env"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="local">Local Sandbox</option>
                <option value="qa">QA Environment</option>
                <option value="staging">Staging</option>
                <option value="production-readonly">Prod Read-Only</option>
              </select>
            </div>
            <div>
              <label htmlFor="proj-browser" className="block text-xs font-medium mb-1">
                Browser Preference
              </label>
              <select
                id="proj-browser"
                value={browserPreference}
                onChange={(e) => setBrowserPreference(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="chromium">Chromium</option>
                <option value="firefox">Firefox</option>
                <option value="webkit">WebKit</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Creating Project...' : 'Create Project & Continue'}
          </button>
        </form>
      </section>

      <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <h2 className="text-base font-semibold mb-4">Configured Projects ({projects.length})</h2>

        {projects.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
            No projects found. Use the form on the left to initialize your first testing workspace.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {projects.map((p) => (
              <div key={p.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{p.name}</span>
                    {p.id === activeProjectId && (
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                        · Active
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                    {p.applicationUrl}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {p.applicationName} · {p.environment} · {p.browserPreference} ·{' '}
                    {p.requirementCount ?? 0} reqs · {p.scenarioCount ?? 0} scenarios
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <StatusText status={p.lastRunStatus ?? 'NONE'} />
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProject(p.id);
                      onNavigate('requirements');
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => handleDelete(p.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
