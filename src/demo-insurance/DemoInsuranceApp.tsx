import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Lock,
  LogOut,
  RotateCcw,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';

interface DemoUser {
  email: string;
  name: string;
  role: 'CUSTOMER' | 'ADJUSTER' | 'ADMIN';
}

interface DemoPolicy {
  policyNumber: string;
  productType: string;
  insuredAsset: string;
  coverageLimitUsd: number;
  deductibleUsd: number;
  effectiveFrom: string;
  effectiveTo: string;
  status: 'ACTIVE' | 'EXPIRED';
}

interface DemoClaim {
  claimId: string;
  policyNumber: string;
  customerEmail: string;
  incidentDate: string;
  lossType: string;
  description: string;
  estimatedAmountUsd: number;
  documentName: string;
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  adjusterNotes: string[];
}

export default function DemoInsuranceApp() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<DemoUser | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [policies, setPolicies] = useState<DemoPolicy[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<DemoPolicy | null>(null);
  const [claims, setClaims] = useState<DemoClaim[]>([]);
  const [adminUsers, setAdminUsers] = useState<
    Array<{ id: string; email: string; name: string; role: string; status: string }>
  >([]);

  // FNOL Form State
  const [policyNumber, setPolicyNumber] = useState('POL-2026-1001');
  const [incidentDate, setIncidentDate] = useState('2026-10-15');
  const [lossType, setLossType] = useState('Water Damage');
  const [estimatedAmount, setEstimatedAmount] = useState('4500');
  const [description, setDescription] = useState('');
  const [documentName, setDocumentName] = useState('damage-estimate.pdf');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Adjuster note state
  const [reviewNote, setReviewNote] = useState('');

  async function fetchPortalData(authToken: string, role: DemoUser['role']) {
    const headers = { 'x-demo-token': authToken };
    const [polRes, clmRes] = await Promise.all([
      fetch('/api/demo-insurance/policies', { headers }),
      fetch('/api/demo-insurance/claims', { headers }),
    ]);
    const polData = await polRes.json();
    const clmData = await clmRes.json();
    setPolicies(polData.policies || []);
    setSelectedPolicy((polData.policies || [])[0] || null);
    setClaims(clmData.claims || []);

    if (role === 'ADMIN') {
      const usrRes = await fetch('/api/demo-insurance/admin/users', { headers });
      const usrData = await usrRes.json();
      setAdminUsers(usrData.users || []);
    }
  }

  useEffect(() => {
    document.title = 'Veridian P&C Insurance Portal — Demo Target Application';
  }, []);

  async function performLogin(targetEmail: string, targetPass: string) {
    setAuthError(null);
    setFeedback(null);
    setLoading(true);
    try {
      const res = await fetch('/api/demo-insurance/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, password: targetPass }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed.');
        return;
      }
      setToken(data.token);
      setUser(data.user);
      await fetchPortalData(data.token, data.user.role);
    } catch {
      setAuthError('Unable to reach Veridian Insurance API.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    await performLogin(email, password);
  }

  async function handleLogout() {
    if (token) {
      await fetch('/api/demo-insurance/logout', {
        method: 'POST',
        headers: { 'x-demo-token': token },
      }).catch(() => {});
    }
    setToken(null);
    setUser(null);
    setPolicies([]);
    setClaims([]);
    setAdminUsers([]);
    setFeedback(null);
  }

  async function handleSubmitFnol(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !user) return;
    setFeedback(null);
    try {
      const res = await fetch('/api/demo-insurance/claims', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-token': token,
        },
        body: JSON.stringify({
          policyNumber,
          incidentDate,
          lossType,
          description: description || 'Reported incident through Veridian self-service portal.',
          estimatedAmountUsd: Number(estimatedAmount),
          documentName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.error || 'Claim validation failed.' });
        return;
      }
      setFeedback({ type: 'success', text: data.message || 'Claim submitted successfully.' });
      setDescription('');
      await fetchPortalData(token, user.role);
    } catch {
      setFeedback({ type: 'error', text: 'Network error submitting claim.' });
    }
  }

  async function handleAdjusterReview(claimId: string, decision: 'APPROVED' | 'REJECTED') {
    if (!token || !user) return;
    setFeedback(null);
    const res = await fetch(`/api/demo-insurance/claims/${claimId}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-token': token,
      },
      body: JSON.stringify({ decision, note: reviewNote }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback({ type: 'error', text: data.error || 'Review update failed.' });
      return;
    }
    setFeedback({ type: 'success', text: data.message });
    setReviewNote('');
    await fetchPortalData(token, user.role);
  }

  async function handleAdminStatusOverride(claimId: string, nextStatus: string) {
    if (!token || !user) return;
    setFeedback(null);
    const res = await fetch(`/api/demo-insurance/admin/claims/${claimId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-token': token,
      },
      body: JSON.stringify({ status: nextStatus }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback({ type: 'error', text: data.error || 'Status update failed.' });
      return;
    }
    setFeedback({ type: 'success', text: data.message });
    await fetchPortalData(token, user.role);
  }

  async function handleResetSeed() {
    await fetch('/api/demo-insurance/reset', { method: 'POST' });
    setFeedback({ type: 'success', text: 'Deterministic insurance seed data restored.' });
    if (token && user) {
      await fetchPortalData(token, user.role);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-lg font-semibold tracking-tight whitespace-nowrap">
              Veridian P&amp;C Insurance
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
              · Target Demo Application
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleResetSeed}
              data-testid="demo-reset-seed"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Seed Data
            </button>
            <a
              href="/"
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 whitespace-nowrap shrink-0"
            >
              Back to AI Test Architect
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {!user ? (
          <div className="max-w-md mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h1 className="text-xl font-semibold mb-1">Policyholder &amp; Staff Sign In</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              Isolated Property &amp; Casualty Insurance sandbox for Playwright exploration and end-to-end test validation.
            </p>

            {authError && (
              <div
                data-testid="demo-auth-error"
                role="alert"
                className="mb-4 p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label htmlFor="demo-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Email Address
                </label>
                <input
                  id="demo-email"
                  type="email"
                  data-testid="demo-login-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="customer@veridian.test"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label htmlFor="demo-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Password
                </label>
                <input
                  id="demo-password"
                  type="password"
                  data-testid="demo-login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                data-testid="demo-login-submit"
                className="w-full py-2.5 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">
                Quick Demo Accounts (Synthetic Local Data Only)
              </p>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  data-testid="demo-quick-customer"
                  onClick={() => {
                    setEmail('customer@veridian.test');
                    setPassword('CustomerPass!2026');
                    performLogin('customer@veridian.test', 'CustomerPass!2026');
                  }}
                  className="text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs flex items-center justify-between"
                >
                  <span className="font-medium">Customer: customer@veridian.test</span>
                  <span className="text-slate-500">Customer Portal</span>
                </button>
                <button
                  type="button"
                  data-testid="demo-quick-adjuster"
                  onClick={() => {
                    setEmail('adjuster@veridian.test');
                    setPassword('AdjusterPass!2026');
                    performLogin('adjuster@veridian.test', 'AdjusterPass!2026');
                  }}
                  className="text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs flex items-center justify-between"
                >
                  <span className="font-medium">Adjuster: adjuster@veridian.test</span>
                  <span className="text-slate-500">Adjuster Queue</span>
                </button>
                <button
                  type="button"
                  data-testid="demo-quick-admin"
                  onClick={() => {
                    setEmail('admin@veridian.test');
                    setPassword('AdminPass!2026');
                    performLogin('admin@veridian.test', 'AdminPass!2026');
                  }}
                  className="text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs flex items-center justify-between"
                >
                  <span className="font-medium">Admin: admin@veridian.test</span>
                  <span className="text-slate-500">Admin Console</span>
                </button>
                <button
                  type="button"
                  data-testid="demo-quick-locked"
                  onClick={() => {
                    setEmail('locked@veridian.test');
                    setPassword('LockedPass!2026');
                  }}
                  className="text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs flex items-center justify-between"
                >
                  <span className="font-medium flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-amber-600" />
                    Locked User: locked@veridian.test
                  </span>
                  <span className="text-amber-600">Lockout Test</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h1 data-testid="demo-portal-heading" className="text-2xl font-semibold">
                  {user.role === 'CUSTOMER'
                    ? 'Customer Policy & Claims Portal'
                    : user.role === 'ADJUSTER'
                      ? 'Adjuster Claim Review Queue'
                      : 'Admin Governance Console'}
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Signed in as {user.name} · {user.email} · Role: {user.role}
                </p>
              </div>
              <button
                type="button"
                data-testid="demo-signout-btn"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>

            {feedback && (
              <div
                data-testid="fnol-feedback"
                role="status"
                className={`p-3.5 rounded-lg border text-sm flex items-center gap-2 ${
                  feedback.type === 'success'
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                    : 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{feedback.text}</span>
              </div>
            )}

            {user.role === 'CUSTOMER' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 space-y-6">
                  <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                    <h2 className="text-base font-semibold mb-3">Active &amp; Historical Policies</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="py-2 pr-4">Policy #</th>
                            <th className="py-2 pr-4">Product</th>
                            <th className="py-2 pr-4 text-right">Limit</th>
                            <th className="py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {policies.map((p) => (
                            <tr
                              key={p.policyNumber}
                              onClick={() => setSelectedPolicy(p)}
                              className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                            >
                              <td className="py-2.5 pr-4 font-mono text-xs">{p.policyNumber}</td>
                              <td className="py-2.5 pr-4">{p.productType}</td>
                              <td className="py-2.5 pr-4 text-right tabular-nums">
                                ${p.coverageLimitUsd.toLocaleString()}
                              </td>
                              <td className="py-2.5 text-xs font-medium">
                                <span
                                  className={
                                    p.status === 'ACTIVE'
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-slate-500'
                                  }
                                >
                                  {p.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {selectedPolicy && (
                      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          Policy Details: {selectedPolicy.policyNumber} — {selectedPolicy.insuredAsset}
                        </div>
                        <div className="tabular-nums">
                          Deductible: ${selectedPolicy.deductibleUsd.toLocaleString()} · Term:{' '}
                          {selectedPolicy.effectiveFrom} to {selectedPolicy.effectiveTo}
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                    <h2 className="text-base font-semibold mb-3">Submitted Claims</h2>
                    <div className="overflow-x-auto">
                      <table data-testid="demo-claims-table" className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="py-2 pr-3">Claim ID</th>
                            <th className="py-2 pr-3">Policy</th>
                            <th className="py-2 pr-3">Loss Type</th>
                            <th className="py-2 pr-3 text-right">Estimate</th>
                            <th className="py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {claims.map((c) => (
                            <tr key={c.claimId}>
                              <td className="py-2.5 pr-3 font-mono text-xs">{c.claimId}</td>
                              <td className="py-2.5 pr-3 font-mono text-xs">{c.policyNumber}</td>
                              <td className="py-2.5 pr-3">{c.lossType}</td>
                              <td className="py-2.5 pr-3 text-right tabular-nums">
                                ${c.estimatedAmountUsd.toLocaleString()}
                              </td>
                              <td className="py-2.5 text-xs font-medium">{c.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>

                <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <h2 className="text-base font-semibold mb-1">First Notice of Loss (FNOL)</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Submit a new property or auto claim with supporting evidence metadata.
                  </p>
                  <form onSubmit={handleSubmitFnol} className="space-y-3.5">
                    <div>
                      <label htmlFor="fnol-policy" className="block text-xs font-medium mb-1">
                        Policy Number
                      </label>
                      <select
                        id="fnol-policy"
                        data-testid="fnol-policy-select"
                        value={policyNumber}
                        onChange={(e) => setPolicyNumber(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      >
                        {policies.map((p) => (
                          <option key={p.policyNumber} value={p.policyNumber}>
                            {p.policyNumber} ({p.productType} - {p.status})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="fnol-date" className="block text-xs font-medium mb-1">
                        Incident Date
                      </label>
                      <input
                        id="fnol-date"
                        type="date"
                        data-testid="fnol-incident-date"
                        value={incidentDate}
                        onChange={(e) => setIncidentDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="fnol-type" className="block text-xs font-medium mb-1">
                          Loss Type
                        </label>
                        <select
                          id="fnol-type"
                          data-testid="fnol-loss-type"
                          value={lossType}
                          onChange={(e) => setLossType(e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        >
                          <option value="Water Damage">Water Damage</option>
                          <option value="Collision">Collision</option>
                          <option value="Wind & Hail">Wind &amp; Hail</option>
                          <option value="Theft">Theft</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="fnol-amount" className="block text-xs font-medium mb-1">
                          Estimated Loss (USD)
                        </label>
                        <input
                          id="fnol-amount"
                          type="number"
                          data-testid="fnol-estimated-amount"
                          value={estimatedAmount}
                          onChange={(e) => setEstimatedAmount(e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="fnol-desc" className="block text-xs font-medium mb-1">
                        Incident Description
                      </label>
                      <textarea
                        id="fnol-desc"
                        rows={3}
                        data-testid="fnol-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Describe what happened and impacted property..."
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="fnol-doc" className="block text-xs font-medium mb-1">
                        Supporting Document (.pdf, .png, .jpg)
                      </label>
                      <input
                        id="fnol-doc"
                        type="text"
                        data-testid="fnol-document-name"
                        value={documentName}
                        onChange={(e) => setDocumentName(e.target.value)}
                        placeholder="evidence.pdf"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                      />
                    </div>
                    <button
                      type="submit"
                      data-testid="fnol-submit-btn"
                      className="w-full py-2.5 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      Submit FNOL Claim
                    </button>
                  </form>
                </section>
              </div>
            )}

            {user.role === 'ADJUSTER' && (
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">Assigned Claims Queue</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Review submitted evidence and enter notes before approving or rejecting claims.
                    </p>
                  </div>
                </div>
                <div>
                  <label htmlFor="adj-note" className="block text-xs font-medium mb-1">
                    Adjuster Review Note (required for rejections)
                  </label>
                  <input
                    id="adj-note"
                    type="text"
                    data-testid="adjuster-review-note"
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="Enter inspection verification or rejection justification..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="overflow-x-auto">
                  <table data-testid="demo-claims-table" className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2 pr-4">Claim ID</th>
                        <th className="py-2 pr-4">Policy</th>
                        <th className="py-2 pr-4">Incident</th>
                        <th className="py-2 pr-4 text-right">Estimate</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2">Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {claims.map((c) => (
                        <tr key={c.claimId}>
                          <td className="py-3 pr-4 font-mono text-xs">{c.claimId}</td>
                          <td className="py-3 pr-4 font-mono text-xs">{c.policyNumber}</td>
                          <td className="py-3 pr-4">
                            <div>{c.lossType}</div>
                            <div className="text-xs text-slate-500">{c.description}</div>
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums">
                            ${c.estimatedAmountUsd.toLocaleString()}
                          </td>
                          <td className="py-3 pr-4 text-xs font-medium">{c.status}</td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                data-testid="adjuster-approve-btn"
                                onClick={() => handleAdjusterReview(c.claimId, 'APPROVED')}
                                className="px-2.5 py-1 text-xs font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                data-testid="adjuster-reject-btn"
                                onClick={() => handleAdjusterReview(c.claimId, 'REJECTED')}
                                className="px-2.5 py-1 text-xs font-medium rounded border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {user.role === 'ADMIN' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-blue-600" />
                    Portal User Directory
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-2 pr-3">Name</th>
                          <th className="py-2 pr-3">Role</th>
                          <th className="py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {adminUsers.map((u) => (
                          <tr key={u.id}>
                            <td className="py-2.5 pr-3">
                              <div className="font-medium text-xs">{u.name}</div>
                              <div className="text-xs text-slate-500 font-mono">{u.email}</div>
                            </td>
                            <td className="py-2.5 pr-3 text-xs">{u.role}</td>
                            <td className="py-2.5 text-xs font-medium">{u.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    Global Claims Status Governance
                  </h2>
                  <div className="overflow-x-auto">
                    <table data-testid="demo-claims-table" className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-2 pr-3">Claim ID</th>
                          <th className="py-2 pr-3">Policy</th>
                          <th className="py-2 pr-3">Customer</th>
                          <th className="py-2">Override Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {claims.map((c) => (
                          <tr key={c.claimId}>
                            <td className="py-2.5 pr-3 font-mono text-xs">{c.claimId}</td>
                            <td className="py-2.5 pr-3 font-mono text-xs">{c.policyNumber}</td>
                            <td className="py-2.5 pr-3 text-xs">{c.customerEmail}</td>
                            <td className="py-2.5">
                              <select
                                aria-label={`Status for ${c.claimId}`}
                                value={c.status}
                                onChange={(e) => handleAdminStatusOverride(c.claimId, e.target.value)}
                                className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                              >
                                <option value="SUBMITTED">SUBMITTED</option>
                                <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                                <option value="APPROVED">APPROVED</option>
                                <option value="REJECTED">REJECTED</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
