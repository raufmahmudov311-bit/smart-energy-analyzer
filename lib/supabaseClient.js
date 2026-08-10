import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

// API route-lar server tərəfində işlədiyi üçün bu client həm server, həm
// də (lazım olsa) client komponentlərində istifadə edilə bilər.
// DİQQƏT: yalnız anon (public) key işlədin — service_role key heç vaxt
// Next.js tərəfinə (frontend-ə) verilməməlidir, o yalnız worker-dədir.
// Placeholder dəyərlər yalnız env dəyişənləri hələ qoyulmayanda build-in
// çökməməsi üçündür — real Supabase quraşdırılmayınca IoT rejimi işləməyəcək,
// bu normaldır, Simulyasiya rejimi hər halda işləyir.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

