// fakeDevice.js
const mqtt = require("mqtt");

const MQTT_HOST = "broker.hivemq.com";
const MQTT_PORT = 1883;
const MQTT_URL = `mqtt://${MQTT_HOST}:${MQTT_PORT}`;
const MQTT_BASE_TOPIC = "iot/demo";

const deviceId = "esp32-1"; // tên "thiết bị" fake

const client = mqtt.connect(MQTT_URL);

client.on("connect", () => {
  console.log("✅ Fake device đã kết nối", MQTT_URL);

  // Gửi dữ liệu mỗi 3 giây
  setInterval(() => {
    const temp = 25 + Math.random() * 5; // 25–30 độ
    const payload = {
      state: "ONLINE",
      temp,
    };
    const topic = `${MQTT_BASE_TOPIC}/devices/${deviceId}/state`;
    client.publish(topic, JSON.stringify(payload));
    console.log("Fake publish:", topic, payload);
  }, 3000);
});

client.on("error", (err) => {
  console.error("Fake device MQTT error:", err.message);
});
