import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// API route-lar server tərəfində işlədiyi üçün bu client həm server, həm
// də (lazım olsa) client komponentlərində istifadə edilə bilər.
// DİQQƏT: yalnız anon (public) key işlədin — service_role key heç vaxt
// Next.js tərəfinə (frontend-ə) verilməməlidir, o yalnız worker-dədir.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
