// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mqtt = require("mqtt");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 4000;
const MQTT_URL = process.env.MQTT_URL || "mqtt://broker.hivemq.com:1883";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const MAX_USERS = parseInt(process.env.MAX_USERS || "10", 10);

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Parser cho JPEG (camera)
const jpegParser = express.raw({ type: "image/jpeg", limit: "10mb" });

// ===== EMAIL / OTP =====
let mailer = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  mailer = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  console.log("Email: Gmail transporter configured");
} else {
  console.log(
    "Email: EMAIL_USER / EMAIL_PASS chưa cấu hình, OTP sẽ chỉ in ra console."
  );
}

async function sendOtpEmail(to, code) {
  if (!to || !code) return;

  if (!mailer) {
    console.log("=== OTP DEBUG ===");
    console.log("To:", to);
    console.log("OTP:", code);
    console.log("=================");
    return;
  }

  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const mailOptions = {
    from,
    to,
    subject: "IoT Platform - Mã OTP xác nhận email",
    text: `Mã OTP của bạn là: ${code}\nHiệu lực trong 15 phút.`,
    html: `
      <p>Chào bạn,</p>
      <p>Mã OTP xác nhận email cho IoT Platform là:</p>
      <h2 style="font-family: monospace; letter-spacing: 2px;">${code}</h2>
      <p>Mã này có hiệu lực trong 15 phút.</p>
    `,
  };

  try {
    await mailer.sendMail(mailOptions);
    console.log("Đã gửi OTP đến", to);
  } catch (err) {
    console.error("Send OTP email error:", err.message);
  }
}

// ===== IN-MEMORY DATA =====
let users = [];
let devices = [];
let nextUserId = 1;
const cameraFrames = new Map(); // key: userId => { buffer, contentType, updatedAt }

// Helper: public user info
function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    email: u.email || null,
    emailVerified: !!u.emailVerified,
    createdAt: u.createdAt,
  };
}

// Tạo admin mặc định
function ensureDefaultAdmin() {
  if (users.find((u) => u.username === "admin")) return;

  const hash = bcrypt.hashSync("admin123", 10);
  const now = new Date().toISOString();
  const adminEmail = process.env.ADMIN_EMAIL || null;

  const adminUser = {
    id: nextUserId++,
    username: "admin",
    passwordHash: hash,
    role: "admin",
    email: adminEmail,
    emailVerified: !!adminEmail,
    otpCode: null,
    otpExpires: null,
    createdAt: now,
  };
  users.push(adminUser);

  console.log("Đã tạo user admin mặc định: admin / admin123");
  if (!adminEmail) {
    console.log("Admin chưa có email, có thể set sau.");
  }
}
ensureDefaultAdmin();

// ===== JWT / AUTH MIDDLEWARE =====
function signToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const [type, token] = auth.split(" ");
  if (type !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = users.find((u) => u.id === decoded.id);
    if (!user) {
      return res.status(401).json({ error: "User not found or deleted" });
    }
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
    };
    req._userObj = user; // raw object
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

// ===== MQTT =====
const mqttClient = mqtt.connect(MQTT_URL);

mqttClient.on("connect", () => {
  console.log("MQTT connected to", MQTT_URL);
  // topic demo: iot/demo/<deviceId>/state
  mqttClient.subscribe("iot/demo/+/state", (err) => {
    if (err) console.error("MQTT subscribe error:", err.message);
    else console.log("Subscribed topic: iot/demo/+/state");
  });
});

mqttClient.on("error", (err) => {
  console.error("MQTT error:", err.message);
});

function upsertDevice(deviceId, msg) {
  let dev = devices.find((d) => d.id === deviceId);
  if (!dev) {
    dev = {
      id: deviceId,
      name: msg.name || "",
      ownerUserId: msg.ownerUserId || null,
      lastState: null,
      lastValue: null,
      sensors: {},
      updatedAt: null,
    };
    devices.push(dev);
  }

  dev.name = msg.name || dev.name;
  dev.lastState = msg.state || dev.lastState || "ONLINE";

  if (typeof msg.value === "number" || typeof msg.value === "string") {
    dev.lastValue = msg.value;
  }
  if (msg.sensors && typeof msg.sensors === "object") {
    dev.sensors = { ...dev.sensors, ...msg.sensors };
  }
  dev.updatedAt = new Date().toISOString();
}

mqttClient.on("message", (topic, payload) => {
  try {
    const match = topic.match(/^iot\/demo\/(.+)\/state$/);
    if (!match) return;
    const deviceId = match[1];
    const msg = JSON.parse(payload.toString("utf8"));
    upsertDevice(deviceId, msg);
  } catch (err) {
    console.error("MQTT message error:", err.message);
  }
});

// ===== ROUTES =====

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    now: new Date().toISOString(),
  });
});

// ---- AUTH ----

// Login
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Thiếu username hoặc password" });
  }
  const user = users.find((u) => u.username === username);
  if (!user) {
    return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });
  }
  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });
  }
  const token = signToken(user);
  res.json({
    token,
    user: publicUser(user),
  });
});

// Public register (user thường), có email + confirm password + OTP
app.post("/api/auth/register-public", (req, res) => {
  const { username, password, confirmPassword, email } = req.body || {};

  if (!username || !password || !confirmPassword || !email) {
    return res
      .status(400)
      .json({ error: "Thiếu username, email hoặc password" });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Mật khẩu xác nhận không trùng" });
  }
  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: "Mật khẩu tối thiểu 6 ký tự" });
  }

  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return res.status(400).json({ error: "Email không hợp lệ" });
  }

  if (users.length >= MAX_USERS) {
    return res.status(400).json({
      error: `Vượt quá số user cho phép (${MAX_USERS}).`,
    });
  }

  if (users.find((u) => u.username === username)) {
    return res.status(400).json({ error: "Username đã tồn tại" });
  }

  if (users.find((u) => u.email === email)) {
    return res.status(400).json({ error: "Email đã được sử dụng" });
  }

  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(password, 10);
  const id = nextUserId++;

  const otpCode = (Math.floor(100000 + Math.random() * 900000)).toString();
  const otpExpires = Date.now() + 15 * 60 * 1000; // 15 phút

  const user = {
    id,
    username,
    passwordHash,
    role: "user",
    email,
    emailVerified: false,
    otpCode,
    otpExpires,
    createdAt: now,
  };
  users.push(user);

  sendOtpEmail(email, otpCode).catch(() => {});

  const token = signToken(user);
  res.json({
    message:
      "Đăng ký thành công. Đã gửi OTP đến email (hoặc in ở console nếu chưa cấu hình SMTP).",
    token,
    user: publicUser(user),
  });
});

// User đổi mật khẩu (self)
app.post("/api/auth/change-password", authMiddleware, (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body || {};
  const user = req._userObj;

  if (!oldPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: "Thiếu dữ liệu." });
  }
  if (!bcrypt.compareSync(oldPassword, user.passwordHash)) {
    return res.status(400).json({ error: "Mật khẩu hiện tại không đúng" });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "Mật khẩu xác nhận không trùng" });
  }
  if (newPassword.length < 6) {
    return res
      .status(400)
      .json({ error: "Mật khẩu mới tối thiểu 6 ký tự" });
  }

  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  res.json({ message: "Đã đổi mật khẩu" });
});

// Gửi lại OTP cho email hiện tại (self)
app.post("/api/auth/send-otp", authMiddleware, (req, res) => {
  const user = req._userObj;
  if (!user.email) {
    return res.status(400).json({ error: "User chưa có email" });
  }

  const otpCode = (Math.floor(100000 + Math.random() * 900000)).toString();
  const otpExpires = Date.now() + 15 * 60 * 1000;

  user.otpCode = otpCode;
  user.otpExpires = otpExpires;

  sendOtpEmail(user.email, otpCode).catch(() => {});
  res.json({ message: "Đã gửi lại OTP" });
});

// Xác nhận OTP email (self)
app.post("/api/auth/verify-email", authMiddleware, (req, res) => {
  const { otp } = req.body || {};
  const user = req._userObj;

  if (!otp) {
    return res.status(400).json({ error: "Thiếu OTP" });
  }
  if (!user.otpCode || !user.otpExpires) {
    return res.status(400).json({ error: "Chưa có OTP nào đang chờ" });
  }
  if (Date.now() > user.otpExpires) {
    return res.status(400).json({ error: "OTP đã hết hạn" });
  }
  if (otp !== user.otpCode) {
    return res.status(400).json({ error: "OTP không đúng" });
  }

  user.emailVerified = true;
  user.otpCode = null;
  user.otpExpires = null;

  res.json({
    message: "Xác nhận email thành công",
    user: publicUser(user),
  });
});
// ---- DEVICES ----

// Danh sách device
app.get("/api/devices", authMiddleware, (req, res) => {
  const user = req.user;
  if (user.role === "admin") {
    return res.json(devices);
  }
  const list = devices.filter(
    (d) => !d.ownerUserId || d.ownerUserId === user.id
  );
  res.json(list);
});

// Claim device
app.post("/api/devices/register", authMiddleware, (req, res) => {
  const { deviceId, name } = req.body || {};
  if (!deviceId) {
    return res.status(400).json({ error: "Thiếu deviceId" });
  }

  let dev = devices.find((d) => d.id === deviceId);
  if (!dev) {
    dev = {
      id: deviceId,
      name: name || "",
      ownerUserId: req.user.id,
      lastState: "UNKNOWN",
      lastValue: null,
      sensors: {},
      updatedAt: new Date().toISOString(),
    };
    devices.push(dev);
  } else {
    if (dev.ownerUserId && dev.ownerUserId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Thiết bị đã thuộc về user khác" });
    }
    dev.ownerUserId = req.user.id;
    if (name) dev.name = name;
  }
  res.json(dev);
});

// Điều khiển device (MQTT publish)
app.post("/api/devices/:id/control", authMiddleware, (req, res) => {
  const deviceId = req.params.id;
  const { command } = req.body || {};
  if (!command) {
    return res.status(400).json({ error: "Thiếu command" });
  }

  const topic = `iot/demo/${deviceId}/control`;
  const payload = JSON.stringify({
    command,
    fromUserId: req.user.id,
    ts: Date.now(),
  });

  mqttClient.publish(topic, payload, (err) => {
    if (err) {
      console.error("MQTT publish error:", err.message);
      return res.status(500).json({ error: "MQTT publish error" });
    }
    res.json({ ok: true });
  });
});

// Xoá device
app.delete("/api/devices/:id", authMiddleware, (req, res) => {
  const deviceId = req.params.id;
  const user = req.user;

  const idx = devices.findIndex((d) => d.id === deviceId);
  if (idx === -1) {
    return res.status(404).json({ error: "Device không tồn tại" });
  }

  const dev = devices[idx];

  if (user.role !== "admin" && dev.ownerUserId && dev.ownerUserId !== user.id) {
    return res.status(403).json({ error: "Không có quyền xoá device này" });
  }

  devices.splice(idx, 1);
  res.json({ message: "Đã xoá device", id: deviceId });
});

// ---- ADMIN USERS ----

// List user
app.get("/api/admin/users", authMiddleware, adminOnly, (req, res) => {
  res.json(users.map(publicUser));
});

// Admin đổi mật khẩu user bất kỳ
app.patch(
  "/api/admin/users/:id/password",
  authMiddleware,
  adminOnly,
  (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const { newPassword } = req.body || {};

    if (!newPassword || newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "Mật khẩu mới tối thiểu 6 ký tự" });
    }

    const user = users.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "User không tồn tại" });
    }

    user.passwordHash = bcrypt.hashSync(newPassword, 10);
    res.json({ message: "Đã đổi mật khẩu cho user", user: publicUser(user) });
  }
);

// Admin set/bỏ quyền admin
app.patch(
  "/api/admin/users/:id/role",
  authMiddleware,
  adminOnly,
  (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const { role } = req.body || {};

    if (!["admin", "user"].includes(role)) {
      return res.status(400).json({ error: "Role không hợp lệ" });
    }

    const user = users.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "User không tồn tại" });
    }

    if (user.id === req.user.id && role !== "admin") {
      return res
        .status(400)
        .json({ error: "Không thể tự bỏ quyền admin của chính mình" });
    }

    user.role = role;
    res.json({
      message: "Đã cập nhật role user",
      user: publicUser(user),
    });
  }
);

// Admin xóa user
app.delete("/api/admin/users/:id", authMiddleware, adminOnly, (req, res) => {
  const userId = parseInt(req.params.id, 10);

  const user = users.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: "User không tồn tại" });
  }

  const admins = users.filter((u) => u.role === "admin");
  if (user.role === "admin" && admins.length <= 1) {
    return res
      .status(400)
      .json({ error: "Không thể xóa admin cuối cùng" });
  }
  if (user.id === req.user.id) {
    return res.status(400).json({ error: "Không thể tự xóa chính mình" });
  }

  users = users.filter((u) => u.id !== userId);
  res.json({ message: "Đã xóa user" });
});

// ---- CAMERA (JPEG frames) ----

// ESP32 / Laptop POST frame
app.post("/api/camera/frame", authMiddleware, jpegParser, (req, res) => {
  if (!req.body || !req.body.length) {
    return res.status(400).json({ error: "Empty body" });
  }

  const userId = String(req.user.id);
  const buffer = Buffer.from(req.body);

  cameraFrames.set(userId, {
    buffer,
    contentType: "image/jpeg",
    updatedAt: Date.now(),
  });

  res.json({ ok: true });
});

// GET latest frame theo userId
app.get("/api/camera/latest/:userId", (req, res) => {
  const userId = String(req.params.userId);
  const entry = cameraFrames.get(userId);
  if (!entry) {
    return res.status(404).json({ error: "No frame" });
  }
  res.setHeader("Content-Type", entry.contentType);
  res.setHeader("Cache-Control", "no-store");
  res.send(entry.buffer);
});
// ---- STATIC / FRONTEND ----
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

// serve luôn các file tĩnh: css, js, ảnh,...
app.use(express.static(FRONTEND_DIR));

// route chính trả về index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
