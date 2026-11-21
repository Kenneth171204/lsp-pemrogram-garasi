'use client';

import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface AlertBannerProps {
  variant: 'error' | 'success' | 'warning';
  title?: string;
  message: string;
  onClose?: () => void;
  children?: React.ReactNode;
}

const VARIANT_STYLES: Record<
  AlertBannerProps['variant'],
  { wrapper: string; iconColor: string; closeBtn: string }
> = {
  error: {
    wrapper: 'border-rose-200 bg-rose-50 text-rose-800',
    iconColor: 'text-rose-600',
    closeBtn: 'text-rose-500 hover:bg-rose-100 hover:text-rose-700',
  },
  success: {
    wrapper: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    iconColor: 'text-emerald-600',
    closeBtn: 'text-emerald-500 hover:bg-emerald-100 hover:text-emerald-700',
  },
  warning: {
    wrapper: 'border-amber-300 bg-amber-50 text-amber-900',
    iconColor: 'text-amber-600',
    closeBtn: 'text-amber-600 hover:bg-amber-100 hover:text-amber-800',
  },
};

export function AlertBanner({
  variant,
  title,
  message,
  onClose,
  children,
}: AlertBannerProps) {
  const styles = VARIANT_STYLES[variant];
  const Icon =
    variant === 'success'
      ? CheckCircle2
      : variant === 'warning'
      ? AlertTriangle
      : AlertCircle;

  return (
    <div
      role="alert"
      className={`flex items-start justify-between gap-3 rounded-xl border p-3.5 text-sm ${styles.wrapper}`}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${styles.iconColor}`} />
        <div className="space-y-1">
          {title && <div className="font-bold">{title}</div>}
          <p>{message}</p>
          {children}
        </div>
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup notifikasi"
          className={`rounded-lg p-1 transition ${styles.closeBtn}`}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
