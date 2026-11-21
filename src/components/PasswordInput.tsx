'use client';

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string | null;
  autoComplete?: string;
}

export function PasswordInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  placeholder = '••••••••',
  disabled = false,
  required = false,
  error,
  autoComplete,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required={required}
          disabled={disabled}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 disabled:bg-slate-100 ${
            error
              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20'
              : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/20'
          }`}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? 'Sembunyikan password' : 'Tampilkan password'}
          title={visible ? 'Sembunyikan password' : 'Tampilkan password'}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-800 disabled:opacity-50"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
      {error && (
        <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>
      )}
    </div>
  );
}
