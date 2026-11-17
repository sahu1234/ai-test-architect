import React, { useMemo, useState } from 'react';
import { CheckSquare, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react';
import type { FullProjectRecord, TestScenarioRecord } from '../types/platform';
import { api } from '../services/api';
import { StatusText } from './StatusText';

interface TestPlansViewProps {
  project: FullProjectRecord | null;
  providerMode: string;
  onRefreshProject: () => Promise<void>;
  onNavigate: (tab: string) => void;
}

export function TestPlansView({
  project,
  providerMode,
  onRefreshProject,
  onNavigate,
}: TestPlansViewProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TestScenarioRecord | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editExpected, setEditExpected] = useState('');
  const [editPriority, setEditPriority] = useState('High');
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const scenarios = project?.testScenarios ?? [];

  const filtered = useMemo(() => {
    return scenarios.filter((s) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        s.testCaseId.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.requirementIds.toLowerCase().includes(q);
      const matchesType = typeFilter === 'ALL' || s.testType === typeFilter;
      const matchesPriority = priorityFilter === 'ALL' || s.priority === priorityFilter;
      const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
      return matchesSearch && matchesType && matchesPriority && matchesStatus;
    });
  }, [scenarios, search, typeFilter, priorityFilter, statusFilter]);

  if (!project) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Select a project to generate and review test scenarios.
        </p>
      </div>
    );
  }

  async function handleGeneratePlan() {
    if (!project) return;
    setError(null);
    setNotice(null);
    setGenerating(true);
    try {
      const res = await api.generateScenarios(project.id, { providerMode });
      setNotice(
        `Generated ${res.scenarios.length} structured scenarios using ${res.meta.provider} (${res.meta.model}).`
      );
      await onRefreshProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test plan generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function handleApproveSelected() {
    if (!project) return;
    setError(null);
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : scenarios.map((s) => s.id);
    await api.approveScenarios(project.id, ids);
    setNotice(`Approved ${ids.length} test scenario(s) for automation.`);
    setSelectedIds(new Set());
    await onRefreshProject();
  }

  async function handleRegenerate(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.regenerateScenario(id, providerMode);
      await onRefreshProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    await api.deleteScenario(id);
    setBusyId(null);
    await onRefreshProject();
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    await api.updateScenario(editing.id, {
      title: editTitle,
      expectedResult: editExpected,
      priority: editPriority,
    });
    setEditing(null);
    await onRefreshProject();
  }

  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
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

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">
              Test Planning Workspace ({scenarios.length} Scenarios)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Generate, filter, edit, regenerate, and approve scenarios mapped to {project.requirements.length} requirements.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGeneratePlan}
              disabled={generating || project.requirements.length === 0}
              data-testid="generate-test-plan-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {generating ? 'Generating Plan...' : 'Generate Test Plan'}
            </button>

            {scenarios.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleApproveSelected}
                  data-testid="approve-scenarios-btn"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  {selectedIds.size > 0
                    ? `Approve Selected (${selectedIds.size})`
                    : 'Approve All Scenarios'}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('automation')}
                  className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                >
                  Explore &amp; Automate
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search TC ID, REQ ID, title..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <select
            aria-label="Filter by type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            <option value="ALL">All Test Types</option>
            <option value="Positive">Positive</option>
            <option value="Negative">Negative</option>
            <option value="Boundary">Boundary</option>
            <option value="Validation">Validation</option>
            <option value="Security">Security</option>
            <option value="Authorization">Authorization</option>
          </select>

          <select
            aria-label="Filter by priority"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            <option value="ALL">All Priorities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="APPROVED">APPROVED</option>
            <option value="AUTOMATED">AUTOMATED</option>
          </select>
        </div>

        {editing && (
          <form
            onSubmit={handleSaveEdit}
            className="p-4 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 space-y-3"
          >
            <div className="text-xs font-semibold">Edit Scenario {editing.testCaseId}</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="md:col-span-3 px-3 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <select
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value)}
                className="px-3 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <input
              type="text"
              value={editExpected}
              onChange={(e) => setEditExpected(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <div className="flex gap-2">
              <button type="submit" className="px-3 py-1 text-xs rounded bg-blue-600 text-white">
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-3 py-1 text-xs rounded border border-slate-300 dark:border-slate-700"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {scenarios.length === 0
              ? 'No scenarios generated yet. Analyze requirements first, then click "Generate Test Plan".'
              : 'No scenarios match the active search or filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 pr-3 w-8">Sel</th>
                  <th className="py-2 pr-3">Test Case ID</th>
                  <th className="py-2 pr-3">Requirement ID</th>
                  <th className="py-2 pr-3">Scenario</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Priority</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((sc) => {
                  const reqs = JSON.parse(sc.requirementIds) as string[];
                  const steps = JSON.parse(sc.testSteps) as string[];
                  const isExpanded = expandedId === sc.id;

                  return (
                    <React.Fragment key={sc.id}>
                      <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 pr-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${sc.testCaseId}`}
                            checked={selectedIds.has(sc.id)}
                            onChange={() => toggleSelection(sc.id)}
                          />
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs font-semibold">
                          {sc.testCaseId}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs text-blue-600 dark:text-blue-400">
                          {reqs.join(', ')}
                        </td>
                        <td className="py-2.5 pr-3">
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : sc.id)}
                            className="text-left hover:underline font-medium text-xs sm:text-sm"
                          >
                            {sc.title}
                          </button>
                        </td>
                        <td className="py-2.5 pr-3 text-xs">{sc.testType}</td>
                        <td className="py-2.5 pr-3 text-xs">{sc.priority}</td>
                        <td className="py-2.5 pr-3">
                          <StatusText status={sc.status} />
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(sc);
                                setEditTitle(sc.title);
                                setEditExpected(sc.expectedResult);
                                setEditPriority(sc.priority);
                              }}
                              className="px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              title="Regenerate scenario"
                              disabled={busyId === sc.id}
                              onClick={() => handleRegenerate(sc.id)}
                              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Delete scenario"
                              disabled={busyId === sc.id}
                              onClick={() => handleDelete(sc.id)}
                              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/70 dark:bg-slate-950/60">
                          <td colSpan={8} className="p-4 text-xs space-y-2">
                            <div>
                              <span className="font-semibold">Steps: </span>
                              <ol className="list-decimal pl-5 mt-1 space-y-0.5 text-slate-600 dark:text-slate-400">
                                {steps.map((st, idx) => (
                                  <li key={idx}>{st}</li>
                                ))}
                              </ol>
                            </div>
                            <div>
                              <span className="font-semibold">Expected Result: </span>
                              <span className="text-slate-600 dark:text-slate-400">
                                {sc.expectedResult}
                              </span>
                            </div>
                            <div>
                              <span className="font-semibold">Engineering Reasoning: </span>
                              <span className="text-slate-500">{sc.reasoning}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
