/**
 * @fileoverview Service Class untuk manajemen autentikasi, registrasi, dan verifikasi penyewa.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from '@/lib/supabase';
import { RegisterInput, User, UserStatus } from '@/types';

/**
 * Mengelola seluruh logika bisnis autentikasi pengguna, registrasi penyewa baru,
 * verifikasi akun oleh Admin, serta pengecekan hak akses menyewa garasi.
 */
export class AuthService {
  private readonly db: SupabaseClient;

  /**
   * Membuat instance baru dari AuthService.
   * @param db - Client Supabase opsional untuk dependency injection (berguna untuk testing).
   */
  constructor(db: SupabaseClient = defaultSupabase) {
    this.db = db;
  }

  /**
   * Memvalidasi data input pendaftaran penyewa baru.
   * @param input - Data registrasi penyewa (NIK, nama lengkap, telepon, email, password).
   * @throws {Error} Jika terdapat field yang kosong atau tidak valid.
   */
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
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Format email tidak valid.');
    }
    if (!password || password.length < 6) {
      throw new Error('Password minimal 6 karakter.');
    }
  }

  /**
   * Memeriksa apakah akun pengguna diizinkan untuk melakukan transaksi sewa garasi.
   * Penyewa hanya dapat menyewa apabila status akunnya sudah `approved`.
   * @param user - Objek pengguna yang memiliki properti `role` dan `status`.
   * @returns `true` jika pengguna adalah penyewa berstatus `approved`, selain itu `false`.
   */
  public canTenantRent(user: Pick<User, 'role' | 'status'>): boolean {
    return user.role === 'penyewa' && user.status === 'approved';
  }

  /**
   * Memastikan penyewa telah diverifikasi (`approved`) sebelum melakukan sewa garasi.
   * @param user - Data pengguna yang akan menyewa.
   * @throws {Error} Jika pengguna bukan penyewa atau statusnya masih `pending` / `rejected`.
   */
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

  /**
   * Mendaftarkan penyewa baru ke database dengan status awal `pending`.
   * @param input - Data pendaftaran penyewa baru.
   * @returns Data pengguna yang berhasil dibuat.
   * @throws {Error} Jika validasi gagal, email/NIK sudah terdaftar, atau query database gagal.
   */
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

    const { data, error } = await this.db
      .from('users')
      .insert(payload)
      .select('id, nik, full_name, phone, email, role, status, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('Email atau NIK sudah terdaftar di sistem.');
      }
      throw new Error(`Gagal mendaftarkan penyewa: ${error.message}`);
    }

    return data as User;
  }

  /**
   * Melakukan autentikasi pengguna berdasarkan email dan password.
   * @param email - Email pengguna yang digunakan sebagai username.
   * @param password - Password pengguna.
   * @returns Data profil pengguna yang terautentikasi.
   * @throws {Error} Jika kredensial salah atau akun telah ditolak Admin (`rejected`).
   */
  public async login(email: string, password: string): Promise<User> {
    const cleanEmail = email?.trim().toLowerCase() ?? '';
    if (!cleanEmail || !password) {
      throw new Error('Email dan password wajib diisi.');
    }

    const { data, error } = await this.db
      .from('users')
      .select('id, nik, full_name, phone, email, role, status, created_at')
      .eq('email', cleanEmail)
      .eq('password', password)
      .maybeSingle();

    if (error) {
      throw new Error(`Terjadi kesalahan saat login: ${error.message}`);
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
  }

  /**
   * Mengambil data pengguna berdasarkan ID.
   * @param userId - UUID pengguna.
   * @returns Data pengguna terkini atau null jika tidak ditemukan.
   */
  public async getUserById(userId: string): Promise<User | null> {
    const { data, error } = await this.db
      .from('users')
      .select('id, nik, full_name, phone, email, role, status, created_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Gagal mengambil data pengguna: ${error.message}`);
    }

    return (data as User) ?? null;
  }

  /**
   * Mengambil daftar seluruh penyewa, opsional difilter berdasarkan status verifikasi.
   * @param statusFilter - Filter status (`pending`, `approved`, `rejected`).
   * @returns Daftar pengguna dengan role `penyewa`.
   */
  public async getTenants(statusFilter?: UserStatus): Promise<User[]> {
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
      throw new Error(`Gagal memuat daftar penyewa: ${error.message}`);
    }

    return (data ?? []) as User[];
  }

  /**
   * Memperbarui status verifikasi penyewa oleh Admin (`approved` atau `rejected`).
   * @param userId - UUID penyewa yang akan diverifikasi.
   * @param decision - Keputusan verifikasi (`approved` atau `rejected`).
   * @returns Data penyewa setelah status diperbarui.
   * @throws {Error} Jika update database gagal.
   */
  public async verifyTenant(
    userId: string,
    decision: Extract<UserStatus, 'approved' | 'rejected'>
  ): Promise<User> {
    if (!userId) {
      throw new Error('ID penyewa wajib disertakan.');
    }

    const { data, error } = await this.db
      .from('users')
      .update({ status: decision })
      .eq('id', userId)
      .eq('role', 'penyewa')
      .select('id, nik, full_name, phone, email, role, status, created_at')
      .single();

    if (error) {
      throw new Error(`Gagal memverifikasi penyewa: ${error.message}`);
    }

    return data as User;
  }
}
