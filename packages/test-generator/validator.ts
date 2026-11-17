import { transformSync } from 'esbuild';
import type { GeneratedAutomationFile } from '../ai-engine/schemas/ai-schemas.ts';

export interface ValidationIssue {
  severity: 'ERROR' | 'WARNING';
  file: string;
  message: string;
}

export interface AutomationValidationReport {
  passed: boolean;
  checkedFiles: number;
  errorCount: number;
  warningCount: number;
  issues: ValidationIssue[];
  mappedRequirementIds: string[];
}

const ALLOWED_DIR_PREFIXES = ['pages/', 'fixtures/', 'tests/', 'test-data/', 'helpers/'];

const FORBIDDEN_SECURITY_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\beval\s*\(/, reason: 'Use of eval() is strictly prohibited.' },
  { pattern: /\bnew\s+Function\s*\(/, reason: 'Use of new Function() is strictly prohibited.' },
  { pattern: /child_process/, reason: 'Importing child_process inside generated tests is prohibited.' },
  { pattern: /process\.env\.[A-Z0-9_]*KEY/i, reason: 'Accessing secret environment keys inside generated tests is prohibited.' },
  { pattern: /process\.env\.[A-Z0-9_]*SECRET/i, reason: 'Accessing secret environment variables is prohibited.' },
  { pattern: /process\.env\.[A-Z0-9_]*TOKEN/i, reason: 'Accessing token environment variables is prohibited.' },
  { pattern: /fs\.(rmSync|unlinkSync|writeFileSync)/, reason: 'Destructive filesystem mutations in generated tests are prohibited.' },
];

export function validateGeneratedAutomation(
  files: GeneratedAutomationFile[],
  validRequirementCodes: string[]
): AutomationValidationReport {
  const issues: ValidationIssue[] = [];
  const mappedReqs = new Set<string>();

  if (files.length === 0) {
    issues.push({ severity: 'ERROR', file: 'workspace', message: 'No automation files were generated.' });
  }

  const hasSpecFile = files.some((f) => f.fileCategory === 'TEST_SPEC' || f.relativePath.endsWith('.spec.ts'));
  if (!hasSpecFile) {
    issues.push({
      severity: 'ERROR',
      file: 'tests/',
      message: 'At least one Playwright .spec.ts test file is required.',
    });
  }

  for (const file of files) {
    const normPath = file.relativePath.replace(/\\/g, '/').replace(/^\/+/, '');

    // 1. Validate file paths
    if (normPath.includes('..') || !ALLOWED_DIR_PREFIXES.some((p) => normPath.startsWith(p))) {
      issues.push({
        severity: 'ERROR',
        file: file.relativePath,
        message: `File path must reside under one of: ${ALLOWED_DIR_PREFIXES.join(', ')}`,
      });
    }

    if (!normPath.endsWith('.ts') && !normPath.endsWith('.json')) {
      issues.push({
        severity: 'ERROR',
        file: file.relativePath,
        message: 'Generated files may only have .ts or .json extensions.',
      });
    }

    // 2. Security guardrails
    for (const rule of FORBIDDEN_SECURITY_PATTERNS) {
      if (rule.pattern.test(file.content)) {
        issues.push({
          severity: 'ERROR',
          file: file.relativePath,
          message: rule.reason,
        });
      }
    }

    // 3. JSON / TypeScript syntax checks
    if (normPath.endsWith('.json')) {
      try {
        JSON.parse(file.content);
      } catch (err) {
        issues.push({
          severity: 'ERROR',
          file: file.relativePath,
          message: `Invalid JSON syntax: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else if (normPath.endsWith('.ts')) {
      try {
        transformSync(file.content, { loader: 'ts', target: 'es2022', format: 'esm' });
      } catch (err) {
        issues.push({
          severity: 'ERROR',
          file: file.relativePath,
          message: `TypeScript syntax error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      // Check imports for relative Page Object references
      if (normPath.startsWith('tests/') && normPath.endsWith('.spec.ts')) {
        if (!file.content.includes('expect(')) {
          issues.push({
            severity: 'ERROR',
            file: file.relativePath,
            message: 'Test spec is missing deterministic expect() assertions.',
          });
        }
        if (file.content.includes('waitForTimeout(')) {
          issues.push({
            severity: 'WARNING',
            file: file.relativePath,
            message: 'Avoid hardcoded waitForTimeout() calls; prefer Playwright web-first assertions.',
          });
        }
        if (/\/\/xpath|nth-child\(/i.test(file.content)) {
          issues.push({
            severity: 'WARNING',
            file: file.relativePath,
            message: 'Brittle XPath or nth-child selector detected; prefer getByRole/getByTestId/getByLabel.',
          });
        }
        if (!/REQ-\d+/.test(file.content)) {
          issues.push({
            severity: 'WARNING',
            file: file.relativePath,
            message: 'Test spec should explicitly reference source REQ-XXX requirement IDs.',
          });
        }
      }
    }

    // 4. Requirement mapping check
    for (const reqCode of file.linkedReqIds) {
      mappedReqs.add(reqCode);
      if (validRequirementCodes.length > 0 && !validRequirementCodes.includes(reqCode)) {
        issues.push({
          severity: 'WARNING',
          file: file.relativePath,
          message: `Referenced requirement "${reqCode}" does not exist in the project's analyzed requirements.`,
        });
      }
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'ERROR').length;
  const warningCount = issues.filter((i) => i.severity === 'WARNING').length;

  return {
    passed: errorCount === 0,
    checkedFiles: files.length,
    errorCount,
    warningCount,
    issues,
    mappedRequirementIds: Array.from(mappedReqs),
  };
}
