import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { resolveChromiumExecutablePath } from '../application-explorer/explorer.ts';

export interface RunPlaywrightOptions {
  executionRunId: string;
  workspaceDir: string;
  browser: 'chromium' | 'firefox' | 'webkit';
  headed: boolean;
  workers: number;
  retries: number;
  timeoutMs?: number;
}

export interface ParsedTestResult {
  testCaseId: string | null;
  testTitle: string;
  specFile: string;
  browser: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'TIMEDOUT';
  durationMs: number;
  errorMessage: string | null;
  stackTrace: string | null;
  screenshotPath: string | null;
  tracePath: string | null;
  videoPath: string | null;
}

export interface PlaywrightExecutionSummary {
  status: 'PASSED' | 'FAILED' | 'ERROR';
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  durationMs: number;
  htmlReportPath: string | null;
  jsonReportPath: string | null;
  junitReportPath: string | null;
  results: ParsedTestResult[];
  rawLog: string;
}

interface PlaywrightJsonSuite {
  title?: string;
  file?: string;
  suites?: PlaywrightJsonSuite[];
  specs?: Array<{
    title: string;
    file?: string;
    tests?: Array<{
      projectName?: string;
      results?: Array<{
        status?: string;
        duration?: number;
        error?: { message?: string; stack?: string };
        attachments?: Array<{ name?: string; contentType?: string; path?: string }>;
      }>;
    }>;
  }>;
}

function toArtifactUrl(absPath: string | undefined, runArtifactsDir: string): string | null {
  if (!absPath) return null;
  const relToTestResults = path.relative(path.resolve(process.cwd(), 'test-results'), absPath);
  if (!relToTestResults.startsWith('..') && !path.isAbsolute(relToTestResults)) {
    return `/artifacts/${relToTestResults.replace(/\\/g, '/')}`;
  }
  const baseName = path.basename(absPath);
  const copiedPath = path.join(runArtifactsDir, baseName);
  if (fs.existsSync(absPath)) {
    fs.copyFileSync(absPath, copiedPath);
    const rel = path.relative(path.resolve(process.cwd(), 'test-results'), copiedPath);
    return `/artifacts/${rel.replace(/\\/g, '/')}`;
  }
  return null;
}

function extractTestCaseId(title: string): string | null {
  const match = title.match(/\b(TC-\d{3,})\b/i);
  return match ? match[1].toUpperCase() : null;
}

export async function runPlaywrightWorkspace(
  options: RunPlaywrightOptions
): Promise<PlaywrightExecutionSummary> {
  const runResultsDir = path.resolve(process.cwd(), 'test-results', 'runs', options.executionRunId);
  const htmlReportDir = path.join(runResultsDir, 'html-report');
  const artifactsDir = path.join(runResultsDir, 'artifacts');
  const jsonReportFile = path.join(runResultsDir, 'results.json');
  const junitReportFile = path.join(runResultsDir, 'junit.xml');

  fs.mkdirSync(runResultsDir, { recursive: true });
  fs.mkdirSync(artifactsDir, { recursive: true });

  const executablePath = options.browser === 'chromium' ? resolveChromiumExecutablePath() : undefined;
  const hasFfmpeg =
    fs.existsSync('/ms-playwright/ffmpeg-1013/ffmpeg-linux') ||
    fs.existsSync(path.join(process.env.HOME || '', '.cache/ms-playwright/ffmpeg-1013/ffmpeg-linux'));

  const configContent = `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: ${Math.max(0, Math.min(3, options.retries))},
  workers: ${Math.max(1, Math.min(4, options.workers))},
  timeout: 30000,
  outputDir: ${JSON.stringify(artifactsDir)},
  reporter: [
    ['json', { outputFile: ${JSON.stringify(jsonReportFile)} }],
    ['junit', { outputFile: ${JSON.stringify(junitReportFile)} }],
    ['html', { outputFolder: ${JSON.stringify(htmlReportDir)}, open: 'never' }],
  ],
  use: {
    headless: ${options.headed ? 'false' : 'true'},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: ${hasFfmpeg ? "'retain-on-failure'" : "'off'"},
    launchOptions: {
      ${executablePath ? `executablePath: ${JSON.stringify(executablePath)},` : ''}
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  },
  projects: [
    {
      name: ${JSON.stringify(options.browser)},
      use: { browserName: ${JSON.stringify(options.browser)} },
    },
  ],
});
`;

  const configPath = path.join(options.workspaceDir, 'playwright.config.ts');
  fs.writeFileSync(configPath, configContent, 'utf8');

  const startTime = Date.now();
  const timeoutMs = options.timeoutMs ?? 120000;

  const execResult = await new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(
      'npx',
      ['playwright', 'test', '--config', configPath],
      {
        cwd: options.workspaceDir,
        shell: false,
        env: {
          ...process.env,
          CI: 'true',
          PLAYWRIGHT_HTML_OPEN: 'never',
        },
      }
    );

    let output = '';
    const append = (chunk: Buffer) => {
      if (output.length < 50000) {
        output += chunk.toString('utf8');
      }
    };

    child.stdout.on('data', append);
    child.stderr.on('data', append);

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      output += `\n[Runner] Execution timed out after ${timeoutMs}ms.`;
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 1, output: `${output}\n${err.message}` });
    });
  });

  const durationMs = Date.now() - startTime;
  const parsedResults: ParsedTestResult[] = [];

  if (fs.existsSync(jsonReportFile)) {
    try {
      const rawJson = JSON.parse(fs.readFileSync(jsonReportFile, 'utf8')) as {
        suites?: PlaywrightJsonSuite[];
      };

      const walkSuite = (suite: PlaywrightJsonSuite, parentFile?: string) => {
        const currentFile = suite.file || parentFile || 'unknown.spec.ts';
        for (const spec of suite.specs ?? []) {
          const specFile = spec.file || currentFile;
          for (const t of spec.tests ?? []) {
            const latestResult = (t.results ?? [])[t.results!.length - 1];
            if (!latestResult) continue;

            const rawStatus = (latestResult.status || 'failed').toLowerCase();
            const status: ParsedTestResult['status'] =
              rawStatus === 'passed'
                ? 'PASSED'
                : rawStatus === 'skipped'
                  ? 'SKIPPED'
                  : rawStatus === 'timedout'
                    ? 'TIMEDOUT'
                    : 'FAILED';

            const attachments = latestResult.attachments ?? [];
            const screenshotAtt = attachments.find(
              (a) => a.name === 'screenshot' || a.contentType?.startsWith('image/')
            );
            const traceAtt = attachments.find(
              (a) => a.name === 'trace' || a.path?.endsWith('.zip')
            );
            const videoAtt = attachments.find(
              (a) => a.name === 'video' || a.contentType?.startsWith('video/')
            );

            parsedResults.push({
              testCaseId: extractTestCaseId(spec.title),
              testTitle: spec.title,
              specFile,
              browser: t.projectName || options.browser,
              status,
              durationMs: Math.round(latestResult.duration ?? 0),
              errorMessage: latestResult.error?.message || null,
              stackTrace: latestResult.error?.stack || null,
              screenshotPath: toArtifactUrl(screenshotAtt?.path, artifactsDir),
              tracePath: toArtifactUrl(traceAtt?.path, artifactsDir),
              videoPath: toArtifactUrl(videoAtt?.path, artifactsDir),
            });
          }
        }
        for (const child of suite.suites ?? []) {
          walkSuite(child, currentFile);
        }
      };

      for (const s of rawJson.suites ?? []) {
        walkSuite(s);
      }
    } catch {
      // Fallback handled below if JSON parse failed
    }
  }

  const totalTests = parsedResults.length;
  const passedTests = parsedResults.filter((r) => r.status === 'PASSED').length;
  const failedTests = parsedResults.filter(
    (r) => r.status === 'FAILED' || r.status === 'TIMEDOUT'
  ).length;
  const skippedTests = parsedResults.filter((r) => r.status === 'SKIPPED').length;

  const overallStatus: PlaywrightExecutionSummary['status'] =
    totalTests === 0 && execResult.code !== 0
      ? 'ERROR'
      : failedTests > 0 || execResult.code !== 0
        ? 'FAILED'
        : 'PASSED';

  return {
    status: overallStatus,
    totalTests,
    passedTests,
    failedTests,
    skippedTests,
    durationMs,
    htmlReportPath: fs.existsSync(path.join(htmlReportDir, 'index.html'))
      ? `/artifacts/runs/${options.executionRunId}/html-report/index.html`
      : null,
    jsonReportPath: fs.existsSync(jsonReportFile)
      ? `/artifacts/runs/${options.executionRunId}/results.json`
      : null,
    junitReportPath: fs.existsSync(junitReportFile)
      ? `/artifacts/runs/${options.executionRunId}/junit.xml`
      : null,
    results: parsedResults,
    rawLog: execResult.output,
  };
}
