/* =========================================
   1. CONFIG & UTILS (CẤU HÌNH & TIỆN ÍCH)
   ========================================= */
const API_BASE_DEFAULT = window.location.origin;
let API_BASE = localStorage.getItem("iot_api_base") || API_BASE_DEFAULT;

// Hàm chọn DOM nhanh
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const val = (s) => $(s)?.value.trim();
const on = (el, evt, fn) => el && el.addEventListener(evt, fn);

// State (Trạng thái) toàn cục
const S = {
    token: localStorage.getItem("iot_token"),
    user: JSON.parse(localStorage.getItem("iot_user") || "null"),
    devices: [], cameras: [], widgets: [], 
    theme: localStorage.getItem("iot_theme") || "light", // Mặc định Light cho đẹp
    editMode: false,
    selW: null, // Widget đang được chọn để sửa
    timers: { auto: null, stream: null, pull: null }
};

// API Call Helper (Tự động gắn Token)
async function api(path, method = "GET", body = null) {
    const headers = { "Content-Type": "application/json" };
    if (S.token) headers.Authorization = "Bearer " + S.token;
    try {
        const res = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : null });
        const data = await res.json();
        if (!res.ok) { 
            if(res.status === 401) logout(); 
            throw data.error || res.status; 
        }
        return data;
    } catch (e) { 
        console.error("API Error:", e); 
        return null; 
    }
}

// Helper tính toán giao diện
const getColSpan = (s) => s === 's' ? 3 : s === 'l' ? 6 : 4; 

// --- LOGIC CÔNG THỨC (QUAN TRỌNG: Xử lý LM35, I2C tại đây) ---
const getVal = (w, d) => {
    if (!d) return 0;
    // 1. Lấy giá trị thô (Raw) từ ESP32 gửi lên
    let raw = d.sensors?.[w.sensorKey] ?? d.lastValue ?? 0;
    
    // 2. Nếu người dùng có nhập công thức, tính toán ngay tại trình duyệt
    if (w.formula && w.formula.trim() !== "") {
        try {
            // x là biến đại diện cho giá trị raw
            const calc = new Function('x', `return ${w.formula}`);
            return parseFloat(calc(raw)).toFixed(2);
        } catch (e) {
            return raw; 
        }
    }
    return raw;
};

/* =========================================
   2. AUTH & INIT (ĐĂNG NHẬP & KHỞI TẠO)
   ========================================= */
function renderApp() {
    if (S.token) {
        $("#authPage").style.display = "none";
        $("#appPage").style.display = "block";
        $("#userBadge").textContent = `${S.user.username}`;
        
        // --- BẢO MẬT GIAO DIỆN ---
        // Ẩn tab Admin nếu không phải admin
        const adminTab = $("#navAdmin");
        const adminSection = $("#adminSection");
        if (S.user.role !== 'admin') {
            if(adminTab) adminTab.style.display = 'none';
            if(adminSection) adminSection.style.display = 'none';
        } else {
            if(adminTab) adminTab.style.display = 'flex';
        }
        
        loadAllData();
        startAutoRefresh();
    } else {
        $("#authPage").style.display = "flex";
        $("#appPage").style.display = "none";
    }
    document.body.setAttribute("data-theme", S.theme);
    updateThemeToggles();
}

// Sự kiện Auth
on($("#loginBtn"), "click", async () => {
    const res = await api("/api/auth/login", "POST", { username: val("#loginUser"), password: val("#loginPass") });
    if(res) saveSession(res); else alert("Sai tài khoản hoặc mật khẩu");
});
on($("#registerBtn"), "click", async () => {
    const res = await api("/api/auth/register-public", "POST", { 
        username: val("#regUser"), email: val("#regEmail"), password: val("#regPass"), confirmPassword: val("#regPassConfirm") 
    });
    if(res) { saveSession(res); alert("Đăng ký thành công! Đã tự động đăng nhập."); }
});
on($("#verifyOtpBtn"), "click", async () => {
    const res = await api("/api/auth/verify-email", "POST", { otp: val("#otpInput") });
    if(res) { saveSession({token: S.token, user: res.user}); alert("Email đã xác thực!"); }
});
on($("#logoutBtn"), "click", logout);
on($("#saveApiBaseBtn"), "click", () => {
    localStorage.setItem("iot_api_base", API_BASE = val("#apiBaseInput"));
    alert("Đã lưu. Reload trang."); location.reload();
});
on($("#toggleApiBaseBtn"), "click", () => {
    const row = $("#apiBaseRow");
    row.style.display = row.style.display === "none" ? "flex" : "none";
});

function saveSession(data) {
    if(data.token) localStorage.setItem("iot_token", S.token = data.token);
    if(data.user) localStorage.setItem("iot_user", JSON.stringify(S.user = data.user));
    renderApp();
}
function logout() { localStorage.clear(); location.reload(); }

/* =========================================
   3. DATA LOADING (TẢI DỮ LIỆU)
   ========================================= */
async function loadAllData() {
    const [prefs, devs, cams] = await Promise.all([
        api("/api/me/prefs"), 
        api("/api/devices"), 
        api("/api/cameras")
    ]);
    if(prefs) {
        S.widgets = prefs.widgets || [];
        S.cameras = (prefs.cameras && prefs.cameras.length) ? prefs.cameras : (cams || []);
    }
    if(devs) S.devices = devs;
    renderDevices(); renderCameras(); renderWidgets(); fillOptions();
}

function startAutoRefresh() {
    if(S.timers.auto) clearInterval(S.timers.auto);
    S.timers.auto = setInterval(async () => {
        if(document.hidden || !S.token) return;
        const devs = await api("/api/devices");
        if(devs) { 
            S.devices = devs; 
            refreshWidgetValues(); 
            renderDevices(); 
        }
    }, 3000);
}

// Cập nhật giá trị (Không render lại HTML để tối ưu)
function refreshWidgetValues() {
    S.widgets.forEach(w => {
        const card = $(`.widget-card[data-id="${w.id}"]`);
        if(!card) return;
        
        const dev = S.devices.find(d => d.id == w.deviceId);
        const val = getVal(w, dev);
        
        const tag = card.querySelector(".widget-tag");
        if(tag) tag.textContent = dev ? dev.lastState : '--';

        if(w.type === 'switch') {
             const btn = card.querySelector(".widget-switch-btn");
             if(btn) {
                 const isOn = val === true || val === 1 || String(val).toLowerCase() === 'on';
                 if(isOn) btn.classList.add('on'); else btn.classList.remove('on');
             }
        } else if (w.type === 'slider') {
            const span = card.querySelector(".widget-slider-row span");
            if(span) span.textContent = val || 0;
        } else if (w.type === 'thermo' || w.type === 'gauge') {
            card.querySelector(".widget-body").innerHTML = W_HTML[w.type](w, val);
        }
    });
}

/* =========================================
   4. DASHBOARD & WIDGETS (GIAO DIỆN ĐẸP)
   ========================================= */
const W_HTML = {
    // Switch: Nút tròn nổi (Neumorphism)
    switch: (w, v) => {
        const isOn = v === true || v === 1 || String(v).toLowerCase() === 'on';
        return `<button class="widget-switch-btn ${isOn?'on':''}" onclick="ctrl('${w.deviceId}', {command:'toggle'})">
            <span style="font-size:24px; color:${isOn?'var(--accent)':'inherit'}">⏻</span>
        </button>`;
    },
    // Slider
    slider: (w, v) => `<div class="widget-slider-row"><input type="range" min="${w.min}" max="${w.max}" value="${v||0}" onchange="ctrl('${w.deviceId}', {command:'analog', value: Number(this.value)})"><span style="font-weight:bold">${v||0}</span></div>`,
    // Button: Nút nhấn nhả
    button: (w) => `<button class="widget-action-btn" onmousedown="ctrl('${w.deviceId}', {command:'${w.sensorKey||'btn'}', action:'press'})"><span class="widget-action-dot"></span><span>PRESS</span></button>`,
    // Thermo: Chữ to
    thermo: (w, v) => `<div class="widget-value-big" style="color:var(--danger)">${v||0}°C</div>`,
    // Gauge: Chữ to
    gauge: (w, v) => `<div class="widget-value-big" style="color:var(--accent-2)">${v||0}</div>`,
    // Dpad
    dpad: (w) => `<div class="widget-dpad"><div class="widget-dpad-row"><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'up'})">↑</button></div><div class="widget-dpad-row"><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'left'})">←</button><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'center'})">⏺</button><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'right'})">→</button></div><div class="widget-dpad-row"><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'down'})">↓</button></div></div>`,
    // Camera
    camera: (w) => `<img src="${S.cameras.find(c=>c.id==w.cameraId)?.snapshotUrl || ''}" class="cam-preview" style="height:90px; object-fit:cover;">`
};

function renderWidgets() {
    const grid = $("#widgetGrid");
    grid.innerHTML = S.widgets.map(w => {
        const dev = S.devices.find(d => d.id == w.deviceId);
        const val = getVal(w, dev);
        
        return `
        <div class="widget-card widget-size-${w.size} widget-theme-${w.theme}" 
             style="grid-column: span ${getColSpan(w.size)}; grid-row: span ${w.type==='camera'?4:2}"
             data-id="${w.id}">
            <div class="widget-header">
                <span class="widget-title">${w.label || w.type}</span>
                <div style="display:flex; gap:4px">
                    <span class="widget-tag">${dev?.lastState || '--'}</span>
                    ${S.editMode ? `
                    <button class="icon-btn btn-sm widget-drag-handle" title="Drag">⠿</button>
                    <button class="icon-btn btn-sm" onclick="editWidget('${w.id}')">⚙</button>
                    <button class="icon-btn btn-sm" onclick="delWidget('${w.id}')" style="color:var(--danger)">✕</button>
                    ` : ''}
                </div>
            </div>
            <div class="widget-body">
                ${W_HTML[w.type] ? W_HTML[w.type](w, val) : 'Unknown'}
            </div>
        </div>`;
    }).join("");

    if(S.editMode) {
        $$(".widget-drag-handle").forEach(h => h.onmousedown = (e) => initDrag(e, h.closest(".widget-card")));
    }
}

/* ==== 5. EDIT MODE & DRAG DROP ==== */
on($("#dashModeBtn"), "click", () => {
    S.editMode = !S.editMode;
    $("#dashModeBtn").textContent = S.editMode ? "Done" : "Edit Mode";
    $("#widgetGrid").classList.toggle("widgets-edit", S.editMode);
    renderWidgets();
});

function initDrag(e, card) {
    e.preventDefault();
    const w = S.widgets.find(x => x.id == card.dataset.id);
    if(!w) return;
    const move = (ev) => {
        const gridRect = $("#widgetGrid").getBoundingClientRect();
        const colWidth = gridRect.width / 12;
        const rowHeight = 90; 
        let newX = Math.ceil((ev.clientX - gridRect.left) / colWidth);
        // Giới hạn lưới
        w.x = Math.max(1, Math.min(12 - getColSpan(w.size) + 1, newX));
        renderWidgets();
    };
    const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        savePrefs();
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
}

// Widget CRUD
$$(".widget-type-btn").forEach(btn => on(btn, "click", () => {
    const type = btn.dataset.type;
    const w = { id: "w"+Date.now(), type, label: type.toUpperCase(), theme: "green", size: "m", x: 1, y: 1 };
    if(['slider','gauge','thermo'].includes(type)) { w.min=0; w.max=100; }
    if(type === 'camera') w.size = 'l';
    S.widgets.push(w); savePrefs(); renderWidgets();
    $("#widgetPaletteMenu").classList.remove("open");
}));
on($("#widgetPaletteToggle"), "click", () => $("#widgetPaletteMenu").classList.toggle("open"));

window.delWidget = (id) => { if(confirm("Xóa?")) { S.widgets = S.widgets.filter(w=>w.id!==id); savePrefs(); renderWidgets(); } };

// Sửa Widget (Bao gồm điền Formula)
window.editWidget = (id) => {
    S.selW = S.widgets.find(w=>w.id===id);
    if(!S.selW) return;
    $("#widgetConfigOverlay").classList.add("open");
    $("#widgetConfigPanel").classList.add("has-selection");
    
    if($("#widgetConfigTitle")) $("#widgetConfigTitle").value = S.selW.label;
    if($("#widgetConfigDevice")) $("#widgetConfigDevice").value = S.selW.deviceId || "";
    if($("#widgetConfigCamera")) $("#widgetConfigCamera").value = S.selW.cameraId || "";
    if($("#widgetConfigSensor")) $("#widgetConfigSensor").value = S.selW.sensorKey || "";
    
    // --- ĐIỀN FORMULA ---
    if($("#widgetConfigFormula")) $("#widgetConfigFormula").value = S.selW.formula || "";
    
    // Range
    const rangeRow = $("#widgetConfigRangeRow");
    if(rangeRow) rangeRow.style.display = ['slider','gauge','thermo'].includes(S.selW.type) ? 'flex' : 'none';
};

// Lưu Config (Map thêm Formula)
on($("#widgetConfigCloseBtn"), "click", () => $("#widgetConfigOverlay").classList.remove("open"));
["Title", "Device", "Camera", "Sensor", "Formula", "Theme", "Size"].forEach(k => {
    const el = $("#widgetConfig"+k);
    if(el) on(el, "change", () => {
        if(S.selW) { 
            const prop = k === 'Title' ? 'label' : k === 'Sensor' ? 'sensorKey' : k === 'Device' ? 'deviceId' : k === 'Camera' ? 'cameraId' : k === 'Formula' ? 'formula' : k.toLowerCase();
            S.selW[prop] = el.value;
            savePrefs(); renderWidgets();
        }
    });
});
["Min", "Max"].forEach(k => {
    const el = $("#widgetConfigRange"+k);
    if(el) on(el, "input", () => { if(S.selW) { S.selW[k.toLowerCase()] = parseFloat(el.value); savePrefs(); renderWidgets(); } });
});

async function savePrefs() { await api("/api/me/prefs", "PUT", { widgets: S.widgets, cameras: S.cameras }); }
function fillOptions() {
    const devOpts = `<option value="">-- Chọn Device --</option>` + S.devices.map(d => `<option value="${d.id}">${d.name||d.id}</option>`).join("");
    const camOpts = `<option value="">-- Chọn Camera --</option>` + S.cameras.map(c => `<option value="${c.id}">${c.name||c.id}</option>`).join("");
    if($("#widgetConfigDevice")) $("#widgetConfigDevice").innerHTML = devOpts;
    if($("#widgetConfigCamera")) $("#widgetConfigCamera").innerHTML = camOpts;
}

/* =========================================
   6. DEVICES & CONTROL
   ========================================= */
function renderDevices() {
    const tbody = $("#deviceTableBody");
    if(!tbody) return;
    const html = S.devices.map(d => `
        <tr onclick="showDetail('${d.id}')">
            <td>${d.id}</td><td>${d.name||''}</td>
            <td><span class="badge ${d.lastState==='ONLINE'?'badge-online':'badge-offline'}">${d.lastState}</span></td>
            <td>${JSON.stringify(d.sensors || d.lastValue || {})}</td>
            <td>${d.updatedAt ? new Date(d.updatedAt).toLocaleTimeString() : '-'}</td>
            <td>
                <button class="secondary btn-sm" onclick="event.stopPropagation(); ctrl('${d.id}', {command:'toggle'})">Toggle</button>
                <button class="danger btn-sm" onclick="event.stopPropagation(); delDev('${d.id}')">Xóa</button>
            </td>
        </tr>`).join("");
    tbody.innerHTML = html || `<tr><td colspan="6" class="small">Chưa có thiết bị.</td></tr>`;
}

window.ctrl = (id, payload) => api(`/api/devices/${id}/control`, "POST", payload);
window.delDev = (id) => confirm(`Xóa thiết bị ${id}?`) && api(`/api/devices/${id}`, "DELETE").then(loadAllData);
on($("#claimBtn"), "click", () => api("/api/devices/register", "POST", { deviceId: val("#claimDeviceId"), name: val("#claimDeviceName") }).then(loadAllData));
on($("#refreshBtn"), "click", loadAllData);

window.showDetail = (id) => {
    const d = S.devices.find(x => x.id == id); if(!d) return;
    $("#detailEmpty").style.display="none"; 
    $("#cameraDetailPanel").style.display="none"; 
    $("#deviceDetailPanel").style.display="block";
    $("#detailId").textContent = d.id; 
    $("#detailName").textContent = d.name; 
    $("#detailState").textContent = d.lastState;
    $("#detailValue").textContent = d.lastValue ?? "--";
    $("#detailSensors").textContent = JSON.stringify(d.sensors || {});
    // Auto fill for firmware gen
    if($("#fwDeviceId")) $("#fwDeviceId").value = d.id;
    if($("#fwDeviceName")) $("#fwDeviceName").value = d.name;
};

/* =========================================
   7. CAMERA & STREAMING
   ========================================= */
function renderCameras() {
    const tbody = $("#cameraTableBody");
    if(!tbody) return;
    tbody.innerHTML = S.cameras.map(c => `
        <tr onclick="showCamDetail('${c.id}')">
            <td>${c.id}</td><td>${c.name}</td>
            <td><button class="danger btn-sm" onclick="event.stopPropagation(); delCam('${c.id}')">Xóa</button></td>
        </tr>`).join("") || `<tr><td colspan="3" class="small">Chưa có camera.</td></tr>`;
}
on($("#camRegisterBtn"), "click", () => {
    const newCam = { id: val("#camIdInput"), name: val("#camNameInput"), snapshotUrl: val("#camUrlInput") };
    api("/api/cameras/register", "POST", { cameraId: newCam.id, name: newCam.name }).then(() => { S.cameras.push(newCam); savePrefs(); loadAllData(); });
});
window.delCam = (id) => { if(confirm("Xóa?")) { S.cameras = S.cameras.filter(c => c.id !== id); savePrefs(); loadAllData(); } };
window.showCamDetail = (id) => {
    const c = S.cameras.find(x => x.id == id);
    $("#detailEmpty").style.display="none"; $("#deviceDetailPanel").style.display="none"; $("#cameraDetailPanel").style.display="block";
    $("#camDetailId").textContent = c.id; $("#camDetailUrl").textContent = c.snapshotUrl;
    if(c.snapshotUrl) $("#camDetailImg").src = c.snapshotUrl;
};
on($("#startStreamBtn"), "click", async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        $("#localVideo").srcObject = stream;
        S.timers.stream = setInterval(() => {
            const cvs = document.createElement("canvas"); cvs.width = $("#localVideo").videoWidth; cvs.height = $("#localVideo").videoHeight;
            cvs.getContext("2d").drawImage($("#localVideo"), 0, 0);
            cvs.toBlob(b => fetch(`${API_BASE}/api/camera/frame`, { method: "POST", headers: { Authorization: "Bearer "+S.token }, body: b }), "image/jpeg", 0.5);
        }, 500);
        S.timers.pull = setInterval(() => { $("#serverVideo").src = `${API_BASE}/api/camera/latest/${S.user.id}?t=${Date.now()}`; }, 500);
        $("#startStreamBtn").disabled = true; $("#stopStreamBtn").disabled = false;
    } catch(e) { alert(e.message); }
});
on($("#stopStreamBtn"), "click", () => {
    clearInterval(S.timers.stream); clearInterval(S.timers.pull);
    $("#localVideo").srcObject?.getTracks().forEach(t=>t.stop());
    $("#startStreamBtn").disabled = false; $("#stopStreamBtn").disabled = true;
});

/* =========================================
   8. FIRMWARE GENERATOR (SỬA LỖI ĐÚNG MẪU BẠN GỬI)
   ========================================= */
if($("#fwAddPinBtn")) on($("#fwAddPinBtn"), "click", () => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><input class="fw-pin-name" placeholder="Name"></td><td><input class="fw-pin-gpio" placeholder="GPIO"></td>
    <td><select class="fw-pin-mode"><option value="output">Output</option><option value="input">In Dig</option><option value="input-analog">In Ana</option></select></td>
    <td><button type="button" class="danger btn-sm" onclick="this.closest('tr').remove()">X</button></td>`;
    $("#fwPinsTableBody").appendChild(tr);
});

on($("#fwGenerateBtn"), "click", () => {
    const devId = val("#fwDeviceId") || "ESP-1";
    const devName = val("#fwDeviceName") || "device";
    const wifi = val("#fwWifiSsid") || "WIFI_SSID";
    const pass = val("#fwWifiPass") || "WIFI_PASS";
    const mqtt = val("#fwMqttHost") || "broker.hivemq.com";
    
    // Lấy list pin từ bảng
    const pins = Array.from($$("#fwPinsTableBody tr")).map((tr, idx) => ({
        idx: idx,
        name: tr.querySelector(".fw-pin-name").value || `PIN_${idx}`,
        gpio: tr.querySelector(".fw-pin-gpio").value,
        mode: tr.querySelector(".fw-pin-mode").value
    })).filter(p => p.gpio);

    // Tạo chuỗi code đúng chuẩn bạn yêu cầu
    let code = `// ESP32 firmware generated by your IoT Platform
// Board: ESP32 (Arduino core)
// Thư viện: PubSubClient, ArduinoJson

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "${wifi}";
const char* WIFI_PASS = "${pass}";

const char* MQTT_HOST = "${mqtt}";
const int   MQTT_PORT = 1883;

String deviceId = "${devId}";
String deviceName = "${devName}";

// Defines
${pins.map(p => `const int ${p.mode==='output' ? 'OUTPUT' : 'INPUT'}_PIN_${p.idx} = ${p.gpio}; // ${p.name}`).join('\n')}

WiFiClient espClient;
PubSubClient client(espClient);

void callback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }
  Serial.print("Control message: ");
  Serial.println(msg);
  if (msg.indexOf("toggle") >= 0) {
    // Toggle Output Pin 0 (Mặc định ví dụ)
    ${pins.filter(p=>p.mode==='output').length > 0 ? 
      `digitalWrite(OUTPUT_PIN_${pins.filter(p=>p.mode==='output')[0].idx}, !digitalRead(OUTPUT_PIN_${pins.filter(p=>p.mode==='output')[0].idx}));` 
      : '// No output pin defined to toggle'}
  }
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Connecting MQTT...");
    String clientId = "esp32-" + deviceId;
    if (client.connect(clientId.c_str())) {
      Serial.println("connected");
      String controlTopic = "iot/demo/" + deviceId + "/control";
      client.subscribe(controlTopic.c_str());
    } else {
      Serial.print(" failed, rc=");
      Serial.println(client.state());
      delay(2000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Pin Setup
${pins.map(p => `  pinMode(${p.mode==='output'?'OUTPUT':'INPUT'}_PIN_${p.idx}, ${p.mode==='output'?'OUTPUT':'INPUT'});\n  if(${p.mode==='output'}) digitalWrite(${p.mode==='output'?'OUTPUT':'INPUT'}_PIN_${p.idx}, LOW);`).join('\n')}

  Serial.print("Connecting WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("WiFi OK, IP: ");
  Serial.println(WiFi.localIP());

  client.setServer(MQTT_HOST, MQTT_PORT);
  client.setCallback(callback);
}

unsigned long lastPublish = 0;

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long now = millis();
  if (now - lastPublish > 2000) {
    lastPublish = now;

    StaticJsonDocument<512> doc;
    doc["name"] = deviceName;
    doc["state"] = "ONLINE";
    
    // Sensors Data
    JsonObject sensors = doc.createNestedObject("sensors");
${pins.filter(p=>p.mode.includes('input')).map(p => `    sensors["${p.name}"] = ${p.mode==='input-analog'?'analogRead':'digitalRead'}(INPUT_PIN_${p.idx});`).join('\n')}

    String topic = "iot/demo/" + deviceId + "/state";
    String payload;
    serializeJson(doc, payload);
    client.publish(topic.c_str(), payload.c_str());
  }
}
`;
    $("#fwCodeOutput").value = code;
});
on($("#fwCopyBtn"), "click", () => { navigator.clipboard.writeText($("#fwCodeOutput").value); $("#fwCopyStatus").textContent = "Copied!"; });

/* =========================================
   9. ADMIN & TABS & THEME
   ========================================= */
const tabs = ["dashboard", "devices", "cameras", "admin"];
$$(".nav-item").forEach(btn => on(btn, "click", () => {
    const t = btn.dataset.tab;
    // Chặn ngay từ Client nếu cố bấm vào Admin
    if(t === 'admin' && S.user.role !== 'admin') return alert("Access Denied: Chỉ Admin mới được vào!");
    
    tabs.forEach(x => {
        $(`#${x}Section`).style.display = x === t ? "block" : "none";
        const nav = $(`.nav-item[data-tab="${x}"]`);
        if(nav) x === t ? nav.classList.add("active") : nav.classList.remove("active");
    });
    
    if(t === 'admin') loadAdmin(); else if(t === 'dashboard') renderWidgets(); else loadAllData();
}));

async function loadAdmin() {
    const users = await api("/api/admin/users");
    if(users) $("#adminUserTableBody").innerHTML = users.map(u => `
        <tr><td>${u.id}</td><td>${u.username}</td><td>${u.role}</td>
        <td><button class="danger btn-sm" onclick="admDel('${u.id}')">Xóa</button></td></tr>
    `).join("");
}
window.admDel = (id) => confirm('Xóa user?') && api(`/api/admin/users/${id}`, "DELETE").then(loadAdmin);

function setTheme(t) { 
    document.body.setAttribute("data-theme", t); 
    localStorage.setItem("iot_theme", S.theme = t); 
    updateThemeToggles();
}
function updateThemeToggles() {
    const icon = S.theme === "dark" ? "🌙" : "☀️";
    if($("#authThemeToggle")) $("#authThemeToggle").textContent = icon;
    if($("#appThemeToggle")) $("#appThemeToggle").textContent = icon;
}
on($("#authThemeToggle"), "click", () => setTheme(S.theme === 'dark' ? 'light' : 'dark'));
on($("#appThemeToggle"), "click", () => setTheme(S.theme === 'dark' ? 'light' : 'dark'));
on($("#sideNavToggle"), "click", () => $("#sideNav").classList.toggle("collapsed"));

/* ==== START ==== */
renderApp();