import { describe, expect, it } from 'vitest';
import { AuthService } from '@/services/AuthService';

describe('AuthService - Validasi Registrasi & Status Verifikasi Penyewa', () => {
  const authService = new AuthService();

  it('menerima data registrasi penyewa yang valid', () => {
    expect(() =>
      authService.validateRegistrationInput({
        nik: '3201012111950001',
        fullName: 'Budi Santoso',
        phone: '081234567890',
        email: 'budi@example.com',
        password: 'password123',
      })
    ).not.toThrow();
  });

  it('menolak registrasi jika NIK tidak valid atau password kurang dari 6 karakter', () => {
    expect(() =>
      authService.validateRegistrationInput({
        nik: '123',
        fullName: 'Budi Santoso',
        phone: '081234567890',
        email: 'budi@example.com',
        password: 'password123',
      })
    ).toThrow(/NIK/i);

    expect(() =>
      authService.validateRegistrationInput({
        nik: '3201012111950001',
        fullName: 'Budi Santoso',
        phone: '081234567890',
        email: 'budi@example.com',
        password: '123',
      })
    ).toThrow(/Password/i);
  });

  it('penyewa berstatus pending atau rejected dilarang menyewa garasi', () => {
    expect(
      authService.canTenantRent({ role: 'penyewa', status: 'pending' })
    ).toBe(false);
    expect(
      authService.canTenantRent({ role: 'penyewa', status: 'rejected' })
    ).toBe(false);
    expect(
      authService.canTenantRent({ role: 'admin', status: 'approved' })
    ).toBe(false);
    expect(
      authService.canTenantRent({ role: 'penyewa', status: 'approved' })
    ).toBe(true);

    expect(() =>
      authService.ensureTenantApproved({ role: 'penyewa', status: 'pending' })
    ).toThrow(/pending/i);
    expect(() =>
      authService.ensureTenantApproved({ role: 'penyewa', status: 'rejected' })
    ).toThrow(/ditolak/i);
    expect(() =>
      authService.ensureTenantApproved({ role: 'penyewa', status: 'approved' })
    ).not.toThrow();
  });
});
