/* =========================================
   1. CONFIG & UTILS (CẤU HÌNH & TIỆN ÍCH)
   ========================================= */
const API_BASE_DEFAULT = window.location.origin;
let API_BASE = localStorage.getItem("iot_api_base") || API_BASE_DEFAULT;

// Các hàm chọn DOM nhanh (giúp code ngắn gọn hơn document.getElementById)
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const val = (s) => $(s)?.value.trim();
const on = (el, evt, fn) => el && el.addEventListener(evt, fn);

// State (Trạng thái) toàn cục của ứng dụng
const S = {
    token: localStorage.getItem("iot_token"),
    user: JSON.parse(localStorage.getItem("iot_user") || "null"),
    devices: [], 
    cameras: [], 
    widgets: [], 
    theme: localStorage.getItem("iot_theme") || "light", // Mặc định Light cho đẹp
    editMode: false, // Trạng thái sửa dashboard
    selW: null,      // Widget đang được chọn để cấu hình
    timers: {        // Quản lý các vòng lặp (để clear khi cần)
        auto: null, 
        stream: null, 
        pull: null 
    }
};

// Hàm gọi API chung (Tự động gắn Token vào Header)
async function api(path, method = "GET", body = null) {
    const headers = { "Content-Type": "application/json" };
    if (S.token) headers.Authorization = "Bearer " + S.token;
    
    try {
        const res = await fetch(API_BASE + path, { 
            method, 
            headers, 
            body: body ? JSON.stringify(body) : null 
        });
        
        const data = await res.json();
        
        if (!res.ok) { 
            // Nếu lỗi 401 (hết phiên đăng nhập) -> Logout ngay
            if(res.status === 401) logout(); 
            throw data.error || res.status; 
        }
        return data;
    } catch (e) { 
        console.error("API Error:", e); 
        return null; // Trả về null để frontend biết mà xử lý
    }
}

// Helper tính toán số cột cho Widget (Grid System)
const getColSpan = (s) => {
    if (s === 's') return 3; // Nhỏ: 3 cột
    if (s === 'l') return 6; // Lớn: 6 cột
    return 4;                // Vừa: 4 cột (Mặc định)
}; 

// Helper lấy giá trị từ Device để hiển thị lên Widget
const getVal = (w, d) => {
    if (!d) return 0;
    // Ưu tiên lấy từ sensorKey (ví dụ: temp, hum), nếu không có thì lấy lastValue
    return d.sensors?.[w.sensorKey] ?? d.lastValue;
};

/* =========================================
   2. AUTHENTICATION & INIT (ĐĂNG NHẬP)
   ========================================= */
function renderApp() {
    if (S.token) {
        // Đã đăng nhập
        $("#authPage").classList.add("hidden");
        $("#appPage").classList.remove("hidden");
        $("#userBadge").textContent = `${S.user.username}`;
        
        // Phân quyền: Ẩn tab Admin nếu không phải admin
        if(S.user.role !== 'admin') {
            $("#navAdmin").classList.add("hidden");
            $("#adminSection").classList.add("hidden");
        } else {
            $("#navAdmin").classList.remove("hidden");
        }
        
        // Tải dữ liệu và bắt đầu tự động cập nhật
        loadAllData();
        startAutoRefresh();
    } else {
        // Chưa đăng nhập
        $("#authPage").classList.remove("hidden");
        $("#appPage").classList.add("hidden");
    }
    
    // Set theme
    document.body.setAttribute("data-theme", S.theme);
    updateThemeToggles();
}

// Xử lý sự kiện nút Login
on($("#loginBtn"), "click", async () => {
    const res = await api("/api/auth/login", "POST", { 
        username: val("#loginUser"), 
        password: val("#loginPass") 
    });
    if(res) saveSession(res); 
    else alert("Sai tài khoản hoặc mật khẩu!");
});

// Xử lý sự kiện nút Register
on($("#registerBtn"), "click", async () => {
    const res = await api("/api/auth/register-public", "POST", { 
        username: val("#regUser"), 
        email: val("#regEmail"), 
        password: val("#regPass"), 
        confirmPassword: val("#regPassConfirm") 
    });
    if(res) { 
        saveSession(res); 
        alert("Đăng ký thành công! Đã tự động đăng nhập."); 
    }
});

// Xử lý sự kiện Verify OTP
on($("#verifyOtpBtn"), "click", async () => {
    const res = await api("/api/auth/verify-email", "POST", { otp: val("#otpInput") });
    if(res) { 
        saveSession({token: S.token, user: res.user}); // Update lại user info
        alert("Email đã được xác thực!"); 
    }
});

on($("#logoutBtn"), "click", logout);

// Lưu cấu hình API URL mới
on($("#saveApiBaseBtn"), "click", () => {
    localStorage.setItem("iot_api_base", API_BASE = val("#apiBaseInput"));
    alert("Đã lưu API Base. Trang sẽ tải lại."); 
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

function logout() { 
    localStorage.clear(); 
    location.reload(); 
}

/* =========================================
   3. DATA LOADING (TẢI DỮ LIỆU TỪ SERVER)
   ========================================= */
async function loadAllData() {
    // Gọi song song 3 API để tiết kiệm thời gian
    const [prefs, devs, cams] = await Promise.all([
        api("/api/me/prefs"), 
        api("/api/devices"), 
        api("/api/cameras")
    ]);
    
    if(prefs) {
        S.widgets = prefs.widgets || [];
        // Ưu tiên camera từ prefs user, nếu không có thì dùng từ hệ thống
        S.cameras = (prefs.cameras && prefs.cameras.length) ? prefs.cameras : (cams || []);
    }
    if(devs) S.devices = devs;
    
    renderDevices();
    renderCameras();
    renderWidgets();
    fillOptions(); // Điền dữ liệu vào các dropdown chọn thiết bị
}

function startAutoRefresh() {
    if(S.timers.auto) clearInterval(S.timers.auto);
    
    // Cứ 3 giây tải lại danh sách thiết bị 1 lần để cập nhật trạng thái
    S.timers.auto = setInterval(async () => {
        if(document.hidden || !S.token) return; // Nếu đang ẩn tab thì không tải
        
        const devs = await api("/api/devices");
        if(devs) { 
            S.devices = devs; 
            refreshWidgetValues(); // Chỉ cập nhật giá trị số (không vẽ lại HTML)
            renderDevices();       // Cập nhật bảng danh sách
        }
    }, 3000);
}

// Cập nhật giá trị widget mà không vẽ lại HTML (Tối ưu performance & UX)
function refreshWidgetValues() {
    S.widgets.forEach(w => {
        const card = $(`.widget-card[data-id="${w.id}"]`);
        if(!card) return;
        
        const dev = S.devices.find(d => d.id == w.deviceId);
        const val = getVal(w, dev);
        
        // 1. Cập nhật nhãn trạng thái (Online/Offline)
        const tag = card.querySelector(".widget-header span:first-child small");
        if(tag && dev) tag.textContent = `(${dev.lastState})`;

        // 2. Cập nhật Body tùy loại widget
        if(w.type === 'switch') {
            const btn = card.querySelector(".btn-neu");
            if(btn) {
                const isOn = val === true || val === 1 || String(val).toLowerCase() === 'on';
                if(isOn) btn.classList.add('active'); else btn.classList.remove('active');
                
                // Đổi màu icon nguồn
                const icon = btn.querySelector("span");
                if(icon) icon.style.color = isOn ? "var(--acc)" : "inherit";
            }
        } else if(w.type === 'slider') {
            // Slider: Cập nhật text, không cập nhật input value để tránh giật khi đang kéo
            const span = card.querySelector(".widget-slider-row span");
            if(span) span.textContent = val || 0;
        } else if(w.type === 'thermo' || w.type === 'gauge') {
            // Thermo/Gauge: Render lại để thanh màu chạy đúng
            card.querySelector(".widget-body").innerHTML = W_HTML[w.type](w, val);
        }
    });
}

/* =========================================
   4. DASHBOARD & WIDGETS (NEUMORPHISM)
   ========================================= */

// Template HTML cho các loại Widget (Dùng class .btn-neu của CSS mới)
const W_HTML = {
    // 1. Switch: Nút tròn to, icon nguồn
    switch: (w, v) => {
        const isOn = v === true || v === 1 || String(v).toLowerCase() === 'on';
        return `
        <button class="btn-neu ${isOn?'active':''}" onclick="ctrl('${w.deviceId}', {command:'toggle'})">
            <span style="font-size:24px; color:${isOn?'var(--acc)':'inherit'}">⏻</span>
        </button>`;
    },
    
    // 2. Slider: Thanh trượt
    slider: (w, v) => `
        <div class="widget-slider-row">
            <input type="range" min="${w.min}" max="${w.max}" value="${v||0}" 
                   onchange="ctrl('${w.deviceId}', {command:'analog', value: Number(this.value)})">
            <span style="font-weight:bold">${v||0}</span>
        </div>`,
        
    // 3. Button: Nút nhấn nhả (Press)
    button: (w) => `
        <button class="btn-neu" 
                onmousedown="ctrl('${w.deviceId}', {command:'${w.sensorKey||'btn'}', action:'press'})" 
                style="font-size:14px">●</button>`,
                
    // 4. Thermometer: Hiển thị nhiệt độ
    thermo: (w, v) => `<div class="widget-value-big" style="color:var(--danger)">${v||0}°C</div>`,
    
    // 5. Gauge: Hiển thị mức độ %
    gauge: (w, v) => `<div class="widget-value-big" style="color:var(--acc2)">${v||0}</div>`,
    
    // 6. D-Pad: Điều khiển xe/robot
    dpad: (w) => `
        <div class="widget-dpad">
            <div class="widget-dpad-row">
                <button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'up'})">↑</button>
            </div>
            <div class="widget-dpad-row">
                <button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'left'})">←</button>
                <button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'center'})">⏺</button>
                <button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'right'})">→</button>
            </div>
            <div class="widget-dpad-row">
                <button class="dpad-btn" onclick="ctrl('${w.deviceId}', {command:'move', dir:'down'})">↓</button>
            </div>
        </div>`,
        
    // 7. Camera Widget
    camera: (w) => {
        const cam = S.cameras.find(c => c.id == w.cameraId);
        return `<img src="${cam?.snapshotUrl || ''}" class="cam-preview" style="height:140px; object-fit:cover;">`;
    }
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
                <span class="widget-title">
                    ${w.label || w.type} 
                    <small style='opacity:0.6'>(${dev ? dev.lastState : '--'})</small>
                </span>
                
                ${S.editMode ? `
                <div style="display:flex; gap:5px">
                    <button class="icon-btn btn-sm widget-drag-handle" style="width:24px;height:24px;font-size:12px;cursor:grab">⠿</button>
                    <button class="icon-btn btn-sm" onclick="editWidget('${w.id}')" style="width:24px;height:24px;font-size:12px">⚙</button>
                    <button class="icon-btn btn-sm" onclick="delWidget('${w.id}')" style="width:24px;height:24px;font-size:12px;color:red">✕</button>
                </div>` : ''}
            </div>
            
            <div class="widget-body">
                ${W_HTML[w.type] ? W_HTML[w.type](w, val) : 'Unknown Widget'}
            </div>
        </div>`;
    }).join("");

    // Kích hoạt tính năng kéo thả (Drag) nếu đang ở Edit Mode
    if(S.editMode) {
        $$(".widget-drag-handle").forEach(h => {
            h.onmousedown = (e) => initDrag(e, h.closest(".widget-card"));
        });
    }
}

/* =========================================
   5. EDIT MODE & DRAG DROP LOGIC
   ========================================= */
on($("#dashModeBtn"), "click", () => {
    S.editMode = !S.editMode;
    $("#dashModeBtn").textContent = S.editMode ? "Done" : "Edit Mode";
    $("#widgetGrid").classList.toggle("widgets-edit", S.editMode);
    
    // Render lại để hiện/ẩn các nút Xóa/Sửa
    renderWidgets();
});

// Logic kéo thả (Snap to Grid 12 cột)
function initDrag(e, card) {
    e.preventDefault();
    const w = S.widgets.find(x => x.id == card.dataset.id);
    if(!w) return;

    const move = (ev) => {
        const gridRect = $("#widgetGrid").getBoundingClientRect();
        const colWidth = gridRect.width / 12; // Chia lưới thành 12 cột
        const rowHeight = 90; // Chiều cao mỗi dòng (khớp với CSS)
        
        // Tính toán tọa độ lưới
        let newX = Math.ceil((ev.clientX - gridRect.left) / colWidth);
        let newY = Math.ceil((ev.clientY - gridRect.top) / rowHeight);
        
        // Giới hạn không cho kéo ra ngoài lưới
        w.x = Math.max(1, Math.min(12 - getColSpan(w.size) + 1, newX));
        // w.y = Math.max(1, newY); // Tạm tắt Y để Grid tự động sắp xếp (Flow layout)
        
        // Render lại ngay để thấy hiệu ứng
        renderWidgets();
    };
    
    const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        savePrefs(); // Lưu vị trí mới vào DB
    };
    
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
}

// Thêm Widget mới
$$(".widget-type-btn").forEach(btn => on(btn, "click", () => {
    const type = btn.dataset.type;
    const w = { 
        id: "w" + Date.now(), 
        type, 
        label: type.toUpperCase(), 
        theme: "green", 
        size: "m", 
        x: 1, y: 1 
    };
    
    // Cấu hình mặc định cho các loại đặc biệt
    if(type === 'slider' || type === 'gauge' || type === 'thermo') { w.min=0; w.max=100; }
    if(type === 'camera') w.size = 'l';
    
    S.widgets.push(w);
    savePrefs();
    renderWidgets();
    
    // Đóng menu sau khi chọn
    $("#widgetPaletteMenu").classList.remove("open");
}));

on($("#widgetPaletteToggle"), "click", () => $("#widgetPaletteMenu").classList.toggle("open"));

// Xóa Widget
window.delWidget = (id) => { 
    if(confirm("Xóa widget này?")) { 
        S.widgets = S.widgets.filter(w => w.id !== id); 
        savePrefs(); 
        renderWidgets(); 
    } 
};

// Sửa Widget (Mở Popup)
window.editWidget = (id) => {
    S.selW = S.widgets.find(w => w.id === id);
    if(!S.selW) return;
    
    $("#widgetConfigOverlay").classList.add("open");
    
    // Điền dữ liệu cũ vào form
    if($("#widgetConfigTitle")) $("#widgetConfigTitle").value = S.selW.label;
    if($("#widgetConfigDevice")) $("#widgetConfigDevice").value = S.selW.deviceId || "";
    if($("#widgetConfigCamera")) $("#widgetConfigCamera").value = S.selW.cameraId || "";
    if($("#widgetConfigSensor")) $("#widgetConfigSensor").value = S.selW.sensorKey || "";
    
    // Hiển thị cấu hình Range nếu cần
    const rangeRow = $("#widgetConfigRangeRow");
    if(rangeRow) {
        const needsRange = ['slider', 'gauge', 'thermo'].includes(S.selW.type);
        rangeRow.style.display = needsRange ? 'flex' : 'none';
    }
};

// Lưu cấu hình khi thay đổi Input
on($("#widgetConfigCloseBtn"), "click", () => $("#widgetConfigOverlay").classList.remove("open"));

["Title", "Device", "Camera", "Sensor", "Theme", "Size"].forEach(k => {
    const el = $("#widgetConfig"+k);
    if(el) on(el, "change", () => {
        if(S.selW) { 
            const prop = k === 'Title' ? 'label' : k === 'Sensor' ? 'sensorKey' : k === 'Device' ? 'deviceId' : k === 'Camera' ? 'cameraId' : k.toLowerCase();
            S.selW[prop] = el.value;
            savePrefs(); 
            renderWidgets();
        }
    });
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
   6. DEVICES & CONTROL LOGIC
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

// Gửi lệnh điều khiển
window.ctrl = (id, payload) => api(`/api/devices/${id}/control`, "POST", payload);

// Xóa thiết bị
window.delDev = (id) => confirm(`Xóa thiết bị ${id}?`) && api(`/api/devices/${id}`, "DELETE").then(loadAllData);

// Claim thiết bị
on($("#claimBtn"), "click", () => api("/api/devices/register", "POST", { 
    deviceId: val("#claimDeviceId"), 
    name: val("#claimDeviceName") 
}).then(loadAllData));

on($("#refreshBtn"), "click", loadAllData);

// Hiển thị chi tiết thiết bị
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
    
    // Vẽ biểu đồ đơn giản (Canvas)
    const ctx = $("#historyCanvas").getContext("2d");
    ctx.clearRect(0,0,300,150);
    ctx.fillStyle = "#10b981";
    // Giả lập vẽ cột giá trị hiện tại
    const h = Math.min((d.lastValue || 0), 100);
    ctx.fillRect(10, 100 - h, 50, h);
    
    // Điền ID vào Firmware Gen để tiện copy
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
        S.cameras.push(newCam); 
        savePrefs(); loadAllData();
    });
});

window.delCam = (id) => { 
    if(confirm("Xóa camera?")) { 
        S.cameras = S.cameras.filter(c => c.id !== id); 
        savePrefs(); loadAllData(); 
    } 
};

window.showCamDetail = (id) => {
    const c = S.cameras.find(x => x.id == id);
    $("#detailEmpty").classList.add("hidden"); 
    $("#deviceDetailPanel").classList.add("hidden"); 
    $("#cameraDetailPanel").classList.remove("hidden");
    $("#camDetailId").textContent = c.id; 
    $("#camDetailUrl").textContent = c.snapshotUrl;
    if(c.snapshotUrl) $("#camDetailImg").src = c.snapshotUrl;
};

// Logic Stream Camera Laptop (WebRTC -> Canvas -> Blob -> API)
on($("#startStreamBtn"), "click", async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        $("#localVideo").srcObject = stream;
        $("#camStreamStatus").textContent = "Đang stream...";
        
        S.timers.stream = setInterval(() => {
            const cvs = document.createElement("canvas");
            cvs.width = $("#localVideo").videoWidth; 
            cvs.height = $("#localVideo").videoHeight;
            cvs.getContext("2d").drawImage($("#localVideo"), 0, 0);
            
            // Gửi ảnh lên server (JPEG quality 0.5)
            cvs.toBlob(blob => fetch(`${API_BASE}/api/camera/frame`, { 
                method: "POST", headers: { Authorization: "Bearer "+S.token }, body: blob 
            }), "image/jpeg", 0.5);
        }, 500); 
        
        // Xem lại ảnh từ server
        S.timers.pull = setInterval(() => {
            $("#serverVideo").src = `${API_BASE}/api/camera/latest/${S.user.id}?t=${Date.now()}`;
        }, 500);
        
        $("#startStreamBtn").disabled = true; $("#stopStreamBtn").disabled = false;
    } catch(e) { alert("Lỗi camera: " + e.message); }
});

on($("#stopStreamBtn"), "click", () => {
    clearInterval(S.timers.stream); 
    clearInterval(S.timers.pull);
    
    const vid = $("#localVideo");
    if(vid.srcObject) vid.srcObject.getTracks().forEach(t=>t.stop());
    vid.srcObject = null;
    
    $("#camStreamStatus").textContent = "Đã dừng.";
    $("#startStreamBtn").disabled = false; $("#stopStreamBtn").disabled = true;
});

/* =========================================
   8. FIRMWARE GENERATOR & ADMIN
   ========================================= */
if($("#fwAddPinBtn")) on($("#fwAddPinBtn"), "click", () => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td><input class="fw-pin-name" placeholder="Name" style="width:80px"></td>
    <td><input class="fw-pin-gpio" placeholder="GPIO" style="width:50px"></td>
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

    // Template C++ (Giữ nguyên đầy đủ để copy vào Arduino IDE)
    let code = `
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

const char* SSID = "${val("#fwWifiSsid")}";
const char* PASS = "${val("#fwWifiPass")}";
const char* MQTT_SERVER = "${val("#fwMqttHost")}";
String DEVICE_ID = "${devId}";

WiFiClient espClient;
PubSubClient client(espClient);

// Defines
${pins.map(p => `const int PIN_${p.name.toUpperCase()} = ${p.gpio}; // ${p.mode}`).join('\n')}

void setup() {
  Serial.begin(115200);
  // Pin Modes
${pins.map(p => `  pinMode(PIN_${p.name.toUpperCase()}, ${p.mode==='output'?'OUTPUT':p.mode==='input-analog'?'INPUT':'INPUT_PULLUP'});`).join('\n')}
  
  WiFi.begin(SSID, PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  
  client.setServer(MQTT_SERVER, 1883);
  client.setCallback(callback);
}

void callback(char* topic, byte* payload, unsigned int length) {
  String msg; for(int i=0;i<length;i++) msg+=(char)payload[i];
  if(msg.indexOf("toggle")>=0) {
    ${pins.filter(p=>p.mode==='output').map(p=>`digitalWrite(PIN_${p.name.toUpperCase()}, !digitalRead(PIN_${p.name.toUpperCase()}));`).join('\n    ')}
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
  if(!client.connected()) reconnect();
  client.loop();
}
`;
    $("#fwCodeOutput").value = code;
});

on($("#fwCopyBtn"), "click", () => { 
    navigator.clipboard.writeText($("#fwCodeOutput").value); 
    $("#fwCopyStatus").textContent = "Copied!"; 
});

// Admin Users
const tabs = ["dashboard", "devices", "cameras", "admin"];
$$(".nav-item").forEach(btn => on(btn, "click", () => {
    const t = btn.dataset.tab;
    // Chặn Admin nếu không có quyền
    if(t === 'admin' && S.user.role !== 'admin') return alert("Access Denied");
    
    tabs.forEach(x => {
        $(`#${x}Section`).classList.toggle("hidden", x !== t);
        const nav = $(`.nav-item[data-tab="${x}"]`);
        if(nav) x === t ? nav.classList.add("active") : nav.classList.remove("active");
    });
    
    if(t === 'admin') loadAdmin(); 
    else if(t === 'dashboard') renderWidgets(); 
    else loadAllData();
}));

async function loadAdmin() {
    const users = await api("/api/admin/users");
    if(users) $("#adminUserTableBody").innerHTML = users.map(u => `
        <tr><td>${u.id}</td><td>${u.username}</td><td>${u.role}</td>
        <td><button class="danger btn-sm" onclick="admDel('${u.id}')">Xóa</button></td></tr>
    `).join("");
}
window.admDel = (id) => confirm('Xóa user?') && api(`/api/admin/users/${id}`, "DELETE").then(loadAdmin);

// Theme Toggles
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