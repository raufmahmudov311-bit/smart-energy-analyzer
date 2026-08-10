/*
  Smart Grid AI — Ana Sayğac Firmware (ESP32)
  ---------------------------------------------
  Nə edir:
    - SCT-013 cərəyan klemması ilə evin ana xəttindəki cərəyanı ölçür
    - ZMPT101B sensoru ilə gərginliyi ölçür (yoxdursa aşağıda "sabit 220V" rejimi var)
    - Hər 5 saniyədə bir MQTT broker-ə JSON formatında məlumat göndərir

  Lazım olan kitabxanalar (Arduino IDE → Library Manager):
    - PubSubClient (Nick O'Leary)
    - ArduinoJson (Benoit Blanchon)
    - EmonLib (openenergymonitor) — cərəyan/gərginlik RMS hesablamaları üçün

  Qoşulma (SCT-013):
    - SCT-013 çıxışı → 10-33 ohm burden rezistor üzərindən → ESP32 GPIO34 (ADC)
    - ZMPT101B (istəyə bağlı) → ESP32 GPIO35 (ADC)

  MQTT mövzusu (topic):
    home/meter/main   →  {"voltage":221.4,"current":6.2,"power_kw":1.37}
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "EmonLib.h"

// ---------------- AYARLAR (öz məlumatlarınızla doldurun) ----------------
const char* WIFI_SSID     = "WIFI_ADINIZ";
const char* WIFI_PASSWORD = "WIFI_SIFRENIZ";

const char* MQTT_HOST = "xxxxxxxx.s1.eu.hivemq.cloud"; // HiveMQ Cloud (pulsuz plan)
const int   MQTT_PORT = 8883;                           // TLS port
const char* MQTT_USER = "MQTT_ISTIFADECI";
const char* MQTT_PASS = "MQTT_SIFRE";
const char* MQTT_TOPIC = "home/meter/main";

// Kalibrasiya əmsalları — ilk quraşdırmada multimetrlə tənzimləyin
const float CURRENT_CALIBRATION = 30.0;   // SCT-013 modelinizin dəyəri (məs. 100A/50mA → ~30)
const float VOLTAGE_CALIBRATION = 234.26; // ZMPT101B üçün başlanğıc dəyər, kalibrasiya lazımdır
const bool  USE_VOLTAGE_SENSOR  = false;  // true = ZMPT101B var, false = sabit 220V istifadə et
const float FIXED_VOLTAGE       = 220.0;

// ---------------------------------------------------------------------

WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);
EnergyMonitor emon;

unsigned long lastSend = 0;
const unsigned long SEND_INTERVAL_MS = 5000;

void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi-a qoşulur");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println(" qoşuldu.");
}

void connectMQTT() {
  espClient.setInsecure(); // sadəlik üçün; production-da broker sertifikatını yoxlamaq tövsiyə olunur
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  while (!mqttClient.connected()) {
    Serial.print("MQTT-ə qoşulur...");
    String clientId = "esp32-main-meter-" + String(random(0xffff), HEX);
    if (mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
      Serial.println(" qoşuldu.");
    } else {
      Serial.print(" alınmadı, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" 2 saniyədən sonra yenidən cəhd olunacaq");
      delay(2000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  connectWiFi();

  emon.current(34, CURRENT_CALIBRATION); // GPIO34 → SCT-013
  if (USE_VOLTAGE_SENSOR) {
    emon.voltage(35, VOLTAGE_CALIBRATION, 1.7); // GPIO35 → ZMPT101B, phase shift 1.7 başlanğıc dəyəri
  }

  connectMQTT();
}

void loop() {
  if (!mqttClient.connected()) connectMQTT();
  mqttClient.loop();

  if (millis() - lastSend >= SEND_INTERVAL_MS) {
    lastSend = millis();

    float voltage, current, powerKw;

    if (USE_VOLTAGE_SENSOR) {
      emon.calcVI(20, 2000); // 20 yarım dövr, 2000ms timeout
      voltage = emon.Vrms;
      current = emon.Irms;
      powerKw = (voltage * current) / 1000.0;
    } else {
      current = emon.calcIrms(1480);
      voltage = FIXED_VOLTAGE;
      powerKw = (voltage * current) / 1000.0;
    }

    StaticJsonDocument<128> doc;
    doc["voltage"] = voltage;
    doc["current"] = current;
    doc["power_kw"] = powerKw;

    char payload[128];
    serializeJson(doc, payload);

    mqttClient.publish(MQTT_TOPIC, payload);
    Serial.println(payload);
  }
}
