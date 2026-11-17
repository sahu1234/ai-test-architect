import path from 'node:path';
import mammoth from 'mammoth';
import { extractText } from 'unpdf';

export const MAX_REQUIREMENT_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_REQUIREMENT_TEXT_CHARS = 50000;

const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.pdf', '.docx']);

export interface ParsedRequirementFile {
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  rawText: string;
}

export function validateRequirementUploadMeta(fileName: string, fileSizeBytes: number): {
  valid: boolean;
  ext?: string;
  reason?: string;
} {
  const cleanName = path.basename(fileName.trim());
  if (!cleanName) {
    return { valid: false, reason: 'File name is required.' };
  }
  const ext = path.extname(cleanName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      reason: `Unsupported file type "${ext || 'unknown'}". Allowed: .txt, .md, .markdown, .pdf, .docx`,
    };
  }
  if (fileSizeBytes <= 0) {
    return { valid: false, reason: 'Uploaded file is empty.' };
  }
  if (fileSizeBytes > MAX_REQUIREMENT_FILE_BYTES) {
    return {
      valid: false,
      reason: `File exceeds maximum size limit of ${MAX_REQUIREMENT_FILE_BYTES / (1024 * 1024)} MB.`,
    };
  }
  return { valid: true, ext };
}

export async function parseRequirementFileBuffer(
  fileName: string,
  buffer: Buffer
): Promise<ParsedRequirementFile> {
  const check = validateRequirementUploadMeta(fileName, buffer.byteLength);
  if (!check.valid || !check.ext) {
    throw new Error(check.reason || 'Invalid requirement file');
  }

  let extracted = '';

  if (check.ext === '.txt' || check.ext === '.md' || check.ext === '.markdown') {
    extracted = buffer.toString('utf8');
  } else if (check.ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    extracted = result.value || '';
  } else if (check.ext === '.pdf') {
    const uint8 = new Uint8Array(buffer);
    const result = await extractText(uint8, { mergePages: true });
    extracted = Array.isArray(result.text) ? result.text.join('\n\n') : String(result.text ?? '');
  }

  const normalized = extracted.replace(/\0/g, '').trim();
  if (!normalized) {
    throw new Error('Could not extract readable text from the uploaded document.');
  }

  return {
    fileName: path.basename(fileName.trim()),
    fileType: check.ext.replace('.', '').toUpperCase(),
    fileSizeBytes: buffer.byteLength,
    rawText: normalized.slice(0, MAX_REQUIREMENT_TEXT_CHARS),
  };
}

export function validatePastedRequirementText(text: string): string {
  const normalized = text.replace(/\0/g, '').trim();
  if (normalized.length < 20) {
    throw new Error('Requirement text must contain at least 20 characters.');
  }
  return normalized.slice(0, MAX_REQUIREMENT_TEXT_CHARS);
}
