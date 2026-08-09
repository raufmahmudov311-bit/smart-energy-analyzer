import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseClient";

export const dynamic = "force-dynamic";

function monthRange(offsetMonths, cutoffDay) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offsetMonths, cutoffDay, 23, 59, 59);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

// GET /api/monthly-summary
// "Bu ay 100 AZN gəlib, keçən ay 80 AZN gəlib, fərq nədəndir?" sualına cavab üçün:
// cari ayın 1-dən bugünə qədər olan sərfiyyatını, keçən ayın eyni gün aralığı ilə müqayisə edir.
export async function GET() {
  try {
    const today = new Date();
    const cutoffDay = today.getDate();

    const current = monthRange(0, cutoffDay);
    const previous = monthRange(-1, cutoffDay);

    const [{ data: currentMeter }, { data: previousMeter }] = await Promise.all([
      supabase.from("meter_daily").select("kwh, cost_azn, day").gte("day", current.start).lte("day", current.end),
      supabase.from("meter_daily").select("kwh, cost_azn, day").gte("day", previous.start).lte("day", previous.end),
    ]);

    const sum = (rows, key) => (rows || []).reduce((s, r) => s + Number(r[key] || 0), 0);

    const currentKwh = sum(currentMeter, "kwh");
    const currentCost = sum(currentMeter, "cost_azn");
    const previousKwh = sum(previousMeter, "kwh");
    const previousCost = sum(previousMeter, "cost_azn");

    // cihaz üzrə eyni müqayisə
    const { data: devices } = await supabase.from("devices").select("id, name");
    let deviceBreakdown = [];

    if (devices && devices.length > 0) {
      deviceBreakdown = await Promise.all(
        devices.map(async (d) => {
          const [{ data: curRows }, { data: prevRows }] = await Promise.all([
            supabase
              .from("device_daily")
              .select("kwh")
              .eq("device_id", d.id)
              .gte("day", current.start)
              .lte("day", current.end),
            supabase
              .from("device_daily")
              .select("kwh")
              .eq("device_id", d.id)
              .gte("day", previous.start)
              .lte("day", previous.end),
          ]);
          const curKwh = sum(curRows, "kwh");
          const prevKwh = sum(prevRows, "kwh");
          return { name: d.name, currentKwh: curKwh, previousKwh: prevKwh, deltaKwh: curKwh - prevKwh };
        })
      );
      deviceBreakdown.sort((a, b) => b.deltaKwh - a.deltaKwh);
    }

    return NextResponse.json({
      cutoffDay,
      current: { kwh: currentKwh, costAzn: currentCost },
      previous: { kwh: previousKwh, costAzn: previousCost },
      deltaKwh: currentKwh - previousKwh,
      deltaCostAzn: currentCost - previousCost,
      deviceBreakdown,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
