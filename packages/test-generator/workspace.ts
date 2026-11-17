import fs from 'node:fs';
import path from 'node:path';
import type { GeneratedAutomationFile } from '../ai-engine/schemas/ai-schemas.ts';
import { resolveSafeWorkspacePath } from '../security/url-guard.ts';

export function getAutomationWorkspaceRoot(projectId: string, automationId: string): string {
  const safeProject = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeAuto = automationId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.resolve(process.cwd(), 'generated-tests', safeProject, safeAuto);
}

export function writeAutomationFilesToWorkspace(
  workspaceDir: string,
  files: GeneratedAutomationFile[]
): string[] {
  fs.mkdirSync(workspaceDir, { recursive: true });
  const writtenPaths: string[] = [];

  for (const file of files) {
    const targetPath = resolveSafeWorkspacePath(workspaceDir, file.relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, file.content, 'utf8');
    writtenPaths.push(targetPath);
  }

  return writtenPaths;
}
