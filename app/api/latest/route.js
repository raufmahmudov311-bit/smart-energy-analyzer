import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseClient";

export const dynamic = "force-dynamic"; // hər dəfə təzə data — cache-lənməsin

// GET /api/latest
// Qaytarır: ən son ana sayğac oxuması + hər cihazın ən son ani gücü,
// bugünkü kWh-ı, + gərginlik tarixçəsi (son 40 nöqtə, "Şəbəkə Nəbzi" qrafiki üçün)
export async function GET() {
  try {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const [{ data: latestMeter }, { data: meterHistory }, { data: devices }, { data: recentAlerts }] =
      await Promise.all([
        supabase
          .from("meter_readings")
          .select("voltage, current, power_kw, recorded_at")
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("meter_readings")
          .select("voltage, recorded_at")
          .order("recorded_at", { ascending: false })
          .limit(40),
        supabase.from("devices").select("id, name, device_key"),
        supabase
          .from("alerts")
          .select("type, message, recorded_at")
          .gte("recorded_at", fifteenMinAgo)
          .order("recorded_at", { ascending: false }),
      ]);

    const today = new Date().toISOString().slice(0, 10);

    let deviceStatus = [];
    if (devices && devices.length > 0) {
      deviceStatus = await Promise.all(
        devices.map(async (d) => {
          const [{ data: latestReading }, { data: dailyRow }] = await Promise.all([
            supabase
              .from("device_readings")
              .select("power_w, energy_kwh_total, recorded_at")
              .eq("device_id", d.id)
              .order("recorded_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from("device_daily")
              .select("kwh")
              .eq("device_id", d.id)
              .eq("day", today)
              .maybeSingle(),
          ]);

          return {
            id: d.id,
            name: d.name,
            deviceKey: d.device_key,
            powerW: latestReading?.power_w ?? null,
            lastSeen: latestReading?.recorded_at ?? null,
            todayKwh: dailyRow?.kwh ?? 0,
            online: latestReading
              ? Date.now() - new Date(latestReading.recorded_at).getTime() < 2 * 60 * 1000
              : false,
          };
        })
      );
    }

    return NextResponse.json({
      meter: latestMeter || null,
      voltageHistory: (meterHistory || []).slice().reverse(),
      devices: deviceStatus,
      recentAlerts: recentAlerts || [],
      isLive: !!latestMeter && Date.now() - new Date(latestMeter.recorded_at).getTime() < 2 * 60 * 1000,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
