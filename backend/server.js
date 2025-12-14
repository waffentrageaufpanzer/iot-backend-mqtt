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
const PORT = process.env.PORT || 4000;
const SECRET = process.env.JWT_SECRET || "hieudeptrai123";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

// --- 1. UTILS & DB INIT ---
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { nextId: 1, users: [], devices: [], cameras: [], prefs: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) }; } catch {}

const saveDb = () => fs.writeFileSync(DB_FILE, JSON.stringify(db));
const err = (res, code, msg) => res.status(code).json({ error: msg });

// Tạo admin mặc định
if (!db.users.find(u => u.username === "admin")) {
    db.users.push({ id: db.nextId++, username: "admin", hash: bcrypt.hashSync("admin123", 10), role: "admin", createdAt: new Date() });
    saveDb();
}

// --- 2. MIDDLEWARE & SECURITY ---
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.raw({ type: "image/jpeg", limit: "10mb" }));

// Rate Limiter: Chống spam login (5 lần sai/phút)
const loginAttempts = new Map();
const rateLimit = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const record = loginAttempts.get(ip) || { count: 0, time: now };
    if (now - record.time > 60000) { record.count = 0; record.time = now; } 
    if (record.count >= 5) return err(res, 429, "Thử lại sau 1 phút.");
    req.rateLimitRecord = record;
    next();
};

// Auth Middleware: Kiểm tra token & quyền
const auth = (role) => (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) throw "No token";
        req.user = jwt.verify(token, SECRET);
        if (role && req.user.role !== role) return err(res, 403, "Cần quyền Admin!");
        next();
    } catch { err(res, 401, "Unauthorized"); }
};

// --- 3. MQTT & STATE ---
const rtState = {}; 
const frames = {};
const client = mqtt.connect(process.env.MQTT_URL || "mqtt://broker.hivemq.com:1883");

client.on("connect", () => client.subscribe("iot/demo/+/state"));
client.on("message", (t, m) => {
    try {
        const devId = t.split("/")[2];
        rtState[devId] = { ...rtState[devId], ...JSON.parse(m.toString()), updatedAt: new Date() };
    } catch {}
});

const mailer = process.env.EMAIL_USER ? nodemailer.createTransport({
    service: "gmail", auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
}) : null;

// --- 4. API ROUTES ---
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// A. Auth
app.post("/api/auth/login", rateLimit, (req, res) => {
    const { username, password } = req.body;
    const u = db.users.find(x => x.username === username);
    if (!u || !bcrypt.compareSync(password, u.hash)) {
        req.rateLimitRecord.count++; loginAttempts.set(req.ip, req.rateLimitRecord);
        return err(res, 401, "Sai tài khoản/mật khẩu");
    }
    loginAttempts.delete(req.ip);
    res.json({ token: jwt.sign({ id: u.id, role: u.role }, SECRET), user: { id: u.id, username: u.username, role: u.role } });
});

app.post("/api/auth/register-public", async (req, res) => {
    const { username, password, email } = req.body;
    if (db.users.find(u => u.username === username)) return err(res, 400, "User đã tồn tại");
    const newUser = { id: db.nextId++, username, email, role: "user", hash: bcrypt.hashSync(password, 10), createdAt: new Date() };
    db.users.push(newUser); saveDb();
    if (mailer) mailer.sendMail({ from: process.env.EMAIL_USER, to: email, subject: "Welcome", text: "Welcome to IoT" }).catch(()=>{});
    res.json({ message: "OK", token: jwt.sign({ id: newUser.id, role: "user" }, SECRET), user: newUser });
});

// B. Devices
app.get("/api/devices", auth(), (req, res) => {
    const list = db.devices.filter(d => req.user.role === "admin" || d.owner === req.user.id)
        .map(d => ({ ...d, ...(rtState[d.id] || {}) })); 
    res.json(list);
});

app.post("/api/devices/register", auth(), (req, res) => {
    if (db.devices.find(d => d.id === req.body.deviceId)) return err(res, 400, "Đã tồn tại");
    db.devices.push({ id: req.body.deviceId, name: req.body.name, owner: req.user.id }); saveDb(); res.json({ ok: true });
});

app.post("/api/devices/:id/control", auth(), (req, res) => {
    // Chỉ chủ sở hữu hoặc admin mới được điều khiển
    const d = db.devices.find(x => x.id === req.params.id);
    if (d && d.owner !== req.user.id && req.user.role !== 'admin') return err(res, 403, "Không có quyền");
    client.publish(`iot/demo/${req.params.id}/control`, JSON.stringify({ ...req.body, from: req.user.id }));
    res.json({ ok: true });
});

app.delete("/api/devices/:id", auth(), (req, res) => {
    const idx = db.devices.findIndex(d => d.id === req.params.id && (req.user.role === "admin" || d.owner === req.user.id));
    if (idx === -1) return err(res, 403, "Không được phép");
    db.devices.splice(idx, 1); saveDb(); res.json({ ok: true });
});

// C. Camera & Prefs
app.get("/api/cameras", auth(), (req, res) => res.json(db.cameras.filter(c => req.user.role === "admin" || c.owner === req.user.id)));
app.post("/api/cameras/register", auth(), (req, res) => { db.cameras.push({ id: req.body.cameraId, name: req.body.name, owner: req.user.id }); saveDb(); res.json({ ok: true }); });
app.get("/api/me/prefs", auth(), (req, res) => res.json(db.prefs[req.user.id] || { widgets: [] }));
app.put("/api/me/prefs", auth(), (req, res) => { db.prefs[req.user.id] = req.body; saveDb(); res.json({ ok: true }); });

app.post("/api/camera/frame", auth(), (req, res) => { frames[req.headers["x-camera-id"] || req.user.id] = req.body; res.json({ ok: true }); });
app.get("/api/camera/latest/:id", (req, res) => frames[req.params.id] ? res.type("jpeg").send(frames[req.params.id]) : err(res, 404, "No signal"));

// D. Admin Only
app.get("/api/admin/users", auth("admin"), (req, res) => res.json(db.users));
app.delete("/api/admin/users/:id", auth("admin"), (req, res) => {
    if(parseInt(req.params.id) === req.user.id) return err(res, 400, "Không thể tự xóa");
    db.users = db.users.filter(u => u.id !== parseInt(req.params.id)); saveDb(); res.json({ ok: true });
});

// 5. Static
const FRONTEND_DIR = path.join(__dirname, "../frontend");
app.use(express.static(FRONTEND_DIR));
app.get(/(.*)/, (req, res) => res.sendFile(path.join(FRONTEND_DIR, "index.html")));

app.listen(PORT, () => console.log(`Server running on ${PORT}`));