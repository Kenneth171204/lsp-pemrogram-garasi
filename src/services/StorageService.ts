/**
 * @fileoverview Service Class untuk unggah bukti pembayaran ke Supabase Storage bucket `payment-proofs`.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from '@/lib/supabase';

/**
 * Mengelola unggah file gambar bukti pembayaran ke Supabase Storage
 * pada bucket publik `payment-proofs`.
 */
export class StorageService {
  public static readonly BUCKET_NAME = 'payment-proofs';
  public static readonly MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

  private readonly db: SupabaseClient;

  /**
   * Membuat instance baru dari StorageService.
   * @param db - Client Supabase opsional untuk dependency injection.
   */
  constructor(db: SupabaseClient = defaultSupabase) {
    this.db = db;
  }

  /**
   * Mengunggah file gambar bukti pembayaran ke bucket `payment-proofs` dan mengembalikan public URL.
   * @param file - File gambar bukti pelunasan atau perpanjangan sewa.
   * @param folder - Subfolder tujuan (`rentals` atau `extensions`).
   * @returns URL publik gambar yang tersimpan di Supabase Storage.
   * @throws {Error} Jika file kosong, format bukan gambar, ukuran melebihi 5MB, atau upload gagal.
   */
  public async uploadPaymentProof(
    file: File,
    folder: 'rentals' | 'extensions'
  ): Promise<string> {
    if (!file) {
      throw new Error('File gambar bukti pembayaran wajib dipilih.');
    }

    if (file.type && !file.type.startsWith('image/')) {
      throw new Error('Bukti pembayaran harus berupa file gambar (JPG, PNG, WEBP).');
    }

    if (file.size > StorageService.MAX_FILE_SIZE_BYTES) {
      throw new Error('Ukuran file bukti pembayaran maksimal 5 MB.');
    }

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniquePath = `${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${sanitizedName}`;

    const { error: uploadError } = await this.db.storage
      .from(StorageService.BUCKET_NAME)
      .upload(uniquePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(
        `Gagal mengunggah bukti pembayaran ke Storage: ${uploadError.message}`
      );
    }

    const { data } = this.db.storage
      .from(StorageService.BUCKET_NAME)
      .getPublicUrl(uniquePath);

    if (!data?.publicUrl) {
      throw new Error('Gagal mendapatkan public URL bukti pembayaran.');
    }

    return data.publicUrl;
  }
}
