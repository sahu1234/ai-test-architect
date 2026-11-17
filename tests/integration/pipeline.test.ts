import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAppServer } from '../../server.ts';

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  process.env.AI_PROVIDER = 'mock';
  const app = await createAppServer();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

describe('Demo Insurance App Business Rules Integration', () => {
  it('enforces locked user, future incident date, duplicate claims, disallowed upload, and RBAC', async () => {
    await fetch(`${baseUrl}/api/demo-insurance/reset`, { method: 'POST' });

    const lockedRes = await fetch(`${baseUrl}/api/demo-insurance/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'locked@veridian.test', password: 'LockedPass!2026' }),
    });
    expect(lockedRes.status).toBe(423);

    const loginRes = await fetch(`${baseUrl}/api/demo-insurance/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'customer@veridian.test', password: 'CustomerPass!2026' }),
    });
    expect(loginRes.status).toBe(200);
    const { token } = (await loginRes.json()) as { token: string };

    // Customer cannot access Admin endpoint
    const rbacRes = await fetch(`${baseUrl}/api/demo-insurance/admin/users`, {
      headers: { 'x-demo-token': token },
    });
    expect(rbacRes.status).toBe(403);

    // Future incident date rejected
    const futureRes = await fetch(`${baseUrl}/api/demo-insurance/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-demo-token': token },
      body: JSON.stringify({
        policyNumber: 'POL-2026-1001',
        incidentDate: '2099-05-01',
        lossType: 'Collision',
        description: 'Future date test',
        estimatedAmountUsd: 1000,
        documentName: 'doc.pdf',
      }),
    });
    expect(futureRes.status).toBe(400);

    // Executable upload rejected
    const exeRes = await fetch(`${baseUrl}/api/demo-insurance/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-demo-token': token },
      body: JSON.stringify({
        policyNumber: 'POL-2026-1001',
        incidentDate: '2026-10-01',
        lossType: 'Collision',
        description: 'Bad file ext test',
        estimatedAmountUsd: 1000,
        documentName: 'virus.exe',
      }),
    });
    expect(exeRes.status).toBe(400);
  });
});

describe('End-to-End API Pipeline Integration (MockAIProvider + Real Playwright Execution)', () => {
  it('runs project creation -> requirement analysis -> test plan -> code review -> Playwright execution -> traceability', async () => {
    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Integration Test Insurance Suite',
        description: 'Full pipeline integration test',
        applicationName: 'Veridian P&C Insurance Portal',
        applicationUrl: `${baseUrl}/demo-insurance`,
        environment: 'local',
        browserPreference: 'chromium',
      }),
    });
    expect(createRes.status).toBe(201);
    const { project } = (await createRes.json()) as { project: { id: string } };

    const sampleText = fs.readFileSync(
      path.resolve(process.cwd(), 'sample-requirements', 'insurance-claims.md'),
      'utf8'
    );

    const uploadRes = await fetch(`${baseUrl}/api/projects/${project.id}/requirements/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'paste', fileName: 'insurance-claims.md', rawText: sampleText }),
    });
    expect(uploadRes.status).toBe(201);

    const analyzeRes = await fetch(`${baseUrl}/api/projects/${project.id}/requirements/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerMode: 'mock' }),
    });
    expect(analyzeRes.status).toBe(200);
    const analyzeData = (await analyzeRes.json()) as { requirements: unknown[]; meta: { provider: string } };
    expect(analyzeData.meta.provider).toBe('mock');
    expect(analyzeData.requirements.length).toBeGreaterThanOrEqual(3);

    const planRes = await fetch(`${baseUrl}/api/projects/${project.id}/scenarios/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerMode: 'mock' }),
    });
    expect(planRes.status).toBe(200);
    const planData = (await planRes.json()) as { scenarios: Array<{ id: string }> };
    expect(planData.scenarios.length).toBeGreaterThanOrEqual(5);

    const approveScRes = await fetch(`${baseUrl}/api/projects/${project.id}/scenarios/approve-selected`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioIds: [] }),
    });
    expect(approveScRes.status).toBe(200);

    const genAutoRes = await fetch(`${baseUrl}/api/projects/${project.id}/automation/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerMode: 'mock' }),
    });
    expect(genAutoRes.status).toBe(201);
    const autoData = (await genAutoRes.json()) as {
      automation: { id: string; files: Array<{ relativePath: string }> };
      validation: { passed: boolean };
    };
    expect(autoData.validation.passed).toBe(true);
    expect(autoData.automation.files.some((f) => f.relativePath.endsWith('.spec.ts'))).toBe(true);

    // Executing before code review approval MUST be blocked (403)
    const blockedExec = await fetch(`${baseUrl}/api/projects/${project.id}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ automationId: autoData.automation.id, browser: 'chromium' }),
    });
    expect(blockedExec.status).toBe(403);

    // Approve code review
    const reviewRes = await fetch(`${baseUrl}/api/automation/${autoData.automation.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'APPROVED', reviewNotes: 'Integration test approval' }),
    });
    expect(reviewRes.status).toBe(200);

    // Execute real Playwright tests against live demo insurance app
    const execRes = await fetch(`${baseUrl}/api/projects/${project.id}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        automationId: autoData.automation.id,
        browser: 'chromium',
        headed: false,
        workers: 1,
        retries: 0,
        providerMode: 'mock',
      }),
    });
    expect(execRes.status).toBe(200);
    const execData = (await execRes.json()) as {
      executionRun: { status: string; totalTests: number; passedTests: number; failedTests: number };
    };
    expect(execData.executionRun.totalTests).toBeGreaterThanOrEqual(5);
    expect(execData.executionRun.passedTests).toBe(execData.executionRun.totalTests);
    expect(execData.executionRun.status).toBe('PASSED');

    // Verify traceability matrix & CSV export
    const traceRes = await fetch(`${baseUrl}/api/projects/${project.id}/traceability`);
    expect(traceRes.status).toBe(200);
    const traceData = (await traceRes.json()) as { coveragePercentage: number; matrix: unknown[] };
    expect(traceData.coveragePercentage).toBe(100);
    expect(traceData.matrix.length).toBeGreaterThanOrEqual(5);

    const csvRes = await fetch(`${baseUrl}/api/projects/${project.id}/traceability/export?format=csv`);
    expect(csvRes.status).toBe(200);
    const csvText = await csvRes.text();
    expect(csvText).toContain('REQ-001');
    expect(csvText).toContain('PASSED');

    // Clean up test project
    await fetch(`${baseUrl}/api/projects/${project.id}`, { method: 'DELETE' });
  });
});
