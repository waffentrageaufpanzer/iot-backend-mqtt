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
const getUser = (id) => db.users.find(u => u.id === id);

// Tạo admin mặc định
if (!db.users.find(u => u.username === "admin")) {
    db.users.push({ id: db.nextId++, username: "admin", hash: bcrypt.hashSync("admin123", 10), role: "admin", createdAt: new Date() });
    saveDb();
}

// --- 2. MIDDLEWARE & SECURITY ---
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.raw({ type: "image/jpeg", limit: "10mb" }));

// Rate Limiter thủ công (Chống Spam Login)
const loginAttempts = new Map();
const rateLimit = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const record = loginAttempts.get(ip) || { count: 0, time: now };
    
    if (now - record.time > 60000) { record.count = 0; record.time = now; } // Reset sau 1 phút
    if (record.count >= 5) return err(res, 429, "Quá nhiều lần thử sai. Vui lòng chờ 1 phút.");
    
    req.rateLimitRecord = record; // Lưu để dùng trong route login
    next();
};

// Middleware xác thực (Auth)
const auth = (role) => (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) throw "No token";
        req.user = jwt.verify(token, SECRET);
        
        // Kiểm tra user có tồn tại trong DB không (tránh trường hợp user bị xóa nhưng token còn hạn)
        const userExists = db.users.find(u => u.id === req.user.id);
        if (!userExists) throw "User deleted";

        // Phân quyền Role
        if (role && req.user.role !== role) return err(res, 403, "Forbidden: Bạn không có quyền này!");
        
        next();
    } catch { err(res, 401, "Unauthorized: Vui lòng đăng nhập lại."); }
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

// ============================================
// --- 4. API ROUTES ---
// ============================================

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", now: new Date() });
});

// A. AUTH (Có Rate Limit & Validation)
app.post("/api/auth/login", rateLimit, (req, res) => {
    const { username, password } = req.body;
    if(!username || !password) return err(res, 400, "Thiếu thông tin");

    const u = db.users.find(x => x.username === username);
    if (!u || !bcrypt.compareSync(password, u.hash)) {
        // Tăng đếm sai
        req.rateLimitRecord.count++;
        loginAttempts.set(req.ip, req.rateLimitRecord);
        return err(res, 401, "Sai tài khoản hoặc mật khẩu");
    }
    
    // Reset đếm nếu login đúng
    loginAttempts.delete(req.ip);
    res.json({ token: jwt.sign({ id: u.id, role: u.role }, SECRET), user: { id: u.id, username: u.username, role: u.role } });
});

app.post("/api/auth/register-public", async (req, res) => {
    const { username, password, email } = req.body;
    
    // Validation kỹ hơn
    if (!username || username.length < 3) return err(res, 400, "Username quá ngắn");
    if (!password || password.length < 6) return err(res, 400, "Password phải từ 6 ký tự");
    if (!email || !email.includes("@")) return err(res, 400, "Email không hợp lệ");

    if (db.users.find(u => u.username === username || u.email === email)) return err(res, 400, "User hoặc Email đã tồn tại");
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const newUser = {
        id: db.nextId++, username, email, role: "user",
        hash: bcrypt.hashSync(password, 10),
        otp, otpExp: Date.now() + 900000, createdAt: new Date()
    };
    db.users.push(newUser); saveDb();

    if (mailer) mailer.sendMail({ from: process.env.EMAIL_USER, to: email, subject: "OTP IoT Platform", text: `Mã OTP của bạn là: ${otp}` }).catch(console.error);
    
    // Trả về token luôn để tiện test (thực tế nên bắt verify trước)
    res.json({ message: "Registered", token: jwt.sign({ id: newUser.id, role: "user" }, SECRET), user: newUser });
});

app.post("/api/auth/verify-email", auth(), (req, res) => {
    const u = getUser(req.user.id);
    if (u.otp !== req.body.otp || Date.now() > u.otpExp) return err(res, 400, "Mã OTP không đúng hoặc hết hạn");
    u.emailVerified = true; delete u.otp; delete u.otpExp; saveDb();
    res.json({ message: "Verified", user: u });
});

// B. DEVICES (Chặt chẽ quyền sở hữu)
app.get("/api/devices", auth(), (req, res) => {
    const list = db.devices.filter(d => req.user.role === "admin" || d.owner === req.user.id)
        .map(d => ({ ...d, ...rtState[d.id] })); 
    res.json(list);
});

app.post("/api/devices/register", auth(), (req, res) => {
    const { deviceId, name } = req.body;
    if(!deviceId) return err(res, 400, "Thiếu Device ID");
    
    // Kiểm tra nếu device đã được ai đó đăng ký
    const existing = db.devices.find(d => d.id === deviceId);
    if (existing) {
        if(existing.owner === req.user.id) return err(res, 400, "Bạn đã thêm thiết bị này rồi");
        return err(res, 403, "Thiết bị này thuộc về người khác!");
    }

    const dev = { id: deviceId, name, owner: req.user.id, createdAt: new Date() };
    db.devices.push(dev); saveDb();
    res.json(dev);
});

app.post("/api/devices/:id/control", auth(), (req, res) => {
    // Chỉ cho phép điều khiển nếu là Admin hoặc Chủ sở hữu
    const d = db.devices.find(x => x.id === req.params.id);
    if(!d && req.user.role !== 'admin') {
         // Cho phép điều khiển thiết bị ảo (chưa đăng ký) nếu muốn test, hoặc chặn luôn:
         // return err(res, 404, "Device not found");
    }
    if(d && d.owner !== req.user.id && req.user.role !== 'admin') return err(res, 403, "Không có quyền điều khiển");

    const topic = `iot/demo/${req.params.id}/control`;
    client.publish(topic, JSON.stringify({ ...req.body, from: req.user.id }));
    res.json({ ok: true });
});

app.delete("/api/devices/:id", auth(), (req, res) => {
    const idx = db.devices.findIndex(d => d.id === req.params.id && (req.user.role === "admin" || d.owner === req.user.id));
    if (idx === -1) return err(res, 403, "Không tìm thấy hoặc không có quyền xóa");
    db.devices.splice(idx, 1); saveDb();
    res.json({ ok: true });
});

// C. CAMERAS
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

app.post("/api/camera/frame", auth(), (req, res) => {
    const camId = req.query.cameraId || req.headers["x-camera-id"] || req.user.id;
    frames[camId] = req.body;
    res.json({ ok: true });
});

app.get("/api/camera/latest/:id", (req, res) => {
    if (!frames[req.params.id]) return err(res, 404, "No signal");
    res.set("Content-Type", "image/jpeg").send(frames[req.params.id]);
});

// D. PREFS & ADMIN
app.get("/api/me/prefs", auth(), (req, res) => res.json(db.prefs[req.user.id] || { widgets: [] }));
app.put("/api/me/prefs", auth(), (req, res) => {
    db.prefs[req.user.id] = req.body; saveDb();
    res.json({ ok: true });
});

// Chỉ Admin mới gọi được API này (đã dùng middleware auth('admin'))
app.get("/api/admin/users", auth("admin"), (req, res) => res.json(db.users));
app.delete("/api/admin/users/:id", auth("admin"), (req, res) => {
    const uid = parseInt(req.params.id);
    if(uid === req.user.id) return err(res, 400, "Không thể tự xóa chính mình");
    
    db.users = db.users.filter(u => u.id !== uid); saveDb();
    res.json({ ok: true });
});

// ============================================
// --- 5. STATIC FILES (PHẢI NẰM CUỐI CÙNG) ---
// ============================================

const FRONTEND_DIR = path.join(__dirname, "../frontend");

// Phục vụ file tĩnh (css, js, ảnh)
app.use(express.static(FRONTEND_DIR));

// Route "Catch-all"
app.get(/(.*)/, (req, res) => {
    const indexPath = path.join(FRONTEND_DIR, "index.html");
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("Error: Frontend not found on server.");
    }
});

// ===== START =====
app.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`);
});