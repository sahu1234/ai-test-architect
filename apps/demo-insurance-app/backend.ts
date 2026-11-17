import { Router } from 'express';
import crypto from 'node:crypto';

export type DemoRole = 'CUSTOMER' | 'ADJUSTER' | 'ADMIN';
export type ClaimStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';

export interface DemoUser {
  id: string;
  email: string;
  name: string;
  role: DemoRole;
  status: 'ACTIVE' | 'LOCKED';
  passwordHash: string;
}

export interface DemoPolicy {
  policyNumber: string;
  holderEmail: string;
  productType: string;
  insuredAsset: string;
  coverageLimitUsd: number;
  deductibleUsd: number;
  effectiveFrom: string;
  effectiveTo: string;
  status: 'ACTIVE' | 'EXPIRED';
}

export interface DemoClaim {
  claimId: string;
  policyNumber: string;
  customerEmail: string;
  incidentDate: string;
  lossType: string;
  description: string;
  estimatedAmountUsd: number;
  documentName: string;
  documentSizeBytes: number;
  status: ClaimStatus;
  adjusterNotes: string[];
  createdAt: string;
  updatedAt: string;
}

function hashDemoPass(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function createInitialSeed() {
  const users: DemoUser[] = [
    {
      id: 'usr-cust-1',
      email: 'customer@veridian.test',
      name: 'Maya Lin',
      role: 'CUSTOMER',
      status: 'ACTIVE',
      passwordHash: hashDemoPass('CustomerPass!2026'),
    },
    {
      id: 'usr-cust-locked',
      email: 'locked@veridian.test',
      name: 'Jordan Vance',
      role: 'CUSTOMER',
      status: 'LOCKED',
      passwordHash: hashDemoPass('LockedPass!2026'),
    },
    {
      id: 'usr-adj-1',
      email: 'adjuster@veridian.test',
      name: 'Elena Rostova',
      role: 'ADJUSTER',
      status: 'ACTIVE',
      passwordHash: hashDemoPass('AdjusterPass!2026'),
    },
    {
      id: 'usr-adm-1',
      email: 'admin@veridian.test',
      name: 'Marcus Sterling',
      role: 'ADMIN',
      status: 'ACTIVE',
      passwordHash: hashDemoPass('AdminPass!2026'),
    },
  ];

  const policies: DemoPolicy[] = [
    {
      policyNumber: 'POL-2026-1001',
      holderEmail: 'customer@veridian.test',
      productType: 'Auto Comprehensive',
      insuredAsset: '2024 Subaru Outback Touring XT',
      coverageLimitUsd: 100000,
      deductibleUsd: 500,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-12-31',
      status: 'ACTIVE',
    },
    {
      policyNumber: 'POL-2026-1042',
      holderEmail: 'customer@veridian.test',
      productType: 'Homeowners Standard',
      insuredAsset: '412 Cedar Ridge Terrace, Seattle WA',
      coverageLimitUsd: 450000,
      deductibleUsd: 1500,
      effectiveFrom: '2026-02-01',
      effectiveTo: '2027-01-31',
      status: 'ACTIVE',
    },
    {
      policyNumber: 'POL-2024-0889',
      holderEmail: 'customer@veridian.test',
      productType: 'Renters Protection',
      insuredAsset: 'Apt 4B, 890 Pine Ave',
      coverageLimitUsd: 40000,
      deductibleUsd: 250,
      effectiveFrom: '2024-01-01',
      effectiveTo: '2024-12-31',
      status: 'EXPIRED',
    },
  ];

  const claims: DemoClaim[] = [
    {
      claimId: 'CLM-2026-001',
      policyNumber: 'POL-2026-1001',
      customerEmail: 'customer@veridian.test',
      incidentDate: '2026-09-12',
      lossType: 'Collision',
      description: 'Rear bumper impact at low speed in supermarket parking lot.',
      estimatedAmountUsd: 3200,
      documentName: 'parking-lot-photo.jpg',
      documentSizeBytes: 245120,
      status: 'SUBMITTED',
      adjusterNotes: [],
      createdAt: '2026-09-13T10:15:00.000Z',
      updatedAt: '2026-09-13T10:15:00.000Z',
    },
    {
      claimId: 'CLM-2026-002',
      policyNumber: 'POL-2026-1042',
      customerEmail: 'customer@veridian.test',
      incidentDate: '2026-08-04',
      lossType: 'Wind & Hail',
      description: 'Shingle damage on south roof slope following summer storm.',
      estimatedAmountUsd: 6850,
      documentName: 'roof-inspection.pdf',
      documentSizeBytes: 512000,
      status: 'UNDER_REVIEW',
      adjusterNotes: ['Initial contractor estimate verified against weather report.'],
      createdAt: '2026-08-05T14:20:00.000Z',
      updatedAt: '2026-08-07T09:00:00.000Z',
    },
  ];

  return { users, policies, claims };
}

export function createDemoInsuranceRouter(): Router {
  const router = Router();
  let state = createInitialSeed();
  const sessions = new Map<string, { email: string; name: string; role: DemoRole }>();

  function getSession(req: { headers: Record<string, string | string[] | undefined> }) {
    const auth = req.headers['x-demo-token'];
    const token = Array.isArray(auth) ? auth[0] : auth;
    if (!token) return null;
    return sessions.get(token) || null;
  }

  router.post('/reset', (_req, res) => {
    state = createInitialSeed();
    res.json({ ok: true, message: 'Demo insurance state reset to deterministic seed.' });
  });

  router.post('/login', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = state.users.find((u) => u.email.toLowerCase() === email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status === 'LOCKED') {
      return res.status(423).json({
        error: 'Account is locked for security verification. Contact Veridian Support.',
      });
    }

    if (user.passwordHash !== hashDemoPass(password)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const sessionUser = { email: user.email, name: user.name, role: user.role };
    sessions.set(token, sessionUser);

    return res.json({
      token,
      user: sessionUser,
    });
  });

  router.post('/logout', (req, res) => {
    const auth = req.headers['x-demo-token'];
    const token = Array.isArray(auth) ? auth[0] : auth;
    if (token) sessions.delete(token);
    res.json({ ok: true });
  });

  router.get('/policies', (req, res) => {
    const user = getSession(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    const policies =
      user.role === 'CUSTOMER'
        ? state.policies.filter((p) => p.holderEmail === user.email)
        : state.policies;
    res.json({ policies });
  });

  router.get('/claims', (req, res) => {
    const user = getSession(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    const claims =
      user.role === 'CUSTOMER'
        ? state.claims.filter((c) => c.customerEmail === user.email)
        : state.claims;
    res.json({ claims });
  });

  router.post('/claims', (req, res) => {
    const user = getSession(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    const policyNumber = String(req.body?.policyNumber || '').trim();
    const incidentDate = String(req.body?.incidentDate || '').trim();
    const lossType = String(req.body?.lossType || '').trim();
    const description = String(req.body?.description || '').trim();
    const estimatedAmountUsd = Number(req.body?.estimatedAmountUsd);
    const documentName = String(req.body?.documentName || '').trim();
    const documentSizeBytes = Number(req.body?.documentSizeBytes ?? 102400);

    if (!policyNumber || !incidentDate || !lossType || !description) {
      return res.status(400).json({ error: 'All mandatory FNOL fields must be completed.' });
    }

    if (!/^POL-\d{4}-\d{4}$/.test(policyNumber)) {
      return res.status(400).json({ error: 'Invalid policy number format. Expected POL-YYYY-XXXX.' });
    }

    const policy = state.policies.find((p) => p.policyNumber === policyNumber);
    if (!policy) {
      return res.status(404).json({ error: `Policy ${policyNumber} was not found.` });
    }
    if (policy.status !== 'ACTIVE') {
      return res.status(400).json({ error: `Policy ${policyNumber} is ${policy.status} and cannot accept new FNOL claims.` });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(incidentDate)) {
      return res.status(400).json({ error: 'Incident date must use YYYY-MM-DD format.' });
    }
    const todayIso = new Date().toISOString().slice(0, 10);
    if (incidentDate > todayIso) {
      return res.status(400).json({ error: 'Incident date cannot be in the future.' });
    }

    if (!Number.isFinite(estimatedAmountUsd) || estimatedAmountUsd <= 0) {
      return res.status(400).json({ error: 'Estimated loss amount must be greater than zero.' });
    }

    if (documentName) {
      const lowerDoc = documentName.toLowerCase();
      const validExt =
        lowerDoc.endsWith('.pdf') ||
        lowerDoc.endsWith('.png') ||
        lowerDoc.endsWith('.jpg') ||
        lowerDoc.endsWith('.jpeg');
      if (!validExt) {
        return res.status(400).json({
          error: 'Unsupported document extension. Allowed formats: .pdf, .png, .jpg, .jpeg.',
        });
      }
      if (documentSizeBytes > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'Document exceeds 5 MB upload limit.' });
      }
    }

    const duplicate = state.claims.find(
      (c) =>
        c.policyNumber === policyNumber &&
        c.incidentDate === incidentDate &&
        c.lossType.toLowerCase() === lossType.toLowerCase()
    );
    if (duplicate) {
      return res.status(409).json({
        error: `Duplicate claim detected: ${duplicate.claimId} already exists for ${policyNumber} on ${incidentDate}.`,
      });
    }

    const now = new Date().toISOString();
    const newClaim: DemoClaim = {
      claimId: `CLM-2026-${String(state.claims.length + 1).padStart(3, '0')}`,
      policyNumber,
      customerEmail: user.role === 'CUSTOMER' ? user.email : policy.holderEmail,
      incidentDate,
      lossType,
      description,
      estimatedAmountUsd,
      documentName: documentName || 'fnol-summary.pdf',
      documentSizeBytes: Number.isFinite(documentSizeBytes) ? documentSizeBytes : 102400,
      status: 'SUBMITTED',
      adjusterNotes: [],
      createdAt: now,
      updatedAt: now,
    };

    state.claims.unshift(newClaim);
    return res.status(201).json({ claim: newClaim, message: `Claim ${newClaim.claimId} submitted.` });
  });

  router.post('/claims/:claimId/review', (req, res) => {
    const user = getSession(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    if (user.role !== 'ADJUSTER' && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Only Adjusters or Admins can review claims.' });
    }

    const claim = state.claims.find((c) => c.claimId === req.params.claimId);
    if (!claim) return res.status(404).json({ error: 'Claim not found.' });

    const decision = String(req.body?.decision || '').toUpperCase() as ClaimStatus;
    const note = String(req.body?.note || '').trim();

    if (!['APPROVED', 'REJECTED', 'UNDER_REVIEW'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid review decision.' });
    }

    if (decision === 'REJECTED' && !note) {
      return res.status(400).json({ error: 'A review note explaining the rejection reason is required.' });
    }

    claim.status = decision;
    if (note) {
      claim.adjusterNotes.push(`[${user.name}] ${note}`);
    }
    claim.updatedAt = new Date().toISOString();

    return res.json({ claim, message: `Claim ${claim.claimId} marked as ${decision}.` });
  });

  router.get('/admin/users', (req, res) => {
    const user = getSession(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    if (user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Admin role required.' });
    }

    res.json({
      users: state.users.map(({ passwordHash: _ph, ...safe }) => safe),
    });
  });

  router.patch('/admin/claims/:claimId/status', (req, res) => {
    const user = getSession(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    if (user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Admin role required to override claim status.' });
    }

    const claim = state.claims.find((c) => c.claimId === req.params.claimId);
    if (!claim) return res.status(404).json({ error: 'Claim not found.' });

    const nextStatus = String(req.body?.status || '').toUpperCase() as ClaimStatus;
    if (!['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Invalid claim status.' });
    }

    claim.status = nextStatus;
    claim.updatedAt = new Date().toISOString();
    return res.json({ claim, message: `Claim ${claim.claimId} status updated to ${nextStatus}.` });
  });

  return router;
}
