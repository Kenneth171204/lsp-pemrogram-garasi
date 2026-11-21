/**
 * @fileoverview Inisialisasi client Supabase untuk operasi database PostgreSQL dan Storage.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

/**
 * Instance default Supabase Client yang digunakan oleh Service Classes.
 */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
