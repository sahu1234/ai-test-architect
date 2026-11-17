async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export const api = {
  getDashboard: () => requestJson<{
    metrics: {
      totalProjects: number;
      totalRequirements: number;
      generatedTestCases: number;
      automatedTestCases: number;
      requirementCoveragePercent: number;
      lastExecutionStatus: string;
    };
    projects: import('../types/platform').ProjectSummary[];
    recentRuns: import('../types/platform').ExecutionRunRecord[];
    recentLogs: Array<{
      id: string;
      agentName: string;
      provider: string;
      model: string;
      durationMs: number;
      success: boolean;
      createdAt: string;
    }>;
  }>('/api/dashboard'),

  getSettings: () => requestJson<{
    ai: import('../types/platform').AIProviderStatus;
    limits: {
      maxUploadBytes: number;
      allowedFileTypes: string[];
      allowedOrigins: string;
      executionTimeoutMs: number;
    };
  }>('/api/settings'),

  getSampleRequirements: () =>
    requestJson<{ samples: Array<{ fileName: string; title: string; content: string }> }>(
      '/api/sample-requirements'
    ),

  createProject: (payload: {
    name: string;
    description: string;
    applicationName: string;
    applicationUrl: string;
    environment: string;
    browserPreference: string;
  }) =>
    requestJson<{ project: import('../types/platform').ProjectSummary }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  bootstrapDemoProject: (baseOrigin: string) =>
    requestJson<{ project: import('../types/platform').ProjectSummary }>(
      '/api/projects/bootstrap-demo',
      {
        method: 'POST',
        body: JSON.stringify({ baseOrigin }),
      }
    ),

  getProject: (id: string) =>
    requestJson<{
      project: import('../types/platform').FullProjectRecord;
      coverage: import('../types/platform').CoverageAuditReport;
    }>(`/api/projects/${id}`),

  deleteProject: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),

  uploadRequirement: (
    projectId: string,
    payload:
      | { mode: 'paste'; fileName?: string; rawText: string }
      | { mode: 'file'; fileName: string; fileBase64: string }
  ) =>
    requestJson<{ document: import('../types/platform').RequirementDocumentItem }>(
      `/api/projects/${projectId}/requirements/upload`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  analyzeRequirements: (projectId: string, payload: { documentId?: string; providerMode?: string }) =>
    requestJson<{
      requirements: import('../types/platform').RequirementItem[];
      meta: { provider: string; model: string; durationMs: number };
    }>(`/api/projects/${projectId}/requirements/analyze`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateRequirement: (reqId: string, payload: { title?: string; description?: string; priority?: string; status?: string }) =>
    requestJson<{ requirement: import('../types/platform').RequirementItem }>(
      `/api/requirements/${reqId}`,
      { method: 'PUT', body: JSON.stringify(payload) }
    ),

  approveAllRequirements: (projectId: string) =>
    requestJson<{ ok: boolean }>(`/api/projects/${projectId}/requirements/approve-all`, {
      method: 'POST',
    }),

  generateScenarios: (projectId: string, payload: { providerMode?: string }) =>
    requestJson<{
      scenarios: import('../types/platform').TestScenarioRecord[];
      meta: { provider: string; model: string; durationMs: number };
    }>(`/api/projects/${projectId}/scenarios/generate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateScenario: (
    scenarioId: string,
    payload: { title?: string; testType?: string; priority?: string; expectedResult?: string; status?: string }
  ) =>
    requestJson<{ scenario: import('../types/platform').TestScenarioRecord }>(
      `/api/scenarios/${scenarioId}`,
      { method: 'PUT', body: JSON.stringify(payload) }
    ),

  regenerateScenario: (scenarioId: string, providerMode?: string) =>
    requestJson<{ scenario: import('../types/platform').TestScenarioRecord }>(
      `/api/scenarios/${scenarioId}/regenerate`,
      { method: 'POST', body: JSON.stringify({ providerMode }) }
    ),

  deleteScenario: (scenarioId: string) =>
    requestJson<{ ok: boolean }>(`/api/scenarios/${scenarioId}`, { method: 'DELETE' }),

  approveScenarios: (projectId: string, scenarioIds: string[]) =>
    requestJson<{ ok: boolean }>(`/api/projects/${projectId}/scenarios/approve-selected`, {
      method: 'POST',
      body: JSON.stringify({ scenarioIds }),
    }),

  exploreApplication: (
    projectId: string,
    payload: { targetUrl?: string; demoAuthQuickRole?: string | null }
  ) =>
    requestJson<{ exploration: import('../types/platform').ExplorationRecord }>(
      `/api/projects/${projectId}/explore`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  generateAutomation: (
    projectId: string,
    payload: { scenarioIds?: string[]; providerMode?: string }
  ) =>
    requestJson<{
      automation: import('../types/platform').GeneratedAutomationRecord;
      validation: {
        passed: boolean;
        checkedFiles: number;
        errorCount: number;
        warningCount: number;
        issues: Array<{ severity: string; file: string; message: string }>;
      };
      meta: { provider: string; model: string; durationMs: number };
    }>(`/api/projects/${projectId}/automation/generate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  reviewAutomation: (
    automationId: string,
    payload: { decision: 'APPROVED' | 'REJECTED'; reviewNotes?: string }
  ) =>
    requestJson<{ automation: import('../types/platform').GeneratedAutomationRecord }>(
      `/api/automation/${automationId}/review`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  executeTests: (
    projectId: string,
    payload: {
      automationId?: string;
      browser: string;
      headed: boolean;
      workers: number;
      retries: number;
      providerMode?: string;
    }
  ) =>
    requestJson<{
      executionRun: import('../types/platform').ExecutionRunRecord;
      executiveSummary: unknown;
      rawLog: string;
    }>(`/api/projects/${projectId}/execute`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  generateExecutiveSummary: (runId: string, providerMode?: string) =>
    requestJson<{ executiveSummary: Record<string, unknown> }>(
      `/api/executions/${runId}/executive-summary`,
      { method: 'POST', body: JSON.stringify({ providerMode }) }
    ),
};
