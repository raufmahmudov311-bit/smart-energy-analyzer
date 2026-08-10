# Smart Grid AI — Enerji Analitikası və İdarəetmə Paneli

Evinizin real elektrik sayğacına (ana xətt + ağıllı prizlər) qoşulan, canlı gərginlik/cərəyan/yük göstərən, gərginlik həddi aşanda Telegram-a bildiriş göndərən və ay-ay müqayisə edən tam funksional platforma.

## Sistem hissələri

1. **Web sayt** (bu repo) — Next.js, Vercel-də pulsuz deploy olunur
2. **Verilənlər bazası** — Supabase (pulsuz plan)
3. **MQTT broker** — HiveMQ Cloud (pulsuz plan) — bütün cihazlar bura yazır/oxuyur
4. **Worker** — daim işləyən kiçik Node.js prosesi (Raspberry Pi və ya 5-10 AZN/ay VPS-də), MQTT-dən oxuyub Supabase-ə yazır, Telegram bildirişi göndərir
5. **Hardware** — ESP32 (ana sayğac üçün) + Tasmota ilə flaşlanmış ağıllı prizlər (hər cihaz üçün)

