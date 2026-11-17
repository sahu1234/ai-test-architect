# Veridian P&C Insurance Portal — End-to-End Claims & FNOL Specification

## Business Context
Policyholders require a self-service First Notice of Loss (FNOL) workflow to file property and auto claims, upload supporting evidence, and track adjuster review decisions.

## Functional Requirements

### 1. Customer Authentication & Policy Portfolio
- Customers authenticate with email and password; locked accounts are denied access.
- Authenticated customers inspect active and expired policies including policy number (format POL-YYYY-XXXX), coverage limit, deductible, and insured asset.

### 2. First Notice of Loss (FNOL) Submission
- Customers select an active policy and submit incident date, loss type, incident description, estimated loss amount (USD), and supporting document filename.
- Business Validation Rules:
  - All mandatory FNOL fields (policy, incident date, loss type, description, estimated amount) are required.
  - Incident date cannot be in the future.
  - Estimated loss amount must be greater than zero.
  - Expired policies cannot accept new FNOL claim submissions.
  - Duplicate claim submissions matching the same policy number, incident date, and loss type must be blocked.
  - Uploaded supporting documents must use `.pdf`, `.png`, `.jpg`, or `.jpeg` extensions and must not exceed 5 MB.

### 3. Adjuster Claim Review Workflow
- Claims Adjusters view submitted and under-review claims, inspect claim metadata, and enter structured review notes.
- Adjusters can transition claims to `APPROVED` or `REJECTED`.
- Rejecting a claim requires a mandatory justification note.

### 4. Admin Governance Portal
- System Administrators inspect user directories and manage claim statuses across all accounts.

## Ambiguities & Missing Information
- Maximum number of supporting documents per claim is unspecified.
- Senior adjuster payout approval limits are not defined in this BRD.
