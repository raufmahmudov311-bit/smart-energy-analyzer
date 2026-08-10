"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Zap,
  Activity,
  Gauge,
  Plus,
  Trash2,
  AlertTriangle,
  TrendingUp,
  Wifi,
  WifiOff,
  Radio,
  Lightbulb,
  Clock,
  ShieldAlert,
  Sparkles,
  CircuitBoard,
  Wallet,
  ChevronDown,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Static config
// ---------------------------------------------------------------------------

const DISPLAY_FONT = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";
const MONO_FONT = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

const PRESETS = [
  { id: "ac", label: "Kondisioner (12000 BTU - 1.1 kW)", name: "Kondisioner", power: 1.1 },
  { id: "pump", label: "Su Nasosu (0.75 kW)", name: "Su Nasosu", power: 0.75 },
  { id: "fridge", label: "Soyuducu (0.2 kW)", name: "Soyuducu", power: 0.2 },
  { id: "led", label: "LED İşıqlandırma (0.05 kW)", name: "LED İşıqlandırma", power: 0.05 },
  { id: "motor", label: "Sənaye Mühərriki (3.0 kW)", name: "Sənaye Mühərriki", power: 3.0 },
  { id: "custom", label: "Digər (əl ilə daxil et)", name: "", power: "" },
];

const TARIFF_LOW = 0.08; // AZN/kWh up to 300 kWh
const TARIFF_HIGH = 0.1; // AZN/kWh above 300 kWh
const TARIFF_THRESHOLD = 300;

const SEED_APPLIANCES = [
  { id: 1, name: "Kondisioner", power: 1.1, hours: 6, count: 1 },
  { id: 2, name: "Soyuducu", power: 0.2, hours: 24, count: 1 },
  { id: 3, name: "Su Nasosu", power: 0.75, hours: 2, count: 1 },
  { id: 4, name: "LED İşıqlandırma", power: 0.05, hours: 8, count: 6 },
];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function fmt(n, d = 2) {
  if (!isFinite(n)) return "0";
  return n.toLocaleString("az-AZ", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export default function SmartGridAI() {
  const [mode, setMode] = useState("sim"); // 'sim' | 'iot'
  const [iotConnecting, setIotConnecting] = useState(false);

  const [appliances, setAppliances] = useState(SEED_APPLIANCES);
  const [voltage, setVoltage] = useState(220);
  const [duty, setDuty] = useState(0.55);
  const [history, setHistory] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({ i, v: 220 }))
  );
  const [anomaly, setAnomaly] = useState(false);
  const [now, setNow] = useState(new Date());
  const tickRef = useRef(0);

  // real data (IoT rejimi) — /api/latest və /api/monthly-summary-dən
  const [realData, setRealData] = useState(null);
  const [monthlySummary, setMonthlySummary] = useState(null);
  const [realDataError, setRealDataError] = useState(false);

  // IoT rejimində canlı datanı poll et (hər 5 saniyə)
  useEffect(() => {
    if (mode !== "iot") return;
    let cancelled = false;

    const fetchLatest = async () => {
      try {
        const res = await fetch("/api/latest", { cache: "no-store" });
        if (!res.ok) throw new Error("api xətası");
        const data = await res.json();
        if (!cancelled) {
          setRealData(data);
          setRealDataError(false);
        }
      } catch {
        if (!cancelled) setRealDataError(true);
      }
    };

    fetchLatest();
    const id = setInterval(fetchLatest, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mode]);

  // aylıq müqayisəni IoT rejiminə keçəndə və hər 2 dəqiqədə bir yenilə
  useEffect(() => {
    if (mode !== "iot") return;
    let cancelled = false;

    const fetchSummary = async () => {
      try {
        const res = await fetch("/api/monthly-summary", { cache: "no-store" });
        if (!res.ok) throw new Error("api xətası");
        const data = await res.json();
        if (!cancelled) setMonthlySummary(data);
      } catch {
        /* səssiz — canlı panel həssas deyil */
      }
    };

    fetchSummary();
    const id = setInterval(fetchSummary, 120000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mode]);

  const hasLiveData = mode === "iot" && !!realData?.meter && !iotConnecting;

  // form state
  const [presetId, setPresetId] = useState("ac");
  const [formName, setFormName] = useState(PRESETS[0].name);
  const [formPower, setFormPower] = useState(String(PRESETS[0].power));
  const [formHours, setFormHours] = useState("4");
  const [formCount, setFormCount] = useState("1");

  // clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // simulation / iot data tick
  useEffect(() => {
    const id = setInterval(() => {
      tickRef.current += 1;

      setVoltage((prev) => {
        let next = prev + rand(-3, 3);
        // occasional grid event
        if (Math.random() < 0.05) {
          next = Math.random() < 0.5 ? rand(182, 193) : rand(247, 256);
        }
        next = clamp(next, 175, 262);
        return next;
      });

      setDuty(() => clamp(0.5 + rand(-0.18, 0.22), 0.25, 0.95));

      if (tickRef.current % 3 === 0) {
        setAnomaly(Math.random() < 0.22);
      }
    }, mode === "iot" ? 1400 : 2200);
    return () => clearInterval(id);
  }, [mode]);

  // push voltage into rolling history
  useEffect(() => {
    setHistory((h) => {
      const next = [...h.slice(1), { i: (h[h.length - 1]?.i ?? 0) + 1, v: voltage }];
      return next;
    });
  }, [voltage]);

  // handle mode toggle -> fake IoT handshake
  const handleModeChange = useCallback((next) => {
    setMode(next);
    if (next === "iot") {
      setIotConnecting(true);
      setTimeout(() => setIotConnecting(false), 1400);
    }
  }, []);

  // preset select handler
  const handlePresetChange = (id) => {
    setPresetId(id);
    const p = PRESETS.find((p) => p.id === id);
    if (p && p.id !== "custom") {
      setFormName(p.name);
      setFormPower(String(p.power));
    } else {
      setFormName("");
      setFormPower("");
    }
  };

  const addAppliance = (e) => {
    e.preventDefault();
    const power = parseFloat(formPower);
    const hours = parseFloat(formHours);
    const count = parseInt(formCount, 10);
    if (!formName.trim() || !power || power <= 0 || !hours || hours <= 0 || !count || count <= 0) return;
    setAppliances((list) => [
      ...list,
      { id: Date.now(), name: formName.trim(), power, hours, count },
    ]);
    // reset (keep preset selection convenient)
    setFormHours("4");
    setFormCount("1");
  };

  const removeAppliance = (id) => setAppliances((list) => list.filter((a) => a.id !== id));

  // -------------------------------------------------------------------------
  // Derived calculations
  // -------------------------------------------------------------------------

  const installedKw = useMemo(
    () => appliances.reduce((s, a) => s + a.power * a.count, 0),
    [appliances]
  );
  const simInstantLoadKw = installedKw * duty;
  const simCurrent = voltage > 0 ? (simInstantLoadKw * 1000) / voltage : 0;

  // hasLiveData true olanda canlı sayğac datasını göstər, əks halda simulyasiya
  const displayVoltage = hasLiveData ? realData.meter.voltage : voltage;
  const displayCurrent = hasLiveData ? realData.meter.current : simCurrent;
  const displayLoadKw = hasLiveData ? realData.meter.power_kw : simInstantLoadKw;
  const displayAnomaly = hasLiveData
    ? (realData.recentAlerts || []).some((a) => a.type === "anomaly")
    : anomaly;

  const dailyKwh = useMemo(
    () => appliances.reduce((s, a) => s + a.power * a.hours * a.count, 0),
    [appliances]
  );
  const monthlyKwh = dailyKwh * 30;

  const monthlyCost = useMemo(() => {
    if (monthlyKwh <= TARIFF_THRESHOLD) return monthlyKwh * TARIFF_LOW;
    return TARIFF_THRESHOLD * TARIFF_LOW + (monthlyKwh - TARIFF_THRESHOLD) * TARIFF_HIGH;
  }, [monthlyKwh]);

  const dailyCost = monthlyCost / 30;
  const blendedRate = monthlyKwh > 0 ? monthlyCost / monthlyKwh : TARIFF_LOW;

  const voltageStatus =
    displayVoltage < 195 ? "low" : displayVoltage > 245 ? "high" : "normal";

  const hour = now.getHours();
  const isPeak = hour >= 17 && hour < 22;

  const breakdown = useMemo(() => {
    const totalDaily = appliances.reduce((s, a) => s + a.power * a.hours * a.count, 0) || 1;
    return appliances
      .map((a) => ({
        name: a.name,
        kwh: a.power * a.hours * a.count,
        pct: ((a.power * a.hours * a.count) / totalDaily) * 100,
      }))
      .sort((a, b) => b.kwh - a.kwh);
  }, [appliances]);

  const insights = useMemo(() => {
    const tips = [];
    const ac = appliances.find((a) => a.name.toLowerCase().includes("kondision"));
    if (ac) {
      const saveKwh = ac.power * 0.15 * ac.hours * ac.count * 30;
      const saveAzn = saveKwh * blendedRate;
      tips.push(
        `Kondisionerin dərəcəsini 1-2°C artırmaqla ayda təxminən ${fmt(saveAzn, 1)} AZN qənaət edə bilərsiniz.`
      );
    }
    const pump = appliances.find((a) => a.name.toLowerCase().includes("nasos"));
    if (pump && isPeak) {
      tips.push("Hazırda pik saatlardır (17:00–22:00) — su nasosunu söndürüb gecə saatlarına keçirmək tövsiyə olunur.");
    } else if (pump) {
      tips.push("Su nasosunu pik saatlardan (17:00–22:00) kənarda işlətmək aylıq xərci azaldacaq.");
    }
    if (!appliances.some((a) => a.name.toLowerCase().includes("led"))) {
      tips.push("Adi lampaları LED işıqlandırma ilə əvəz etməklə enerji sərfiyyatını 70%-ə qədər azalda bilərsiniz.");
    }
    if (displayAnomaly) {
      tips.push("Qeyri-adi boş yük aşkarlandı — sayğacı və xətti yoxlayın, qanunsuz qoşulma ehtimalı var.");
    }
    if (monthlyKwh > TARIFF_THRESHOLD) {
      tips.push(`Aylıq sərfiyyat 300 kWh həddini keçib — hər əlavə kWh üçün 0.10 AZN (0.08 AZN əvəzinə) ödəyirsiniz.`);
    }
    if (voltageStatus !== "normal") {
      tips.push("Gərginlik normadan kənardır — həssas elektron cihazları stabilizatordan istifadə etmədən qoşmayın.");
    }
    if (tips.length === 0) {
      tips.push("Hazırda sistem normal işləyir. Sərfiyyatınızı azaltmaq üçün cihaz əlavə edərək təhlilə başlayın.");
    }
    return tips.slice(0, 4);
  }, [appliances, blendedRate, isPeak, displayAnomaly, monthlyKwh, voltageStatus]);

  // oscilloscope path — canlı rejimdə realData.voltageHistory, əks halda simulyasiya
  const displayHistory = useMemo(() => {
    if (hasLiveData && realData.voltageHistory?.length) {
      return realData.voltageHistory.map((r, i) => ({ i, v: r.voltage }));
    }
    return history;
  }, [hasLiveData, realData, history]);

  const scopePath = useMemo(() => {
    const w = 600;
    const h = 80;
    const min = 175, max = 262;
    const pts = displayHistory.map((p, idx) => {
      const x = (idx / (displayHistory.length - 1)) * w;
      const y = h - ((p.v - min) / (max - min)) * h;
      return `${idx === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return pts.join(" ");
  }, [displayHistory]);

  const scopeColor =
    voltageStatus === "normal" ? "#34d399" : voltageStatus === "low" ? "#fbbf24" : "#f87171";

  return (
    <div
      className="min-h-screen w-full bg-[#050a08] text-emerald-50 relative overflow-x-hidden"
      style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
    >
      <style>{`
        @keyframes pulseGlow { 0%,100% { opacity:.55 } 50% { opacity:1 } }
        .glow-dot { animation: pulseGlow 2s ease-in-out infinite; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; }
      `}</style>

      {/* ambient backdrop */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.15]" style={{
        background: "radial-gradient(circle at 15% -10%, #10b981 0%, transparent 45%), radial-gradient(circle at 100% 10%, #059669 0%, transparent 40%)"
      }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* ---------------------------------------------------------- Header */}
        <header className="flex flex-col gap-4 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <CircuitBoard className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h1
                  className="text-xl sm:text-2xl font-semibold tracking-tight text-white"
                  style={{ fontFamily: DISPLAY_FONT }}
                >
                  Smart Grid AI
                </h1>
                <p className="text-xs sm:text-sm text-emerald-200/50">
                  Enerji Analitikası və İdarəetmə Paneli
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-[11px] text-emerald-200/40 uppercase tracking-wider">Son yenilənmə</div>
                <div className="text-sm text-emerald-200/80" style={{ fontFamily: MONO_FONT }}>
                  {now.toLocaleTimeString("az-AZ")}
                </div>
              </div>
              <ModeToggle mode={mode} onChange={handleModeChange} connecting={iotConnecting} />
            </div>
          </div>
        </header>

        {/* ---------------------------------------------------- Alert banners */}
        <div className="flex flex-col gap-2 mb-6">
          {voltageStatus !== "normal" && (
            <AlertBanner
              tone={voltageStatus === "low" ? "amber" : "red"}
              icon={AlertTriangle}
              title={voltageStatus === "low" ? "Aşağı Gərginlik Qəzası" : "Yüksək Gərginlik Qəzası"}
              text={`Şəbəkə gərginliyi ${fmt(displayVoltage, 0)}V səviyyəsindədir. Normal diapazon 195V–245V arasıdır. Cihazlarınızı qorumaq üçün stabilizatordan istifadə edin.`}
            />
          )}
          {isPeak && (
            <AlertBanner
              tone="amber"
              icon={Clock}
              title="Pik Saatlar Xəbərdarlığı"
              text="Hazırda 17:00–22:00 pik yük intervalındasınız. Ağır yüklü cihazların istifadəsini məhdudlaşdırmaq tövsiyə olunur."
            />
          )}
          {mode === "iot" && realDataError && (
            <AlertBanner
              tone="amber"
              icon={WifiOff}
              title="Serverə qoşulma xətası"
              text="/api/latest cavab vermir — Supabase mühit dəyişənlərini (env) və worker-in işlədiyini yoxlayın."
            />
          )}
          {displayAnomaly && (
            <AlertBanner
              tone="red"
              icon={ShieldAlert}
              title="Qanunsuz Qoşulma / Sızma Şübhəsi"
              text="Sayğacda izah olunmayan boş yük aşkarlandı. Xətti və qoşulmaları yoxlamağınız tövsiyə olunur."
            />
          )}
        </div>

        {/* ------------------------------------------------------- Dashboard */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <StatCard
            icon={Zap}
            label="Gərginlik"
            value={`${fmt(displayVoltage, 0)}`}
            unit="V"
            status={voltageStatus === "normal" ? "Normal" : voltageStatus === "low" ? "Aşağı" : "Yüksək"}
            tone={voltageStatus === "normal" ? "good" : "bad"}
          />
          <StatCard
            icon={Activity}
            label="Cərəyan"
            value={fmt(displayCurrent, 1)}
            unit="A"
            status={isPeak ? "Pik saat" : "Sabit rejim"}
            tone={isPeak ? "warn" : "neutral"}
          />
          <StatCard
            icon={Gauge}
            label="Cəmi Yük"
            value={fmt(displayLoadKw, 2)}
            unit="kW"
            status={hasLiveData ? "Mənbə: canlı sayğac" : `Quraşdırılmış: ${fmt(installedKw, 2)} kW`}
            tone="neutral"
          />
        </section>

        {/* signature element: grid pulse oscilloscope */}
        <section className="rounded-2xl border border-emerald-900/40 bg-[#0a120e]/70 backdrop-blur px-4 sm:px-6 py-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-emerald-200/70 text-xs uppercase tracking-widest">
              <Radio className="h-3.5 w-3.5 glow-dot text-emerald-400" />
              Şəbəkə Nəbzi — {hasLiveData ? "Canlı Sayğac" : "Simulyasiya"}
            </div>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full border"
              style={{
                color: scopeColor,
                borderColor: scopeColor + "55",
                backgroundColor: scopeColor + "14",
              }}
            >
              {voltageStatus === "normal" ? "STABİL" : voltageStatus === "low" ? "DÜŞMƏ" : "SIÇRAYIŞ"}
            </span>
          </div>
          <svg viewBox="0 0 600 80" className="w-full h-16 sm:h-20" preserveAspectRatio="none">
            <line x1="0" y1="40" x2="600" y2="40" stroke="#134e3a" strokeWidth="1" strokeDasharray="4 4" />
            <path d={scopePath} fill="none" stroke={scopeColor} strokeWidth="2" style={{ transition: "stroke 0.6s" }} />
          </svg>
        </section>

        {/* ------------------------------------------------------- Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* left column: appliance management */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            <Panel title="Cihazların İdarə Olunması" icon={Plus} subtitle="Yeni cihaz əlavə edin və real vaxtda xərci izləyin">
              <form onSubmit={addAppliance} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="col-span-2 sm:col-span-4">
                  <label className="block text-[11px] text-emerald-200/50 mb-1">Hazır seçim</label>
                  <div className="relative">
                    <select
                      value={presetId}
                      onChange={(e) => handlePresetChange(e.target.value)}
                      className="w-full appearance-none bg-[#0d1a15] border border-emerald-900/50 rounded-lg px-3 py-2 text-sm text-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    >
                      {PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500/60 pointer-events-none" />
                  </div>
                </div>

                <Field label="Cihaz Adı" span="col-span-2 sm:col-span-1">
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Məs: Paltaryuyan"
                    className="ipt"
                  />
                </Field>
                <Field label="Güc (kW)">
                  <input
                    type="number" step="0.01" min="0"
                    value={formPower}
                    onChange={(e) => setFormPower(e.target.value)}
                    className="ipt"
                  />
                </Field>
                <Field label="Saat/gün">
                  <input
                    type="number" step="0.5" min="0" max="24"
                    value={formHours}
                    onChange={(e) => setFormHours(e.target.value)}
                    className="ipt"
                  />
                </Field>
                <Field label="Sayı">
                  <input
                    type="number" step="1" min="1"
                    value={formCount}
                    onChange={(e) => setFormCount(e.target.value)}
                    className="ipt"
                  />
                </Field>

                <button
                  type="submit"
                  className="col-span-2 sm:col-span-4 mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-medium text-sm py-2.5 transition-colors"
                >
                  <Plus className="h-4 w-4" /> Cihaz Əlavə Et
                </button>
              </form>

              <style>{`.ipt{width:100%;background:#0d1a15;border:1px solid rgba(6,95,70,0.5);border-radius:0.5rem;padding:0.5rem 0.75rem;font-size:0.875rem;color:#ecfdf5;} .ipt:focus{outline:none;box-shadow:0 0 0 2px rgba(16,185,129,0.5);}`}</style>

              {/* appliance table */}
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="text-left text-[11px] text-emerald-200/40 uppercase tracking-wider border-b border-emerald-900/40">
                      <th className="py-2 px-1 font-normal">Cihaz</th>
                      <th className="py-2 px-1 font-normal">Güc</th>
                      <th className="py-2 px-1 font-normal">Saat/gün</th>
                      <th className="py-2 px-1 font-normal">Sayı</th>
                      <th className="py-2 px-1 font-normal">Günlük kWh</th>
                      <th className="py-2 px-1 font-normal">Günlük Xərc</th>
                      <th className="py-2 px-1 font-normal"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {appliances.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-emerald-200/40 text-sm">
                          Hələ cihaz əlavə edilməyib.
                        </td>
                      </tr>
                    )}
                    {appliances.map((a) => {
                      const kwh = a.power * a.hours * a.count;
                      const cost = kwh * blendedRate;
                      return (
                        <tr key={a.id} className="border-b border-emerald-900/20 hover:bg-emerald-500/[0.03]">
                          <td className="py-2 px-1 text-emerald-50">{a.name}</td>
                          <td className="py-2 px-1 text-emerald-200/70" style={{ fontFamily: MONO_FONT }}>{fmt(a.power, 2)} kW</td>
                          <td className="py-2 px-1 text-emerald-200/70" style={{ fontFamily: MONO_FONT }}>{fmt(a.hours, 1)}</td>
                          <td className="py-2 px-1 text-emerald-200/70" style={{ fontFamily: MONO_FONT }}>×{a.count}</td>
                          <td className="py-2 px-1 text-emerald-300" style={{ fontFamily: MONO_FONT }}>{fmt(kwh, 2)}</td>
                          <td className="py-2 px-1 text-emerald-300" style={{ fontFamily: MONO_FONT }}>{fmt(cost, 2)} ₼</td>
                          <td className="py-2 px-1 text-right">
                            <button
                              onClick={() => removeAppliance(a.id)}
                              className="text-emerald-200/30 hover:text-red-400 transition-colors"
                              aria-label="Sil"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>

            {/* breakdown bars */}
            <Panel title="Cihazlar üzrə Yük Bölgüsü" icon={TrendingUp} subtitle="Günlük sərfiyyatda hər kateqoriyanın payı">
              <div className="flex flex-col gap-3">
                {breakdown.length === 0 && (
                  <p className="text-sm text-emerald-200/40">Bölgünü görmək üçün cihaz əlavə edin.</p>
                )}
                {breakdown.map((b, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-emerald-100">{b.name}</span>
                      <span className="text-emerald-300" style={{ fontFamily: MONO_FONT }}>
                        {fmt(b.pct, 1)}% · {fmt(b.kwh, 2)} kWh
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-emerald-950 border border-emerald-900/40 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400"
                        style={{ width: `${clamp(b.pct, 2, 100)}%`, transition: "width 0.6s ease" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* right column: AI analytics */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Panel title="Aİ Xərc və Sərfiyyat Təxmini" icon={Wallet} subtitle="Cari cihaz siyahısına əsasən proqnoz">
              <div className="grid grid-cols-1 gap-3">
                <MetricRow label="Günlük Sərfiyyat" value={`${fmt(dailyKwh, 2)} kWh`} />
                <MetricRow label="Aylıq Təxmini Sərfiyyat" value={`${fmt(monthlyKwh, 1)} kWh`} />
                <MetricRow label="Günlük Xərc" value={`${fmt(dailyCost, 2)} ₼`} />
                <MetricRow
                  label="Aylıq Təxmini İşıq Pulu"
                  value={`${fmt(monthlyCost, 2)} ₼`}
                  highlight
                />
              </div>
              <div className="mt-4 pt-4 border-t border-emerald-900/30 text-[11px] text-emerald-200/40 leading-relaxed">
                Tarif: 300 kWh-a qədər 0.08 ₼/kWh, 300 kWh-dan yuxarı 0.10 ₼/kWh (Azərişıq tarifi əsasında).
                {monthlyKwh > TARIFF_THRESHOLD && (
                  <span className="text-amber-400"> Cari proqnoz yüksək tarif zonasına daxildir.</span>
                )}
              </div>
            </Panel>

            {mode === "iot" && monthlySummary && (
              <Panel
                title="Aylıq Müqayisə"
                icon={TrendingUp}
                subtitle={`Bu ayın 1-dən ${monthlySummary.cutoffDay}-nə qədər, keçən ayın eyni dövrü ilə`}
              >
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <MetricRow label="Bu ay" value={`${fmt(monthlySummary.current.costAzn, 2)} ₼`} />
                  <MetricRow label="Keçən ay" value={`${fmt(monthlySummary.previous.costAzn, 2)} ₼`} />
                </div>
                <div
                  className={`rounded-lg px-3 py-2.5 mb-4 border text-sm ${
                    monthlySummary.deltaCostAzn > 0
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                      : "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                  }`}
                >
                  Fərq: {monthlySummary.deltaCostAzn > 0 ? "+" : ""}
                  {fmt(monthlySummary.deltaCostAzn, 2)} ₼ ({fmt(monthlySummary.deltaKwh, 1)} kWh)
                </div>
                {monthlySummary.deviceBreakdown?.filter((d) => Math.abs(d.deltaKwh) > 0.01).length > 0 && (
                  <div>
                    <div className="text-[11px] text-emerald-200/50 mb-2 uppercase tracking-wider">
                      Fərqə ən çox təsir edən cihazlar
                    </div>
                    <div className="flex flex-col gap-2">
                      {monthlySummary.deviceBreakdown
                        .filter((d) => Math.abs(d.deltaKwh) > 0.01)
                        .slice(0, 4)
                        .map((d, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-emerald-100">{d.name}</span>
                            <span
                              className={d.deltaKwh > 0 ? "text-amber-400" : "text-emerald-400"}
                              style={{ fontFamily: MONO_FONT }}
                            >
                              {d.deltaKwh > 0 ? "+" : ""}
                              {fmt(d.deltaKwh, 2)} kWh
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </Panel>
            )}

            <Panel title="Aİ Tövsiyələri" icon={Sparkles} subtitle="Sərfiyyatınıza uyğun fərdi tövsiyələr" accent>
              <ul className="flex flex-col gap-3">
                {insights.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-emerald-100/90 leading-snug">
                    <Lightbulb className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Sistem Statusu" icon={ShieldAlert} subtitle="Qanunsuz qoşulma və şəbəkə sağlamlığı">
              <div className="flex flex-col gap-3 text-sm">
                <StatusLine label="Rejim" value={mode === "sim" ? "Simulyasiya (Əllə daxiletmə)" : "Smart Sensor / IoT (API)"} />
                <StatusLine label="Gərginlik vəziyyəti" value={voltageStatus === "normal" ? "Normal" : voltageStatus === "low" ? "Aşağı gərginlik" : "Yüksək gərginlik"} tone={voltageStatus === "normal" ? "good" : "bad"} />
                <StatusLine label="Pik saat" value={isPeak ? "Bəli — 17:00–22:00" : "Xeyr"} tone={isPeak ? "warn" : "good"} />
                <StatusLine label="Sızma / anomaliya" value={displayAnomaly ? "Aşkarlandı" : "Aşkarlanmadı"} tone={displayAnomaly ? "bad" : "good"} />
                {mode === "iot" && (
                  <StatusLine
                    label="Sayğac bağlantısı"
                    value={hasLiveData ? "Canlı" : realDataError ? "Xəta" : "Gözlənilir..."}
                    tone={hasLiveData ? "good" : realDataError ? "bad" : "warn"}
                  />
                )}
              </div>
            </Panel>

            {mode === "iot" && realData?.devices?.length > 0 && (
              <Panel
                title="Canlı Cihaz Ölçmələri"
                icon={Radio}
                subtitle="Ağıllı prizlərdən gələn ani güc və bugünkü sərfiyyat"
              >
                <div className="flex flex-col gap-2.5">
                  {realData.devices.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between rounded-lg bg-emerald-950/40 border border-emerald-900/30 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${d.online ? "bg-emerald-400 glow-dot" : "bg-emerald-800"}`} />
                        <span className="text-sm text-emerald-100">{d.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-emerald-200" style={{ fontFamily: MONO_FONT }}>
                          {d.powerW !== null ? `${fmt(d.powerW, 0)} Vt` : "—"}
                        </div>
                        <div className="text-[11px] text-emerald-200/40" style={{ fontFamily: MONO_FONT }}>
                          bu gün {fmt(d.todayKwh, 2)} kWh
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        </div>

        <footer className="mt-10 text-center text-[11px] text-emerald-200/25 pb-6">
          Smart Grid AI · Süni intellektlə dəstəklənən enerji təhlili və qənaət platforması
          {!hasLiveData && " — hazırda nümayiş/simulyasiya rejimindəsiniz."}
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModeToggle({ mode, onChange, connecting }) {
  return (
    <div className="flex items-center gap-2 bg-[#0d1a15] border border-emerald-900/50 rounded-full p-1 text-xs">
      <button
        onClick={() => onChange("sim")}
        className={`px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 ${
          mode === "sim" ? "bg-emerald-500 text-emerald-950 font-medium" : "text-emerald-200/50 hover:text-emerald-100"
        }`}
      >
        Simulyasiya
      </button>
      <button
        onClick={() => onChange("iot")}
        className={`px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 ${
          mode === "iot" ? "bg-emerald-500 text-emerald-950 font-medium" : "text-emerald-200/50 hover:text-emerald-100"
        }`}
      >
        {mode === "iot" && connecting ? (
          <WifiOff className="h-3.5 w-3.5" />
        ) : (
          <Wifi className="h-3.5 w-3.5" />
        )}
        IoT Sensor
      </button>
    </div>
  );
}

function AlertBanner({ tone, icon: Icon, title, text }) {
  const styles =
    tone === "red"
      ? "bg-red-500/10 border-red-500/30 text-red-200"
      : "bg-amber-500/10 border-amber-500/30 text-amber-200";
  const iconColor = tone === "red" ? "text-red-400" : "text-amber-400";
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${styles}`}>
      <Icon className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${iconColor}`} />
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs opacity-80 mt-0.5 leading-relaxed">{text}</div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, unit, status, tone }) {
  const toneColor =
    tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : tone === "warn" ? "text-amber-400" : "text-emerald-200/50";
  return (
    <div className="rounded-2xl border border-emerald-900/40 bg-[#0a120e]/70 backdrop-blur px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-emerald-200/50 uppercase tracking-wider">{label}</span>
        <Icon className="h-4 w-4 text-emerald-500/60" />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl sm:text-3xl font-semibold text-white" style={{ fontFamily: MONO_FONT }}>
          {value}
        </span>
        <span className="text-sm text-emerald-200/40">{unit}</span>
      </div>
      <div className={`text-[11px] mt-1.5 ${toneColor}`}>{status}</div>
    </div>
  );
}

function Panel({ title, subtitle, icon: Icon, children, accent }) {
  return (
    <div
      className={`rounded-2xl border px-4 sm:px-5 py-5 backdrop-blur ${
        accent ? "border-emerald-600/40 bg-emerald-500/[0.04]" : "border-emerald-900/40 bg-[#0a120e]/70"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="h-4 w-4 text-emerald-400" />}
        <h2 className="text-sm font-semibold text-white tracking-tight" style={{ fontFamily: DISPLAY_FONT }}>
          {title}
        </h2>
      </div>
      {subtitle && <p className="text-xs text-emerald-200/40 mb-4">{subtitle}</p>}
      {children}
    </div>
  );
}

function Field({ label, children, span }) {
  return (
    <div className={span}>
      <label className="block text-[11px] text-emerald-200/50 mb-1">{label}</label>
      {children}
    </div>
  );
}

function MetricRow({ label, value, highlight }) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${
        highlight ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-emerald-950/40 border border-emerald-900/30"
      }`}
    >
      <span className={`text-xs sm:text-sm ${highlight ? "text-emerald-200" : "text-emerald-200/60"}`}>{label}</span>
      <span
        className={`text-sm sm:text-base font-semibold ${highlight ? "text-emerald-300" : "text-emerald-100"}`}
        style={{ fontFamily: MONO_FONT }}
      >
        {value}
      </span>
    </div>
  );
}

function StatusLine({ label, value, tone }) {
  const dotColor = tone === "good" ? "bg-emerald-400" : tone === "bad" ? "bg-red-400" : tone === "warn" ? "bg-amber-400" : "bg-emerald-700";
  return (
    <div className="flex items-center justify-between">
      <span className="text-emerald-200/50">{label}</span>
      <span className="flex items-center gap-2 text-emerald-100">
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        {value}
      </span>
    </div>
  );
}
