import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseClient";

export const dynamic = "force-dynamic";

// GET /api/devices — bütün qeydiyyatdan keçmiş cihazların siyahısı
export async function GET() {
  const { data, error } = await supabase
    .from("devices")
    .select("id, name, device_key, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ devices: data });
}
