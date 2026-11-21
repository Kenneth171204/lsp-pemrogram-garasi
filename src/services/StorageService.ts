import { SupabaseClient } from '@supabase/supabase-js';
import {
  MAX_IMAGE_FILE_SIZE_BYTES,
  translateError,
  validateImageFile,
} from '@/lib/errors';
import { supabase as defaultSupabase } from '@/lib/supabase';

export class StorageService {
  public static readonly BUCKET_NAME = 'payment-proofs';
  public static readonly MAX_FILE_SIZE_BYTES = MAX_IMAGE_FILE_SIZE_BYTES;

  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient = defaultSupabase) {
    this.db = db;
  }

  public async uploadPaymentProof(
    file: File,
    folder: 'rentals' | 'extensions'
  ): Promise<string> {
    const fileError = validateImageFile(file, StorageService.MAX_FILE_SIZE_BYTES);
    if (fileError) {
      throw new Error(fileError);
    }

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniquePath = `${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${sanitizedName}`;

    try {
      const { error: uploadError } = await this.db.storage
        .from(StorageService.BUCKET_NAME)
        .upload(uniquePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(
          translateError(
            uploadError,
            'Gagal mengunggah bukti pembayaran ke penyimpanan.'
          )
        );
      }

      const { data } = this.db.storage
        .from(StorageService.BUCKET_NAME)
        .getPublicUrl(uniquePath);

      if (!data?.publicUrl) {
        throw new Error('Gagal mendapatkan URL publik bukti pembayaran.');
      }

      return data.publicUrl;
    } catch (err) {
      throw new Error(
        translateError(err, 'Gagal mengunggah bukti pembayaran ke penyimpanan.')
      );
    }
  }
}
