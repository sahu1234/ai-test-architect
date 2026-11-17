import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { createServer as createViteServer } from 'vite';
import { createPlatformApiRouter } from './apps/web/api/routes.ts';
import { createDemoInsuranceRouter } from './apps/demo-insurance-app/backend.ts';
import { ensureDefaultUser } from './packages/db/client.ts';

export async function createAppServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  await ensureDefaultUser();

  // Serve Playwright reports, traces, screenshots, and exploration captures safely
  const testResultsDir = path.resolve(process.cwd(), 'test-results');
  fs.mkdirSync(testResultsDir, { recursive: true });
  app.use('/artifacts', express.static(testResultsDir));

  // Isolated Demo Insurance App API
  app.use('/api/demo-insurance', createDemoInsuranceRouter());

  // AI Test Architect Platform API
  app.use('/api', createPlatformApiRouter());

  // API Error Handler
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        issues: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    return res.status(500).json({ error: message });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMainModule) {
  const PORT = Number(process.env.PORT || 3000);
  createAppServer()
    .then((app) => {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`AI Test Architect listening on http://0.0.0.0:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to start AI Test Architect server:', err);
      process.exit(1);
    });
}
