// server.js
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const mqtt = require("mqtt");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const app = express();

// ===== CONFIG =====
const PORT = process.env.PORT || 4000;
const MQTT_URL = process.env.MQTT_URL || "mqtt://broker.hivemq.com:1883";
const JWT_SECRET = process.env.JWT_SECRET || "hieudeptrai123";
const MAX_USERS = parseInt(process.env.MAX_USERS || "10", 10);

// Luu du lieu ra file (de login o noi khac van con)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, "db.json");

// ===== MIDDLEWARE =====
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

// Parser cho JPEG (camera)
const jpegParser = express.raw({ type: "image/jpeg", limit: "10mb" });

// ===== DB (PERSISTENT JSON) =====
// db structure:
// {
//   nextUserId: number,
//   users: [],
//   deviceRegistry: [],   // {id, name, ownerUserId, createdAt, updatedAt}
//   cameraRegistry: [],   // {id, name, ownerUserId, createdAt, updatedAt}
//   widgetsByUser: { [userId]: any } // layout/widgets config
// }
function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadDbSync() {
  ensureDirSync(DATA_DIR);

  if (!fs.existsSync(DB_FILE)) {
    const init = {
      nextUserId: 1,
      users: [],
      deviceRegistry: [],
      cameraRegistry: [],
      widgetsByUser: {},
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2), "utf8");
    return init;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const data = JSON.parse(raw);

    // sanitize toi thieu
    data.nextUserId = Number(data.nextUserId || 1);
    data.users = Array.isArray(data.users) ? data.users : [];
    data.deviceRegistry = Array.isArray(data.deviceRegistry)
      ? data.deviceRegistry
      : [];
    data.cameraRegistry = Array.isArray(data.cameraRegistry)
      ? data.cameraRegistry
      : [];
    data.widgetsByUser =
      data.widgetsByUser && typeof data.widgetsByUser === "object"
        ? data.widgetsByUser
        : {};

    return data;
  } catch (e) {
    console.error("DB parse failed, tao backup va tao db moi:", e.message);
    try {
      fs.copyFileSync(DB_FILE, DB_FILE + ".broken_" + Date.now());
    } catch {}
    const init = {
      nextUserId: 1,
      users: [],
      deviceRegistry: [],
      cameraRegistry: [],
      widgetsByUser: {},
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2), "utf8");
    return init;
  }
}

let db = loadDbSync();
let saveTimer = null;

function scheduleSaveDb() {
  // debounce de tranh ghi file lien tuc
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
    } catch (e) {
      console.error("Save DB failed:", e.message);
    }
  }, 200);
}

// ===== IN-MEMORY RUNTIME STATE =====
const devicesRuntime = []; // state realtime tu MQTT
const cameraFrames = new Map(); // key: cameraId => { buffer, contentType, updatedAt }

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
    "Email: EMAIL_USER / EMAIL_PASS chua cau hinh, OTP se chi in ra console."
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
    subject: "IoT Platform - Ma OTP xac nhan email",
    text: `Ma OTP cua ban la: ${code}\nHieu luc trong 15 phut.`,
    html: `
      <p>Chao ban,</p>
      <p>Ma OTP xac nhan email cho IoT Platform la:</p>
      <h2 style="font-family: monospace; letter-spacing: 2px;">${code}</h2>
      <p>Ma nay co hieu luc trong 15 phut.</p>
    `,
  };

  try {
    await mailer.sendMail(mailOptions);
    console.log("Da gui OTP den", to);
  } catch (err) {
    console.error("Send OTP email error:", err.message);
  }
}

// ===== HELPERS =====
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

function allocUserId() {
  const id = db.nextUserId;
  db.nextUserId += 1;
  scheduleSaveDb();
  return id;
}

function ensureDefaultAdmin() {
  if (db.users.find((u) => u.username === "admin")) return;

  const hash = bcrypt.hashSync("admin123", 10);
  const now = new Date().toISOString();
  const adminEmail = process.env.ADMIN_EMAIL || null;

  const adminUser = {
    id: allocUserId(),
    username: "admin",
    passwordHash: hash,
    role: "admin",
    email: adminEmail,
    emailVerified: !!adminEmail,
    otpCode: null,
    otpExpires: null,
    createdAt: now,
  };

  db.users.push(adminUser);
  scheduleSaveDb();

  console.log("Da tao user admin mac dinh: admin / admin123");
  if (!adminEmail) console.log("Admin chua co email, co the set sau.");
}
ensureDefaultAdmin();

// ===== JWT / AUTH =====
function signToken(user) {
  const payload = { id: user.id, username: user.username, role: user.role };
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
    const user = db.users.find((u) => u.id === decoded.id);
    if (!user) return res.status(401).json({ error: "User not found or deleted" });

    req.user = { id: user.id, username: user.username, role: user.role };
    req._userObj = user;
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

// ===== DEVICE REGISTRY + RUNTIME =====
function getRegistryDevice(deviceId) {
  return db.deviceRegistry.find((d) => d.id === deviceId) || null;
}

function upsertRegistryDevice(deviceId, patch) {
  let dev = getRegistryDevice(deviceId);
  const now = new Date().toISOString();

  if (!dev) {
    dev = {
      id: deviceId,
      name: patch.name || "",
      ownerUserId: patch.ownerUserId || null,
      createdAt: now,
      updatedAt: now,
    };
    db.deviceRegistry.push(dev);
  } else {
    if (typeof patch.name === "string") dev.name = patch.name;
    if (patch.ownerUserId !== undefined) dev.ownerUserId = patch.ownerUserId;
    dev.updatedAt = now;
  }

  scheduleSaveDb();
  return dev;
}

function getRuntimeDevice(deviceId) {
  return devicesRuntime.find((d) => d.id === deviceId) || null;
}

function upsertRuntimeDevice(deviceId, msg) {
  let dev = getRuntimeDevice(deviceId);
  if (!dev) {
    dev = {
      id: deviceId,
      name: "",
      ownerUserId: null,
      lastState: "UNKNOWN",
      lastValue: null,
      sensors: {},
      updatedAt: null,
    };
    devicesRuntime.push(dev);
  }

  // merge registry info (owner/name)
  const reg = getRegistryDevice(deviceId);
  if (reg) {
    dev.name = reg.name || dev.name;
    dev.ownerUserId = reg.ownerUserId ?? dev.ownerUserId;
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
  return dev;
}

function buildDeviceListForUser(user) {
  // base: registry devices (de hien ca khi offline)
  const list = [];

  for (const reg of db.deviceRegistry) {
    if (user.role === "admin") {
      list.push({
        id: reg.id,
        name: reg.name || "",
        ownerUserId: reg.ownerUserId || null,
        lastState: "UNKNOWN",
        lastValue: null,
        sensors: {},
        updatedAt: reg.updatedAt || null,
      });
    } else {
      // show device chua owner hoac owner la user
      if (!reg.ownerUserId || reg.ownerUserId === user.id) {
        list.push({
          id: reg.id,
          name: reg.name || "",
          ownerUserId: reg.ownerUserId || null,
          lastState: "UNKNOWN",
          lastValue: null,
          sensors: {},
          updatedAt: reg.updatedAt || null,
        });
      }
    }
  }

  // overlay runtime state
  const byId = new Map(list.map((d) => [d.id, d]));
  for (const rt of devicesRuntime) {
    if (user.role !== "admin") {
      if (rt.ownerUserId && rt.ownerUserId !== user.id) continue;
    }
    const cur = byId.get(rt.id);
    if (cur) {
      cur.lastState = rt.lastState;
      cur.lastValue = rt.lastValue;
      cur.sensors = rt.sensors;
      cur.updatedAt = rt.updatedAt;
      if (rt.name) cur.name = rt.name;
      if (rt.ownerUserId !== undefined) cur.ownerUserId = rt.ownerUserId;
    } else {
      byId.set(rt.id, { ...rt });
    }
  }

  return Array.from(byId.values());
}

// ===== CAMERA REGISTRY =====
function getRegistryCamera(cameraId) {
  return db.cameraRegistry.find((c) => c.id === cameraId) || null;
}

function upsertRegistryCamera(cameraId, patch) {
  let cam = getRegistryCamera(cameraId);
  const now = new Date().toISOString();

  if (!cam) {
    cam = {
      id: cameraId,
      name: patch.name || "",
      ownerUserId: patch.ownerUserId || null,
      createdAt: now,
      updatedAt: now,
    };
    db.cameraRegistry.push(cam);
  } else {
    if (typeof patch.name === "string") cam.name = patch.name;
    if (patch.ownerUserId !== undefined) cam.ownerUserId = patch.ownerUserId;
    cam.updatedAt = now;
  }

  scheduleSaveDb();
  return cam;
}

function buildCameraListForUser(user) {
  if (user.role === "admin") return db.cameraRegistry;
  return db.cameraRegistry.filter(
    (c) => !c.ownerUserId || c.ownerUserId === user.id
  );
}

// ===== MQTT =====
const mqttClient = mqtt.connect(MQTT_URL);

mqttClient.on("connect", () => {
  console.log("MQTT connected to", MQTT_URL);
  mqttClient.subscribe("iot/demo/+/state", (err) => {
    if (err) console.error("MQTT subscribe error:", err.message);
    else console.log("Subscribed topic: iot/demo/+/state");
  });
});

mqttClient.on("error", (err) => {
  console.error("MQTT error:", err.message);
});

mqttClient.on("message", (topic, payload) => {
  try {
    const match = topic.match(/^iot\/demo\/(.+)\/state$/);
    if (!match) return;
    const deviceId = match[1];
    const msg = JSON.parse(payload.toString("utf8"));
    upsertRuntimeDevice(deviceId, msg);
  } catch (err) {
    console.error("MQTT message error:", err.message);
  }
});

// ===== ROUTES =====

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", now: new Date().toISOString() });
});

// ===== AUTH =====
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Thieu username hoac password" });
  }

  const user = db.users.find((u) => u.username === username);
  if (!user) return res.status(401).json({ error: "Sai tai khoan hoac mat khau" });

  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Sai tai khoan hoac mat khau" });

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

// Public register
app.post("/api/auth/register-public", (req, res) => {
  const { username, password, confirmPassword, email } = req.body || {};

  if (!username || !password || !confirmPassword || !email) {
    return res.status(400).json({ error: "Thieu username, email hoac password" });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Mat khau xac nhan khong trung" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Mat khau toi thieu 6 ky tu" });
  }
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return res.status(400).json({ error: "Email khong hop le" });
  }

  if (db.users.length >= MAX_USERS) {
    return res.status(400).json({ error: `Vuot qua so user cho phep (${MAX_USERS}).` });
  }

  if (db.users.find((u) => u.username === username)) {
    return res.status(400).json({ error: "Username da ton tai" });
  }
  if (db.users.find((u) => u.email === email)) {
    return res.status(400).json({ error: "Email da duoc su dung" });
  }

  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(password, 10);
  const id = allocUserId();

  const otpCode = (Math.floor(100000 + Math.random() * 900000)).toString();
  const otpExpires = Date.now() + 15 * 60 * 1000;

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

  db.users.push(user);
  scheduleSaveDb();

  sendOtpEmail(email, otpCode).catch(() => {});

  const token = signToken(user);
  res.json({
    message: "Dang ky thanh cong. Da gui OTP den email (hoac in console).",
    token,
    user: publicUser(user),
  });
});

// Change password
app.post("/api/auth/change-password", authMiddleware, (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body || {};
  const user = req._userObj;

  if (!oldPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: "Thieu du lieu." });
  }
  if (!bcrypt.compareSync(oldPassword, user.passwordHash)) {
    return res.status(400).json({ error: "Mat khau hien tai khong dung" });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "Mat khau xac nhan khong trung" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Mat khau moi toi thieu 6 ky tu" });
  }

  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  scheduleSaveDb();
  res.json({ message: "Da doi mat khau" });
});

// Send OTP
app.post("/api/auth/send-otp", authMiddleware, (req, res) => {
  const user = req._userObj;
  if (!user.email) return res.status(400).json({ error: "User chua co email" });

  const otpCode = (Math.floor(100000 + Math.random() * 900000)).toString();
  const otpExpires = Date.now() + 15 * 60 * 1000;

  user.otpCode = otpCode;
  user.otpExpires = otpExpires;
  scheduleSaveDb();

  sendOtpEmail(user.email, otpCode).catch(() => {});
  res.json({ message: "Da gui lai OTP" });
});

// Verify email
app.post("/api/auth/verify-email", authMiddleware, (req, res) => {
  const { otp } = req.body || {};
  const user = req._userObj;

  if (!otp) return res.status(400).json({ error: "Thieu OTP" });
  if (!user.otpCode || !user.otpExpires) {
    return res.status(400).json({ error: "Chua co OTP nao dang cho" });
  }
  if (Date.now() > user.otpExpires) {
    return res.status(400).json({ error: "OTP da het han" });
  }
  if (otp !== user.otpCode) {
    return res.status(400).json({ error: "OTP khong dung" });
  }

  user.emailVerified = true;
  user.otpCode = null;
  user.otpExpires = null;
  scheduleSaveDb();

  res.json({ message: "Xac nhan email thanh cong", user: publicUser(user) });
});

// ===== DEVICES =====
app.get("/api/devices", authMiddleware, (req, res) => {
  res.json(buildDeviceListForUser(req.user));
});

// Claim/register device
app.post("/api/devices/register", authMiddleware, (req, res) => {
  const { deviceId, name } = req.body || {};
  if (!deviceId) return res.status(400).json({ error: "Thieu deviceId" });

  const reg = getRegistryDevice(deviceId);
  if (reg && reg.ownerUserId && reg.ownerUserId !== req.user.id) {
    return res.status(403).json({ error: "Thiet bi da thuoc ve user khac" });
  }

  const dev = upsertRegistryDevice(deviceId, {
    ownerUserId: req.user.id,
    name: name || reg?.name || "",
  });

  // tao runtime neu chua co
  upsertRuntimeDevice(deviceId, { name: dev.name, state: "UNKNOWN" });

  res.json(dev);
});

// Control device (MQTT publish)
// Ho tro ca command string va payload object (slider/button/switch)
app.post("/api/devices/:id/control", authMiddleware, (req, res) => {
  const deviceId = req.params.id;

  const reg = getRegistryDevice(deviceId);
  if (reg && reg.ownerUserId && reg.ownerUserId !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "Khong co quyen dieu khien device nay" });
  }

  const { command, payload } = req.body || {};
  const hasCommand = typeof command === "string" && command.length > 0;
  const hasPayload = payload && typeof payload === "object";

  if (!hasCommand && !hasPayload) {
    return res.status(400).json({ error: "Thieu command hoac payload" });
  }

  const topic = `iot/demo/${deviceId}/control`;

  const out = {
    fromUserId: req.user.id,
    ts: Date.now(),
    ...(hasCommand ? { command } : {}),
    ...(hasPayload ? payload : {}),
  };

  mqttClient.publish(topic, JSON.stringify(out), (err) => {
    if (err) {
      console.error("MQTT publish error:", err.message);
      return res.status(500).json({ error: "MQTT publish error" });
    }
    res.json({ ok: true });
  });
});

// Delete device
app.delete("/api/devices/:id", authMiddleware, (req, res) => {
  const deviceId = req.params.id;

  const regIdx = db.deviceRegistry.findIndex((d) => d.id === deviceId);
  if (regIdx === -1) return res.status(404).json({ error: "Device khong ton tai" });

  const reg = db.deviceRegistry[regIdx];
  if (req.user.role !== "admin" && reg.ownerUserId && reg.ownerUserId !== req.user.id) {
    return res.status(403).json({ error: "Khong co quyen xoa device nay" });
  }

  db.deviceRegistry.splice(regIdx, 1);
  scheduleSaveDb();

  const rtIdx = devicesRuntime.findIndex((d) => d.id === deviceId);
  if (rtIdx !== -1) devicesRuntime.splice(rtIdx, 1);

  res.json({ message: "Da xoa device", id: deviceId });
});

// ===== CAMERAS =====
// List cameras (for dropdown)
app.get("/api/cameras", authMiddleware, (req, res) => {
  res.json(buildCameraListForUser(req.user));
});

// Claim/register camera (for dropdown)
app.post("/api/cameras/register", authMiddleware, (req, res) => {
  const { cameraId, name } = req.body || {};
  if (!cameraId) return res.status(400).json({ error: "Thieu cameraId" });

  const reg = getRegistryCamera(cameraId);
  if (reg && reg.ownerUserId && reg.ownerUserId !== req.user.id) {
    return res.status(403).json({ error: "Camera da thuoc ve user khac" });
  }

  const cam = upsertRegistryCamera(cameraId, {
    ownerUserId: req.user.id,
    name: name || reg?.name || "",
  });

  res.json(cam);
});

// Delete camera
app.delete("/api/cameras/:id", authMiddleware, (req, res) => {
  const cameraId = req.params.id;

  const idx = db.cameraRegistry.findIndex((c) => c.id === cameraId);
  if (idx === -1) return res.status(404).json({ error: "Camera khong ton tai" });

  const cam = db.cameraRegistry[idx];
  if (req.user.role !== "admin" && cam.ownerUserId && cam.ownerUserId !== req.user.id) {
    return res.status(403).json({ error: "Khong co quyen xoa camera nay" });
  }

  db.cameraRegistry.splice(idx, 1);
  scheduleSaveDb();

  cameraFrames.delete(String(cameraId));

  res.json({ message: "Da xoa camera", id: cameraId });
});

// ===== USER PREFS (SYNC DASHBOARD + CAMERAS) =====
// Frontend (app.js) dung: GET/PUT /api/me/prefs
function defaultPrefs() {
  return { widgets: [], cameras: [] };
}

app.get("/api/me/prefs", authMiddleware, (req, res) => {
  const key = String(req.user.id);
  const prefs = db.widgetsByUser[key];

  if (!prefs || typeof prefs !== "object") {
    return res.json({ widgets: [], cameras: [] });
  }

  const widgets = Array.isArray(prefs.widgets) ? prefs.widgets : [];
  const cameras = Array.isArray(prefs.cameras) ? prefs.cameras : [];

  res.json({ widgets, cameras });
});

app.put("/api/me/prefs", authMiddleware, (req, res) => {
  const key = String(req.user.id);
  const prefs = req.body || {};

  // Linh hoat: thieu cai nao tu dong coi la []
  const widgets = Array.isArray(prefs.widgets) ? prefs.widgets : [];
  const cameras = Array.isArray(prefs.cameras) ? prefs.cameras : [];

  db.widgetsByUser[key] = { widgets, cameras };

  scheduleSaveDb();
  res.json({ ok: true });
});
// ===== OPTIONS (CHO DROPDOWN DEVICE ID + CAMERA ID) =====
app.get("/api/options", authMiddleware, (req, res) => {
  const deviceList = buildDeviceListForUser(req.user).map((d) => ({
    id: d.id,
    name: d.name || d.id,
    ownerUserId: d.ownerUserId || null,
  }));

  const cameraList = buildCameraListForUser(req.user).map((c) => ({
    id: c.id,
    name: c.name || c.id,
    ownerUserId: c.ownerUserId || null,
  }));

  res.json({ devices: deviceList, cameras: cameraList });
});

// ===== CAMERA FRAMES =====
// POST JPEG frame: gui kem cameraId bang query hoac header
// - query: /api/camera/frame?cameraId=cam1
// - header: x-camera-id: cam1
app.post("/api/camera/frame", authMiddleware, jpegParser, (req, res) => {
  if (!req.body || !req.body.length) {
    return res.status(400).json({ error: "Empty body" });
  }

  const cameraId =
    (req.query.cameraId && String(req.query.cameraId)) ||
    (req.headers["x-camera-id"] && String(req.headers["x-camera-id"])) ||
    // fallback: dung userId nhu code cu
    String(req.user.id);

  // auto tao camera registry neu chua co (de camera widget de thoi la chay)
  const reg = getRegistryCamera(cameraId);
  if (reg && reg.ownerUserId && reg.ownerUserId !== req.user.id) {
    return res.status(403).json({ error: "CameraId dang thuoc user khac" });
  }
  if (!reg) {
    upsertRegistryCamera(cameraId, {
      ownerUserId: req.user.id,
      name: "",
    });
  } else if (!reg.ownerUserId) {
    // neu chua owner thi gan owner
    upsertRegistryCamera(cameraId, { ownerUserId: req.user.id });
  }

  cameraFrames.set(String(cameraId), {
    buffer: Buffer.from(req.body),
    contentType: "image/jpeg",
    updatedAt: Date.now(),
  });

  res.json({ ok: true, cameraId });
});

// GET latest frame theo cameraId (public de <img src> chay thang)
app.get("/api/camera/latest/:cameraId", (req, res) => {
  const cameraId = String(req.params.cameraId);
  const entry = cameraFrames.get(cameraId);
  if (!entry) return res.status(404).json({ error: "No frame" });

  res.setHeader("Content-Type", entry.contentType);
  res.setHeader("Cache-Control", "no-store");
  res.send(entry.buffer);
});

// ===== ADMIN USERS =====
app.get("/api/admin/users", authMiddleware, adminOnly, (req, res) => {
  res.json(db.users.map(publicUser));
});

app.patch("/api/admin/users/:id/password", authMiddleware, adminOnly, (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { newPassword } = req.body || {};

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Mat khau moi toi thieu 6 ky tu" });
  }

  const user = db.users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: "User khong ton tai" });

  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  scheduleSaveDb();
  res.json({ message: "Da doi mat khau cho user", user: publicUser(user) });
});

app.patch("/api/admin/users/:id/role", authMiddleware, adminOnly, (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { role } = req.body || {};

  if (!["admin", "user"].includes(role)) {
    return res.status(400).json({ error: "Role khong hop le" });
  }

  const user = db.users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: "User khong ton tai" });

  if (user.id === req.user.id && role !== "admin") {
    return res.status(400).json({ error: "Khong the tu bo quyen admin" });
  }

  user.role = role;
  scheduleSaveDb();
  res.json({ message: "Da cap nhat role user", user: publicUser(user) });
});

app.delete("/api/admin/users/:id", authMiddleware, adminOnly, (req, res) => {
  const userId = parseInt(req.params.id, 10);

  const user = db.users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: "User khong ton tai" });

  const admins = db.users.filter((u) => u.role === "admin");
  if (user.role === "admin" && admins.length <= 1) {
    return res.status(400).json({ error: "Khong the xoa admin cuoi cung" });
  }
  if (user.id === req.user.id) {
    return res.status(400).json({ error: "Khong the tu xoa chinh minh" });
  }

  db.users = db.users.filter((u) => u.id !== userId);
  scheduleSaveDb();
  res.json({ message: "Da xoa user" });
});

// ===== STATIC / FRONTEND =====
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
app.use(express.static(FRONTEND_DIR));

app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// ===== START =====
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  console.log(`DB file: ${DB_FILE}`);
});
