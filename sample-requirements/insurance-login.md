# Veridian P&C Insurance Portal — Authentication & Role Access Specification

## Overview
Veridian Insurance provides an online portal serving Customers, Claims Adjusters, and System Administrators.

## Functional Requirements

### 1. Portal Login & Credential Validation
- Registered users log in using their corporate or policyholder email address and password.
- Valid credentials authenticate the user and redirect them directly to their role-specific workspace (Customer Portal, Adjuster Portal, or Admin Portal).
- Invalid credentials (unknown email or mismatched password) must display an explicit inline error message and prevent session creation.
- Both email and password inputs are mandatory before form submission.

### 2. Locked Account Security Control
- Accounts marked as LOCKED must be prevented from authenticating even when valid credentials are entered.
- The system must display a clear account lock notification advising the user to contact support.

### 3. Role-Based Authorization Boundaries
- Customers may view only their own policies and claims and cannot access Adjuster approval controls or Admin user directories.
- Claims Adjusters can review assigned claims, record review notes, and approve or reject claims.
- Administrators can view all portal users and override global claim statuses.

## Open Questions / Ambiguities
- Password complexity rules and MFA enforcement thresholds for Adjuster accounts are not specified in this draft.
- Consecutive failed login attempt threshold before automatic lockout is not stated.
