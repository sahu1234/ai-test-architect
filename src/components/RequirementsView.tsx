import React, { useEffect, useState } from 'react';
import { Check, FileUp, Sparkles, Upload } from 'lucide-react';
import type { FullProjectRecord } from '../types/platform';
import { api } from '../services/api';
import { StatusText } from './StatusText';

interface RequirementsViewProps {
  project: FullProjectRecord | null;
  providerMode: string;
  onRefreshProject: () => Promise<void>;
  onNavigate: (tab: string) => void;
}

export function RequirementsView({
  project,
  providerMode,
  onRefreshProject,
  onNavigate,
}: RequirementsViewProps) {
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('requirements-spec.md');
  const [samples, setSamples] = useState<Array<{ fileName: string; title: string; content: string }>>(
    []
  );
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');

  useEffect(() => {
    api
      .getSampleRequirements()
      .then((res) => setSamples(res.samples))
      .catch(() => {});
  }, []);

  if (!project) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Select or create a testing project before uploading requirements.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('projects')}
          className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          Go to Projects
        </button>
      </div>
    );
  }

  const latestDoc = project.requirementDocuments[0] || null;

  async function handlePasteSave(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    setError(null);
    setNotice(null);
    setUploading(true);
    try {
      await api.uploadRequirement(project.id, {
        mode: 'paste',
        fileName,
        rawText,
      });
      setNotice(`Saved "${fileName}" to project workspace.`);
      await onRefreshProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !project) return;
    setError(null);
    setNotice(null);
    setUploading(true);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const { document } = await api.uploadRequirement(project.id, {
        mode: 'file',
        fileName: file.name,
        fileBase64: base64,
      });
      setRawText(document.rawText);
      setFileName(document.fileName);
      setNotice(`Extracted ${document.rawText.length} chars from ${document.fileName}.`);
      await onRefreshProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File parsing failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleAnalyze() {
    if (!project) return;
    setError(null);
    setNotice(null);
    setAnalyzing(true);
    try {
      const res = await api.analyzeRequirements(project.id, {
        documentId: latestDoc?.id,
        providerMode,
      });
      setNotice(
        `Analyzed ${res.requirements.length} requirements using ${res.meta.provider} (${res.meta.model}) in ${res.meta.durationMs}ms.`
      );
      await onRefreshProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Requirement analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSaveEdit(reqId: string) {
    await api.updateRequirement(reqId, { title: editTitle, description: editDesc });
    setEditingId(null);
    await onRefreshProject();
  }

  async function handleApproveAll() {
    if (!project) return;
    await api.approveAllRequirements(project.id);
    setNotice('All analyzed requirements marked as APPROVED.');
    await onRefreshProject();
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Requirement Upload</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Paste BRD/PRD text or upload TXT, Markdown, PDF, or DOCX (max 2 MB).
              </p>
            </div>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0">
              <FileUp className="w-3.5 h-3.5" />
              Upload File
              <input
                type="file"
                accept=".txt,.md,.markdown,.pdf,.docx"
                onChange={handleFileInput}
                className="sr-only"
              />
            </label>
          </div>

          {samples.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">Load sample BRD:</span>
              {samples.map((s) => (
                <button
                  key={s.fileName}
                  type="button"
                  onClick={() => {
                    setFileName(s.fileName);
                    setRawText(s.content);
                  }}
                  className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-xs"
                >
                  {s.fileName}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handlePasteSave} className="space-y-3">
            <div>
              <label htmlFor="doc-name" className="block text-xs font-medium mb-1">
                Document Name
              </label>
              <input
                id="doc-name"
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
              />
            </div>

            <div>
              <label htmlFor="req-raw" className="block text-xs font-medium mb-1">
                Specification Content
              </label>
              <textarea
                id="req-raw"
                rows={10}
                value={rawText || latestDoc?.rawText || ''}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste your Business Requirement Document, PRD, or user stories here..."
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={uploading || !(rawText || latestDoc?.rawText)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploading ? 'Saving...' : 'Save Document'}
              </button>

              <button
                type="button"
                onClick={handleAnalyze}
                disabled={analyzing || (!latestDoc && !rawText)}
                data-testid="analyze-requirements-btn"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {analyzing ? 'Analyzing Requirements...' : 'Analyze Requirements'}
              </button>
            </div>
          </form>
        </section>

        <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">
                Extracted Document Preview
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {latestDoc
                  ? `${latestDoc.fileName} · ${latestDoc.fileType} · ${latestDoc.fileSizeBytes} bytes`
                  : 'No document uploaded yet'}
              </p>
            </div>
            {latestDoc && <StatusText status={latestDoc.status} />}
          </div>

          {latestDoc ? (
            <div className="space-y-3">
              {latestDoc.analysisNotes && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-semibold">Analyst Summary: </span>
                  {latestDoc.analysisNotes}
                </div>
              )}
              <pre className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono whitespace-pre-wrap max-h-80 overflow-y-auto text-slate-700 dark:text-slate-300">
                {latestDoc.rawText}
              </pre>
            </div>
          ) : (
            <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
              Upload or paste a requirement document to inspect its extracted content prior to AI analysis.
            </div>
          )}
        </section>
      </div>

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">
              Analyzed Requirements ({project.requirements.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Review acceptance criteria, business rules, ambiguities, missing info, and assumptions before generating tests.
            </p>
          </div>
          {project.requirements.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleApproveAll}
                data-testid="approve-all-reqs-btn"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Check className="w-3.5 h-3.5" />
                Approve All Requirements
              </button>
              <button
                type="button"
                onClick={() => onNavigate('test-plans')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              >
                Proceed to Test Planning
              </button>
            </div>
          )}
        </div>

        {project.requirements.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Click &ldquo;Analyze Requirements&rdquo; after saving a requirement document to extract structured requirements.
          </p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {project.requirements.map((req) => {
              const ambiguities = JSON.parse(req.ambiguitiesJson) as string[];
              const missing = JSON.parse(req.missingInfoJson) as string[];
              const assumptions = JSON.parse(req.assumptionsJson) as string[];
              const actors = JSON.parse(req.actorsJson) as string[];
              const isEditing = editingId === req.id;

              return (
                <div key={req.id} className="py-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                          {req.reqCode}
                        </span>
                        <span>·</span>
                        <span>{req.category}</span>
                        <span>·</span>
                        <span>Priority: {req.priority}</span>
                        {actors.length > 0 && (
                          <>
                            <span>·</span>
                            <span>Actors: {actors.join(', ')}</span>
                          </>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="space-y-2 pt-1">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                          <textarea
                            rows={2}
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(req.id)}
                              className="px-3 py-1 text-xs rounded bg-blue-600 text-white"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="px-3 py-1 text-xs rounded border border-slate-300 dark:border-slate-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {req.title}
                          </h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {req.description}
                          </p>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <StatusText status={req.status} />
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(req.id);
                          setEditTitle(req.title);
                          setEditDesc(req.description);
                        }}
                        className="px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Edit
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <div className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Acceptance Criteria ({req.acceptanceCriteria.length})
                      </div>
                      <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4">
                        {req.acceptanceCriteria.map((ac) => (
                          <li key={ac.id}>
                            <span className="font-mono text-slate-500">{ac.criteriaCode}:</span>{' '}
                            {ac.statement}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Business Rules ({req.businessRules.length})
                      </div>
                      <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4">
                        {req.businessRules.map((br) => (
                          <li key={br.id}>
                            <span className="font-mono text-slate-500">{br.ruleCode}:</span>{' '}
                            {br.statement}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {(ambiguities.length > 0 || missing.length > 0 || assumptions.length > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1 text-slate-600 dark:text-slate-400">
                      {ambiguities.length > 0 && (
                        <div>
                          <span className="font-semibold text-amber-700 dark:text-amber-400">
                            Ambiguities:{' '}
                          </span>
                          {ambiguities.join(' ')}
                        </div>
                      )}
                      {missing.length > 0 && (
                        <div>
                          <span className="font-semibold text-red-700 dark:text-red-400">
                            Missing Info:{' '}
                          </span>
                          {missing.join(' ')}
                        </div>
                      )}
                      {assumptions.length > 0 && (
                        <div>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            Assumptions:{' '}
                          </span>
                          {assumptions.join(' ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
