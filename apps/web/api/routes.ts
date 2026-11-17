import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { prisma, ensureDefaultUser } from '../../../packages/db/client.ts';
import { validateTargetUrl } from '../../../packages/security/url-guard.ts';
import {
  getAIProviderStatus,
  type ProviderMode,
} from '../../../packages/ai-engine/providers/provider-factory.ts';
import {
  orchestrateAutomationGeneration,
  orchestrateRequirementAnalysis,
  orchestrateTestPlanning,
} from '../../../packages/ai-engine/orchestrator/ai-orchestrator.ts';
import {
  parseRequirementFileBuffer,
  validatePastedRequirementText,
} from '../../../packages/requirement-engine/parser.ts';
import { exploreApplication } from '../../../packages/application-explorer/explorer.ts';
import { validateGeneratedAutomation } from '../../../packages/test-generator/validator.ts';
import {
  getAutomationWorkspaceRoot,
  writeAutomationFilesToWorkspace,
} from '../../../packages/test-generator/workspace.ts';
import { runPlaywrightWorkspace } from '../../../packages/playwright-runner/runner.ts';
import {
  calculateCoverageAndTraceability,
  exportTraceabilityCsv,
} from '../../../packages/coverage-engine/coverage.ts';
import { generateProjectExecutiveReport } from '../../../packages/reporting/executive-report.ts';
import type { RequirementAnalysis, TestScenarioItem } from '../../../packages/ai-engine/schemas/ai-schemas.ts';

const CreateProjectSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().min(4).max(1000),
  applicationName: z.string().min(2).max(120),
  applicationUrl: z.string().url(),
  environment: z.enum(['local', 'staging', 'qa', 'production-readonly']).default('local'),
  browserPreference: z.enum(['chromium', 'firefox', 'webkit']).default('chromium'),
});

function parseProviderMode(val: unknown): ProviderMode | undefined {
  if (val === 'mock' || val === 'gemini' || val === 'auto') return val;
  return undefined;
}

async function syncCoverageMappings(projectId: string) {
  const requirements = await prisma.requirement.findMany({ where: { projectId } });
  const scenarios = await prisma.testScenario.findMany({ where: { projectId } });
  const latestRun = await prisma.executionRun.findFirst({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: { results: true },
  });
  const latestAutomation = await prisma.generatedAutomation.findFirst({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: { files: true },
  });

  const reqByCode = new Map(requirements.map((r) => [r.reqCode, r]));
  const resultByTc = new Map(
    (latestRun?.results ?? [])
      .filter((r) => r.testCaseId)
      .map((r) => [r.testCaseId!.toUpperCase(), r])
  );
  const specFiles = (latestAutomation?.files ?? []).filter((f) => f.fileCategory === 'TEST_SPEC');

  await prisma.coverageMapping.deleteMany({ where: { projectId } });

  const mappingsToCreate: Array<{
    projectId: string;
    requirementId: string;
    testScenarioId: string | null;
    specFile: string | null;
    lastStatus: string;
  }> = [];

  for (const req of requirements) {
    const linked = scenarios.filter((s) => {
      const codes = JSON.parse(s.requirementIds) as string[];
      return codes.includes(req.reqCode);
    });

    if (linked.length === 0) {
      mappingsToCreate.push({
        projectId,
        requirementId: req.id,
        testScenarioId: null,
        specFile: null,
        lastStatus: 'NOT_EXECUTED',
      });
      continue;
    }

    for (const sc of linked) {
      const res = resultByTc.get(sc.testCaseId.toUpperCase());
      const matchedSpec =
        res?.specFile ||
        specFiles.find((f) => f.content.includes(sc.testCaseId))?.relativePath ||
        null;

      mappingsToCreate.push({
        projectId,
        requirementId: req.id,
        testScenarioId: sc.id,
        specFile: matchedSpec,
        lastStatus: res?.status || 'NOT_EXECUTED',
      });
    }
  }

  if (mappingsToCreate.length > 0) {
    await prisma.coverageMapping.createMany({ data: mappingsToCreate });
  }
  return reqByCode.size;
}

export function createPlatformApiRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'ai-test-architect',
      ai: getAIProviderStatus(),
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/settings', (_req, res) => {
    res.json({
      ai: getAIProviderStatus(),
      limits: {
        maxUploadBytes: 2 * 1024 * 1024,
        allowedFileTypes: ['.txt', '.md', '.markdown', '.pdf', '.docx'],
        allowedOrigins: process.env.ALLOWED_TARGET_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000',
        executionTimeoutMs: 120000,
      },
    });
  });

  router.get('/sample-requirements', (_req, res) => {
    const dir = path.resolve(process.cwd(), 'sample-requirements');
    if (!fs.existsSync(dir)) return res.json({ samples: [] });

    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((fileName) => {
        const content = fs.readFileSync(path.join(dir, fileName), 'utf8');
        const firstHeading = content.split('\n')[0]?.replace(/^#+\s*/, '') || fileName;
        return {
          fileName,
          title: firstHeading,
          content,
        };
      });

    return res.json({ samples: files });
  });

  router.get('/dashboard', async (_req, res, next) => {
    try {
      const projects = await prisma.project.findMany({
        include: {
          requirements: true,
          testScenarios: true,
          executionRuns: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      const recentRuns = await prisma.executionRun.findMany({
        include: { project: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      });

      const recentLogs = await prisma.aIExecutionLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      let totalRequirements = 0;
      let totalScenarios = 0;
      let automatedScenarios = 0;
      let coveredRequirements = 0;

      for (const p of projects) {
        totalRequirements += p.requirements.length;
        totalScenarios += p.testScenarios.length;
        automatedScenarios += p.testScenarios.filter((s) => s.status === 'AUTOMATED').length;

        const linkedCodes = new Set(
          p.testScenarios.flatMap((s) => JSON.parse(s.requirementIds) as string[])
        );
        coveredRequirements += p.requirements.filter((r) => linkedCodes.has(r.reqCode)).length;
      }

      const requirementCoveragePercent =
        totalRequirements > 0 ? Math.round((coveredRequirements / totalRequirements) * 100) : 0;

      res.json({
        metrics: {
          totalProjects: projects.length,
          totalRequirements,
          generatedTestCases: totalScenarios,
          automatedTestCases: automatedScenarios,
          requirementCoveragePercent,
          lastExecutionStatus: recentRuns[0]?.status ?? 'NO_RUNS',
        },
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          applicationName: p.applicationName,
          applicationUrl: p.applicationUrl,
          environment: p.environment,
          browserPreference: p.browserPreference,
          requirementCount: p.requirements.length,
          scenarioCount: p.testScenarios.length,
          lastRunStatus: p.executionRuns[0]?.status ?? 'NONE',
          updatedAt: p.updatedAt,
        })),
        recentRuns,
        recentLogs,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/projects', async (_req, res, next) => {
    try {
      const projects = await prisma.project.findMany({
        include: {
          _count: {
            select: {
              requirementDocuments: true,
              requirements: true,
              testScenarios: true,
              explorations: true,
              generatedAutomations: true,
              executionRuns: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });
      res.json({ projects });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects', async (req, res, next) => {
    try {
      const body = CreateProjectSchema.parse(req.body);
      const urlCheck = validateTargetUrl(body.applicationUrl);
      if (!urlCheck.valid || !urlCheck.normalizedUrl) {
        return res.status(400).json({ error: urlCheck.reason || 'Invalid target URL' });
      }
      const user = await ensureDefaultUser();
      const project = await prisma.project.create({
        data: {
          ...body,
          applicationUrl: urlCheck.normalizedUrl,
          userId: user.id,
        },
      });
      res.status(201).json({ project });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/bootstrap-demo', async (req, res, next) => {
    try {
      const user = await ensureDefaultUser();
      const baseOrigin =
        typeof req.body?.baseOrigin === 'string' && req.body.baseOrigin.startsWith('http')
          ? req.body.baseOrigin.replace(/\/$/, '')
          : `http://127.0.0.1:${process.env.PORT || 3000}`;

      const targetUrl = `${baseOrigin}/demo-insurance`;
      const project = await prisma.project.create({
        data: {
          name: 'Veridian P&C Insurance QA Suite',
          description:
            'Enterprise end-to-end QA automation suite validating Customer Login, Policy Portfolio, FNOL Claim Submission, Adjuster Review, and Admin Governance.',
          applicationName: 'Veridian P&C Insurance Portal',
          applicationUrl: targetUrl,
          environment: 'local',
          browserPreference: 'chromium',
          userId: user.id,
        },
      });

      const samplePath = path.resolve(process.cwd(), 'sample-requirements', 'insurance-claims.md');
      if (fs.existsSync(samplePath)) {
        const rawText = fs.readFileSync(samplePath, 'utf8');
        await prisma.requirementDocument.create({
          data: {
            projectId: project.id,
            fileName: 'insurance-claims.md',
            fileType: 'MD',
            fileSizeBytes: Buffer.byteLength(rawText, 'utf8'),
            rawText,
            status: 'UPLOADED',
          },
        });
      }

      res.status(201).json({ project });
    } catch (err) {
      next(err);
    }
  });

  router.get('/projects/:id', async (req, res, next) => {
    try {
      const project = await prisma.project.findUnique({
        where: { id: req.params.id },
        include: {
          requirementDocuments: { orderBy: { createdAt: 'desc' } },
          requirements: {
            include: {
              acceptanceCriteria: true,
              businessRules: true,
            },
            orderBy: { reqCode: 'asc' },
          },
          testScenarios: { orderBy: { testCaseId: 'asc' } },
          explorations: { orderBy: { createdAt: 'desc' } },
          generatedAutomations: {
            include: { files: { orderBy: { relativePath: 'asc' } } },
            orderBy: { createdAt: 'desc' },
          },
          executionRuns: {
            include: { results: { orderBy: { testTitle: 'asc' } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const latestRun = project.executionRuns[0];
      const latestAuto = project.generatedAutomations[0];
      const specByScenario = new Map<string, string>();
      if (latestAuto) {
        const specs = latestAuto.files.filter((f) => f.fileCategory === 'TEST_SPEC');
        for (const sc of project.testScenarios) {
          const match = specs.find((f) => f.content.includes(sc.testCaseId));
          if (match) specByScenario.set(sc.id, match.relativePath);
        }
      }

      const coverage = calculateCoverageAndTraceability({
        requirements: project.requirements,
        scenarios: project.testScenarios,
        latestResults: latestRun?.results ?? [],
        automationSpecsByScenarioId: specByScenario,
      });

      res.json({ project, coverage });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/projects/:id', async (req, res, next) => {
    try {
      await prisma.project.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // STEP 2: Requirement upload (pasted or base64 file)
  router.post('/projects/:id/requirements/upload', async (req, res, next) => {
    try {
      const project = await prisma.project.findUnique({ where: { id: req.params.id } });
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const mode = req.body?.mode === 'file' ? 'file' : 'paste';
      let fileName = 'pasted-requirements.md';
      let fileType = 'MD';
      let fileSizeBytes = 0;
      let rawText = '';

      if (mode === 'file') {
        const incomingName = String(req.body?.fileName || '');
        const base64Content = String(req.body?.fileBase64 || '');
        if (!incomingName || !base64Content) {
          return res.status(400).json({ error: 'fileName and fileBase64 are required for file upload.' });
        }
        const buffer = Buffer.from(base64Content, 'base64');
        const parsed = await parseRequirementFileBuffer(incomingName, buffer);
        fileName = parsed.fileName;
        fileType = parsed.fileType;
        fileSizeBytes = parsed.fileSizeBytes;
        rawText = parsed.rawText;
      } else {
        rawText = validatePastedRequirementText(String(req.body?.rawText || ''));
        fileName = String(req.body?.fileName || 'pasted-requirements.md').trim() || 'pasted-requirements.md';
        fileSizeBytes = Buffer.byteLength(rawText, 'utf8');
      }

      const document = await prisma.requirementDocument.create({
        data: {
          projectId: project.id,
          fileName,
          fileType,
          fileSizeBytes,
          rawText,
          status: 'UPLOADED',
        },
      });

      res.status(201).json({ document });
    } catch (err) {
      next(err);
    }
  });

  // STEP 3: AI Requirement Analysis
  router.post('/projects/:id/requirements/analyze', async (req, res, next) => {
    try {
      const project = await prisma.project.findUnique({ where: { id: req.params.id } });
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const documentId = typeof req.body?.documentId === 'string' ? req.body.documentId : undefined;
      const doc = documentId
        ? await prisma.requirementDocument.findUnique({ where: { id: documentId } })
        : await prisma.requirementDocument.findFirst({
            where: { projectId: project.id },
            orderBy: { createdAt: 'desc' },
          });

      if (!doc || doc.projectId !== project.id) {
        return res.status(400).json({ error: 'Upload or paste a requirement document before analyzing.' });
      }

      const providerOverride = parseProviderMode(req.body?.providerMode);
      const { data: analysis, provider, model, durationMs } = await orchestrateRequirementAnalysis(
        project.id,
        {
          rawText: doc.rawText,
          applicationName: project.applicationName,
        },
        providerOverride
      );

      await prisma.requirementDocument.update({
        where: { id: doc.id },
        data: {
          analysisJson: JSON.stringify(analysis),
          analysisNotes: analysis.summary,
          status: 'ANALYZED',
        },
      });

      // Replace existing requirements from prior analysis of this project cleanly
      await prisma.requirement.deleteMany({ where: { projectId: project.id } });

      for (const item of analysis.requirements) {
        await prisma.requirement.create({
          data: {
            projectId: project.id,
            documentId: doc.id,
            reqCode: item.reqCode,
            title: item.title,
            description: item.description,
            category: item.category,
            priority: item.priority,
            actorsJson: JSON.stringify(item.actors),
            ambiguitiesJson: JSON.stringify(item.ambiguities),
            assumptionsJson: JSON.stringify(item.assumptions),
            missingInfoJson: JSON.stringify(item.missingInformation),
            status: 'DRAFT',
            acceptanceCriteria: {
              create: item.acceptanceCriteria.map((ac) => ({
                criteriaCode: ac.criteriaCode,
                statement: ac.statement,
                isTestable: ac.isTestable,
              })),
            },
            businessRules: {
              create: item.businessRules.map((br) => ({
                ruleCode: br.ruleCode,
                statement: br.statement,
                severity: br.severity,
              })),
            },
          },
        });
      }

      await syncCoverageMappings(project.id);

      const requirements = await prisma.requirement.findMany({
        where: { projectId: project.id },
        include: { acceptanceCriteria: true, businessRules: true },
        orderBy: { reqCode: 'asc' },
      });

      res.json({
        analysis,
        requirements,
        meta: { provider, model, durationMs },
      });
    } catch (err) {
      next(err);
    }
  });

  router.put('/requirements/:reqId', async (req, res, next) => {
    try {
      const existing = await prisma.requirement.findUnique({ where: { id: req.params.reqId } });
      if (!existing) return res.status(404).json({ error: 'Requirement not found' });

      const updated = await prisma.requirement.update({
        where: { id: existing.id },
        data: {
          title: typeof req.body?.title === 'string' ? req.body.title : existing.title,
          description:
            typeof req.body?.description === 'string' ? req.body.description : existing.description,
          priority: typeof req.body?.priority === 'string' ? req.body.priority : existing.priority,
          status: typeof req.body?.status === 'string' ? req.body.status : existing.status,
        },
        include: { acceptanceCriteria: true, businessRules: true },
      });
      res.json({ requirement: updated });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:id/requirements/approve-all', async (req, res, next) => {
    try {
      await prisma.requirement.updateMany({
        where: { projectId: req.params.id },
        data: { status: 'APPROVED' },
      });
      await prisma.requirementDocument.updateMany({
        where: { projectId: req.params.id, status: 'ANALYZED' },
        data: { status: 'APPROVED' },
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // STEP 4: Test Plan Generation
  router.post('/projects/:id/scenarios/generate', async (req, res, next) => {
    try {
      const project = await prisma.project.findUnique({
        where: { id: req.params.id },
        include: {
          requirements: {
            include: { acceptanceCriteria: true, businessRules: true },
            orderBy: { reqCode: 'asc' },
          },
          requirementDocuments: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (project.requirements.length === 0) {
        return res.status(400).json({ error: 'Analyze requirements before generating a test plan.' });
      }

      const analysisPayload: RequirementAnalysis = {
        summary: project.requirementDocuments[0]?.analysisNotes || project.description,
        actors: Array.from(
          new Set(project.requirements.flatMap((r) => JSON.parse(r.actorsJson) as string[]))
        ),
        workflows: project.requirements.map((r) => `${r.reqCode}: ${r.title}`),
        requirements: project.requirements.map((r) => ({
          reqCode: r.reqCode,
          title: r.title,
          description: r.description,
          category: (r.category as 'Functional' | 'Non-Functional') || 'Functional',
          priority: (r.priority as 'High' | 'Medium' | 'Low') || 'Medium',
          actors: JSON.parse(r.actorsJson) as string[],
          acceptanceCriteria: r.acceptanceCriteria.map((ac) => ({
            criteriaCode: ac.criteriaCode,
            statement: ac.statement,
            isTestable: ac.isTestable,
          })),
          businessRules: r.businessRules.map((br) => ({
            ruleCode: br.ruleCode,
            statement: br.statement,
            severity: (br.severity as 'Mandatory' | 'Recommended' | 'Advisory') || 'Mandatory',
          })),
          missingInformation: JSON.parse(r.missingInfoJson) as string[],
          ambiguities: JSON.parse(r.ambiguitiesJson) as string[],
          assumptions: JSON.parse(r.assumptionsJson) as string[],
        })),
        duplicateWarnings: [],
        globalMissingInformation: [],
        globalAmbiguities: [],
        globalAssumptions: [],
      };

      const providerOverride = parseProviderMode(req.body?.providerMode);
      const { data: generated, provider, model, durationMs } = await orchestrateTestPlanning(
        project.id,
        {
          analysis: analysisPayload,
          applicationName: project.applicationName,
        },
        providerOverride
      );

      await prisma.testScenario.deleteMany({ where: { projectId: project.id } });

      for (const sc of generated) {
        await prisma.testScenario.create({
          data: {
            projectId: project.id,
            testCaseId: sc.testCaseId,
            requirementIds: JSON.stringify(sc.requirementIds),
            title: sc.title,
            testType: sc.testType,
            priority: sc.priority,
            preconditions: JSON.stringify(sc.preconditions),
            testSteps: JSON.stringify(sc.testSteps),
            testData: JSON.stringify(sc.testData),
            expectedResult: sc.expectedResult,
            tags: JSON.stringify(sc.tags),
            reasoning: sc.reasoning,
            status: 'DRAFT',
          },
        });
      }

      await syncCoverageMappings(project.id);

      const scenarios = await prisma.testScenario.findMany({
        where: { projectId: project.id },
        orderBy: { testCaseId: 'asc' },
      });

      res.json({ scenarios, meta: { provider, model, durationMs } });
    } catch (err) {
      next(err);
    }
  });

  router.put('/scenarios/:scenarioId', async (req, res, next) => {
    try {
      const existing = await prisma.testScenario.findUnique({ where: { id: req.params.scenarioId } });
      if (!existing) return res.status(404).json({ error: 'Test scenario not found' });

      const updated = await prisma.testScenario.update({
        where: { id: existing.id },
        data: {
          title: typeof req.body?.title === 'string' ? req.body.title : existing.title,
          testType: typeof req.body?.testType === 'string' ? req.body.testType : existing.testType,
          priority: typeof req.body?.priority === 'string' ? req.body.priority : existing.priority,
          expectedResult:
            typeof req.body?.expectedResult === 'string'
              ? req.body.expectedResult
              : existing.expectedResult,
          testSteps: Array.isArray(req.body?.testSteps)
            ? JSON.stringify(req.body.testSteps)
            : existing.testSteps,
          status: typeof req.body?.status === 'string' ? req.body.status : existing.status,
        },
      });
      res.json({ scenario: updated });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/scenarios/:scenarioId', async (req, res, next) => {
    try {
      const deleted = await prisma.testScenario.delete({ where: { id: req.params.scenarioId } });
      await syncCoverageMappings(deleted.projectId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/scenarios/:scenarioId/regenerate', async (req, res, next) => {
    try {
      const existing = await prisma.testScenario.findUnique({
        where: { id: req.params.scenarioId },
        include: {
          project: {
            include: {
              requirements: { include: { acceptanceCriteria: true, businessRules: true } },
            },
          },
        },
      });
      if (!existing) return res.status(404).json({ error: 'Scenario not found' });

      const linkedCodes = JSON.parse(existing.requirementIds) as string[];
      const targetReqs = existing.project.requirements.filter((r) => linkedCodes.includes(r.reqCode));
      const fallbackReqs = targetReqs.length > 0 ? targetReqs : existing.project.requirements.slice(0, 1);

      const providerOverride = parseProviderMode(req.body?.providerMode);
      const { data: candidates } = await orchestrateTestPlanning(
        existing.projectId,
        {
          applicationName: existing.project.applicationName,
          analysis: {
            summary: existing.project.description,
            actors: ['End User'],
            workflows: fallbackReqs.map((r) => r.title),
            requirements: fallbackReqs.map((r) => ({
              reqCode: r.reqCode,
              title: r.title,
              description: r.description,
              category: 'Functional',
              priority: (r.priority as 'High' | 'Medium' | 'Low') || 'Medium',
              actors: JSON.parse(r.actorsJson) as string[],
              acceptanceCriteria: r.acceptanceCriteria.map((ac) => ({
                criteriaCode: ac.criteriaCode,
                statement: ac.statement,
                isTestable: ac.isTestable,
              })),
              businessRules: r.businessRules.map((br) => ({
                ruleCode: br.ruleCode,
                statement: br.statement,
                severity: 'Mandatory',
              })),
              missingInformation: [],
              ambiguities: [],
              assumptions: [],
            })),
            duplicateWarnings: [],
            globalMissingInformation: [],
            globalAmbiguities: [],
            globalAssumptions: [],
          },
        },
        providerOverride
      );

      const picked =
        candidates.find((c) => c.testType === existing.testType) || candidates[0];
      if (!picked) {
        return res.status(500).json({ error: 'Unable to regenerate scenario' });
      }

      const updated = await prisma.testScenario.update({
        where: { id: existing.id },
        data: {
          title: picked.title,
          testType: picked.testType,
          priority: picked.priority,
          preconditions: JSON.stringify(picked.preconditions),
          testSteps: JSON.stringify(picked.testSteps),
          testData: JSON.stringify(picked.testData),
          expectedResult: picked.expectedResult,
          tags: JSON.stringify(picked.tags),
          reasoning: picked.reasoning,
          status: 'DRAFT',
        },
      });

      res.json({ scenario: updated });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:id/scenarios/approve-selected', async (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.scenarioIds) ? (req.body.scenarioIds as string[]) : [];
      if (ids.length === 0) {
        await prisma.testScenario.updateMany({
          where: { projectId: req.params.id },
          data: { status: 'APPROVED' },
        });
      } else {
        await prisma.testScenario.updateMany({
          where: { projectId: req.params.id, id: { in: ids } },
          data: { status: 'APPROVED' },
        });
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // STEP 5: Application Exploration
  router.post('/projects/:id/explore', async (req, res, next) => {
    try {
      const project = await prisma.project.findUnique({ where: { id: req.params.id } });
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const targetUrl =
        typeof req.body?.targetUrl === 'string' && req.body.targetUrl.trim()
          ? req.body.targetUrl.trim()
          : project.applicationUrl;

      const demoAuthQuickRole =
        req.body?.demoAuthQuickRole === 'customer' ||
        req.body?.demoAuthQuickRole === 'adjuster' ||
        req.body?.demoAuthQuickRole === 'admin'
          ? req.body.demoAuthQuickRole
          : null;

      const explorationId = `exp_${Date.now()}`;
      try {
        const explored = await exploreApplication({
          targetUrl,
          explorationId,
          demoAuthQuickRole,
        });

        const record = await prisma.applicationExploration.create({
          data: {
            projectId: project.id,
            targetUrl: explored.targetUrl,
            pageTitle: explored.pageTitle,
            inspectedUrlsJson: JSON.stringify(explored.inspectedUrls),
            formsJson: JSON.stringify(explored.forms),
            interactiveJson: JSON.stringify(explored.interactiveElements),
            navigationJson: JSON.stringify(explored.navigationPaths),
            domSummary: explored.domSummary,
            screenshotPath: explored.screenshotPath,
            status: 'COMPLETED',
          },
        });

        res.json({ exploration: record });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const failedRecord = await prisma.applicationExploration.create({
          data: {
            projectId: project.id,
            targetUrl,
            pageTitle: 'Exploration Failed',
            inspectedUrlsJson: JSON.stringify([targetUrl]),
            formsJson: '[]',
            interactiveJson: '[]',
            navigationJson: '[]',
            domSummary: message,
            status: 'FAILED',
            errorMessage: message,
          },
        });
        res.status(422).json({ error: message, exploration: failedRecord });
      }
    } catch (err) {
      next(err);
    }
  });

  // STEP 6: Playwright Automation Code Generation + Agent 5 Validation
  router.post('/projects/:id/automation/generate', async (req, res, next) => {
    try {
      const project = await prisma.project.findUnique({
        where: { id: req.params.id },
        include: {
          requirements: true,
          testScenarios: { orderBy: { testCaseId: 'asc' } },
          explorations: { where: { status: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const requestedIds = Array.isArray(req.body?.scenarioIds)
        ? (req.body.scenarioIds as string[])
        : [];
      const selectedScenarios =
        requestedIds.length > 0
          ? project.testScenarios.filter((s) => requestedIds.includes(s.id))
          : project.testScenarios.filter((s) => s.status === 'APPROVED' || s.status === 'AUTOMATED');

      if (selectedScenarios.length === 0) {
        return res.status(400).json({
          error: 'Approve at least one test scenario before generating Playwright automation code.',
        });
      }

      const scenarioItems: TestScenarioItem[] = selectedScenarios.map((s) => ({
        testCaseId: s.testCaseId,
        requirementIds: JSON.parse(s.requirementIds) as string[],
        title: s.title,
        testType: s.testType as TestScenarioItem['testType'],
        priority: s.priority as TestScenarioItem['priority'],
        preconditions: JSON.parse(s.preconditions) as string[],
        testSteps: JSON.parse(s.testSteps) as string[],
        testData: JSON.parse(s.testData) as Record<string, unknown>,
        expectedResult: s.expectedResult,
        tags: JSON.parse(s.tags) as string[],
        reasoning: s.reasoning,
      }));

      const latestExploration = project.explorations[0];
      const explorationContext = latestExploration
        ? {
            targetUrl: latestExploration.targetUrl,
            pageTitle: latestExploration.pageTitle,
            inspectedUrls: JSON.parse(latestExploration.inspectedUrlsJson) as string[],
            forms: JSON.parse(latestExploration.formsJson) as unknown[],
            interactiveElements: (
              JSON.parse(latestExploration.interactiveJson) as unknown[]
            ).slice(0, 40),
            domSummary: latestExploration.domSummary,
          }
        : null;

      const providerOverride = parseProviderMode(req.body?.providerMode);
      const { data: generated, provider, model, durationMs } = await orchestrateAutomationGeneration(
        project.id,
        {
          applicationName: project.applicationName,
          targetUrl: project.applicationUrl,
          scenarios: scenarioItems,
          exploration: explorationContext,
        },
        providerOverride
      );

      // Run Agent 5: Test Validation Agent before writing/marking ready
      const validReqCodes = project.requirements.map((r) => r.reqCode);
      const validationReport = validateGeneratedAutomation(generated.files, validReqCodes);

      const automationRecord = await prisma.generatedAutomation.create({
        data: {
          projectId: project.id,
          workspaceDir: 'pending',
          scenarioIdsJson: JSON.stringify(selectedScenarios.map((s) => s.id)),
          validationStatus: validationReport.passed ? 'PASSED' : 'FAILED',
          validationReport: JSON.stringify(validationReport),
          approvalStatus: 'PENDING_REVIEW',
        },
      });

      const workspaceDir = getAutomationWorkspaceRoot(project.id, automationRecord.id);
      if (validationReport.passed) {
        writeAutomationFilesToWorkspace(workspaceDir, generated.files);
      }

      const updatedAutomation = await prisma.generatedAutomation.update({
        where: { id: automationRecord.id },
        data: {
          workspaceDir,
          files: {
            create: generated.files.map((f) => ({
              relativePath: f.relativePath,
              fileCategory: f.fileCategory,
              content: f.content,
              locatorsJson: JSON.stringify(f.locators),
              linkedReqIds: JSON.stringify(f.linkedReqIds),
            })),
          },
        },
        include: { files: { orderBy: { relativePath: 'asc' } } },
      });

      if (validationReport.passed) {
        await prisma.testScenario.updateMany({
          where: { id: { in: selectedScenarios.map((s) => s.id) } },
          data: { status: 'AUTOMATED' },
        });
      }

      await syncCoverageMappings(project.id);

      res.status(201).json({
        automation: updatedAutomation,
        validation: validationReport,
        meta: { provider, model, durationMs },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/projects/:id/automation/:automationId/download', async (req, res, next) => {
    try {
      const automation = await prisma.generatedAutomation.findUnique({
        where: { id: req.params.automationId },
        include: { files: true },
      });
      if (!automation || automation.projectId !== req.params.id) {
        return res.status(404).json({ error: 'Automation suite not found' });
      }
      res.setHeader('Content-Disposition', `attachment; filename="playwright-suite-${automation.id}.json"`);
      res.json({
        automationId: automation.id,
        validationStatus: automation.validationStatus,
        approvalStatus: automation.approvalStatus,
        files: automation.files.map((f) => ({
          relativePath: f.relativePath,
          fileCategory: f.fileCategory,
          content: f.content,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // STEP 7: Code Review & Approval Gate
  router.post('/automation/:automationId/review', async (req, res, next) => {
    try {
      const existing = await prisma.generatedAutomation.findUnique({
        where: { id: req.params.automationId },
      });
      if (!existing) return res.status(404).json({ error: 'Automation suite not found' });

      const decision = req.body?.decision === 'REJECTED' ? 'REJECTED' : 'APPROVED';
      if (decision === 'APPROVED' && existing.validationStatus !== 'PASSED') {
        return res.status(400).json({
          error: 'Cannot approve automation that failed static validation checks.',
        });
      }

      const updated = await prisma.generatedAutomation.update({
        where: { id: existing.id },
        data: {
          approvalStatus: decision,
          approvedBy: 'Principal QA Architect',
          approvedAt: decision === 'APPROVED' ? new Date() : null,
          reviewNotes: typeof req.body?.reviewNotes === 'string' ? req.body.reviewNotes : null,
        },
        include: { files: { orderBy: { relativePath: 'asc' } } },
      });

      res.json({ automation: updated });
    } catch (err) {
      next(err);
    }
  });

  // STEP 8: Controlled Playwright Test Execution
  router.post('/projects/:id/execute', async (req, res, next) => {
    try {
      const project = await prisma.project.findUnique({
        where: { id: req.params.id },
        include: { testScenarios: true },
      });
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const automationId = typeof req.body?.automationId === 'string' ? req.body.automationId : undefined;
      const automation = automationId
        ? await prisma.generatedAutomation.findUnique({
            where: { id: automationId },
            include: { files: true },
          })
        : await prisma.generatedAutomation.findFirst({
            where: { projectId: project.id },
            orderBy: { createdAt: 'desc' },
            include: { files: true },
          });

      if (!automation || automation.projectId !== project.id) {
        return res.status(400).json({ error: 'Generate Playwright automation files first.' });
      }
      if (automation.approvalStatus !== 'APPROVED') {
        return res.status(403).json({
          error:
            'Execution blocked: Generated automation must be reviewed and approved in Code Review before running.',
        });
      }
      if (automation.validationStatus !== 'PASSED') {
        return res.status(400).json({ error: 'Cannot execute automation that failed validation.' });
      }

      // Ensure files are materialized in controlled workspace
      writeAutomationFilesToWorkspace(
        automation.workspaceDir,
        automation.files.map((f) => ({
          relativePath: f.relativePath,
          fileCategory: f.fileCategory as 'PAGE_OBJECT' | 'FIXTURE' | 'TEST_SPEC' | 'TEST_DATA' | 'HELPER',
          content: f.content,
          locators: JSON.parse(f.locatorsJson) as string[],
          linkedReqIds: JSON.parse(f.linkedReqIds) as string[],
        }))
      );

      const browser =
        req.body?.browser === 'firefox' || req.body?.browser === 'webkit'
          ? req.body.browser
          : 'chromium';
      const headed = Boolean(req.body?.headed);
      const workers = Math.max(1, Math.min(4, Number(req.body?.workers ?? 1) || 1));
      const retries = Math.max(0, Math.min(2, Number(req.body?.retries ?? 0) || 0));

      const run = await prisma.executionRun.create({
        data: {
          projectId: project.id,
          automationId: automation.id,
          browser,
          headed,
          workers,
          retries,
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      const summary = await runPlaywrightWorkspace({
        executionRunId: run.id,
        workspaceDir: automation.workspaceDir,
        browser,
        headed,
        workers,
        retries,
      });

      const scenarioByTc = new Map(
        project.testScenarios.map((s) => [s.testCaseId.toUpperCase(), s.id])
      );

      if (summary.results.length > 0) {
        await prisma.executionResult.createMany({
          data: summary.results.map((r) => ({
            executionRunId: run.id,
            scenarioId: r.testCaseId ? scenarioByTc.get(r.testCaseId.toUpperCase()) ?? null : null,
            testCaseId: r.testCaseId,
            testTitle: r.testTitle,
            specFile: r.specFile,
            browser: r.browser,
            status: r.status,
            durationMs: r.durationMs,
            errorMessage: r.errorMessage,
            stackTrace: r.stackTrace,
            screenshotPath: r.screenshotPath,
            tracePath: r.tracePath,
            videoPath: r.videoPath,
          })),
        });
      }

      const updatedRun = await prisma.executionRun.update({
        where: { id: run.id },
        data: {
          status: summary.status,
          totalTests: summary.totalTests,
          passedTests: summary.passedTests,
          failedTests: summary.failedTests,
          skippedTests: summary.skippedTests,
          durationMs: summary.durationMs,
          htmlReportPath: summary.htmlReportPath,
          jsonReportPath: summary.jsonReportPath,
          junitReportPath: summary.junitReportPath,
          completedAt: new Date(),
        },
        include: { results: { orderBy: { testTitle: 'asc' } } },
      });

      await syncCoverageMappings(project.id);

      // Generate executive AI summary automatically if run produced results
      let executiveSummary = null;
      if (summary.totalTests > 0) {
        try {
          executiveSummary = await generateProjectExecutiveReport(
            project.id,
            updatedRun.id,
            parseProviderMode(req.body?.providerMode)
          );
        } catch {
          // Executive summary can also be triggered explicitly later
        }
      }

      const finalRun = await prisma.executionRun.findUnique({
        where: { id: updatedRun.id },
        include: { results: { orderBy: { testTitle: 'asc' } } },
      });

      res.json({
        executionRun: finalRun,
        executiveSummary,
        rawLog: summary.rawLog,
      });
    } catch (err) {
      next(err);
    }
  });

  // STEP 10: AI Executive Summary on existing run
  router.post('/executions/:runId/executive-summary', async (req, res, next) => {
    try {
      const run = await prisma.executionRun.findUnique({ where: { id: req.params.runId } });
      if (!run) return res.status(404).json({ error: 'Execution run not found' });

      const summary = await generateProjectExecutiveReport(
        run.projectId,
        run.id,
        parseProviderMode(req.body?.providerMode)
      );
      res.json({ executiveSummary: summary });
    } catch (err) {
      next(err);
    }
  });

  // Traceability Matrix & Export
  router.get('/projects/:id/traceability', async (req, res, next) => {
    try {
      const project = await prisma.project.findUnique({
        where: { id: req.params.id },
        include: {
          requirements: {
            include: { acceptanceCriteria: true, businessRules: true },
            orderBy: { reqCode: 'asc' },
          },
          testScenarios: { orderBy: { testCaseId: 'asc' } },
          executionRuns: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { results: true },
          },
          generatedAutomations: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { files: true },
          },
        },
      });
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const specByScenario = new Map<string, string>();
      const specs = (project.generatedAutomations[0]?.files ?? []).filter(
        (f) => f.fileCategory === 'TEST_SPEC'
      );
      for (const sc of project.testScenarios) {
        const match = specs.find((f) => f.content.includes(sc.testCaseId));
        if (match) specByScenario.set(sc.id, match.relativePath);
      }

      const audit = calculateCoverageAndTraceability({
        requirements: project.requirements,
        scenarios: project.testScenarios,
        latestResults: project.executionRuns[0]?.results ?? [],
        automationSpecsByScenarioId: specByScenario,
      });

      res.json(audit);
    } catch (err) {
      next(err);
    }
  });

  router.get('/projects/:id/traceability/export', async (req, res, next) => {
    try {
      const project = await prisma.project.findUnique({
        where: { id: req.params.id },
        include: {
          requirements: {
            include: { acceptanceCriteria: true, businessRules: true },
            orderBy: { reqCode: 'asc' },
          },
          testScenarios: { orderBy: { testCaseId: 'asc' } },
          executionRuns: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { results: true },
          },
          generatedAutomations: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { files: true },
          },
        },
      });
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const specByScenario = new Map<string, string>();
      const specs = (project.generatedAutomations[0]?.files ?? []).filter(
        (f) => f.fileCategory === 'TEST_SPEC'
      );
      for (const sc of project.testScenarios) {
        const match = specs.find((f) => f.content.includes(sc.testCaseId));
        if (match) specByScenario.set(sc.id, match.relativePath);
      }

      const audit = calculateCoverageAndTraceability({
        requirements: project.requirements,
        scenarios: project.testScenarios,
        latestResults: project.executionRuns[0]?.results ?? [],
        automationSpecsByScenarioId: specByScenario,
      });

      if (req.query.format === 'csv') {
        const csv = exportTraceabilityCsv(audit.matrix);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="traceability-${project.id}.csv"`
        );
        return res.send(csv);
      }

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="traceability-${project.id}.json"`
      );
      return res.json(audit);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
