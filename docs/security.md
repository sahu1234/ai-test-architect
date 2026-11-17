# Security & Reliability Guardrails

## Implemented Controls

- **Human-in-the-Loop Code Review Gate**: Generated Playwright code defaults to `PENDING_REVIEW` and cannot be executed (`403 Forbidden`) until explicitly approved by a reviewer.
- **Static Code & Path Validation**: Agent 5 blocks `eval()`, `new Function()`, `child_process`, secret `process.env.*` reads, and files outside `pages/`, `fixtures/`, `tests/`, `test-data/`, or `helpers/`.
- **Path Traversal Protection**: All file writes resolve through `resolveSafeWorkspacePath` and verify containment inside `generated-tests/`.
- **SSRF & Origin Controls**: `validateTargetUrl` rejects non-HTTP(S) schemes (`file:`, `javascript:`, `data:`), cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`), and unapproved private network ranges.
- **Untrusted Data Isolation**: Uploaded documents and explored DOM text are delimited as untrusted data in prompts; authentication passwords/tokens are never sent to Gemini.
- **No Shell Interpolation**: Playwright execution uses `spawn('npx', ['playwright', 'test', ...], { shell: false })` with explicit execution timeouts.
- **Upload Validation**: Enforces 2 MB upload limit and `.txt`, `.md`, `.markdown`, `.pdf`, `.docx` allowlist.

## Local Execution Security Model Limitations

Ordinary Node.js `child_process` spawning provides process isolation, working-directory scoping, and static pre-execution checks, **not** a kernel-level OS container or microVM sandbox. When deploying for untrusted multi-tenant code execution, run Playwright workers inside ephemeral rootless containers (e.g., Docker/gVisor) with strict network egress policies.
