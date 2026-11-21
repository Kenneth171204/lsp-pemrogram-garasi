import { SupabaseClient } from '@supabase/supabase-js';
import { translateError } from '@/lib/errors';
import { supabase as defaultSupabase } from '@/lib/supabase';
import { RegisterInput, User, UserStatus } from '@/types';

export class AuthService {
  private static readonly GENERAL_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  private static readonly GMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
  public static readonly MIN_PASSWORD_LENGTH = 6;

  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient = defaultSupabase) {
    this.db = db;
  }

  public isValidEmail(email: string): boolean {
    return AuthService.GENERAL_EMAIL_REGEX.test(email.trim());
  }

  public isValidGmail(email: string): boolean {
    return AuthService.GMAIL_REGEX.test(email.trim());
  }

  // Mengizinkan domain non-Gmail agar akun admin@garasi.com tetap bisa login
  public validateLoginInput(email: string, password: string): void {
    const cleanEmail = email?.trim() ?? '';
    const cleanPassword = password ?? '';

    if (!cleanEmail) {
      throw new Error('Email wajib diisi.');
    }
    if (!this.isValidEmail(cleanEmail)) {
      throw new Error(
        'Format email tidak valid (harus mengandung @ dan domain yang benar).'
      );
    }
    if (!cleanPassword || cleanPassword.length < AuthService.MIN_PASSWORD_LENGTH) {
      throw new Error('Password minimal harus 6 karakter.');
    }
  }

  public validateRegistrationInput(input: RegisterInput): void {
    const nik = input.nik?.trim() ?? '';
    const fullName = input.fullName?.trim() ?? '';
    const phone = input.phone?.trim() ?? '';
    const email = input.email?.trim() ?? '';
    const password = input.password ?? '';

    if (!nik || !/^\d{8,20}$/.test(nik)) {
      throw new Error('NIK (No. KTP) wajib diisi berupa angka 8-20 digit.');
    }
    if (!fullName || fullName.length < 2) {
      throw new Error('Nama lengkap wajib diisi minimal 2 karakter.');
    }
    if (!phone || !/^[0-9+\-\s]{8,20}$/.test(phone)) {
      throw new Error('Nomor telepon tidak valid (minimal 8 digit).');
    }
    if (!email || !this.isValidGmail(email)) {
      throw new Error('Email harus menggunakan format @gmail.com yang valid.');
    }
    if (!password || password.length < AuthService.MIN_PASSWORD_LENGTH) {
      throw new Error('Password minimal harus 6 karakter.');
    }
    if (
      input.confirmPassword !== undefined &&
      input.confirmPassword !== password
    ) {
      throw new Error('Konfirmasi password tidak cocok.');
    }
  }

  public canTenantRent(user: Pick<User, 'role' | 'status'>): boolean {
    return user.role === 'penyewa' && user.status === 'approved';
  }

  public ensureTenantApproved(user: Pick<User, 'role' | 'status'>): void {
    if (user.role !== 'penyewa') {
      throw new Error('Hanya akun dengan role penyewa yang dapat menyewa garasi.');
    }
    if (user.status === 'pending') {
      throw new Error(
        'Akun Anda berstatus pending dan belum diverifikasi Admin. Anda belum dapat menyewa garasi.'
      );
    }
    if (user.status === 'rejected') {
      throw new Error(
        'Akun Anda ditolak oleh Admin sehingga tidak dapat menyewa garasi.'
      );
    }
  }

  public async registerTenant(input: RegisterInput): Promise<User> {
    this.validateRegistrationInput(input);

    const payload = {
      nik: input.nik.trim(),
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
      email: input.email.trim().toLowerCase(),
      password: input.password,
      role: 'penyewa' as const,
      status: 'pending' as const,
    };

    try {
      const { data, error } = await this.db
        .from('users')
        .insert(payload)
        .select('id, nik, full_name, phone, email, role, status, created_at')
        .single();

      if (error) {
        throw new Error(translateError(error, 'Gagal mendaftarkan penyewa baru.'));
      }

      return data as User;
    } catch (err) {
      throw new Error(translateError(err, 'Gagal mendaftarkan penyewa baru.'));
    }
  }

  public async login(email: string, password: string): Promise<User> {
    this.validateLoginInput(email, password);
    const cleanEmail = email.trim().toLowerCase();

    try {
      const { data, error } = await this.db
        .from('users')
        .select('id, nik, full_name, phone, email, role, status, created_at')
        .eq('email', cleanEmail)
        .eq('password', password)
        .maybeSingle();

      if (error) {
        throw new Error(translateError(error, 'Terjadi kesalahan saat masuk ke sistem.'));
      }
      if (!data) {
        throw new Error('Email atau password salah.');
      }

      const user = data as User;
      if (user.status === 'rejected') {
        throw new Error(
          'Akun Anda telah ditolak oleh Admin. Silakan hubungi pengelola garasi.'
        );
      }

      return user;
    } catch (err) {
      throw new Error(translateError(err, 'Terjadi kesalahan saat masuk ke sistem.'));
    }
  }

  public async getUserById(userId: string): Promise<User | null> {
    try {
      const { data, error } = await this.db
        .from('users')
        .select('id, nik, full_name, phone, email, role, status, created_at')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        throw new Error(translateError(error, 'Gagal mengambil data pengguna.'));
      }

      return (data as User) ?? null;
    } catch (err) {
      throw new Error(translateError(err, 'Gagal mengambil data pengguna.'));
    }
  }

  public async getTenants(statusFilter?: UserStatus): Promise<User[]> {
    try {
      let query = this.db
        .from('users')
        .select('id, nik, full_name, phone, email, role, status, created_at')
        .eq('role', 'penyewa')
        .order('created_at', { ascending: false });

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(translateError(error, 'Gagal memuat daftar penyewa.'));
      }

      return (data ?? []) as User[];
    } catch (err) {
      throw new Error(translateError(err, 'Gagal memuat daftar penyewa.'));
    }
  }

  public async verifyTenant(
    userId: string,
    decision: Extract<UserStatus, 'approved' | 'rejected'>
  ): Promise<User> {
    if (!userId) {
      throw new Error('ID penyewa wajib disertakan.');
    }

    try {
      const { data, error } = await this.db
        .from('users')
        .update({ status: decision })
        .eq('id', userId)
        .eq('role', 'penyewa')
        .select('id, nik, full_name, phone, email, role, status, created_at')
        .single();

      if (error) {
        throw new Error(translateError(error, 'Gagal memverifikasi penyewa.'));
      }

      return data as User;
    } catch (err) {
      throw new Error(translateError(err, 'Gagal memverifikasi penyewa.'));
    }
  }
}
