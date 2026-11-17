# Veridian P&C Insurance Portal — Policy Management & Coverage Inquiry Specification

## Scope
Policyholders must be able to review active and historical insurance policies prior to initiating claims or coverage inquiries.

## Requirements
- Display a structured portfolio of policies belonging to the authenticated customer.
- Policy numbers must follow the standardized `POL-YYYY-XXXX` pattern.
- Each policy record must expose:
  - Product type (e.g., Auto Comprehensive, Homeowners Standard)
  - Insured asset description
  - Coverage limit and deductible in USD
  - Effective start and expiration dates
  - Policy lifecycle status (`ACTIVE` or `EXPIRED`)
- Expired policies must remain visible for historical reference while preventing new FNOL submissions.
