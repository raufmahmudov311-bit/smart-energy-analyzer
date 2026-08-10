-- Smart Grid AI — verilənlər bazası sxemi (Supabase / Postgres)
-- Bunu Supabase layihənizdə: SQL Editor → New query → yapışdırıb "Run" edin.

create extension if not exists "uuid-ossp";

-- Evdəki hər ağıllı prizə (kondisioner, paltaryuyan, televizor və s.) uyğun cihaz
create table if not exists devices (
  id uuid primary key default uuid_generate_v4(),
  name text not null,               -- Məs: 'Kondisioner'
  device_key text unique not null,  -- Tasmota MQTT topic slug, məs: 'plug-ac-01'
  icon text default 'zap',          -- frontend üçün ixtiyari ikon adı
  created_at timestamptz default now()
);

-- Ağıllı prizlərdən gələn ani ölçmələr (hər 5-10 saniyədə bir)
create table if not exists device_readings (
  id bigserial primary key,
  device_id uuid not null references devices(id) on delete cascade,
  power_w numeric not null,              -- ani güc (Vt)
  energy_kwh_total numeric,              -- prizin öz daxili sayğacı (kumulyativ, kWh)
  recorded_at timestamptz not null default now()
);
create index if not exists idx_device_readings_device_time
  on device_readings (device_id, recorded_at desc);

-- Ana sayğac / ESP32+CT klemmadan gələn ölçmələr
create table if not exists meter_readings (
  id bigserial primary key,
  voltage numeric not null,
  current numeric not null,
  power_kw numeric not null,
  recorded_at timestamptz not null default now()
);
create index if not exists idx_meter_readings_time
  on meter_readings (recorded_at desc);

-- Gün üzrə cihaz başına toplanmış sərfiyyat (worker tərəfindən hesablanır)
create table if not exists device_daily (
  device_id uuid not null references devices(id) on delete cascade,
  day date not null,
  kwh numeric not null default 0,
  primary key (device_id, day)
);

-- Gün üzrə ümumi ev sərfiyyatı və AZN xərci (worker tərəfindən hesablanır)
create table if not exists meter_daily (
  day date primary key,
  kwh numeric not null default 0,
  cost_azn numeric not null default 0
);

-- Bildiriş tarixçəsi (gərginlik həddi, anomaliya və s.)
create table if not exists alerts (
  id bigserial primary key,
  type text not null,               -- 'voltage_high' | 'voltage_low' | 'anomaly'
  message text not null,
  recorded_at timestamptz not null default now()
);

-- Nümunə cihazlar — evinizdə olan HƏR ELEKTRİK CİHAZINI bura əlavə edə bilərsiniz.
-- Yalnız ağıllı priz taxdığınız cihazlar real (canlı) data göndərəcək; qalanları
-- istəsəniz sadəcə planlaşdırma üçün web saytdakı "əl ilə daxiletmə" formasında saxlaya bilərsiniz.
-- Yeni cihaz əlavə etmək üçün bu sətri kopyalayıb device_key-i unikal saxlayın:
--   insert into devices (name, device_key) values ('Cihaz adı', 'plug-unikal-ad') on conflict (device_key) do nothing;

insert into devices (name, device_key) values
  ('Kondisioner', 'plug-ac-01'),
  ('Paltaryuyan', 'plug-washer-01'),
  ('Qabyuyan', 'plug-dishwasher-01'),
  ('Televizor', 'plug-tv-01'),
  ('Soyuducu', 'plug-fridge-01'),
  ('Su qızdırıcısı (Boyler)', 'plug-boiler-01'),
  ('Su Nasosu', 'plug-pump-01'),
  ('Mikrodalğalı soba', 'plug-microwave-01'),
  ('Elektrik sobası / Peç', 'plug-oven-01'),
  ('Kompüter', 'plug-pc-01'),
  ('Wi-Fi router', 'plug-router-01'),
  ('Ütü', 'plug-iron-01'),
  ('Tozsoran', 'plug-vacuum-01'),
  ('Saç qurutma maşını', 'plug-hairdryer-01'),
  ('LED işıqlandırma (salon)', 'plug-led-living-01'),
  ('LED işıqlandırma (mətbəx)', 'plug-led-kitchen-01'),
  ('Kondisioner (yataq otağı)', 'plug-ac-bedroom-01')
on conflict (device_key) do nothing;
