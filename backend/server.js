/* 1. CONFIG */
const API_BASE = localStorage.getItem("iot_api_base") || window.location.origin;
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const val = (s) => $(s)?.value.trim();
const on = (el, evt, fn) => el && el.addEventListener(evt, fn);

const S = {
    token: localStorage.getItem("iot_token"),
    user: JSON.parse(localStorage.getItem("iot_user") || "null"),
    devices: [], cameras: [], widgets: [], 
    theme: localStorage.getItem("iot_theme") || "light",
    editMode: false, selW: null, timers: { auto: null }
};

async function api(path, method = "GET", body = null) {
    const headers = { "Content-Type": "application/json" };
    if (S.token) headers.Authorization = "Bearer " + S.token;
    try {
        const res = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : null });
        const data = await res.json();
        if (!res.ok) { if(res.status === 401) logout(); throw data.error || res.status; }
        return data;
    } catch (e) { console.error(e); return null; }
}

/* 2. AUTH & INIT */
function renderApp() {
    if (S.token) {
        $("#authPage").classList.add("hidden");
        $("#appPage").classList.remove("hidden");
        $("#userBadge").textContent = S.user.username;
        if(S.user.role !== 'admin') { $("#navAdmin").classList.add("hidden"); $("#adminSection").classList.add("hidden"); } 
        else $("#navAdmin").classList.remove("hidden");
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
    if(res) saveSession(res); else alert("Login Failed");
});
on($("#registerBtn"), "click", async () => {
    const res = await api("/api/auth/register-public", "POST", { username: val("#regUser"), email: val("#regEmail"), password: val("#regPass") });
    if(res) { saveSession(res); alert("Registered!"); }
});
on($("#logoutBtn"), "click", logout);
on($("#toggleApiBaseBtn"), "click", () => $("#apiBaseRow").style.display = "flex");
on($("#saveApiBaseBtn"), "click", () => { localStorage.setItem("iot_api_base", val("#apiBaseInput")); location.reload(); });

function saveSession(data) {
    localStorage.setItem("iot_token", S.token = data.token);
    localStorage.setItem("iot_user", JSON.stringify(S.user = data.user));
    renderApp();
}
function logout() { localStorage.clear(); location.reload(); }

/* 3. DATA & LOGIC */
async function loadAllData() {
    const [prefs, devs, cams] = await Promise.all([api("/api/me/prefs"), api("/api/devices"), api("/api/cameras")]);
    if(prefs) { S.widgets = prefs.widgets||[]; S.cameras = prefs.cameras||(cams||[]); }
    if(devs) S.devices = devs;
    renderDevices(); renderCameras(); renderWidgets(); fillOptions();
}

function startAutoRefresh() {
    if(S.timers.auto) clearInterval(S.timers.auto);
    S.timers.auto = setInterval(async () => {
        if(document.hidden || !S.token) return;
        const devs = await api("/api/devices");
        if(devs) { S.devices = devs; refreshWidgetValues(); renderDevices(); }
    }, 3000);
}

// --- LOGIC CÔNG THỨC (QUAN TRỌNG) ---
const getVal = (w, d) => {
    if (!d) return 0;
    let raw = d.sensors?.[w.sensorKey] ?? d.lastValue ?? 0;
    if (w.formula && w.formula.trim() !== "") {
        try {
            const calc = new Function('x', `return ${w.formula}`);
            return parseFloat(calc(raw)).toFixed(2);
        } catch { return raw; }
    }
    return raw;
};

/* 4. DASHBOARD WIDGETS */
const W_HTML = {
    switch: (w, v) => {
        const isOn = v === true || v === 1 || String(v).toLowerCase() === 'on';
        return `<button class="widget-switch-btn ${isOn?'on':''}" onclick="ctrl('${w.deviceId}', {command:'toggle'})"><span>⏻</span></button>`;
    },
    slider: (w, v) => `<div class="widget-slider-row"><input type="range" min="${w.min}" max="${w.max}" value="${v||0}" onchange="ctrl('${w.deviceId}', {command:'analog', value: Number(this.value)})"><span>${v||0}</span></div>`,
    thermo: (w, v) => `<div class="widget-value-big" style="color:var(--danger)">${v||0}°C</div>`,
    gauge: (w, v) => `<div class="widget-value-big" style="color:var(--acc2)">${v||0}</div>`,
    button: (w) => `<button class="btn-neu-rect" onmousedown="ctrl('${w.deviceId}', {command:'${w.sensorKey||'btn'}', action:'press'})">PRESS</button>`,
    dpad: (w) => `<div class="widget-dpad"><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'up'})">↑</button><div><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'left'})">←</button><button class="dpad-btn">●</button><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'right'})">→</button></div><button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'down'})">↓</button></div>`,
    camera: (w) => `<img src="${S.cameras.find(c=>c.id==w.cameraId)?.snapshotUrl || ''}" class="cam-preview" style="height:80px">`
};

function renderWidgets() {
    $("#widgetGrid").innerHTML = S.widgets.map(w => {
        const dev = S.devices.find(d => d.id == w.deviceId);
        const val = getVal(w, dev);
        return `
        <div class="widget-card" style="grid-column: span ${getColSpan(w.size)}; grid-row: span ${w.type==='camera'?4:2}" data-id="${w.id}">
            <div class="widget-header"><span>${w.label||w.type}</span>${S.editMode ? `<button style="color:red;background:none;border:none;cursor:pointer" onclick="delWidget('${w.id}')">✕</button><button style="background:none;border:none;cursor:pointer" onclick="editWidget('${w.id}')">⚙</button>` : ''}</div>
            <div class="widget-body">${W_HTML[w.type] ? W_HTML[w.type](w, val) : 'Err'}</div>
        </div>`;
    }).join("");
    if(S.editMode) $$(".widget-card").forEach(c => c.onmousedown = (e) => initDrag(e, c));
}

function refreshWidgetValues() {
    S.widgets.forEach(w => {
        const card = $(`.widget-card[data-id="${w.id}"]`);
        if(!card) return;
        const dev = S.devices.find(d => d.id == w.deviceId);
        const val = getVal(w, dev);
        if(w.type === 'switch') {
            const btn = card.querySelector(".widget-switch-btn");
            if(btn) { 
                const isOn = val === true || val === 1 || String(val) === 'on';
                isOn ? btn.classList.add('on') : btn.classList.remove('on');
            }
        } else if(w.type === 'thermo' || w.type === 'gauge' || w.type === 'slider') {
            card.querySelector(".widget-body").innerHTML = W_HTML[w.type](w, val);
        }
    });
}

const getColSpan = (s) => s==='s'?3:s==='l'?6:4;

/* 5. EDIT & CONFIG */
on($("#dashModeBtn"), "click", () => {
    S.editMode = !S.editMode; $("#dashModeBtn").textContent = S.editMode?"Done":"Edit";
    $("#widgetGrid").classList.toggle("widgets-edit", S.editMode); renderWidgets();
});

// Drag Logic (Rút gọn)
function initDrag(e, card) {
    if(e.target.tagName==='BUTTON') return;
    const w = S.widgets.find(x => x.id == card.dataset.id);
    const move = (ev) => {
        const rect = $("#widgetGrid").getBoundingClientRect();
        w.x = Math.max(1, Math.min(12, Math.ceil((ev.clientX - rect.left) / (rect.width/12))));
        renderWidgets();
    };
    const up = () => { document.removeEventListener("mousemove",move); document.removeEventListener("mouseup",up); savePrefs(); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
}

// Widget CRUD
$$(".widget-type-btn").forEach(btn => on(btn, "click", () => {
    const type = btn.dataset.type;
    const w = { id: "w"+Date.now(), type, label: type.toUpperCase(), theme: "green", size: "m", x: 1 };
    if(['slider','gauge','thermo'].includes(type)) { w.min=0; w.max=100; }
    if(type==='camera') w.size='l';
    S.widgets.push(w); savePrefs(); renderWidgets();
}));
on($("#widgetPaletteToggle"), "click", () => $("#widgetPaletteMenu").classList.toggle("open"));

window.delWidget = (id) => { if(confirm("Del?")) { S.widgets=S.widgets.filter(w=>w.id!==id); savePrefs(); renderWidgets(); } };
window.editWidget = (id) => {
    S.selW = S.widgets.find(w=>w.id===id);
    $("#widgetConfigOverlay").classList.add("open");
    ["Title","Device","Sensor","Formula"].forEach(k => $("#widgetConfig"+k).value = S.selW[k.toLowerCase()] || (k==='Formula'?S.selW.formula:'') || "");
    const rangeRow = $("#widgetConfigRangeRow");
    if(rangeRow) rangeRow.style.display = ['slider','gauge','thermo'].includes(S.selW.type) ? 'flex' : 'none';
};

on($("#widgetConfigCloseBtn"), "click", () => $("#widgetConfigOverlay").classList.remove("open"));
["Title", "Device", "Camera", "Sensor", "Formula", "Theme", "Size"].forEach(k => {
    on($("#widgetConfig"+k), "change", (e) => {
        if(S.selW) { 
            const prop = k==='Title'?'label':k==='Sensor'?'sensorKey':k==='Device'?'deviceId':k==='Formula'?'formula':k.toLowerCase();
            S.selW[prop] = e.target.value; savePrefs(); renderWidgets();
        }
    });
});
["Min", "Max"].forEach(k => on($("#widgetConfigRange"+k), "input", (e) => { if(S.selW) { S.selW[k.toLowerCase()] = Number(e.target.value); savePrefs(); renderWidgets(); } }));

async function savePrefs() { await api("/api/me/prefs", "PUT", { widgets: S.widgets, cameras: S.cameras }); }
function fillOptions() {
    const opts = (arr) => arr.map(x => `<option value="${x.id}">${x.name||x.id}</option>`).join("");
    $("#widgetConfigDevice").innerHTML = `<option value="">--Device--</option>` + opts(S.devices);
    $("#widgetConfigCamera").innerHTML = `<option value="">--Camera--</option>` + opts(S.cameras);
}

/* 6. DEVICES & CAMERAS */
function renderDevices() {
    $("#deviceTableBody").innerHTML = S.devices.map(d => `<tr><td>${d.id}</td><td>${d.name}</td><td>${d.lastState}</td><td>${JSON.stringify(d.sensors||d.lastValue)}</td><td><button class="btn-neu-rect" onclick="ctrl('${d.id}',{command:'toggle'})">Toggle</button><button class="btn-neu-rect" style="color:red" onclick="delDev('${d.id}')">X</button></td></tr>`).join("");
    if($("#fwDeviceId")) $("#fwDeviceId").value = S.devices[0]?.id || "";
}
window.ctrl = (id, pl) => api(`/api/devices/${id}/control`, "POST", pl);
window.delDev = (id) => confirm("Xóa?") && api(`/api/devices/${id}`, "DELETE").then(loadAllData);
on($("#claimBtn"), "click", () => api("/api/devices/register", "POST", { deviceId: val("#claimDeviceId"), name: val("#claimDeviceName") }).then(loadAllData));
on($("#refreshBtn"), "click", loadAllData);

function renderCameras() {
    $("#cameraTableBody").innerHTML = S.cameras.map(c => `<tr><td>${c.id}</td><td>${c.name}</td><td><button style="color:red" onclick="delCam('${c.id}')">X</button></td></tr>`).join("");
}
on($("#camRegisterBtn"), "click", () => api("/api/cameras/register", "POST", { cameraId: val("#camIdInput"), name: val("#camNameInput"), snapshotUrl: val("#camUrlInput") }).then(loadAllData));
window.delCam = (id) => confirm("Xóa?") && api(`/api/cameras/${id}`, "DELETE").then(loadAllData);

on($("#startStreamBtn"), "click", async () => {
    try {
        const s = await navigator.mediaDevices.getUserMedia({video:true}); $("#localVideo").srcObject = s;
        S.timers.stream = setInterval(() => {
            const cvs = document.createElement("canvas"); cvs.width = 300; cvs.height = 200;
            cvs.getContext("2d").drawImage($("#localVideo"),0,0,300,200);
            cvs.toBlob(b => fetch(`${API_BASE}/api/camera/frame`, { method:"POST", headers:{Authorization:`Bearer ${S.token}`}, body:b }), "image/jpeg", 0.5);
        }, 500);
        S.timers.pull = setInterval(() => $("#serverVideo").src = `${API_BASE}/api/camera/latest/${S.user.id}?t=${Date.now()}`, 500);
        $("#startStreamBtn").disabled = true; $("#stopStreamBtn").disabled = false;
    } catch(e) { alert(e.message); }
});
on($("#stopStreamBtn"), "click", () => {
    clearInterval(S.timers.stream); clearInterval(S.timers.pull);
    $("#localVideo").srcObject?.getTracks().forEach(t=>t.stop());
    $("#startStreamBtn").disabled = false; $("#stopStreamBtn").disabled = true;
});

/* 7. ADMIN & THEME & FW GEN */
on($("#fwGenerateBtn"), "click", () => {
    const pins = Array.from($$("#fwPinsTableBody tr")).map(tr => `const int PIN_${tr.querySelector(".fw-pin-name").value.toUpperCase()} = ${tr.querySelector(".fw-pin-gpio").value};`).join("\n");
    $("#fwCodeOutput").value = `#include <WiFi.h>\n#include <PubSubClient.h>\n//...\n${pins}\n// Logic MQTT here...`;
});
if($("#fwAddPinBtn")) on($("#fwAddPinBtn"), "click", () => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><input class="fw-pin-name" style="width:80px"></td><td><input class="fw-pin-gpio" style="width:50px"></td><td><button onclick="this.closest('tr').remove()">X</button></td>`;
    $("#fwPinsTableBody").appendChild(tr);
});

async function loadAdmin() {
    const users = await api("/api/admin/users");
    $("#adminUserTableBody").innerHTML = users.map(u => `<tr><td>${u.id}</td><td>${u.username}</td><td>${u.role}</td><td><button onclick="admDel('${u.id}')">Del</button></td></tr>`).join("");
}
window.admDel = (id) => confirm("Del?") && api(`/api/admin/users/${id}`, "DELETE").then(loadAdmin);

const toggleTheme = () => {
    S.theme = S.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem("iot_theme", S.theme);
    renderApp();
};
on($("#authThemeToggle"), "click", toggleTheme);
on($("#appThemeToggle"), "click", toggleTheme);
function updateThemeToggles() { const i = S.theme==='dark'?'🌙':'☀️'; if($("#authThemeToggle")) $("#authThemeToggle").textContent=i; if($("#appThemeToggle")) $("#appThemeToggle").textContent=i; }

/* START */
renderApp();