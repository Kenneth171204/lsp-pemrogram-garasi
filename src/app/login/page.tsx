'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Info, LogIn } from 'lucide-react';
import { AlertBanner } from '@/components/AlertBanner';
import { PasswordInput } from '@/components/PasswordInput';
import { useAuth } from '@/context/AuthContext';
import { translateError } from '@/lib/errors';
import { AuthService } from '@/services/AuthService';

const authService = new AuthService();

interface LoginFieldErrors {
  email?: string;
  password?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { setSessionUser } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateField = (
    field: keyof LoginFieldErrors,
    nextEmail: string,
    nextPassword: string
  ): string | undefined => {
    if (field === 'email') {
      const trimmed = nextEmail.trim();
      if (!trimmed) return 'Email wajib diisi.';
      if (!authService.isValidEmail(trimmed)) {
        return 'Format email tidak valid (contoh: nama@domain.com).';
      }
      return undefined;
    }

    if (field === 'password') {
      if (!nextPassword || nextPassword.length < AuthService.MIN_PASSWORD_LENGTH) {
        return 'Password minimal harus 6 karakter.';
      }
      return undefined;
    }
    return undefined;
  };

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (touched.email) {
      setFieldErrors((prev) => ({
        ...prev,
        email: validateField('email', val, password),
      }));
    }
  };

  const handlePasswordChange = (val: string) => {
    setPassword(val);
    if (touched.password) {
      setFieldErrors((prev) => ({
        ...prev,
        password: validateField('password', email, val),
      }));
    }
  };

  const handleBlur = (field: keyof LoginFieldErrors) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setFieldErrors((prev) => ({
      ...prev,
      [field]: validateField(field, email, password),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const nextErrors: LoginFieldErrors = {
      email: validateField('email', email, password),
      password: validateField('password', email, password),
    };
    setTouched({ email: true, password: true });
    setFieldErrors(nextErrors);

    if (nextErrors.email || nextErrors.password) {
      return;
    }

    setSubmitting(true);
    try {
      const user = await authService.login(email, password);
      setSessionUser(user);
      router.push(user.role === 'admin' ? '/admin' : '/penyewa');
    } catch (err) {
      setError(translateError(err, 'Gagal masuk ke sistem.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
            <LogIn className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Masuk Sistem</h1>
            <p className="text-xs text-slate-500">
              Gunakan email &amp; password akun Admin atau Penyewa
            </p>
          </div>
        </div>

        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div>
            <div className="font-semibold">Akun Admin Default (Seeder):</div>
            <div>
              Email: <code>admin@garasi.com</code> • Password: <code>admin123</code>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4">
            <AlertBanner
              variant="error"
              message={error}
              onClose={() => setError(null)}
            />
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Email (Username)
            </label>
            <input
              id="login-email"
              type="email"
              required
              disabled={submitting}
              autoComplete="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              onBlur={() => handleBlur('email')}
              placeholder="nama@domain.com"
              aria-invalid={Boolean(fieldErrors.email)}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:bg-slate-100 ${
                fieldErrors.email
                  ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20'
                  : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/20'
              }`}
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs font-medium text-rose-600">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <PasswordInput
            id="login-password"
            label="Password"
            required
            disabled={submitting}
            autoComplete="current-password"
            value={password}
            onChange={handlePasswordChange}
            onBlur={() => handleBlur('password')}
            error={fieldErrors.password}
          />

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Memproses...' : 'Masuk'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
          Belum memiliki akun penyewa?{' '}
          <Link href="/register" className="font-semibold text-blue-600 hover:underline">
            Daftar di sini
          </Link>
        </p>
      </div>
    </div>
  );
}
