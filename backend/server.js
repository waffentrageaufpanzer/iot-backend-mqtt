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
const SECRET = process.env.JWT_SECRET || "secret";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

// --- UTILS & DB ---
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { nextId: 1, users: [], devices: [], cameras: [], prefs: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) }; } catch {}

const saveDb = () => fs.writeFileSync(DB_FILE, JSON.stringify(db));
const err = (res, code, msg) => res.status(code).json({ error: msg });
const getUser = (id) => db.users.find(u => u.id === id);

// Tạo admin mặc định nếu chưa có
if (!db.users.find(u => u.username === "admin")) {
    db.users.push({ id: db.nextId++, username: "admin", hash: bcrypt.hashSync("admin123", 10), role: "admin", createdAt: new Date() });
    saveDb();
}

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.raw({ type: "image/jpeg", limit: "10mb" }));
app.use(express.static(path.join(__dirname, "../frontend")));

const auth = (role) => (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        req.user = jwt.verify(token, SECRET);
        if (role && req.user.role !== role) throw "Forbidden";
        next();
    } catch { err(res, 401, "Unauthorized"); }
};

// --- MQTT & RUNTIME STATE ---
const rtState = {}; // Lưu trạng thái realtime (RAM)
const frames = {};  // Lưu frame camera (RAM)
const client = mqtt.connect(process.env.MQTT_URL || "mqtt://broker.hivemq.com:1883");

client.on("connect", () => client.subscribe("iot/demo/+/state"));
client.on("message", (t, m) => {
    try {
        const devId = t.split("/")[2];
        rtState[devId] = { ...rtState[devId], ...JSON.parse(m.toString()), updatedAt: new Date() };
    } catch {}
});

// --- EMAIL SETUP ---
const mailer = process.env.EMAIL_USER ? nodemailer.createTransport({
    service: "gmail", auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
}) : null;

// --- ROUTES ---

// 1. AUTH
app.post("/api/auth/login", (req, res) => {
    const u = db.users.find(x => x.username === req.body.username);
    if (!u || !bcrypt.compareSync(req.body.password, u.hash)) return err(res, 401, "Login failed");
    res.json({ token: jwt.sign({ id: u.id, role: u.role }, SECRET), user: u });
});

app.post("/api/auth/register-public", async (req, res) => {
    const { username, password, email } = req.body;
    if (db.users.find(u => u.username === username || u.email === email)) return err(res, 400, "User exists");
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const newUser = {
        id: db.nextId++, username, email, role: "user",
        hash: bcrypt.hashSync(password, 10),
        otp, otpExp: Date.now() + 900000, createdAt: new Date()
    };
    db.users.push(newUser); saveDb();

    if (mailer) mailer.sendMail({ from: process.env.EMAIL_USER, to: email, subject: "OTP", text: otp }).catch(console.error);
    res.json({ message: "Registered", token: jwt.sign({ id: newUser.id, role: "user" }, SECRET), user: newUser });
});

app.post("/api/auth/verify-email", auth(), (req, res) => {
    const u = getUser(req.user.id);
    if (u.otp !== req.body.otp || Date.now() > u.otpExp) return err(res, 400, "Invalid OTP");
    u.emailVerified = true; delete u.otp; delete u.otpExp; saveDb();
    res.json({ message: "Verified", user: u });
});

// 2. DEVICES
app.get("/api/devices", auth(), (req, res) => {
    // Merge DB config + Runtime MQTT state
    const list = db.devices.filter(d => req.user.role === "admin" || d.owner === req.user.id)
        .map(d => ({ ...d, ...rtState[d.id] })); 
    res.json(list);
});

app.post("/api/devices/register", auth(), (req, res) => {
    const { deviceId, name } = req.body;
    if (db.devices.find(d => d.id === deviceId)) return err(res, 400, "Exists");
    const dev = { id: deviceId, name, owner: req.user.id, createdAt: new Date() };
    db.devices.push(dev); saveDb();
    res.json(dev);
});

app.post("/api/devices/:id/control", auth(), (req, res) => {
    const topic = `iot/demo/${req.params.id}/control`;
    client.publish(topic, JSON.stringify({ ...req.body, from: req.user.id }));
    res.json({ ok: true });
});

app.delete("/api/devices/:id", auth(), (req, res) => {
    const idx = db.devices.findIndex(d => d.id === req.params.id && (req.user.role === "admin" || d.owner === req.user.id));
    if (idx === -1) return err(res, 403, "Not allowed");
    db.devices.splice(idx, 1); saveDb();
    res.json({ ok: true });
});

// 3. CAMERAS
app.get("/api/cameras", auth(), (req, res) => {
    res.json(db.cameras.filter(c => req.user.role === "admin" || c.owner === req.user.id));
});

app.post("/api/cameras/register", auth(), (req, res) => {
    const { cameraId, name } = req.body;
    if (!db.cameras.find(c => c.id === cameraId)) {
        db.cameras.push({ id: cameraId, name, owner: req.user.id }); saveDb();
    }
    res.json({ ok: true });
});

// Frame streaming (nhận JPEG -> lưu RAM -> Client lấy)
app.post("/api/camera/frame", auth(), (req, res) => {
    const camId = req.query.cameraId || req.headers["x-camera-id"] || req.user.id;
    frames[camId] = req.body;
    res.json({ ok: true });
});

app.get("/api/camera/latest/:id", (req, res) => {
    if (!frames[req.params.id]) return err(res, 404, "No signal");
    res.set("Content-Type", "image/jpeg").send(frames[req.params.id]);
});

// 4. USER PREFS (Dashboard widgets)
app.get("/api/me/prefs", auth(), (req, res) => res.json(db.prefs[req.user.id] || { widgets: [] }));
app.put("/api/me/prefs", auth(), (req, res) => {
    db.prefs[req.user.id] = req.body; saveDb();
    res.json({ ok: true });
});

// 5. ADMIN
app.get("/api/admin/users", auth("admin"), (req, res) => res.json(db.users));
app.delete("/api/admin/users/:id", auth("admin"), (req, res) => {
    db.users = db.users.filter(u => u.id !== parseInt(req.params.id)); saveDb();
    res.json({ ok: true });
});

const FRONTEND_DIR = path.join(__dirname, "../frontend");
app.use(express.static(FRONTEND_DIR));

app.get("/", (req, res) => {
    const indexPath = path.join(FRONTEND_DIR, "index.html");
        res.sendFile(indexPath);
});
// ===== START =====
app.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`);
});