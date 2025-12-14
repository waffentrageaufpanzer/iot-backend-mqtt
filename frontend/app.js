/* =========================================
   1. CONFIG & UTILS
   ========================================= */
const API_BASE_DEFAULT = window.location.origin;
let API_BASE = localStorage.getItem("iot_api_base") || API_BASE_DEFAULT;

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const val = (s) => $(s)?.value.trim();
const on = (el, evt, fn) => el && el.addEventListener(evt, fn);

// State toàn cục
const S = {
    token: localStorage.getItem("iot_token"),
    user: JSON.parse(localStorage.getItem("iot_user") || "null"),
    devices: [], cameras: [], widgets: [], 
    theme: localStorage.getItem("iot_theme") || "light", // Default Light cho Neumorphism
    editMode: false,
    selW: null,
    timers: { auto: null, stream: null, pull: null }
};

// API Helper
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
    } catch (e) { console.error("API Error:", e); return null; }
}

/* =========================================
   2. AUTH & UI INIT
   ========================================= */
function renderApp() {
    if (S.token) {
        $("#authPage").classList.add("hidden");
        $("#appPage").classList.remove("hidden");
        $("#userBadge").textContent = `${S.user.username}`;
        
        // Chỉ hiện tab Admin nếu là admin
        if(S.user.role !== 'admin') {
            $("#navAdmin").classList.add("hidden");
            $("#adminSection").classList.add("hidden");
        } else {
            $("#navAdmin").classList.remove("hidden");
        }
        
        loadAllData();
        startAutoRefresh();
    } else {
        $("#authPage").classList.remove("hidden");
        $("#appPage").classList.add("hidden");
    }
    document.body.setAttribute("data-theme", S.theme);
    updateThemeToggles();
}

on($("#loginBtn"), "click", async () => {
    const res = await api("/api/auth/login", "POST", { username: val("#loginUser"), password: val("#loginPass") });
    if(res) saveSession(res); else alert("Sai tài khoản hoặc mật khẩu!");
});
on($("#registerBtn"), "click", async () => {
    const res = await api("/api/auth/register-public", "POST", { 
        username: val("#regUser"), email: val("#regEmail"), password: val("#regPass"), confirmPassword: val("#regPassConfirm") 
    });
    if(res) { saveSession(res); alert("Đăng ký thành công! Đã đăng nhập."); }
});
on($("#verifyOtpBtn"), "click", async () => {
    const res = await api("/api/auth/verify-email", "POST", { otp: val("#otpInput") });
    if(res) { saveSession({token: S.token, user: res.user}); alert("Email đã xác thực!"); }
});
on($("#logoutBtn"), "click", logout);
on($("#saveApiBaseBtn"), "click", () => {
    localStorage.setItem("iot_api_base", API_BASE = val("#apiBaseInput"));
    alert("Đã lưu API Base. Reload trang."); location.reload();
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
   3. DATA LOADING
   ========================================= */
async function loadAllData() {
    const [prefs, devs, cams] = await Promise.all([
        api("/api/me/prefs"), api("/api/devices"), api("/api/cameras")
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

// Cập nhật giá trị widget (Optimized)
function refreshWidgetValues() {
    S.widgets.forEach(w => {
        const card = $(`.widget-card[data-id="${w.id}"]`);
        if(!card) return;
        const dev = S.devices.find(d => d.id == w.deviceId);
        const val = getVal(w, dev);
        
        // Update tag
        const tag = card.querySelector(".widget-header span:first-child");
        if(tag && dev) tag.innerHTML = `${w.label} <small style='opacity:0.6'>(${dev.lastState})</small>`;

        // Update body content
        if(w.type === 'switch') {
            const btn = card.querySelector(".btn-neu");
            if(btn) {
                const isOn = val === true || val === 1 || String(val).toLowerCase() === 'on';
                if(isOn) btn.classList.add('active'); else btn.classList.remove('active');
                const icon = btn.querySelector("span");
                if(icon) icon.style.color = isOn ? "var(--acc)" : "inherit";
            }
        } else if(w.type === 'slider') {
            const span = card.querySelector("span");
            if(span) span.textContent = val || 0;
        } else if(w.type === 'thermo' || w.type === 'gauge') {
            card.querySelector(".widget-body").innerHTML = W_HTML[w.type](w, val);
        }
    });
}

/* =========================================
   4. DASHBOARD & WIDGETS
   ========================================= */
const getColSpan = (s) => s === 's' ? 3 : s === 'l' ? 6 : 4; 
const getVal = (w, d) => d ? (d.sensors?.[w.sensorKey] ?? d.lastValue) : 0;

// Template HTML (Neumorphism Style)
const W_HTML = {
    // Nút tròn nổi 3D
    switch: (w, v) => {
        const isOn = v === true || v === 1 || String(v).toLowerCase() === 'on';
        return `<button class="btn-neu ${isOn?'active':''}" onclick="ctrl('${w.deviceId}', {command:'toggle'})">
            <span style="font-size:24px; color:${isOn?'var(--acc)':'inherit'}">⏻</span>
        </button>`;
    },
    slider: (w, v) => `<div class="widget-slider-row"><input type="range" min="${w.min}" max="${w.max}" value="${v||0}" onchange="ctrl('${w.deviceId}', {command:'analog', value: Number(this.value)})"><span style="font-weight:bold">${v||0}</span></div>`,
    button: (w) => `<button class="btn-neu" onmousedown="ctrl('${w.deviceId}', {command:'${w.sensorKey||'btn'}', action:'press'})" style="font-size:14px">●</button>`,
    thermo: (w, v) => `<div class="widget-value-big" style="color:var(--danger)">${v||0}°C</div>`,
    gauge: (w, v) => `<div class="widget-value-big" style="color:var(--acc2)">${v||0}</div>`,
    dpad: (w) => `<div class="widget-dpad"><div class="widget-dpad-row"><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'up'})">↑</button></div><div class="widget-dpad-row"><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'left'})">←</button><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'center'})">⏺</button><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'right'})">→</button></div><div class="widget-dpad-row"><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'down'})">↓</button></div></div>`,
    camera: (w) => `<img src="${S.cameras.find(c=>c.id==w.cameraId)?.snapshotUrl || ''}" class="cam-preview" style="height:140px">`
};

function renderWidgets() {
    const grid = $("#widgetGrid");
    grid.innerHTML = S.widgets.map(w => {
        const dev = S.devices.find(d => d.id == w.deviceId);
        const val = getVal(w, dev);
        
        return `
        <div class="widget-card" 
             style="grid-column: span ${getColSpan(w.size)}; grid-row: span ${w.type==='camera'?4:2}"
             data-id="${w.id}">
            <div class="widget-header">
                <span class="widget-title">${w.label || w.type}</span>
                ${S.editMode ? `<div>
                    <button class="icon-btn btn-sm widget-drag-handle" style="width:24px;height:24px;font-size:12px">⠿</button>
                    <button class="icon-btn btn-sm" onclick="editWidget('${w.id}')" style="width:24px;height:24px;font-size:12px">⚙</button>
                    <button class="icon-btn btn-sm" onclick="delWidget('${w.id}')" style="width:24px;height:24px;font-size:12px;color:red">✕</button>
                </div>` : ''}
            </div>
            <div class="widget-body">
                ${W_HTML[w.type] ? W_HTML[w.type](w, val) : 'Unknown'}
            </div>
        </div>`;
    }).join("");

    if(S.editMode) $$(".widget-drag-handle").forEach(h => h.onmousedown = (e) => initDrag(e, h.closest(".widget-card")));
}

/* ==== 5. EDIT MODE & DRAG ==== */
on($("#dashModeBtn"), "click", () => {
    S.editMode = !S.editMode;
    $("#dashModeBtn").textContent = S.editMode ? "Run Mode" : "Edit Mode";
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
        let newY = Math.ceil((ev.clientY - gridRect.top) / rowHeight);
        
        // Snap to grid logic
        w.x = Math.max(1, Math.min(12 - getColSpan(w.size) + 1, newX));
        // w.y = Math.max(1, newY); // Tạm tắt Y để tránh nhảy lung tung, Grid auto-flow tốt hơn
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

// Add Widget
$$(".widget-type-btn").forEach(btn => on(btn, "click", () => {
    const type = btn.dataset.type;
    const w = { id: "w"+Date.now(), type, label: type.toUpperCase(), theme: "green", size: "m", x: 1, y: 1 };
    if(type === 'slider' || type === 'gauge' || type === 'thermo') { w.min=0; w.max=100; }
    if(type === 'camera') w.size = 'l';
    S.widgets.push(w); savePrefs(); renderWidgets();
    $("#widgetPaletteMenu").classList.remove("open");
}));
on($("#widgetPaletteToggle"), "click", () => $("#widgetPaletteMenu").classList.toggle("open"));

// Widget Actions
window.delWidget = (id) => { if(confirm("Xóa widget?")) { S.widgets = S.widgets.filter(w=>w.id!==id); savePrefs(); renderWidgets(); } };
window.editWidget = (id) => {
    S.selW = S.widgets.find(w=>w.id===id);
    if(!S.selW) return;
    $("#widgetConfigOverlay").classList.add("open");
    $("#widgetConfigTitle").value = S.selW.label;
    $("#widgetConfigDevice").value = S.selW.deviceId || "";
    $("#widgetConfigSensor").value = S.selW.sensorKey || "";
};

// Config Save
on($("#widgetConfigCloseBtn"), "click", () => $("#widgetConfigOverlay").classList.remove("open"));
["Title", "Device", "Camera", "Sensor", "Theme", "Size"].forEach(k => {
    const el = $("#widgetConfig"+k);
    if(el) on(el, "change", () => {
        if(S.selW) { 
            S.selW[k === 'Title' ? 'label' : k === 'Sensor' ? 'sensorKey' : k === 'Device' ? 'deviceId' : k.toLowerCase()] = el.value;
            savePrefs(); renderWidgets();
        }
    });
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
    $("#detailEmpty").classList.add("hidden"); 
    $("#cameraDetailPanel").classList.add("hidden"); 
    $("#deviceDetailPanel").classList.remove("hidden");
    
    $("#detailId").textContent = d.id; 
    $("#detailName").textContent = d.name; 
    $("#detailState").textContent = d.lastState;
    $("#detailValue").textContent = d.lastValue ?? "--";
    $("#detailSensors").textContent = JSON.stringify(d.sensors || {});
    
    if($("#fwDeviceId")) $("#fwDeviceId").value = d.id;
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
        S.cameras.push(newCam); savePrefs(); loadAllData();
    });
});
window.delCam = (id) => { if(confirm("Xóa camera?")) { S.cameras = S.cameras.filter(c => c.id !== id); savePrefs(); loadAllData(); } };

window.showCamDetail = (id) => {
    const c = S.cameras.find(x => x.id == id);
    $("#detailEmpty").classList.add("hidden"); 
    $("#deviceDetailPanel").classList.add("hidden"); 
    $("#cameraDetailPanel").classList.remove("hidden");
    $("#camDetailId").textContent = c.id; 
    $("#camDetailUrl").textContent = c.snapshotUrl;
    if(c.snapshotUrl) $("#camDetailImg").src = c.snapshotUrl;
};

on($("#startStreamBtn"), "click", async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        $("#localVideo").srcObject = stream;
        $("#camStreamStatus").textContent = "Đang stream...";
        
        S.timers.stream = setInterval(() => {
            const cvs = document.createElement("canvas");
            cvs.width = $("#localVideo").videoWidth; cvs.height = $("#localVideo").videoHeight;
            cvs.getContext("2d").drawImage($("#localVideo"), 0, 0);
            cvs.toBlob(blob => fetch(`${API_BASE}/api/camera/frame`, { 
                method: "POST", headers: { Authorization: "Bearer "+S.token }, body: blob 
            }), "image/jpeg", 0.5);
        }, 500); 
        
        S.timers.pull = setInterval(() => {
            $("#serverVideo").src = `${API_BASE}/api/camera/latest/${S.user.id}?t=${Date.now()}`;
        }, 500);
        
        $("#startStreamBtn").disabled = true; $("#stopStreamBtn").disabled = false;
    } catch(e) { alert("Lỗi camera: " + e.message); }
});

on($("#stopStreamBtn"), "click", () => {
    clearInterval(S.timers.stream); clearInterval(S.timers.pull);
    $("#localVideo").srcObject?.getTracks().forEach(t=>t.stop());
    $("#startStreamBtn").disabled = false; $("#stopStreamBtn").disabled = true;
});

/* =========================================
   8. FIRMWARE & ADMIN & THEME
   ========================================= */
if($("#fwAddPinBtn")) on($("#fwAddPinBtn"), "click", () => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><input class="fw-pin-name" placeholder="Name"></td><td><input class="fw-pin-gpio" placeholder="GPIO"></td>
    <td><select class="fw-pin-mode"><option value="output">Output</option><option value="input">In Dig</option><option value="input-analog">In Ana</option></select></td>
    <td><button type="button" class="danger btn-sm" onclick="this.closest('tr').remove()">X</button></td>`;
    $("#fwPinsTableBody").appendChild(tr);
});

on($("#fwGenerateBtn"), "click", () => {
    const devId = val("#fwDeviceId") || "my-device";
    const pins = Array.from($$("#fwPinsTableBody tr")).map(tr => ({
        name: tr.querySelector(".fw-pin-name").value,
        gpio: tr.querySelector(".fw-pin-gpio").value,
        mode: tr.querySelector(".fw-pin-mode").value
    })).filter(p => p.name && p.gpio);

    // Template C++ Rút gọn (Đủ dùng)
    let code = `#include <WiFi.h>\n#include <PubSubClient.h>\n#include <ArduinoJson.h>\n\nconst char* SSID = "${val("#fwWifiSsid")}";\nconst char* PASS = "${val("#fwWifiPass")}";\nconst char* MQTT_SERVER = "${val("#fwMqttHost")}";\nString DEVICE_ID = "${devId}";\n\nWiFiClient espClient;\nPubSubClient client(espClient);\n\n${pins.map(p => `const int PIN_${p.name.toUpperCase()} = ${p.gpio};`).join('\n')}\n\nvoid setup() {\n  Serial.begin(115200);\n${pins.map(p => `  pinMode(PIN_${p.name.toUpperCase()}, ${p.mode==='output'?'OUTPUT':p.mode.includes('pullup')?'INPUT_PULLUP':'INPUT'});`).join('\n')}\n  WiFi.begin(SSID, PASS);\n  client.setServer(MQTT_SERVER, 1883);\n  client.setCallback(callback);\n}\n\nvoid callback(char* topic, byte* payload, unsigned int length) {\n  String msg; for(int i=0;i<length;i++) msg+=(char)payload[i];\n  if(msg.indexOf("toggle")>=0) {\n    ${pins.filter(p=>p.mode==='output').map(p=>`digitalWrite(PIN_${p.name.toUpperCase()}, !digitalRead(PIN_${p.name.toUpperCase()}));`).join('\n    ')}\n  }\n}\n\nvoid loop() {\n  if(!client.connected()) { client.connect(("ESP32_"+DEVICE_ID).c_str()); client.subscribe(("iot/demo/"+DEVICE_ID+"/control").c_str()); }\n  client.loop();\n}`;
    $("#fwCodeOutput").value = code;
});
on($("#fwCopyBtn"), "click", () => { navigator.clipboard.writeText($("#fwCodeOutput").value); $("#fwCopyStatus").textContent = "Copied!"; });

// Admin & Tabs
const tabs = ["dashboard", "devices", "cameras", "admin"];
$$(".nav-item").forEach(btn => on(btn, "click", () => {
    const t = btn.dataset.tab;
    if(t === 'admin' && S.user.role !== 'admin') return alert("Access Denied");
    tabs.forEach(x => {
        $(`#${x}Section`).classList.toggle("hidden", x !== t);
        const nav = $(`.nav-item[data-tab="${x}"]`);
        if(nav) x === t ? nav.classList.add("active") : nav.classList.remove("active");
    });
    if(t === 'admin') loadAdmin(); else if(t === 'dashboard') renderWidgets(); else loadAllData();
}));

async function loadAdmin() {
    const users = await api("/api/admin/users");
    if(users) $("#adminUserTableBody").innerHTML = users.map(u => `<tr><td>${u.id}</td><td>${u.username}</td><td>${u.role}</td><td><button class="danger btn-sm" onclick="admDel('${u.id}')">Xóa</button></td></tr>`).join("");
}
window.admDel = (id) => confirm('Xóa user?') && api(`/api/admin/users/${id}`, "DELETE").then(loadAdmin);

// Theme
function updateThemeToggles() {
    const icon = S.theme === "dark" ? "🌙" : "☀️";
    if($("#authThemeToggle")) $("#authThemeToggle").textContent = icon;
    if($("#appThemeToggle")) $("#appThemeToggle").textContent = icon;
}
const toggleTheme = () => {
    S.theme = S.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem("iot_theme", S.theme);
    document.body.setAttribute("data-theme", S.theme);
    updateThemeToggles();
};
on($("#authThemeToggle"), "click", toggleTheme);
on($("#appThemeToggle"), "click", toggleTheme);
on($("#sideNavToggle"), "click", () => $("#sideNav").classList.toggle("collapsed"));

/* ==== START ==== */
renderApp();