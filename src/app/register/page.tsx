'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { AlertBanner } from '@/components/AlertBanner';
import { PasswordInput } from '@/components/PasswordInput';
import { translateError } from '@/lib/errors';
import { AuthService } from '@/services/AuthService';

const authService = new AuthService();

interface RegisterFields {
  nik: string;
  fullName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
}

type RegisterFieldErrors = Partial<Record<keyof RegisterFields, string>>;
type RegisterTouched = Partial<Record<keyof RegisterFields, boolean>>;

export default function RegisterPage() {
  const [fields, setFields] = useState<RegisterFields>({
    nik: '',
    fullName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [touched, setTouched] = useState<RegisterTouched>({});
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const validateSingleField = (
    name: keyof RegisterFields,
    values: RegisterFields
  ): string | undefined => {
    switch (name) {
      case 'nik': {
        const nik = values.nik.trim();
        if (!nik || !/^\d{8,20}$/.test(nik)) {
          return 'NIK (No. KTP) wajib diisi berupa angka 8-20 digit.';
        }
        return undefined;
      }
      case 'fullName': {
        const fullName = values.fullName.trim();
        if (!fullName || fullName.length < 2) {
          return 'Nama lengkap wajib diisi minimal 2 karakter.';
        }
        return undefined;
      }
      case 'phone': {
        const phone = values.phone.trim();
        if (!phone || !/^[0-9+\-\s]{8,20}$/.test(phone)) {
          return 'Nomor telepon tidak valid (minimal 8 digit).';
        }
        return undefined;
      }
      case 'email': {
        const email = values.email.trim();
        if (!email || !authService.isValidGmail(email)) {
          return 'Email harus menggunakan format @gmail.com yang valid.';
        }
        return undefined;
      }
      case 'password': {
        if (
          !values.password ||
          values.password.length < AuthService.MIN_PASSWORD_LENGTH
        ) {
          return 'Password minimal harus 6 karakter.';
        }
        return undefined;
      }
      case 'confirmPassword': {
        if (!values.confirmPassword) {
          return 'Konfirmasi password wajib diisi.';
        }
        if (values.confirmPassword !== values.password) {
          return 'Konfirmasi password tidak cocok.';
        }
        return undefined;
      }
      default:
        return undefined;
    }
  };

  const handleFieldChange = (name: keyof RegisterFields, value: string) => {
    const nextValues = { ...fields, [name]: value };
    setFields(nextValues);

    if (touched[name]) {
      setFieldErrors((prev) => ({
        ...prev,
        [name]: validateSingleField(name, nextValues),
        ...(name === 'password' && touched.confirmPassword
          ? { confirmPassword: validateSingleField('confirmPassword', nextValues) }
          : {}),
      }));
    } else if (name === 'password' && touched.confirmPassword) {
      setFieldErrors((prev) => ({
        ...prev,
        confirmPassword: validateSingleField('confirmPassword', nextValues),
      }));
    }
  };

  const handleFieldBlur = (name: keyof RegisterFields) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    setFieldErrors((prev) => ({
      ...prev,
      [name]: validateSingleField(name, fields),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const allKeys: (keyof RegisterFields)[] = [
      'nik',
      'fullName',
      'phone',
      'email',
      'password',
      'confirmPassword',
    ];
    const nextTouched: RegisterTouched = {};
    const nextErrors: RegisterFieldErrors = {};

    for (const key of allKeys) {
      nextTouched[key] = true;
      const errMsg = validateSingleField(key, fields);
      if (errMsg) nextErrors[key] = errMsg;
    }

    setTouched(nextTouched);
    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const created = await authService.registerTenant({
        nik: fields.nik,
        fullName: fields.fullName,
        phone: fields.phone,
        email: fields.email,
        password: fields.password,
        confirmPassword: fields.confirmPassword,
      });
      setSuccessMsg(
        `Pendaftaran atas nama ${created.full_name} berhasil! Status akun saat ini: ${created.status}. Silakan tunggu verifikasi Admin sebelum melakukan penyewaan garasi.`
      );
      setFields({
        nik: '',
        fullName: '',
        phone: '',
        email: '',
        password: '',
        confirmPassword: '',
      });
      setTouched({});
      setFieldErrors({});
    } catch (err) {
      setError(translateError(err, 'Gagal melakukan registrasi penyewa.'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = (hasError?: string) =>
    `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:bg-slate-100 ${
      hasError
        ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20'
        : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/20'
    }`;

  return (
    <div className="mx-auto max-w-lg py-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Registrasi Penyewa Baru
            </h1>
            <p className="text-xs text-slate-500">
              Status awal akun adalah pending hingga diverifikasi Admin
            </p>
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

        {successMsg && (
          <div className="mb-4">
            <AlertBanner
              variant="success"
              message={successMsg}
              onClose={() => setSuccessMsg(null)}
            >
              <Link
                href="/login"
                className="mt-1 inline-block font-semibold text-emerald-700 underline"
              >
                Lanjut ke Halaman Masuk
              </Link>
            </AlertBanner>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor="reg-nik"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              NIK (No. KTP)
            </label>
            <input
              id="reg-nik"
              type="text"
              required
              disabled={submitting}
              value={fields.nik}
              onChange={(e) => handleFieldChange('nik', e.target.value)}
              onBlur={() => handleFieldBlur('nik')}
              placeholder="Contoh: 3201012111950001"
              aria-invalid={Boolean(fieldErrors.nik)}
              className={inputClass(fieldErrors.nik)}
            />
            {fieldErrors.nik && (
              <p className="mt-1 text-xs font-medium text-rose-600">
                {fieldErrors.nik}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="reg-fullname"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Nama Lengkap
            </label>
            <input
              id="reg-fullname"
              type="text"
              required
              disabled={submitting}
              value={fields.fullName}
              onChange={(e) => handleFieldChange('fullName', e.target.value)}
              onBlur={() => handleFieldBlur('fullName')}
              placeholder="Contoh: Budi Santoso"
              aria-invalid={Boolean(fieldErrors.fullName)}
              className={inputClass(fieldErrors.fullName)}
            />
            {fieldErrors.fullName && (
              <p className="mt-1 text-xs font-medium text-rose-600">
                {fieldErrors.fullName}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="reg-phone"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Nomor Telepon
            </label>
            <input
              id="reg-phone"
              type="text"
              required
              disabled={submitting}
              value={fields.phone}
              onChange={(e) => handleFieldChange('phone', e.target.value)}
              onBlur={() => handleFieldBlur('phone')}
              placeholder="Contoh: 081234567890"
              aria-invalid={Boolean(fieldErrors.phone)}
              className={inputClass(fieldErrors.phone)}
            />
            {fieldErrors.phone && (
              <p className="mt-1 text-xs font-medium text-rose-600">
                {fieldErrors.phone}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="reg-email"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Email Gmail (Username)
            </label>
            <input
              id="reg-email"
              type="email"
              required
              disabled={submitting}
              autoComplete="email"
              value={fields.email}
              onChange={(e) => handleFieldChange('email', e.target.value)}
              onBlur={() => handleFieldBlur('email')}
              placeholder="contoh: budi@gmail.com"
              aria-invalid={Boolean(fieldErrors.email)}
              className={inputClass(fieldErrors.email)}
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs font-medium text-rose-600">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <PasswordInput
            id="reg-password"
            label="Password (minimal 6 karakter)"
            required
            disabled={submitting}
            autoComplete="new-password"
            value={fields.password}
            onChange={(val) => handleFieldChange('password', val)}
            onBlur={() => handleFieldBlur('password')}
            error={fieldErrors.password}
          />

          <PasswordInput
            id="reg-confirm-password"
            label="Confirm Password"
            required
            disabled={submitting}
            autoComplete="new-password"
            value={fields.confirmPassword}
            onChange={(val) => handleFieldChange('confirmPassword', val)}
            onBlur={() => handleFieldBlur('confirmPassword')}
            error={fieldErrors.confirmPassword}
          />

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Mendaftarkan...' : 'Daftar Sekarang'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
          Sudah memiliki akun?{' '}
          <Link href="/login" className="font-semibold text-blue-600 hover:underline">
            Masuk di sini
          </Link>
        </p>
      </div>
    </div>
  );
}
