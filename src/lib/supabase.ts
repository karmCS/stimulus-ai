import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl) {
  throw new Error("Missing VITE_SUPABASE_URL. Set it in your environment (.env.local).");
}

if (!supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_ANON_KEY. Set it in your environment (.env.local).");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

