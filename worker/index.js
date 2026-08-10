// Smart Grid AI — Worker
// ------------------------------------------------------------------
// Bu proses evdə (Raspberry Pi) və ya ucuz bir VPS-də DAİM işləməlidir.
// Vəzifəsi:
//   1) MQTT broker-dən ana sayğac + ağıllı priz məlumatlarını dinləmək
//   2) Supabase-ə yazmaq
//   3) Gərginlik həddi aşanda / gecə anomaliyasında Telegram-a bildiriş göndərmək
//   4) Hər gün üçün cihaz və ev üzrə toplam kWh/AZN-i hesablayıb saxlamaq
//
// İşə salmaq:  npm install && cp .env.example .env (doldurun) && npm start
// Daimi işləmə üçün: pm2 start index.js --name smart-grid-worker

import "dotenv/config";
import mqtt from "mqtt";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------- config

const {
  MQTT_HOST,
  MQTT_PORT = "8883",
  MQTT_USER,
  MQTT_PASS,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  VOLTAGE_LOW = "195",
  VOLTAGE_HIGH = "245",
  ANOMALY_NIGHT_THRESHOLD_KW = "0.3",
  TARIFF_LOW = "0.08",
  TARIFF_HIGH = "0.10",
  TARIFF_THRESHOLD = "300",
} = process.env;

const voltageLow = parseFloat(VOLTAGE_LOW);
const voltageHigh = parseFloat(VOLTAGE_HIGH);
const anomalyThresholdKw = parseFloat(ANOMALY_NIGHT_THRESHOLD_KW);
const tariffLow = parseFloat(TARIFF_LOW);
const tariffHigh = parseFloat(TARIFF_HIGH);
const tariffThreshold = parseFloat(TARIFF_THRESHOLD);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY .env-də tapılmadı.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------- telegram

async function sendTelegramAlert(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Telegram konfiqurasiya olunmayıb, bildiriş göndərilmədi:", text);
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
  } catch (err) {
    console.error("Telegram bildirişi göndərilə bilmədi:", err.message);
  }
}

// hər bildiriş növü üçün 5 dəqiqəlik "sakitlik" — spam olmasın deyə
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;
const lastAlertAt = {};
function shouldAlert(type) {
  const now = Date.now();
  if (!lastAlertAt[type] || now - lastAlertAt[type] > ALERT_COOLDOWN_MS) {
    lastAlertAt[type] = now;
    return true;
  }
  return false;
}

async function logAlert(type, message) {
  await supabase.from("alerts").insert({ type, message });
}

// ---------------------------------------------------------------- state

// gündəlik ev sərfiyyatını ardıcıl (incremental) toplamaq üçün
let lastMeterTime = null;
let todayKey = new Date().toISOString().slice(0, 10);

function tariffRateForCumulativeKwh(cumulativeKwhBeforeThisSlice) {
  return cumulativeKwhBeforeThisSlice >= tariffThreshold ? tariffHigh : tariffLow;
}

async function getMonthToDateKwh() {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  const day = startOfMonth.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("meter_daily")
    .select("kwh")
    .gte("day", day);
  if (error) {
    console.error("getMonthToDateKwh xəta:", error.message);
    return 0;
  }
  return (data || []).reduce((s, r) => s + Number(r.kwh), 0);
}

// ---------------------------------------------------------------- mqtt handlers

async function handleMeterMessage(payload) {
  const { voltage, current, power_kw } = payload;
  if (typeof voltage !== "number" || typeof power_kw !== "number") return;

  await supabase.from("meter_readings").insert({
    voltage,
    current,
    power_kw,
  });

  // ---- gərginlik həddi bildirişləri ----
  if (voltage < voltageLow && shouldAlert("voltage_low")) {
    const msg = `⚠️ Aşağı Gərginlik Qəzası: ${voltage.toFixed(0)}V (normal: ${voltageLow}-${voltageHigh}V)`;
    await sendTelegramAlert(msg);
    await logAlert("voltage_low", msg);
  } else if (voltage > voltageHigh && shouldAlert("voltage_high")) {
    const msg = `⚠️ Yüksək Gərginlik Qəzası: ${voltage.toFixed(0)}V (normal: ${voltageLow}-${voltageHigh}V)`;
    await sendTelegramAlert(msg);
    await logAlert("voltage_high", msg);
  }

  // ---- gecə anomaliyası (sızma / qanunsuz qoşulma şübhəsi) ----
  const hour = new Date().getHours();
  if (hour >= 1 && hour < 5 && power_kw > anomalyThresholdKw && shouldAlert("anomaly")) {
    const msg = `🔎 Gecə saatlarında qeyri-adi yük aşkarlandı: ${power_kw.toFixed(2)} kW (saat ${hour}:00). Sayğacı və qoşulmaları yoxlayın.`;
    await sendTelegramAlert(msg);
    await logAlert("anomaly", msg);
  }

  // ---- gündəlik kWh/AZN-i ardıcıl toplamaq ----
  const now = Date.now();
  const nowDay = new Date().toISOString().slice(0, 10);
  if (nowDay !== todayKey) {
    // gün dəyişdi, sayğacı sıfırla
    todayKey = nowDay;
    lastMeterTime = null;
  }

  if (lastMeterTime !== null) {
    const hoursElapsed = (now - lastMeterTime) / 3_600_000;
    const kwhIncrement = power_kw * hoursElapsed;

    if (kwhIncrement > 0 && kwhIncrement < 5) {
      // ağlabatan bir artım (proses fasilələrindən yaranan sıçrayışların qarşısını alırıq)
      const monthKwhSoFar = await getMonthToDateKwh();
      const rate = tariffRateForCumulativeKwh(monthKwhSoFar);
      const costIncrement = kwhIncrement * rate;

      const { data: existing } = await supabase
        .from("meter_daily")
        .select("kwh, cost_azn")
        .eq("day", todayKey)
        .maybeSingle();

      const newKwh = (existing?.kwh || 0) + kwhIncrement;
      const newCost = (existing?.cost_azn || 0) + costIncrement;

      await supabase
        .from("meter_daily")
        .upsert({ day: todayKey, kwh: newKwh, cost_azn: newCost }, { onConflict: "day" });
    }
  }
  lastMeterTime = now;
}

async function handlePlugMessage(deviceKey, payload) {
  const energy = payload.ENERGY;
  if (!energy) return;

  const { data: device } = await supabase
    .from("devices")
    .select("id")
    .eq("device_key", deviceKey)
    .maybeSingle();

  if (!device) {
    console.warn(`Naməlum device_key: "${deviceKey}" — devices cədvəlinə əlavə edin.`);
    return;
  }

  await supabase.from("device_readings").insert({
    device_id: device.id,
    power_w: energy.Power ?? 0,
    energy_kwh_total: energy.Total ?? null,
  });
}

// ---------------------------------------------------------------- mqtt connect

const mqttClient = mqtt.connect({
  host: MQTT_HOST,
  port: parseInt(MQTT_PORT, 10),
  protocol: "mqtts",
  username: MQTT_USER,
  password: MQTT_PASS,
});

mqttClient.on("connect", () => {
  console.log("MQTT broker-ə qoşuldu.");
  mqttClient.subscribe("home/meter/main");
  mqttClient.subscribe("tele/+/SENSOR"); // Tasmota ağıllı prizlər
});

mqttClient.on("message", async (topic, messageBuf) => {
  let payload;
  try {
    payload = JSON.parse(messageBuf.toString());
  } catch {
    return;
  }

  if (topic === "home/meter/main") {
    await handleMeterMessage(payload);
  } else if (topic.startsWith("tele/") && topic.endsWith("/SENSOR")) {
    const deviceKey = topic.split("/")[1];
    await handlePlugMessage(deviceKey, payload);
  }
});

mqttClient.on("error", (err) => console.error("MQTT xətası:", err.message));

// ---------------------------------------------------------------- gündəlik cihaz aqreqasiyası

// Hər 10 dəqiqədə bir, hər cihaz üçün bugünkü kWh-ı (Tasmota-nın öz kumulyativ
// sayğacından: bu günün ilk oxuma ilə son oxuma arasındakı fərq) hesablayıb saxlayır.
cron.schedule("*/10 * * * *", async () => {
  const day = new Date().toISOString().slice(0, 10);
  const startOfDay = `${day}T00:00:00.000Z`;

  const { data: devices } = await supabase.from("devices").select("id");
  if (!devices) return;

  for (const d of devices) {
    const { data: readings } = await supabase
      .from("device_readings")
      .select("energy_kwh_total")
      .eq("device_id", d.id)
      .gte("recorded_at", startOfDay)
      .not("energy_kwh_total", "is", null)
      .order("recorded_at", { ascending: true });

    if (!readings || readings.length === 0) continue;

    const first = Number(readings[0].energy_kwh_total);
    const last = Number(readings[readings.length - 1].energy_kwh_total);
    const kwhToday = Math.max(0, last - first);

    await supabase
      .from("device_daily")
      .upsert({ device_id: d.id, day, kwh: kwhToday }, { onConflict: "device_id,day" });
  }

  console.log(`[cron] Cihaz üzrə gündəlik aqreqasiya yeniləndi (${day}).`);
});

console.log("Smart Grid AI worker işə düşdü. MQTT mesajları gözlənilir...");
