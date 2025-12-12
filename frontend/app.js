/* ==== CONFIG & STATE ==== */
const API_BASE_DEFAULT = window.location.origin;
let API_BASE = localStorage.getItem("iot_api_base") || API_BASE_DEFAULT;
let token = localStorage.getItem("iot_token") || null;
let currentUser = null;
try {
  const us = localStorage.getItem("iot_user");
  if (us) currentUser = JSON.parse(us);
} catch {}
let currentLang = localStorage.getItem("iot_lang") || "vi";
let currentTheme = localStorage.getItem("iot_theme") || "dark";

const I18N = {
  vi: {
    "auth.title": "IoT Platform",
    "auth.subtitle": "Đăng nhập để quản lý thiết bị.",
    "auth.loginTab": "Đăng nhập",
    "auth.registerTab": "Đăng ký",
    "auth.loginBtn": "Đăng nhập",
    "auth.registerBtn": "Tạo tài khoản",
    "nav.dashboard": "Dashboard",
    "nav.devices": "Thiết bị",
    "nav.cameras": "Camera",
    "nav.admin": "Admin",
    "app.title": "IoT Platform",
    "app.changePass": "Đổi mật khẩu",
    "app.logout": "Đăng xuất",
    "dash.title": "Dashboard",
    "dash.addWidget": "Thêm widget",
  },
  en: {
    "auth.title": "IoT Platform",
    "auth.subtitle": "Login to manage devices.",
    "auth.loginTab": "Login",
    "auth.registerTab": "Sign up",
    "auth.loginBtn": "Login",
    "auth.registerBtn": "Create account",
    "nav.dashboard": "Dashboard",
    "nav.devices": "Devices",
    "nav.cameras": "Cameras",
    "nav.admin": "Admin",
    "app.title": "IoT Platform",
    "app.changePass": "Change password",
    "app.logout": "Logout",
    "dash.title": "Dashboard",
    "dash.addWidget": "Add widget",
  },
};

/* ==== DOM ==== */
const authPage = document.getElementById("authPage");
const appPage = document.getElementById("appPage");
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginUserInput = document.getElementById("loginUser");
const loginPassInput = document.getElementById("loginPass");
const loginBtn = document.getElementById("loginBtn");
const regUserInput = document.getElementById("regUser");
const regEmailInput = document.getElementById("regEmail");
const regPassInput = document.getElementById("regPass");
const regPassConfirmInput = document.getElementById("regPassConfirm");
const registerBtn = document.getElementById("registerBtn");
const otpInput = document.getElementById("otpInput");
const verifyOtpBtn = document.getElementById("verifyOtpBtn");
const resendOtpBtn = document.getElementById("resendOtpBtn");
const apiBaseInput = document.getElementById("apiBaseInput");
const saveApiBaseBtn = document.getElementById("saveApiBaseBtn");
const toggleApiBaseBtn = document.getElementById("toggleApiBaseBtn");
const apiBaseRow = document.getElementById("apiBaseRow");
const authMessage = document.getElementById("authMessage");
const logoutBtn = document.getElementById("logoutBtn");
const changePassBtn = document.getElementById("changePassBtn");
const userBadge = document.getElementById("userBadge");
const healthBadge = document.getElementById("healthBadge");
const dashboardSection = document.getElementById("dashboardSection");
const devicesSection = document.getElementById("devicesSection");
const camerasSection = document.getElementById("camerasSection");
const adminSection = document.getElementById("adminSection");
const navButtons = document.querySelectorAll(".nav-item");
const navAdmin = document.getElementById("navAdmin");
const searchInput = document.getElementById("searchInput");
const toggleAutoBtn = document.getElementById("toggleAutoBtn");
const refreshBtn = document.getElementById("refreshBtn");
const statusEl = document.getElementById("status");
const tbody = document.getElementById("deviceTableBody");
const claimDeviceId = document.getElementById("claimDeviceId");
const claimDeviceName = document.getElementById("claimDeviceName");
const claimBtn = document.getElementById("claimBtn");
const fwDeviceId = document.getElementById("fwDeviceId");
const fwDeviceName = document.getElementById("fwDeviceName");
const fwWifiSsid = document.getElementById("fwWifiSsid");
const fwWifiPass = document.getElementById("fwWifiPass");
const fwMqttHost = document.getElementById("fwMqttHost");
const fwMqttPort = document.getElementById("fwMqttPort");
const fwPinsTableBody = document.getElementById("fwPinsTableBody");
const fwAddPinBtn = document.getElementById("fwAddPinBtn");
const fwGenerateBtn = document.getElementById("fwGenerateBtn");
const fwCodeOutput = document.getElementById("fwCodeOutput");
const fwCopyBtn = document.getElementById("fwCopyBtn");
const fwCopyStatus = document.getElementById("fwCopyStatus");
const camIdInput = document.getElementById("camIdInput");
const camNameInput = document.getElementById("camNameInput");
const camUrlInput = document.getElementById("camUrlInput");
const camRegisterBtn = document.getElementById("camRegisterBtn");
const camStatus = document.getElementById("camStatus");
const cameraTableBody = document.getElementById("cameraTableBody");
const adminUserTableBody = document.getElementById("adminUserTableBody");
const detailEmpty = document.getElementById("detailEmpty");
const deviceDetailPanel = document.getElementById("deviceDetailPanel");
const cameraDetailPanel = document.getElementById("cameraDetailPanel");
const detailId = document.getElementById("detailId");
const detailName = document.getElementById("detailName");
const detailState = document.getElementById("detailState");
const detailValue = document.getElementById("detailValue");
const detailUpdated = document.getElementById("detailUpdated");
const detailSensors = document.getElementById("detailSensors");
const historyCanvas = document.getElementById("historyCanvas");
const camDetailId = document.getElementById("camDetailId");
const camDetailName = document.getElementById("camDetailName");
const camDetailUrl = document.getElementById("camDetailUrl");
const camDetailImg = document.getElementById("camDetailImg");
const startStreamBtn = document.getElementById("startStreamBtn");
const stopStreamBtn = document.getElementById("stopStreamBtn");
const localVideo = document.getElementById("localVideo");
const serverVideo = document.getElementById("serverVideo");
const camStreamStatus = document.getElementById("camStreamStatus");
const widgetGrid = document.getElementById("widgetGrid");
const widgetPaletteToggle = document.getElementById("widgetPaletteToggle");
const widgetPaletteMenu = document.getElementById("widgetPaletteMenu");
const widgetTypeButtons = document.querySelectorAll(".widget-type-btn");
const dashModeBtn = document.getElementById("dashModeBtn");
const sideNav = document.getElementById("sideNav");
const sideNavToggle = document.getElementById("sideNavToggle");
const authLangToggle = document.getElementById("authLangToggle");
const appLangToggle = document.getElementById("appLangToggle");
const authThemeToggle = document.getElementById("authThemeToggle");
const appThemeToggle = document.getElementById("appThemeToggle");

/* widget config DOM */
const widgetConfigOverlay = document.getElementById("widgetConfigOverlay");
const widgetConfigPanel = document.getElementById("widgetConfigPanel");
const widgetConfigCloseBtn = document.getElementById("widgetConfigCloseBtn");
const widgetConfigTitle = document.getElementById("widgetConfigTitle");
const widgetConfigDevice = document.getElementById("widgetConfigDevice");
const widgetConfigSensor = document.getElementById("widgetConfigSensor");
const widgetConfigTheme = document.getElementById("widgetConfigTheme");
const widgetConfigRangeRow = document.getElementById("widgetConfigRangeRow");
const widgetConfigRangeMin = document.getElementById("widgetConfigRangeMin");
const widgetConfigRangeMax = document.getElementById("widgetConfigRangeMax");
/* NEW: size selector */
const widgetConfigSize = document.getElementById("widgetConfigSize");

/* STATE */
let autoRefresh = false;
let autoTimer = null;
let lastDevices = [];
let cameras = [];
const historyMap = {};
let localStream = null;
let streamInterval = null;
let serverPullInterval = null;
let captureCanvas = null;
let captureCtx = null;
let widgets = [];
let widgetIdCounter = 0;
let selectedWidgetId = null;
let widgetsRunning = false;
let lastActivity = Date.now();

/* THEME + LANG */
function setTheme(theme) {
  currentTheme = theme === "light" ? "light" : "dark";
  localStorage.setItem("iot_theme", currentTheme);
  document.body.setAttribute("data-theme", currentTheme);
  updateThemeToggles();
}
function updateThemeToggles() {
  const icon = currentTheme === "dark" ? "🌙" : "☀️";
  if (authThemeToggle) authThemeToggle.textContent = icon;
  if (appThemeToggle) appThemeToggle.textContent = icon;
}
function setLang(lang) {
  currentLang = lang === "en" ? "en" : "vi";
  localStorage.setItem("iot_lang", currentLang);
  updateLangToggles();
  applyI18n();
}
function updateLangToggles() {
  [authLangToggle, appLangToggle].forEach((group) => {
    if (!group) return;
    group.querySelectorAll("button[data-lang]").forEach((b) => {
      const l = b.getAttribute("data-lang");
      if (l === currentLang) b.classList.add("active");
      else b.classList.remove("active");
    });
  });
}
function applyI18n() {
  const dict = I18N[currentLang] || I18N.vi;
  document.querySelectorAll("[data-i18n-key]").forEach((el) => {
    const key = el.getAttribute("data-i18n-key");
    if (dict[key]) el.textContent = dict[key];
  });
}

/* CAMERA STORAGE */
function loadCamerasFromLocal() {
  try {
    const s = localStorage.getItem("iot_cameras");
    cameras = s ? JSON.parse(s) : [];
  } catch {
    cameras = [];
  }
}
function saveCamerasToLocal() {
  localStorage.setItem("iot_cameras", JSON.stringify(cameras));
}

/* VIEW */
function showAuthPage() {
  authPage.style.display = "flex";
  appPage.style.display = "none";
}
function showAppPage() {
  authPage.style.display = "none";
  appPage.style.display = "block";
}
function updateUserBadge() {
  if (currentUser) {
    let emailInfo = "";
    if (currentUser.email) emailInfo = currentUser.emailVerified ? " ✅" : " ⚠️";
    userBadge.textContent =
      currentUser.username + " (" + currentUser.role + ")" + (emailInfo ? " " + emailInfo : "");
  } else userBadge.textContent = "";
  updateAdminTabVisibility();
}
function updateAdminTabVisibility() {
  if (!navAdmin) return;
  if (currentUser && currentUser.role === "admin") navAdmin.style.display = "flex";
  else {
    navAdmin.style.display = "none";
    adminSection.style.display = "none";
  }
}

/* AUTH TABS */
tabLogin.onclick = () => {
  tabLogin.classList.add("active");
  tabRegister.classList.remove("active");
  loginForm.style.display = "block";
  registerForm.style.display = "none";
  authMessage.textContent =
    currentLang === "vi" ? "Đăng nhập để vào app." : "Login to access app.";
};
tabRegister.onclick = () => {
  tabRegister.classList.add("active");
  tabLogin.classList.remove("active");
  loginForm.style.display = "none";
  registerForm.style.display = "block";
  authMessage.textContent =
    currentLang === "vi" ? "Tạo user mới." : "Create new user.";
};

/* BACKEND URL */
apiBaseInput.value = API_BASE;
toggleApiBaseBtn.onclick = () => {
  apiBaseRow.style.display = apiBaseRow.style.display === "none" ? "flex" : "none";
};
saveApiBaseBtn.onclick = () => {
  const val = apiBaseInput.value.trim();
  if (!val) return;
  API_BASE = val.replace(/\/+$/, "");
  localStorage.setItem("iot_api_base", API_BASE);
  authMessage.textContent = "Saved API_BASE.";
};

/* LOGIN */
loginBtn.onclick = async () => {
  const u = loginUserInput.value.trim();
  const p = loginPassInput.value.trim();
  if (!u || !p) {
    authMessage.textContent =
      currentLang === "vi" ? "Nhập đủ username/password." : "Fill username/password.";
    return;
  }
  authMessage.textContent =
    currentLang === "vi" ? "Đang đăng nhập..." : "Logging in...";
  try {
    const res = await fetch(API_BASE + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p }),
    });
    const data = await res.json();
    if (!res.ok) {
      authMessage.textContent = "Login lỗi: " + (data.error || res.status);
      return;
    }
    token = data.token;
    currentUser = data.user;
    localStorage.setItem("iot_token", token);
    localStorage.setItem("iot_user", JSON.stringify(currentUser));
    authMessage.textContent = currentLang === "vi" ? "OK." : "OK.";
    updateUserBadge();
    showAppPage();
    fetchHealth();
    loadCamerasFromLocal();
    renderCameras(cameras);
    fetchAll();
  } catch (err) {
    authMessage.textContent = "Login error: " + err.message;
  }
};

/* REGISTER */
registerBtn.onclick = async () => {
  const u = regUserInput.value.trim();
  const email = regEmailInput.value.trim();
  const p = regPassInput.value.trim();
  const pc = regPassConfirmInput.value.trim();
  if (!u || !email || !p || !pc) {
    authMessage.textContent =
      currentLang === "vi" ? "Nhập đủ thông tin." : "Fill all fields.";
    return;
  }
  if (p !== pc) {
    authMessage.textContent =
      currentLang === "vi" ? "Mật khẩu không khớp." : "Password mismatch.";
    return;
  }
  authMessage.textContent =
    currentLang === "vi" ? "Đang tạo user..." : "Creating user...";
  try {
    const res = await fetch(API_BASE + "/api/auth/register-public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, email, password: p, confirmPassword: pc }),
    });
    const data = await res.json();
    if (!res.ok) {
      authMessage.textContent = "Đăng ký lỗi: " + (data.error || res.status);
      return;
    }
    token = data.token;
    currentUser = data.user;
    localStorage.setItem("iot_token", token);
    localStorage.setItem("iot_user", JSON.stringify(currentUser));
    authMessage.textContent = (data.message || "OK.") + " OTP xem email/console.";
    updateUserBadge();
    showAppPage();
    fetchHealth();
    loadCamerasFromLocal();
    renderCameras(cameras);
    fetchAll();
  } catch (err) {
    authMessage.textContent = "Đăng ký error: " + err.message;
  }
};

/* OTP */
verifyOtpBtn.onclick = async () => {
  const otp = otpInput.value.trim();
  if (!otp) {
    authMessage.textContent = "Nhập OTP.";
    return;
  }
  if (!token) {
    authMessage.textContent = "Cần login.";
    return;
  }
  try {
    const res = await fetch(API_BASE + "/api/auth/verify-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ otp }),
    });
    const data = await res.json();
    if (!res.ok) {
      authMessage.textContent = "OTP lỗi: " + (data.error || res.status);
      return;
    }
    currentUser = data.user;
    localStorage.setItem("iot_user", JSON.stringify(currentUser));
    authMessage.textContent = data.message || "OK.";
    updateUserBadge();
  } catch (err) {
    authMessage.textContent = "OTP error: " + err.message;
  }
};
resendOtpBtn.onclick = async () => {
  if (!token) {
    authMessage.textContent = "Cần login.";
    return;
  }
  try {
    const res = await fetch(API_BASE + "/api/auth/send-otp", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();
    if (!res.ok) {
      authMessage.textContent = "OTP lỗi: " + (data.error || res.status);
      return;
    }
    authMessage.textContent = data.message || "Đã gửi lại.";
  } catch (err) {
    authMessage.textContent = "OTP error: " + err.message;
  }
};

/* LOGOUT + CHANGE PASS */
logoutBtn.onclick = () => {
  token = null;
  currentUser = null;
  localStorage.removeItem("iot_token");
  localStorage.removeItem("iot_user");
  lastDevices = [];
  tbody.innerHTML = `<tr><td colspan="6" class="small">Chưa có dữ liệu.</td></tr>`;
  adminUserTableBody.innerHTML = `<tr><td colspan="6" class="small">...</td></tr>`;
  detailEmpty.style.display = "block";
  deviceDetailPanel.style.display = "none";
  cameraDetailPanel.style.display = "none";
  widgets = [];
  selectedWidgetId = null;
  renderWidgets();
  showAuthPage();
  authMessage.textContent = "Đã logout.";
};
changePassBtn.onclick = async () => {
  if (!token || !currentUser) {
    alert("Cần login.");
    return;
  }
  const oldPass = prompt("Mật khẩu hiện tại:");
  if (!oldPass) return;
  const newPass = prompt("Mật khẩu mới:");
  if (!newPass) return;
  const confirm = prompt("Nhập lại mật khẩu mới:");
  if (confirm !== newPass) {
    alert("Không khớp.");
    return;
  }
  try {
    const res = await fetch(API_BASE + "/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass, confirmPassword: confirm }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert("Lỗi: " + (data.error || res.status));
      return;
    }
    alert("Đã đổi, nên login lại.");
  } catch (err) {
    alert("Lỗi: " + err.message);
  }
};

/* NAV */
function showTab(tab) {
  navButtons.forEach((btn) => {
    const t = btn.getAttribute("data-tab");
    if (t === tab) btn.classList.add("active");
    else btn.classList.remove("active");
  });
  dashboardSection.style.display = tab === "dashboard" ? "block" : "none";
  devicesSection.style.display = tab === "devices" ? "block" : "none";
  camerasSection.style.display = tab === "cameras" ? "block" : "none";
  adminSection.style.display = tab === "admin" ? "block" : "none";
  if (tab === "devices") fetchAll();
  if (tab === "dashboard") renderWidgets();
  if (tab === "admin" && currentUser && currentUser.role === "admin") fetchAdminUsers();
}
navButtons.forEach((btn) => {
  btn.onclick = () => {
    const tab = btn.getAttribute("data-tab");
    if (tab === "admin" && (!currentUser || currentUser.role !== "admin")) {
      alert("Không phải admin.");
      return;
    }
    showTab(tab);
  };
});
sideNavToggle.onclick = () => {
  sideNav.classList.toggle("collapsed");
};

/* HEALTH */
async function fetchHealth() {
  try {
    const res = await fetch(API_BASE + "/api/health");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.status === "ok") {
      healthBadge.textContent = "Backend OK";
      healthBadge.classList.remove("pill-red");
      healthBadge.classList.add("pill-green");
    } else throw new Error("status != ok");
  } catch {
    healthBadge.textContent = "Backend lỗi";
    healthBadge.classList.remove("pill-green");
    healthBadge.classList.add("pill-red");
  }
}

/* DEVICES */
toggleAutoBtn.onclick = () => {
  autoRefresh = !autoRefresh;
  if (autoRefresh) {
    toggleAutoBtn.textContent = "Auto: ON";
    toggleAutoBtn.classList.remove("secondary");
    toggleAutoBtn.classList.add("danger");
    autoTimer = setInterval(fetchAll, 5000);
  } else {
    toggleAutoBtn.textContent = "Auto: OFF";
    toggleAutoBtn.classList.add("secondary");
    toggleAutoBtn.classList.remove("danger");
    if (autoTimer) clearInterval(autoTimer);
  }
};
refreshBtn.onclick = fetchAll;
searchInput.oninput = () => renderDevices(lastDevices);
claimBtn.onclick = async () => {
  if (!token) {
    statusEl.textContent = "Cần login.";
    return;
  }
  const id = claimDeviceId.value.trim();
  const name = claimDeviceName.value.trim();
  if (!id) {
    statusEl.textContent = "Nhập ID.";
    return;
  }
  statusEl.textContent = "Claim " + id + "...";
  try {
    const res = await fetch(API_BASE + "/api/devices/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ deviceId: id, name }),
    });
    const data = await res.json();
    if (!res.ok) {
      statusEl.textContent = "Claim lỗi: " + (data.error || res.status);
      return;
    }
    statusEl.textContent = "OK.";
    fetchAll();
  } catch (err) {
    statusEl.textContent = "Lỗi: " + err.message;
  }
};
async function fetchDevices() {
  if (!token) throw new Error("Chưa login.");
  const res = await fetch(API_BASE + "/api/devices", {
    headers: { Authorization: "Bearer " + token },
  });
  if (res.status === 401) throw new Error("Token sai/hết hạn.");
  if (!res.ok) throw new Error("HTTP " + res.status);
  const devices = await res.json();
  const now = Date.now();
  devices.forEach((d) => {
    const id = d.id;
    const v = typeof d.lastValue === "number" ? d.lastValue : null;
    if (!historyMap[id]) historyMap[id] = [];
    if (v !== null) {
      historyMap[id].push(v);
      if (historyMap[id].length > 50) historyMap[id].shift();
    }
    if (d.updatedAt) {
      const age = now - new Date(d.updatedAt).getTime();
      if (age > 30000) d.lastState = "OFFLINE";
    }
  });
  return devices;
}
async function fetchAll() {
  statusEl.textContent = "Loading...";
  refreshBtn.disabled = true;
  try {
    await fetchHealth();
    const devices = await fetchDevices();
    lastDevices = devices;
    renderDevices(devices);
    renderCameras(cameras);
    statusEl.textContent = "Devices: " + devices.length;
    camStatus.textContent = "Cameras: " + cameras.length;
    renderWidgets();
  } catch (err) {
    statusEl.textContent = "Lỗi: " + err.message;
    tbody.innerHTML = `<tr><td colspan="6" class="small">Lỗi load devices.</td></tr>`;
  } finally {
    refreshBtn.disabled = false;
  }
}
function renderDevices(devices) {
  const keyword = searchInput.value.trim().toLowerCase();
  let filtered = devices;
  if (keyword) {
    filtered = devices.filter(
      (d) =>
        String(d.id).toLowerCase().includes(keyword) ||
        String(d.name || "").toLowerCase().includes(keyword),
    );
  }
  if (!filtered || filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="small">Không có device.</td></tr>`;
    return;
  }
  tbody.innerHTML = "";
  filtered.forEach((d) => {
    const tr = document.createElement("tr");
    let isOnline = String(d.lastState || "").toUpperCase() === "ONLINE";
    if (d.updatedAt) {
      const age = Date.now() - new Date(d.updatedAt).getTime();
      if (age > 30000) isOnline = false;
    }
    const sensors = d.sensors || {};
    const sensorSummary = [];
    if (sensors.temp != null) sensorSummary.push(`T: ${sensors.temp}°C`);
    if (sensors.hum != null) sensorSummary.push(`H: ${sensors.hum}%`);
    if (sensors.motion != null) sensorSummary.push(`M: ${sensors.motion ? 1 : 0}`);
    const valueText = d.lastValue ?? (sensorSummary.length ? sensorSummary.join(" | ") : "-");
    tr.innerHTML = `
      <td>${d.id}</td>
      <td>${d.name || ""}</td>
      <td>
        <span class="badge ${isOnline ? "badge-online" : "badge-offline"}">
          <span class="status-dot ${isOnline ? "dot-online" : "dot-offline"}"></span>
          ${d.lastState || "UNKNOWN"}
        </span>
      </td>
      <td>${valueText}</td>
      <td>${d.updatedAt ? new Date(d.updatedAt).toLocaleString() : "-"}</td>
      <td>
        <button class="secondary btn-sm" data-action="toggle">Toggle</button>
        <button class="danger btn-sm" data-action="delete">Xoá</button>
      </td>`;
    tr.onclick = (e) => {
      if (e.target.tagName.toLowerCase() === "button") return;
      showDeviceDetail(d);
    };
    const btnToggle = tr.querySelector('button[data-action="toggle"]');
    const btnDel = tr.querySelector('button[data-action="delete"]');
    btnToggle.onclick = (e) => {
      e.stopPropagation();
      sendToggle(d.id);
    };
    btnDel.onclick = (e) => {
      e.stopPropagation();
      deleteDevice(d.id);
    };
    tbody.appendChild(tr);
  });
}
function showDeviceDetail(d) {
  detailEmpty.style.display = "none";
  cameraDetailPanel.style.display = "none";
  deviceDetailPanel.style.display = "block";
  detailId.textContent = d.id;
  detailName.textContent = d.name || "";
  let isOnline = String(d.lastState || "").toUpperCase() === "ONLINE";
  if (d.updatedAt) {
    const age = Date.now() - new Date(d.updatedAt).getTime();
    if (age > 30000) isOnline = false;
  }
  detailState.innerHTML = `
    <span class="badge ${isOnline ? "badge-online" : "badge-offline"}">
      <span class="status-dot ${isOnline ? "dot-online" : "dot-offline"}"></span>
      ${d.lastState || "UNKNOWN"}
    </span>`;
  detailValue.textContent = d.lastValue ?? "-";
  detailUpdated.textContent = d.updatedAt ? new Date(d.updatedAt).toLocaleString() : "-";
  const s = d.sensors || {};
  const parts = [];
  if (s.temp != null) parts.push(`Temp: ${s.temp} °C`);
  if (s.hum != null) parts.push(`Hum: ${s.hum} %`);
  if (s.motion != null) parts.push(`Motion: ${s.motion ? "Có" : "Không"}`);
  detailSensors.textContent = parts.join(" | ") || "Không có.";
  drawHistoryChart(d.id);
  if (fwDeviceId) fwDeviceId.value = d.id;
  if (fwDeviceName && !fwDeviceName.value) fwDeviceName.value = d.name || d.id;
}
function drawHistoryChart(deviceId) {
  const data = historyMap[deviceId] || [];
  const ctx = historyCanvas.getContext("2d");
  ctx.clearRect(0, 0, historyCanvas.width, historyCanvas.height);
  if (data.length === 0) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "11px system-ui";
    ctx.fillText("Không có history.", 8, 18);
    return;
  }
  const w = historyCanvas.width,
    h = historyCanvas.height;
  const min = Math.min(...data),
    max = Math.max(...data),
    pad = 18;
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 1;
  ctx.strokeRect(pad, pad, w - 2 * pad, h - 2 * pad);
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((v, idx) => {
    const x = pad + (idx / Math.max(1, data.length - 1)) * (w - 2 * pad);
    const ratio = max === min ? 0.5 : (v - min) / (max - min);
    const y = h - pad - ratio * (h - 2 * pad);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}
async function sendCommand(deviceId, payload) {
  if (!token) {
    statusEl.textContent = "Cần login.";
    return;
  }
  const cmd = payload && payload.command ? payload.command : "cmd";
  statusEl.textContent = cmd + " " + deviceId + "...";
  try {
    const res = await fetch(API_BASE + "/api/devices/" + deviceId + "/control", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(payload || {}),
    });
    const data = await res.json();
    if (!res.ok) {
      statusEl.textContent = "Lỗi: " + (data.error || res.status);
      return;
    }
    statusEl.textContent = "OK.";
  } catch (err) {
    statusEl.textContent = "Lỗi: " + err.message;
  }
}
async function sendToggle(deviceId) {
  return sendCommand(deviceId, { command: "toggle" });
}
async function deleteDevice(deviceId) {
  if (!token) {
    alert("Cần login.");
    return;
  }
  if (!confirm("Xoá " + deviceId + "?")) return;
  try {
    const res = await fetch(API_BASE + "/api/devices/" + deviceId, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert("Lỗi: " + (data.error || res.status));
      return;
    }
    fetchAll();
  } catch (err) {
    alert("Lỗi: " + err.message);
  }
}

/* CAMERAS */
camRegisterBtn.onclick = () => {
  const id = camIdInput.value.trim();
  const name = camNameInput.value.trim();
  const url = camUrlInput.value.trim();
  if (!id || !url) {
    camStatus.textContent = "Cần ID + URL.";
    return;
  }
  const existing = cameras.find((c) => c.id === id);
  if (existing) {
    existing.name = name;
    existing.snapshotUrl = url;
  } else cameras.push({ id, name, snapshotUrl: url });
  saveCamerasToLocal();
  renderCameras(cameras);
  camStatus.textContent = "OK.";
};
function renderCameras(cams) {
  if (!cams || cams.length === 0) {
    cameraTableBody.innerHTML = `<tr><td colspan="3" class="small">Chưa có camera.</td></tr>`;
    return;
  }
  cameraTableBody.innerHTML = "";
  cams.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${c.id}</td>
      <td>${c.name || ""}</td>
      <td>
        <button class="secondary btn-sm" data-action="view">Xem</button>
        <button class="danger btn-sm" data-action="delete">Xoá</button>
      </td>`;
    const viewBtn = tr.querySelector('button[data-action="view"]');
    const delBtn = tr.querySelector('button[data-action="delete"]');
    viewBtn.onclick = (e) => {
      e.stopPropagation();
      showCameraDetail(c);
    };
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteCamera(c.id);
    };
    tr.onclick = () => showCameraDetail(c);
    cameraTableBody.appendChild(tr);
  });
}
function showCameraDetail(c) {
  detailEmpty.style.display = "none";
  deviceDetailPanel.style.display = "none";
  cameraDetailPanel.style.display = "block";
  camDetailId.textContent = c.id;
  camDetailName.textContent = c.name || "";
  if (c.snapshotUrl) {
    camDetailUrl.innerHTML = `<a href="${c.snapshotUrl}" target="_blank">${c.snapshotUrl}</a>`;
    camDetailImg.src = c.snapshotUrl;
  } else {
    camDetailUrl.textContent = "(no URL)";
    camDetailImg.removeAttribute("src");
  }
}
function deleteCamera(id) {
  if (!confirm("Xoá camera " + id + "?")) return;
  cameras = cameras.filter((c) => c.id !== id);
  saveCamerasToLocal();
  renderCameras(cameras);
  if (camDetailId.textContent === id) {
    cameraDetailPanel.style.display = "none";
    detailEmpty.style.display = "block";
  }
}

/* FIRMWARE GENERATOR */
function addPinRow(name = "", gpio = "", mode = "output") {
  if (!fwPinsTableBody) return;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="fw-pin-name" placeholder="Tên" value="${name}"></td>
    <td><input class="fw-pin-gpio" placeholder="GPIO" value="${gpio}" style="max-width:60px;"></td>
    <td>
      <select class="fw-pin-mode">
        <option value="output" ${mode === "output" ? "selected" : ""}>Output</option>
        <option value="input-digital" ${mode === "input-digital" ? "selected" : ""}>In dig</option>
        <option value="input-analog" ${mode === "input-analog" ? "selected" : ""}>In ana</option>
      </select>
    </td>
    <td><button type="button" class="danger btn-sm fw-pin-remove">X</button></td>`;
  tr.querySelector(".fw-pin-remove").onclick = () => tr.remove();
  fwPinsTableBody.appendChild(tr);
}
function buildFirmwareCode(cfg) {
  function esc(str) {
    return String(str || "").replace(/"/g, '\\"');
  }
  const deviceId = esc(cfg.deviceId || "my-device");
  const deviceName = esc(cfg.deviceName || cfg.deviceId || "My IoT Device");
  const wifiSsid = esc(cfg.wifiSsid || "YOUR_WIFI_SSID");
  const wifiPass = esc(cfg.wifiPass || "YOUR_WIFI_PASSWORD");
  const mqttHost = esc(cfg.mqttHost || "broker.hivemq.com");
  const mqttPort = parseInt(cfg.mqttPort, 10) || 1883;
  const outputs = cfg.outputs || [];
  const inDig = cfg.inputsDigital || [];
  const inAna = cfg.inputsAnalog || [];
  const lines = [];
  lines.push("// ESP32 firmware generated by your IoT Platform");
  lines.push("// Board: ESP32 (Arduino core)");
  lines.push("// Thư viện: PubSubClient, ArduinoJson");
  lines.push("");
  lines.push("#include <WiFi.h>");
  lines.push("#include <PubSubClient.h>");
  lines.push("#include <ArduinoJson.h>");
  lines.push("");
  lines.push(`const char* WIFI_SSID = "${wifiSsid}";`);
  lines.push(`const char* WIFI_PASS = "${wifiPass}";`);
  lines.push("");
  lines.push(`const char* MQTT_HOST = "${mqttHost}";`);
  lines.push(`const int   MQTT_PORT = ${mqttPort};`);
  lines.push("");
  lines.push(`String deviceId = "${deviceId}";`);
  lines.push(`String deviceName = "${deviceName}";`);
  lines.push("");
  outputs.forEach((p, idx) => {
    lines.push(`const int OUTPUT_PIN_${idx} = ${p.gpio}; // ${p.name}`);
  });
  if (outputs.length > 0) lines.push("");
  inDig.forEach((p, idx) => {
    lines.push(`const int INPUT_DIGITAL_PIN_${idx} = ${p.gpio}; // ${p.name}`);
  });
  if (inDig.length > 0) lines.push("");
  inAna.forEach((p, idx) => {
    lines.push(`const int INPUT_ANALOG_PIN_${idx} = ${p.gpio}; // ${p.name}`);
  });
  if (inAna.length > 0) lines.push("");
  lines.push("WiFiClient espClient;");
  lines.push("PubSubClient client(espClient);");
  lines.push("");
  lines.push("void callback(char* topic, byte* payload, unsigned int length) {");
  lines.push("  String msg;");
  lines.push("  for (unsigned int i = 0; i < length; i++) {");
  lines.push("    msg += (char)payload[i];");
  lines.push("  }");
  lines.push("  Serial.print(\"Control message: \");");
  lines.push("  Serial.println(msg);");
  if (outputs.length > 0) {
    lines.push("  if (msg.indexOf(\"toggle\") >= 0) {");
    outputs.forEach((p, idx) => {
      lines.push(`    digitalWrite(OUTPUT_PIN_${idx}, !digitalRead(OUTPUT_PIN_${idx}));`);
    });
    lines.push("  }");
  }
  lines.push("}");
  lines.push("");
  lines.push("void reconnect() {");
  lines.push("  while (!client.connected()) {");
  lines.push("    Serial.print(\"Connecting MQTT...\");");
  lines.push("    String clientId = \"esp32-\" + deviceId;");
  lines.push("    if (client.connect(clientId.c_str())) {");
  lines.push("      Serial.println(\"connected\");");
  lines.push("      String controlTopic = \"iot/demo/\" + deviceId + \"/control\";");
  lines.push("      client.subscribe(controlTopic.c_str());");
  lines.push("    } else {");
  lines.push("      Serial.print(\" failed, rc=\");");
  lines.push("      Serial.println(client.state());");
  lines.push("      delay(2000);");
  lines.push("    }");
  lines.push("  }");
  lines.push("}");
  lines.push("");
  lines.push("void setup() {");
  lines.push("  Serial.begin(115200);");
  lines.push("  delay(1000);");
  lines.push("");
  if (outputs.length > 0) {
    lines.push("  // Output");
    outputs.forEach((p, idx) => {
      lines.push(`  pinMode(OUTPUT_PIN_${idx}, OUTPUT);`);
      lines.push(`  digitalWrite(OUTPUT_PIN_${idx}, LOW);`);
    });
    lines.push("");
  }
  if (inDig.length > 0) {
    lines.push("  // Input digital");
    inDig.forEach((p, idx) => {
      lines.push(`  pinMode(INPUT_DIGITAL_PIN_${idx}, INPUT_PULLUP);`);
    });
    lines.push("");
  }
  lines.push("  Serial.print(\"Connecting WiFi\");");
  lines.push("  WiFi.begin(WIFI_SSID, WIFI_PASS);");
  lines.push("  while (WiFi.status() != WL_CONNECTED) {");
  lines.push("    delay(500);");
  lines.push("    Serial.print(\".\");");
  lines.push("  }");
  lines.push("  Serial.println();");
  lines.push("  Serial.print(\"WiFi OK, IP: \");");
  lines.push("  Serial.println(WiFi.localIP());");
  lines.push("");
  lines.push("  client.setServer(MQTT_HOST, MQTT_PORT);");
  lines.push("  client.setCallback(callback);");
  lines.push("}");
  lines.push("");
  lines.push("unsigned long lastPublish = 0;");
  lines.push("");
  lines.push("void loop() {");
  lines.push("  if (!client.connected()) {");
  lines.push("    reconnect();");
  lines.push("  }");
  lines.push("  client.loop();");
  lines.push("");
  lines.push("  unsigned long now = millis();");
  lines.push("  if (now - lastPublish > 2000) {");
  lines.push("    lastPublish = now;");
  lines.push("");
  lines.push("    StaticJsonDocument<512> doc;");
  lines.push("    doc[\"name\"] = deviceName;");
  lines.push("    doc[\"state\"] = \"ONLINE\";");
  if (inDig.length > 0 || inAna.length > 0) {
    lines.push("    JsonObject sensors = doc.createNestedObject(\"sensors\");");
    inDig.forEach((p, idx) => {
      lines.push(`    sensors["${esc(p.name)}"] = digitalRead(INPUT_DIGITAL_PIN_${idx});`);
    });
    inAna.forEach((p, idx) => {
      lines.push(`    sensors["${esc(p.name)}"] = analogRead(INPUT_ANALOG_PIN_${idx});`);
    });
  }
  lines.push("");
  lines.push("    String topic = \"iot/demo/\" + deviceId + \"/state\";");
  lines.push("    String payload;");
  lines.push("    serializeJson(doc, payload);");
  lines.push("    client.publish(topic.c_str(), payload.c_str());");
  lines.push("  }");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}
if (fwAddPinBtn && fwPinsTableBody) {
  addPinRow("led", "2", "output");
  addPinRow("temp", "34", "input-analog");
  fwAddPinBtn.onclick = () => addPinRow("", "", "output");
}
if (fwMqttHost && !fwMqttHost.value) fwMqttHost.value = "broker.hivemq.com";
if (fwMqttPort && !fwMqttPort.value) fwMqttPort.value = "1883";
if (fwCodeOutput && !fwCodeOutput.value) {
  fwCodeOutput.value =
    "// Nhấn Generate để tạo code ESP32 ở đây.\n// Nhớ cài PubSubClient + ArduinoJson trong Arduino IDE.\n";
}
if (fwGenerateBtn) {
  fwGenerateBtn.onclick = () => {
    const deviceId = fwDeviceId.value.trim();
    if (!deviceId) {
      alert("Nhập Device ID.");
      return;
    }
    const deviceName = fwDeviceName.value.trim() || deviceId;
    const wifiSsid = fwWifiSsid.value.trim() || "YOUR_WIFI_SSID";
    const wifiPass = fwWifiPass.value.trim() || "YOUR_WIFI_PASSWORD";
    const mqttHost = fwMqttHost.value.trim() || "broker.hivemq.com";
    const mqttPort = fwMqttPort.value.trim() || "1883";
    const rows = fwPinsTableBody ? Array.from(fwPinsTableBody.querySelectorAll("tr")) : [];
    const outputs = [],
      inputsDigital = [],
      inputsAnalog = [];
    rows.forEach((tr) => {
      const nameEl = tr.querySelector(".fw-pin-name");
      const gpioEl = tr.querySelector(".fw-pin-gpio");
      const modeEl = tr.querySelector(".fw-pin-mode");
      if (!nameEl || !gpioEl || !modeEl) return;
      const name = nameEl.value.trim();
      const gpioStr = gpioEl.value.trim();
      const mode = modeEl.value;
      if (!name || !gpioStr) return;
      const gpio = parseInt(gpioStr, 10);
      if (Number.isNaN(gpio)) return;
      const entry = { name, gpio, mode };
      if (mode === "output") outputs.push(entry);
      else if (mode === "input-digital") inputsDigital.push(entry);
      else if (mode === "input-analog") inputsAnalog.push(entry);
    });
    if (outputs.length === 0 && inputsDigital.length === 0 && inputsAnalog.length === 0) {
      alert("Cần ít nhất 1 chân.");
      return;
    }
    const code = buildFirmwareCode({
      deviceId,
      deviceName,
      wifiSsid,
      wifiPass,
      mqttHost,
      mqttPort,
      outputs,
      inputsDigital,
      inputsAnalog,
    });
    fwCodeOutput.value = code;
  };
}
if (fwCopyBtn) {
  fwCopyBtn.onclick = () => {
    const txt = fwCodeOutput.value || "";
    if (!txt.trim()) {
      fwCopyStatus.textContent = "Không có code.";
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(txt)
        .then(() => {
          fwCopyStatus.textContent = "Đã copy ✅";
          setTimeout(() => (fwCopyStatus.textContent = ""), 1500);
        })
        .catch(() => {
          fwCopyStatus.textContent = "Copy lỗi.";
        });
    } else {
      fwCodeOutput.select();
      document.execCommand("copy");
      fwCopyStatus.textContent = "Đã copy (fallback).";
      setTimeout(() => (fwCopyStatus.textContent = ""), 1500);
    }
  };
}

/* ADMIN */
async function fetchAdminUsers() {
  if (!token || !currentUser || currentUser.role !== "admin") {
    adminUserTableBody.innerHTML = `<tr><td colspan="6" class="small">Không phải admin.</td></tr>`;
    return;
  }
  adminUserTableBody.innerHTML = `<tr><td colspan="6" class="small">Loading...</td></tr>`;
  try {
    const res = await fetch(API_BASE + "/api/admin/users", {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();
    if (!res.ok) {
      adminUserTableBody.innerHTML = `<tr><td colspan="6" class="small">Lỗi: ${
        data.error || res.status
      }</td></tr>`;
      return;
    }
    renderAdminUsers(data);
  } catch (err) {
    adminUserTableBody.innerHTML = `<tr><td colspan="6" class="small">Lỗi: ${err.message}</td></tr>`;
  }
}
function renderAdminUsers(users) {
  if (!users || users.length === 0) {
    adminUserTableBody.innerHTML = `<tr><td colspan="6" class="small">Không có user.</td></tr>`;
    return;
  }
  adminUserTableBody.innerHTML = "";
  users.forEach((u) => {
    const tr = document.createElement("tr");
    const created = u.createdAt ? new Date(u.createdAt).toLocaleString() : "-";
    const emailLabel = (u.email || "") + (u.email ? (u.emailVerified ? " ✅" : " ⚠️") : "");
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.username}</td>
      <td>${emailLabel}</td>
      <td>${u.role}</td>
      <td>${created}</td>
      <td>
        <button class="secondary btn-sm" data-role="${u.id}">
          ${u.role === "admin" ? "Bỏ admin" : "Set admin"}
        </button>
        <button class="secondary btn-sm" data-pw="${u.id}">Đổi pass</button>
        <button class="danger btn-sm" data-del="${u.id}">Xoá</button>
      </td>`;
    const btnRole = tr.querySelector("button[data-role]");
    const btnPw = tr.querySelector("button[data-pw]");
    const btnDel = tr.querySelector("button[data-del]");
    btnRole.onclick = async (e) => {
      e.stopPropagation();
      const newRole = u.role === "admin" ? "user" : "admin";
      if (u.id === currentUser.id && newRole !== "admin") {
        alert("Không tự bỏ admin.");
        return;
      }
      if (!confirm(`Chuyển ${u.username} -> ${newRole}?`)) return;
      try {
        const res = await fetch(API_BASE + "/api/admin/users/" + u.id + "/role", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({ role: newRole }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert("Lỗi: " + (data.error || res.status));
          return;
        }
        fetchAdminUsers();
      } catch (err) {
        alert("Lỗi: " + err.message);
      }
    };
    btnPw.onclick = async (e) => {
      e.stopPropagation();
      const newPass = prompt("Mật khẩu mới cho: " + u.username);
      if (!newPass) return;
      try {
        const res = await fetch(API_BASE + "/api/admin/users/" + u.id + "/password", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({ newPassword: newPass }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert("Lỗi: " + (data.error || res.status));
          return;
        }
        alert("OK.");
      } catch (err) {
        alert("Lỗi: " + err.message);
      }
    };
    btnDel.onclick = async (e) => {
      e.stopPropagation();
      if (u.id === currentUser.id) {
        alert("Không xoá user đang login.");
        return;
      }
      if (!confirm("Xoá user " + u.username + "?")) return;
      try {
        const res = await fetch(API_BASE + "/api/admin/users/" + u.id, {
          method: "DELETE",
          headers: { Authorization: "Bearer " + token },
        });
        const data = await res.json();
        if (!res.ok) {
          alert("Lỗi: " + (data.error || res.status));
          return;
        }
        fetchAdminUsers();
      } catch (err) {
        alert("Lỗi: " + err.message);
      }
    };
    adminUserTableBody.appendChild(tr);
  });
}

/* ===== DASHBOARD WIDGETS (session only) ===== */
function getWidgetValue(w, dev) {
  let raw = null;
  if (dev) {
    if (dev.sensors && w.sensorKey && dev.sensors[w.sensorKey] != null)
      raw = dev.sensors[w.sensorKey];
    else if (typeof dev.lastValue === "number") raw = dev.lastValue;
    else if (dev.sensors) {
      for (const k of Object.keys(dev.sensors)) {
        const v = dev.sensors[k];
        if (typeof v === "number") {
          raw = v;
          break;
        }
      }
    }
  }
  return raw;
}

function selectWidget(id, { openConfig = false } = {}) {
  selectedWidgetId = id;
  if (!widgetGrid) return;
  widgetGrid.querySelectorAll(".widget-card").forEach((card) => {
    if (card.dataset.id === String(id)) card.classList.add("widget-selected");
    else card.classList.remove("widget-selected");
  });
  const w = widgets.find((x) => x.id === id) || null;
  if (openConfig) updateWidgetConfig(w);
  else updateWidgetConfig(null);
}

function updateWidgetConfig(w) {
  if (!widgetConfigPanel || !widgetConfigOverlay) return;
  if (!w) {
    widgetConfigOverlay.classList.remove("open");
    widgetConfigPanel.classList.remove("has-selection");
    if (widgetConfigTitle) widgetConfigTitle.value = "";
    if (widgetConfigDevice) widgetConfigDevice.value = "";
    if (widgetConfigSensor) widgetConfigSensor.value = "";
    if (widgetConfigTheme) widgetConfigTheme.value = "green";
    if (widgetConfigSize) widgetConfigSize.value = "m";
    if (widgetConfigRangeRow) widgetConfigRangeRow.style.display = "none";
    return;
  }
  widgetConfigOverlay.classList.add("open");
  widgetConfigPanel.classList.add("has-selection");
  if (widgetConfigTitle) widgetConfigTitle.value = w.label || "";
  if (widgetConfigDevice) widgetConfigDevice.value = w.deviceId || "";
  if (widgetConfigSensor) widgetConfigSensor.value = w.sensorKey || "";
  if (widgetConfigTheme) widgetConfigTheme.value = w.theme || "green";
  if (widgetConfigSize) widgetConfigSize.value = w.size || "m";
  const needsRange = w.type === "thermo" || w.type === "gauge" || w.type === "slider";
  if (widgetConfigRangeRow) widgetConfigRangeRow.style.display = needsRange ? "flex" : "none";
  if (needsRange) {
    if (widgetConfigRangeMin) widgetConfigRangeMin.value = typeof w.min === "number" ? w.min : "";
    if (widgetConfigRangeMax) widgetConfigRangeMax.value = typeof w.max === "number" ? w.max : "";
  }
}
function widgetConfigClose() {
  updateWidgetConfig(null);
}
if (widgetConfigCloseBtn) {
  widgetConfigCloseBtn.onclick = (e) => {
    e.stopPropagation();
    updateWidgetConfig(null);
  };
}
if (widgetConfigOverlay) {
  widgetConfigOverlay.addEventListener("click", (e) => {
    if (e.target === widgetConfigOverlay) updateWidgetConfig(null);
  });
}

/* apply classes for theme + size */
function syncWidgetCard(w) {
  if (!widgetGrid) return;
  const card = widgetGrid.querySelector(`.widget-card[data-id="${w.id}"]`);
  if (!card) return;
  const t = card.querySelector(".widget-title");
  const label = w.label || w.type.toUpperCase();
  const devLabel = w.deviceId ? " · " + w.deviceId : "";
  if (t) {
    t.textContent = label + devLabel;
    t.title = label + devLabel;
  }
  card.classList.remove(
    "widget-theme-green",
    "widget-theme-blue",
    "widget-theme-amber",
    "widget-theme-pink",
    "widget-theme-gray",
    "widget-size-s",
    "widget-size-m",
    "widget-size-l",
  );
  card.classList.add(
    "widget-theme-" + (w.theme || "green"),
    "widget-size-" + (w.size || "m"),
  );
}

/* render widgets */
function renderWidgets() {
  if (!widgetGrid) return;
  widgetGrid.innerHTML = "";
  widgetGrid.classList.toggle("widgets-running", widgetsRunning);
  if (!widgets.length) {
    const d = document.createElement("div");
    d.className = "empty-hint";
    d.textContent = currentLang === "vi" ? "Chưa có widget." : "No widget.";
    widgetGrid.appendChild(d);
    updateWidgetConfig(null);
    return;
  }
  widgets.forEach((w) => {
    const dev = lastDevices.find((d) => String(d.id) === String(w.deviceId));
    const val = getWidgetValue(w, dev);
    const card = document.createElement("div");
    const theme = w.theme || "green";
    const size = w.size || "m";
    card.className = `widget-card widget-${w.type} widget-theme-${theme} widget-size-${size}`;
    card.dataset.id = w.id;
    if (w.id === selectedWidgetId) card.classList.add("widget-selected");
    const label = w.label || w.type.toUpperCase();
    const devLabel = w.deviceId ? " · " + w.deviceId : "";
    const hasDev = !!dev;
    const valueDisplay = val == null ? "--" : val;
    let bodyInner = "";
    if (w.type === "thermo") {
      const min = typeof w.min === "number" ? w.min : 0;
      const max = typeof w.max === "number" ? w.max : 100;
      let level = 0;
      if (typeof val === "number" && max > min) {
        level = Math.max(0, Math.min(1, (val - min) / (max - min)));
      }
      const levelPct = (level * 100).toFixed(0) + "%";
      bodyInner = `
        <div class="widget-thermo" style="--thermo-level:${levelPct};">
          <div class="thermo-icon">
            <div class="thermo-mercury"></div>
            <div class="thermo-bulb"></div>
          </div>
          <div class="widget-thermo-info">
            <div class="widget-value-big">${valueDisplay}<span class="widget-unit">°C</span></div>
            <div class="widget-meta">Range: ${min} – ${max}</div>
          </div>
        </div>`;
    } else if (w.type === "gauge") {
      const min = typeof w.min === "number" ? w.min : 0;
      const max = typeof w.max === "number" ? w.max : 100;
      let percent = 0;
      if (typeof val === "number" && max > min) {
        percent = Math.max(0, Math.min(1, (val - min) / (max - min)));
      }
      const barWidth = (percent * 100).toFixed(0);
      bodyInner = `
        <div class="widget-value-big">${valueDisplay}</div>
        <div style="height:6px;border-radius:999px;background:#111827;overflow:hidden;margin-top:2px;">
          <div style="height:100%;width:${barWidth}%;background:linear-gradient(90deg,#22c55e,#eab308,#ef4444);"></div>
        </div>
        <div class="widget-meta">Range: ${min} – ${max}</div>`;
    } else if (w.type === "slider") {
      const min = typeof w.min === "number" ? w.min : 0;
      const max = typeof w.max === "number" ? w.max : 100;
      const sliderVal =
        typeof w.currentValue === "number" ? w.currentValue : Math.round((min + max) / 2);
      bodyInner = `
        <div class="widget-slider-row widget-control">
          <input type="range" min="${min}" max="${max}" value="${sliderVal}" class="widget-slider-input">
          <span class="widget-slider-value">${sliderVal}</span>
        </div>
        <div class="widget-meta">Analog: ${min} – ${max}</div>`;
    } else if (w.type === "dpad") {
      bodyInner = `
        <div class="widget-dpad widget-control">
          <div class="widget-dpad-row">
            <button type="button" class="dpad-btn" data-dir="up">↑</button>
          </div>
          <div class="widget-dpad-row">
            <button type="button" class="dpad-btn" data-dir="left">←</button>
            <button type="button" class="dpad-btn" data-dir="center">⏺</button>
            <button type="button" class="dpad-btn" data-dir="right">→</button>
          </div>
          <div class="widget-dpad-row">
            <button type="button" class="dpad-btn" data-dir="down">↓</button>
          </div>
        </div>`;
    } else {
      bodyInner = `<div class="widget-meta">Last: ${valueDisplay}</div>`;
    }
    const isOn = dev && String(dev.lastState || "").toUpperCase() === "ONLINE";
    card.innerHTML = `
      <div class="widget-header">
        <span class="widget-title" title="${label + devLabel}">${label}${devLabel}</span>
        <div style="display:flex;gap:4px;align-items:center;">
          <span class="widget-tag">${hasDev ? "Online" : "No data"}</span>
          <button type="button" class="icon-btn btn-sm widget-config-btn">⚙</button>
          <button type="button" class="icon-btn btn-sm widget-remove">✕</button>
        </div>
      </div>
      <div class="widget-body">
        ${
          w.type === "switch"
            ? `<button type="button" class="widget-switch-btn widget-control ${
                isOn ? "on" : "off"
              }">
               <span class="widget-switch-track">
                 <span class="widget-switch-thumb"></span>
               </span>
               <span class="widget-switch-label">${isOn ? "ON" : "OFF"}</span>
             </button>`
            : ""
        }
        ${w.type !== "switch" ? bodyInner : ""}
        <div class="widget-meta">Device: ${w.deviceId || "-"}${
          w.sensorKey ? " · " + w.sensorKey : ""
        }</div>
      </div>`;
    const btnRemove = card.querySelector(".widget-remove");
    btnRemove.onclick = (e) => {
      e.stopPropagation();
      widgets = widgets.filter((x) => x.id !== w.id);
      if (selectedWidgetId === w.id) selectedWidgetId = null;
      renderWidgets();
    };
    const btnCfg = card.querySelector(".widget-config-btn");
    btnCfg.onclick = (e) => {
      e.stopPropagation();
      selectWidget(w.id, { openConfig: true });
    };
    if (w.type === "switch") {
      const sw = card.querySelector(".widget-switch-btn");
      sw.onclick = (e) => {
        e.stopPropagation();
        if (!w.deviceId) {
          alert("Chưa set Device ID.");
          return;
        }
        sendToggle(w.deviceId);
      };
    }
    if (w.type === "slider") {
      const slider = card.querySelector(".widget-slider-input");
      const lbl = card.querySelector(".widget-slider-value");
      slider.oninput = (e) => {
        e.stopPropagation();
        w.currentValue = parseInt(slider.value, 10);
        if (lbl) lbl.textContent = w.currentValue;
      };
      slider.onchange = (e) => {
        e.stopPropagation();
        if (!w.deviceId) {
          alert("Chưa set Device ID.");
          return;
        }
        sendCommand(w.deviceId, { command: "analog", value: w.currentValue || 0 });
      };
    }
    if (w.type === "dpad") {
      card.querySelectorAll(".dpad-btn").forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          if (!w.deviceId) {
            alert("Chưa set Device ID.");
            return;
          }
          const dir = btn.getAttribute("data-dir") || "";
          sendCommand(w.deviceId, { command: "move", dir });
        };
      });
    }
    card.onclick = (e) => {
      const isControl = e.target.closest(".widget-control");
      const isButton = e.target.tagName.toLowerCase() === "button";
      if (isControl || isButton) return;
      selectWidget(w.id, { openConfig: false });
    };
    widgetGrid.appendChild(card);
  });
}

/* widget palette & config events */
if (widgetPaletteToggle && widgetPaletteMenu) {
  widgetPaletteToggle.onclick = () => {
    widgetPaletteMenu.classList.toggle("open");
  };
}
if (widgetTypeButtons) {
  widgetTypeButtons.forEach((btn) => {
    btn.onclick = () => {
      const type = btn.getAttribute("data-type");
      const w = {
        id: "w" + ++widgetIdCounter,
        type,
        deviceId: "",
        sensorKey: null,
        theme: "green",
        label: "",
        size: "m", // default medium
      };
      if (type === "slider") {
        w.currentValue = 50;
        w.min = 0;
        w.max = 100;
      }
      if (type === "thermo") {
        w.min = 0;
        w.max = 100;
      }
      if (type === "gauge") {
        w.min = 0;
        w.max = 100;
      }
      widgets.push(w);
      selectedWidgetId = w.id;
      renderWidgets();
      if (widgetPaletteMenu) widgetPaletteMenu.classList.remove("open");
      selectWidget(w.id, { openConfig: true });
    };
  });
}
if (dashModeBtn) {
  dashModeBtn.onclick = () => {
    widgetsRunning = !widgetsRunning;
    dashModeBtn.textContent = widgetsRunning ? "Run" : "Edit";
    renderWidgets();
  };
}

/* config inputs -> widget state */
if (widgetConfigTitle) {
  widgetConfigTitle.addEventListener("input", () => {
    if (!selectedWidgetId) return;
    const w = widgets.find((x) => x.id === selectedWidgetId);
    if (!w) return;
    w.label = widgetConfigTitle.value.trim();
    syncWidgetCard(w);
  });
}
if (widgetConfigDevice) {
  widgetConfigDevice.addEventListener("input", () => {
    if (!selectedWidgetId) return;
    const w = widgets.find((x) => x.id === selectedWidgetId);
    if (!w) return;
    w.deviceId = widgetConfigDevice.value.trim();
    syncWidgetCard(w);
  });
}
if (widgetConfigSensor) {
  widgetConfigSensor.addEventListener("input", () => {
    if (!selectedWidgetId) return;
    const w = widgets.find((x) => x.id === selectedWidgetId);
    if (!w) return;
    w.sensorKey = widgetConfigSensor.value.trim() || null;
    syncWidgetCard(w);
  });
}
if (widgetConfigTheme) {
  widgetConfigTheme.addEventListener("change", () => {
    if (!selectedWidgetId) return;
    const w = widgets.find((x) => x.id === selectedWidgetId);
    if (!w) return;
    w.theme = widgetConfigTheme.value || "green";
    syncWidgetCard(w);
  });
}
/* NEW: size change */
if (widgetConfigSize) {
  widgetConfigSize.addEventListener("change", () => {
    if (!selectedWidgetId) return;
    const w = widgets.find((x) => x.id === selectedWidgetId);
    if (!w) return;
    w.size = widgetConfigSize.value || "m";
    syncWidgetCard(w);
  });
}
if (widgetConfigRangeMin) {
  widgetConfigRangeMin.addEventListener("input", () => {
    if (!selectedWidgetId) return;
    const w = widgets.find((x) => x.id === selectedWidgetId);
    if (!w) return;
    const v = parseFloat(widgetConfigRangeMin.value);
    w.min = isNaN(v) ? null : v;
    renderWidgets();
  });
}
if (widgetConfigRangeMax) {
  widgetConfigRangeMax.addEventListener("input", () => {
    if (!selectedWidgetId) return;
    const w = widgets.find((x) => x.id === selectedWidgetId);
    if (!w) return;
    const v = parseFloat(widgetConfigRangeMax.value);
    w.max = isNaN(v) ? null : v;
    renderWidgets();
  });
}

/* CAMERA STREAM */
async function startCameraStream() {
  if (!token || !currentUser) {
    camStreamStatus.textContent = "Cần login.";
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    camStreamStatus.textContent = "Browser không hỗ trợ.";
    return;
  }
  try {
    camStreamStatus.textContent = "Đang mở camera...";
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    localStream = stream;
    localVideo.srcObject = stream;
    captureCanvas = document.createElement("canvas");
    captureCtx = captureCanvas.getContext("2d");
    streamInterval = setInterval(async () => {
      if (!localVideo.videoWidth || !localVideo.videoHeight) return;
      captureCanvas.width = localVideo.videoWidth;
      captureCanvas.height = localVideo.videoHeight;
      captureCtx.drawImage(localVideo, 0, 0, captureCanvas.width, captureCanvas.height);
      captureCanvas.toBlob(
        async (blob) => {
          if (!blob) return;
          try {
            const arrBuf = await blob.arrayBuffer();
            await fetch(API_BASE + "/api/camera/frame", {
              method: "POST",
              headers: {
                Authorization: "Bearer " + token,
                "Content-Type": "image/jpeg",
              },
              body: arrBuf,
            });
          } catch (e) {
            console.error("Send frame error:", e);
          }
        },
        "image/jpeg",
        0.6,
      );
    }, 300);
    serverPullInterval = setInterval(() => {
      if (!currentUser) return;
      serverVideo.src =
        API_BASE + "/api/camera/latest/" + currentUser.id + "?t=" + Date.now();
    }, 300);
    startStreamBtn.disabled = true;
    stopStreamBtn.disabled = false;
    camStreamStatus.textContent = "Đang stream.";
  } catch (err) {
    camStreamStatus.textContent = "Lỗi camera: " + err.message;
  }
}
function stopCameraStream() {
  if (streamInterval) {
    clearInterval(streamInterval);
    streamInterval = null;
  }
  if (serverPullInterval) {
    clearInterval(serverPullInterval);
    serverPullInterval = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  localVideo.srcObject = null;
  startStreamBtn.disabled = false;
  stopStreamBtn.disabled = true;
  camStreamStatus.textContent = "Đã dừng.";
}
if (startStreamBtn && stopStreamBtn) {
  startStreamBtn.onclick = startCameraStream;
  stopStreamBtn.onclick = stopCameraStream;
}

/* THEME & LANG EVENTS */
[authLangToggle, appLangToggle].forEach((group) => {
  if (!group) return;
  group.addEventListener("click", (e) => {
    if (e.target.tagName.toLowerCase() !== "button") return;
    const lang = e.target.getAttribute("data-lang");
    setLang(lang);
  });
});
[authThemeToggle, appThemeToggle].forEach((btn) => {
  if (!btn) return;
  btn.onclick = () => {
    setTheme(currentTheme === "dark" ? "light" : "dark");
  };
});

/* INACTIVITY AUTO LOGOUT (5 min) */
["click", "mousemove", "keydown", "scroll"].forEach((evt) => {
  window.addEventListener(evt, () => {
    lastActivity = Date.now();
  });
});
setInterval(() => {
  if (token && Date.now() - lastActivity > 5 * 60 * 1000) {
    lastActivity = Date.now();
    if (appPage.style.display !== "none") {
      alert(
        currentLang === "vi"
          ? "Bạn đã bị đăng xuất do không hoạt động."
          : "Logged out due to inactivity.",
      );
      logoutBtn.click();
    }
  }
}, 60000);

/* INIT */
setTheme(currentTheme);
setLang(currentLang);
updateUserBadge();
loadCamerasFromLocal();
renderCameras(cameras);
fetchHealth();
if (token && currentUser) {
  showAppPage();
  fetchAll();
} else {
  showAuthPage();
}
