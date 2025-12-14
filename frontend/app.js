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
    theme: localStorage.getItem("iot_theme") || "dark",
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
const getVal = (w, d) => d ? (d.sensors?.[w.sensorKey] ?? d.lastValue) : 0;

/* =========================================
   2. AUTH & INIT (ĐĂNG NHẬP & KHỞI TẠO)
   ========================================= */
function renderApp() {
    if (S.token) {
        $("#authPage").style.display = "none";
        $("#appPage").style.display = "block";
        $("#userBadge").textContent = `${S.user.username} (${S.user.role})`;
        
        // Chỉ hiện tab Admin nếu là admin
        const adminTab = $("#navAdmin");
        if(adminTab) adminTab.style.display = S.user.role === 'admin' ? 'flex' : 'none';
        
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
    if(res) saveSession(res); else alert("Đăng nhập thất bại");
});
on($("#registerBtn"), "click", async () => {
    const res = await api("/api/auth/register-public", "POST", { 
        username: val("#regUser"), email: val("#regEmail"), password: val("#regPass"), confirmPassword: val("#regPassConfirm") 
    });
    if(res) { saveSession(res); alert("Đăng ký thành công! OTP đã gửi."); }
});
on($("#verifyOtpBtn"), "click", async () => {
    const res = await api("/api/auth/verify-email", "POST", { otp: val("#otpInput") });
    if(res) { saveSession({token: S.token, user: res.user}); alert("Email đã xác thực!"); }
});
on($("#logoutBtn"), "click", logout);
on($("#saveApiBaseBtn"), "click", () => {
    localStorage.setItem("iot_api_base", API_BASE = val("#apiBaseInput"));
    alert("Đã lưu API Base. Reload trang.");
    location.reload();
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
    // Tải song song Widget, Device, Camera
    const [prefs, devs, cams] = await Promise.all([
        api("/api/me/prefs"), 
        api("/api/devices"), 
        api("/api/cameras")
    ]);
    
    if(prefs) {
        S.widgets = prefs.widgets || [];
        // Ưu tiên camera trong prefs, nếu không có thì dùng danh sách gốc
        S.cameras = (prefs.cameras && prefs.cameras.length) ? prefs.cameras : (cams || []);
    }
    if(devs) S.devices = devs;
    
    renderDevices();
    renderCameras();
    renderWidgets();
    fillOptions(); // Điền data vào dropdown config
}

function startAutoRefresh() {
    if(S.timers.auto) clearInterval(S.timers.auto);
    S.timers.auto = setInterval(async () => {
        if(document.hidden || !S.token) return;
        const devs = await api("/api/devices");
        if(devs) { 
            S.devices = devs; 
            // Chỉ render lại widget (để cập nhật giá trị) chứ không render lại toàn bộ DOM tránh lag
            refreshWidgetValues(); 
            renderDevices(); // Update bảng thiết bị
        }
    }, 3000);
}

// Cập nhật giá trị widget mà không vẽ lại HTML (Tối ưu performance)
function refreshWidgetValues() {
    S.widgets.forEach(w => {
        const card = $(`.widget-card[data-id="${w.id}"]`);
        if(!card) return;
        
        const dev = S.devices.find(d => d.id == w.deviceId);
        const val = getVal(w, dev);
        
        // Cập nhật tag status
        const tag = card.querySelector(".widget-tag");
        if(tag) tag.textContent = dev ? dev.lastState : 'NO DATA';

        // Cập nhật giá trị hiển thị (tùy loại widget)
        if(w.type === 'thermo' || w.type === 'gauge') {
            // Thermo/Gauge cần render lại để thanh màu chạy
            card.querySelector(".widget-body").innerHTML = W_HTML[w.type](w, val);
        } else if (w.type === 'slider') {
            // Slider chỉ cần update số, không update input để tránh mất focus khi đang kéo
            const label = card.querySelector("span");
            if(label) label.textContent = val || 0;
        } else if (w.type === 'switch') {
             const btn = card.querySelector(".widget-switch-btn");
             if(btn) {
                 const isOn = val === true || val === 1 || String(val).toLowerCase() === 'on';
                 btn.className = `widget-switch-btn widget-control ${isOn?'on':'off'}`;
                 btn.querySelector(".widget-switch-label").textContent = isOn ? "ON" : "OFF";
             }
        }
    });
}

/* =========================================
   4. DASHBOARD & WIDGETS
   ========================================= */
// Template HTML (Factory Pattern)
const W_HTML = {
    switch: (w, v) => {
        const isOn = v === true || v === 1 || String(v).toLowerCase() === 'on';
        return `<button class="widget-switch-btn ${isOn?'on':'off'}" onclick="ctrl('${w.deviceId}', {command:'toggle'})">
            <span class="widget-switch-track"><span class="widget-switch-thumb"></span></span>
            <span class="widget-switch-label">${isOn?'ON':'OFF'}</span>
        </button>`;
    },
    slider: (w, v) => `<div class="widget-slider-row"><input type="range" min="${w.min}" max="${w.max}" value="${v||0}" onchange="ctrl('${w.deviceId}', {command:'analog', value: Number(this.value)})"><span>${v||0}</span></div>`,
    button: (w) => `<button class="widget-action-btn" onclick="ctrl('${w.deviceId}', {command:'${w.sensorKey||'btn'}', action:'press'})"><span class="widget-action-dot"></span><span>${w.label||'PRESS'}</span></button>`,
    thermo: (w, v) => {
        const pct = Math.min(((v||0)/w.max)*100, 100);
        return `<div class="widget-thermo" style="--thermo-level:${pct}%"><div class="thermo-icon"><div class="thermo-mercury"></div><div class="thermo-bulb"></div></div><div class="widget-value-big">${v||0}°C</div></div>`;
    },
    gauge: (w, v) => {
        const pct = Math.min(((v||0)/w.max)*100, 100);
        return `<div class="widget-value-big">${v||0}</div><div class="widget-gauge-bar"><div class="widget-gauge-fill" style="width:${pct}%"></div></div>`;
    },
    dpad: (w) => `<div class="widget-dpad"><div class="widget-dpad-row"><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'up'})">↑</button></div><div class="widget-dpad-row"><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'left'})">←</button><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'center'})">⏺</button><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'right'})">→</button></div><div class="widget-dpad-row"><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'down'})">↓</button></div></div>`,
    camera: (w) => `<img src="${S.cameras.find(c=>c.id==w.cameraId)?.snapshotUrl || ''}" style="width:100%;height:140px;object-fit:cover;border-radius:8px;">`
};

function renderWidgets() {
    const grid = $("#widgetGrid");
    // Nếu đang edit mode thì vẽ lại toàn bộ, nếu không thì chỉ vẽ lần đầu hoặc khi đổi cấu trúc
    // Ở đây vẽ lại luôn cho đơn giản
    grid.innerHTML = S.widgets.map(w => {
        const dev = S.devices.find(d => d.id == w.deviceId);
        const val = getVal(w, dev);
        
        return `
        <div class="widget-card widget-size-${w.size} widget-theme-${w.theme}" 
             style="grid-column: ${w.x} / span ${getColSpan(w.size)}; grid-row: ${w.y} / span ${w.type==='camera'?4:2}"
             data-id="${w.id}">
            <div class="widget-header">
                <span class="widget-title">${w.label || w.type} ${dev ? '· '+dev.id : ''}</span>
                <div style="display:flex; gap:4px">
                    <span class="widget-tag">${dev?.lastState || (w.type==='camera'?'CAM':'--')}</span>
                    <button class="icon-btn btn-sm widget-drag-handle" title="Drag">⠿</button>
                    <button class="icon-btn btn-sm" onclick="editWidget('${w.id}')">⚙</button>
                    <button class="icon-btn btn-sm" onclick="delWidget('${w.id}')">✕</button>
                </div>
            </div>
            <div class="widget-body">
                ${W_HTML[w.type] ? W_HTML[w.type](w, val) : 'Unknown'}
            </div>
        </div>`;
    }).join("");

    if(S.editMode) {
        // Gắn sự kiện kéo thả cho icon handle
        $$(".widget-drag-handle").forEach(h => h.onmousedown = (e) => initDrag(e, h.closest(".widget-card")));
    }
}

/* ==== 5. EDIT MODE & DRAG DROP ==== */
on($("#dashModeBtn"), "click", () => {
    S.editMode = !S.editMode;
    $("#dashModeBtn").textContent = S.editMode ? "Run Mode" : "Edit Mode";
    $("#widgetGrid").classList.toggle("widgets-edit", S.editMode);
    // Khi bật edit mode thì render lại để hiện nút drag
    renderWidgets();
});

function initDrag(e, card) {
    e.preventDefault();
    const w = S.widgets.find(x => x.id == card.dataset.id);
    if(!w) return;

    const move = (ev) => {
        const gridRect = $("#widgetGrid").getBoundingClientRect();
        const colWidth = gridRect.width / 12;
        const rowHeight = 90; // Khớp với CSS grid-auto-rows
        
        let newX = Math.ceil((ev.clientX - gridRect.left) / colWidth);
        let newY = Math.ceil((ev.clientY - gridRect.top) / rowHeight);
        
        // Giới hạn trong lưới
        w.x = Math.max(1, Math.min(12 - getColSpan(w.size) + 1, newX));
        w.y = Math.max(1, newY);
        
        // Vẽ lại ngay lập tức để thấy hiệu ứng
        renderWidgets();
    };
    
    const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        savePrefs(); // Lưu vị trí mới
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
}

// Widget CRUD
$$(".widget-type-btn").forEach(btn => on(btn, "click", () => {
    const type = btn.dataset.type;
    const w = { id: "w"+Date.now(), type, label: type.toUpperCase(), theme: "green", size: "m", x: 1, y: 1 };
    if(type === 'slider' || type === 'gauge' || type === 'thermo') { w.min=0; w.max=100; }
    if(type === 'camera') w.size = 'l';
    S.widgets.push(w);
    savePrefs();
    renderWidgets();
    // Đóng menu palette nếu cần
    $("#widgetPaletteMenu").classList.remove("open");
}));

on($("#widgetPaletteToggle"), "click", () => $("#widgetPaletteMenu").classList.toggle("open"));

// Window Functions (Global) để HTML gọi được
window.delWidget = (id) => { if(confirm("Xóa widget?")) { S.widgets = S.widgets.filter(w=>w.id!==id); savePrefs(); renderWidgets(); } };
window.editWidget = (id) => {
    S.selW = S.widgets.find(w=>w.id===id);
    if(!S.selW) return;
    $("#widgetConfigOverlay").classList.add("open");
    $("#widgetConfigPanel").classList.add("has-selection");
    
    // Fill data cũ
    if($("#widgetConfigTitle")) $("#widgetConfigTitle").value = S.selW.label;
    if($("#widgetConfigDevice")) $("#widgetConfigDevice").value = S.selW.deviceId || "";
    if($("#widgetConfigCamera")) $("#widgetConfigCamera").value = S.selW.cameraId || "";
    if($("#widgetConfigSensor")) $("#widgetConfigSensor").value = S.selW.sensorKey || "";
    if($("#widgetConfigTheme")) $("#widgetConfigTheme").value = S.selW.theme || "green";
    if($("#widgetConfigSize")) $("#widgetConfigSize").value = S.selW.size || "m";
    
    // Hiển thị range nếu cần
    const rangeRow = $("#widgetConfigRangeRow");
    if(rangeRow) rangeRow.style.display = (S.selW.type==='slider' || S.selW.type==='gauge' || S.selW.type==='thermo') ? 'flex' : 'none';
    if($("#widgetConfigRangeMin")) $("#widgetConfigRangeMin").value = S.selW.min || 0;
    if($("#widgetConfigRangeMax")) $("#widgetConfigRangeMax").value = S.selW.max || 100;
};

// Config Events
on($("#widgetConfigCloseBtn"), "click", () => $("#widgetConfigOverlay").classList.remove("open"));
["Title", "Device", "Camera", "Sensor", "Theme", "Size"].forEach(k => {
    const el = $("#widgetConfig"+k);
    if(el) on(el, "change", () => {
        if(S.selW) { 
            S.selW[k === 'Title' ? 'label' : k === 'Sensor' ? 'sensorKey' : k === 'Device' ? 'deviceId' : k === 'Camera' ? 'cameraId' : k.toLowerCase()] = el.value;
            savePrefs(); renderWidgets();
        }
    });
});
// Riêng range min/max
["Min", "Max"].forEach(k => {
    const el = $("#widgetConfigRange"+k);
    if(el) on(el, "input", () => { if(S.selW) { S.selW[k.toLowerCase()] = parseFloat(el.value); savePrefs(); renderWidgets(); } });
});

async function savePrefs() {
    await api("/api/me/prefs", "PUT", { widgets: S.widgets, cameras: S.cameras });
}

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
            <td>${d.id}</td>
            <td>${d.name||''}</td>
            <td><span class="badge ${d.lastState==='ONLINE'?'badge-online':'badge-offline'}">${d.lastState}</span></td>
            <td>${typeof d.lastValue === 'object' ? JSON.stringify(d.lastValue) : (d.lastValue ?? JSON.stringify(d.sensors||{}))}</td>
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
    
    // Điền sẵn vào Firmware Gen
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
    api("/api/cameras/register", "POST", { cameraId: newCam.id, name: newCam.name }).then(() => {
        S.cameras.push(newCam); 
        savePrefs(); loadAllData();
    });
});
window.delCam = (id) => { if(confirm("Xóa camera?")) { S.cameras = S.cameras.filter(c => c.id !== id); savePrefs(); loadAllData(); } };

window.showCamDetail = (id) => {
    const c = S.cameras.find(x => x.id == id);
    $("#detailEmpty").style.display="none"; 
    $("#deviceDetailPanel").style.display="none"; 
    $("#cameraDetailPanel").style.display="block";
    $("#camDetailId").textContent = c.id; 
    $("#camDetailUrl").textContent = c.snapshotUrl;
    if(c.snapshotUrl) $("#camDetailImg").src = c.snapshotUrl;
};

// Logic Stream Camera Laptop
on($("#startStreamBtn"), "click", async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const video = $("#localVideo");
        video.srcObject = stream;
        $("#camStreamStatus").textContent = "Đang stream...";
        
        S.timers.stream = setInterval(() => {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth; 
            canvas.height = video.videoHeight;
            canvas.getContext("2d").drawImage(video, 0, 0);
            canvas.toBlob(blob => fetch(`${API_BASE}/api/camera/frame`, { 
                method: "POST", headers: { Authorization: "Bearer "+S.token }, body: blob 
            }), "image/jpeg", 0.6);
        }, 300); // Gửi 3 khung hình/giây
        
        // Tự xem lại chính mình từ server
        S.timers.pull = setInterval(() => {
            $("#serverVideo").src = `${API_BASE}/api/camera/latest/${S.user.id}?t=${Date.now()}`;
        }, 300);
        
        $("#startStreamBtn").disabled = true; $("#stopStreamBtn").disabled = false;
    } catch(e) { alert("Lỗi camera: " + e.message); }
});

on($("#stopStreamBtn"), "click", () => {
    clearInterval(S.timers.stream); clearInterval(S.timers.pull);
    const vid = $("#localVideo");
    if(vid.srcObject) vid.srcObject.getTracks().forEach(t=>t.stop());
    vid.srcObject = null;
    $("#camStreamStatus").textContent = "Đã dừng.";
    $("#startStreamBtn").disabled = false; $("#stopStreamBtn").disabled = true;
});

/* =========================================
   8. FIRMWARE GENERATOR (C++ Code)
   ========================================= */
// Logic thêm dòng Pin
if($("#fwAddPinBtn")) on($("#fwAddPinBtn"), "click", () => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><input class="fw-pin-name" placeholder="Name"></td><td><input class="fw-pin-gpio" placeholder="GPIO"></td>
    <td><select class="fw-pin-mode"><option value="output">Output</option><option value="input">In Dig</option><option value="input-analog">In Ana</option></select></td>
    <td><button type="button" class="danger btn-sm" onclick="this.closest('tr').remove()">X</button></td>`;
    $("#fwPinsTableBody").appendChild(tr);
});

// Logic tạo code
on($("#fwGenerateBtn"), "click", () => {
    const devId = val("#fwDeviceId") || "my-device";
    const ssid = val("#fwWifiSsid") || "WIFI_SSID";
    const pass = val("#fwWifiPass") || "WIFI_PASS";
    const mqtt = val("#fwMqttHost") || "broker.hivemq.com";
    
    // Thu thập Pin
    const pins = Array.from($$("#fwPinsTableBody tr")).map(tr => ({
        name: tr.querySelector(".fw-pin-name").value,
        gpio: tr.querySelector(".fw-pin-gpio").value,
        mode: tr.querySelector(".fw-pin-mode").value
    })).filter(p => p.name && p.gpio);

    // Template C++
    let code = `// ESP32 Firmware for ${devId}
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "${ssid}";
const char* WIFI_PASS = "${pass}";
const char* MQTT_SERVER = "${mqtt}";
const int MQTT_PORT = 1883;
String DEVICE_ID = "${devId}";

WiFiClient espClient;
PubSubClient client(espClient);

// Defines
${pins.map(p => `const int PIN_${p.name.toUpperCase()} = ${p.gpio}; // ${p.mode}`).join('\n')}

void setup() {
  Serial.begin(115200);
  // Pin Modes
${pins.map(p => `  pinMode(PIN_${p.name.toUpperCase()}, ${p.mode==='output'?'OUTPUT':p.mode==='input-analog'?'INPUT':'INPUT_PULLUP'});`).join('\n')}
  
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  
  client.setServer(MQTT_SERVER, MQTT_PORT);
  client.setCallback(callback);
}

void callback(char* topic, byte* payload, unsigned int length) {
  String msg; for (int i=0;i<length;i++) msg += (char)payload[i];
  if (msg.indexOf("toggle") >= 0) {
    // Ví dụ toggle pin đầu tiên
    ${pins.length ? `digitalWrite(PIN_${pins[0].name.toUpperCase()}, !digitalRead(PIN_${pins[0].name.toUpperCase()}));` : '// No output pins'}
  }
}

void reconnect() {
  while (!client.connected()) {
    if (client.connect(("ESP32_"+DEVICE_ID).c_str())) {
      client.subscribe(("iot/demo/"+DEVICE_ID+"/control").c_str());
    } else delay(5000);
  }
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();
  
  // Gửi data cảm biến mỗi 2s
  static unsigned long last = 0;
  if (millis() - last > 2000) {
    last = millis();
    StaticJsonDocument<256> doc;
    doc["state"] = "ONLINE";
    JsonObject sensors = doc.createNestedObject("sensors");
${pins.filter(p=>p.mode.includes('input')).map(p => `    sensors["${p.name}"] = ${p.mode==='input-analog'?'analogRead':'digitalRead'}(PIN_${p.name.toUpperCase()});`).join('\n')}
    String out; serializeJson(doc, out);
    client.publish(("iot/demo/"+DEVICE_ID+"/state").c_str(), out.c_str());
  }
}
`;
    $("#fwCodeOutput").value = code;
});
on($("#fwCopyBtn"), "click", () => { 
    navigator.clipboard.writeText($("#fwCodeOutput").value); 
    $("#fwCopyStatus").textContent = "Đã copy!"; 
});

/* =========================================
   9. ADMIN & TABS & THEME
   ========================================= */
const tabs = ["dashboard", "devices", "cameras", "admin"];
$$(".nav-item").forEach(btn => on(btn, "click", () => {
    const t = btn.dataset.tab;
    if(t === 'admin' && S.user.role !== 'admin') return alert("Chỉ Admin mới được vào!");
    
    // Switch UI
    tabs.forEach(x => {
        $(`#${x}Section`).style.display = x === t ? "block" : "none";
        const nav = $(`.nav-item[data-tab="${x}"]`);
        if(nav) {
            if(x === t) nav.classList.add("active"); else nav.classList.remove("active");
        }
    });
    
    if(t === 'admin') loadAdmin();
    else if(t === 'dashboard') renderWidgets();
    else loadAllData();
}));

async function loadAdmin() {
    const users = await api("/api/admin/users");
    const tbody = $("#adminUserTableBody");
    if(users && tbody) {
        tbody.innerHTML = users.map(u => `
        <tr><td>${u.id}</td><td>${u.username}</td><td>${u.role}</td>
        <td><button class="danger btn-sm" onclick="admDel('${u.id}')">Xóa</button></td></tr>
    `).join("");
    }
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

// SideNav Toggle
on($("#sideNavToggle"), "click", () => $("#sideNav").classList.toggle("collapsed"));

/* ==== START ==== */
renderApp();