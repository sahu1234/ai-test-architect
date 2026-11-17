import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MinusCircle,
  XCircle,
} from 'lucide-react';

export function StatusText({ status }: { status: string }) {
  const upper = (status || 'UNKNOWN').toUpperCase();

  if (['PASSED', 'APPROVED', 'COMPLETED', 'COVERED', 'AUTOMATED'].includes(upper)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>{upper}</span>
      </span>
    );
  }

  if (['FAILED', 'REJECTED', 'ERROR', 'TIMEDOUT', 'UNCOVERED'].includes(upper)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400 whitespace-nowrap">
        <XCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{upper}</span>
      </span>
    );
  }

  if (['PENDING_REVIEW', 'RUNNING', 'ANALYZED', 'DRAFT'].includes(upper)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>{upper.replace('_', ' ')}</span>
      </span>
    );
  }

  if (['SKIPPED', 'NOT_EXECUTED', 'NONE', 'NO_RUNS'].includes(upper)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
        <MinusCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{upper.replace('_', ' ')}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <span>{upper}</span>
    </span>
  );
}
