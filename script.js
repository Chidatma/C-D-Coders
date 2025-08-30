/* ========= Simple state & helpers (localStorage) ========= */
const LS_KEYS = {
  REPORTS: "mw_reports",
  SCORES: "mw_scores",
  THEME: "mw_theme"
};

const el = (id) => document.getElementById(id);
const nowISO = () => new Date().toISOString();

const load = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; }
  catch { return fallback; }
};
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

/* ========= Theme ========= */
const applyStoredTheme = () => {
  const t = load(LS_KEYS.THEME, "dark");
  document.documentElement.classList.toggle("light", t === "light");
};
applyStoredTheme();

const toggleTheme = () => {
  const light = !document.documentElement.classList.contains("light");
  document.documentElement.classList.toggle("light", light);
  save(LS_KEYS.THEME, light ? "light" : "dark");
};
el("theme").addEventListener("click", toggleTheme);
el("theme2").addEventListener("click", toggleTheme);

/* ========= Mobile menu ========= */
const menuBtn = el("menuBtn");
const drawer = el("drawer");
menuBtn?.addEventListener("click", () => {
  const open = !drawer.classList.contains("open");
  drawer.classList.toggle("open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
});
drawer?.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
  drawer.classList.remove("open");
  menuBtn.setAttribute("aria-expanded", "false");
}));

/* ========= Admin Role ========= */
const ADMIN_PASS = "mangrove123"; // change this password if you want
let isAdmin = false;

const adminForm = el("adminForm");
const adminMsg = el("adminMsg");
const adminPanel = el("adminPanel");
const adminFeed = el("adminFeed");
const logoutBtn = el("logoutBtn");

adminForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const pass = el("adminPass").value;
  if (pass === ADMIN_PASS) {
    isAdmin = true;
    adminForm.style.display = "none";
    adminPanel.style.display = "block";
    renderAdminFeed();
  } else {
    adminMsg.textContent = "❌ Wrong password";
  }
});

logoutBtn?.addEventListener("click", () => {
  isAdmin = false;
  adminPanel.style.display = "none";
  adminForm.style.display = "block";
  el("adminPass").value = "";
  adminMsg.textContent = "";
});

/* ========= Data ========= */
let reports = load(LS_KEYS.REPORTS, []);   // array of Report
let scores  = load(LS_KEYS.SCORES, {});    // { reporterName: points }

/*
Report = {
  id, whenISO, reporter, category, details, lat, lng, photoDataURL?, channel, phone?,
  ai: { confidence:0-100, flags:[] }, status: "Submitted" | "Validated" | "Flagged"
}
*/

/* ========= Geolocation utilities ========= */
const geoBtn = el("geoBtn");
geoBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    alert("Geolocation not supported by this browser.");
    return;
  }
  geoBtn.disabled = true; geoBtn.textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      el("lat").value = Number(latitude.toFixed(6));
      el("lng").value = Number(longitude.toFixed(6));
      updateMapLink();
      geoBtn.disabled = false; geoBtn.textContent = "Use my location";
    },
    (err) => {
      alert("Location error: " + err.message);
      geoBtn.disabled = false; geoBtn.textContent = "Use my location";
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
});

function updateMapLink() {
  const lat = el("lat").value, lng = el("lng").value;
  const ok = lat && lng && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng));
  el("osmLink").href = ok ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=14/${lat}/${lng}` : "#";
}
["lat","lng"].forEach(id => el(id).addEventListener("input", updateMapLink));

/* ========= Image to DataURL (for local preview/storage) ========= */
function fileToDataURL(file) {
  return new Promise((res, rej) => {
    if (!file) return res(null);
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

/* ========= Mock AI validation ========= */
function aiValidate({ details, photoDataURL, lat, lng, category }) {
  let score = 40;
  const flags = [];

  const len = (details || "").trim().length;
  score += Math.min(30, Math.floor(len / 20)); // up to +30

  if (photoDataURL) score += 15;
  if (/boat|chainsaw|truck|oil|dump|cut|stump|logging/i.test(details)) score += 10;
  if (/illegal|reclamation|spoil|backhoe|bulldozer/i.test(details)) score += 8;

  const latNum = parseFloat(lat), lngNum = parseFloat(lng);
  if (!isNaN(latNum) && Math.abs(latNum) <= 35) score += 5;
  if (isNaN(latNum) || isNaN(lngNum)) flags.push("Missing coordinates");

  score = Math.max(5, Math.min(99, score));
  let status = "Submitted";
  if (score >= 70) status = "Validated";
  else if (score < 45) status = "Flagged";

  if (score < 50) flags.push("Low confidence – needs moderator review");
  if (!photoDataURL) flags.push("No photo attached");

  return { confidence: score, flags, status };
}

/* ========= Gamification ========= */
function addPoints(name, amount) {
  if (!name) return;
  scores[name] = (scores[name] || 0) + amount;
  save(LS_KEYS.SCORES, scores);
}

function badgeFor(points) {
  if (points >= 100) return "Champion";
  if (points >= 50)  return "Ranger";
  if (points >= 20)  return "Guardian";
  return "Beginner";
}

/* ========= Renderers ========= */
const feedBody = el("feedBody");
const lbList = el("lbList");
const statusFilter = el("statusFilter");
const filterText = el("filterText");

function renderFeed() {
  const q = (filterText.value || "").toLowerCase();
  const statusSel = statusFilter.value;
  feedBody.innerHTML = "";

  reports
    .slice()
    .sort((a,b) => new Date(b.whenISO) - new Date(a.whenISO))
    .forEach((r, idx) => {
      const match =
        (!statusSel || r.status === statusSel) &&
        (!q || (r.reporter.toLowerCase().includes(q) ||
                r.category.toLowerCase().includes(q) ||
                r.status.toLowerCase().includes(q)));

      if (!match) return;

      const tr = document.createElement("tr");

      const confClass = r.ai.confidence >= 70 ? "ok" : (r.ai.confidence >= 45 ? "warn" : "bad");
      const flags = r.ai.flags.length ? ` • ${r.ai.flags.join(" • ")}` : "";

      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td title="${r.whenISO}">${new Date(r.whenISO).toLocaleString()}</td>
        <td>${escapeHtml(r.reporter)}</td>
        <td><span class="pill">${escapeHtml(r.category)}</span></td>
        <td>
          ${fmtCoord(r.lat)}, ${fmtCoord(r.lng)}
          ${r.lat && r.lng ? ` · <a href="https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=14/${r.lat}/${r.lng}" target="_blank" rel="noopener">map</a>` : ""}
        </td>
        <td class="${confClass}"><strong>${r.ai.confidence}%</strong>${flags ? `<div style="color:var(--muted);font-size:.92rem">${flags}</div>` : ""}</td>
        <td>${r.status}</td>
      `;
      feedBody.appendChild(tr);
    });
}

function renderLeaderboard() {
  const entries = Object.entries(scores).sort((a,b) => b[1]-a[1]).slice(0, 20);
  lbList.innerHTML = "";
  entries.forEach(([name, pts], i) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>#${i+1} ${escapeHtml(name)}</strong> — ${pts} pts · <span class="pill">${badgeFor(pts)}</span>`;
    lbList.appendChild(li);
  });
}

/* ========= Utilities ========= */
function fmtCoord(v) {
  if (v === "" || v === undefined || v === null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return n.toFixed(5);
}
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function randId() {
  return Math.random().toString(36).slice(2, 9);
}

/* ========= Form handling ========= */
const form = el("reportForm");
const formMsg = el("formMsg");
el("clearForm").addEventListener("click", () => {
  form.reset(); formMsg.textContent = "Form cleared.";
  updateMapLink();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const reporter = el("reporter").value.trim();
  const category = el("category").value.trim();
  const details  = el("details").value.trim();
  const lat = el("lat").value.trim();
  const lng = el("lng").value.trim();
  const channel = el("channel").value;
  const phone = el("phone").value.trim();

  if (!reporter || !category) {
    formMsg.textContent = "Please enter your name and choose a category.";
    return;
  }

  let photoDataURL = null;
  try {
    photoDataURL = await fileToDataURL(el("photo").files[0]);
  } catch {}

  const ai = aiValidate({ details, photoDataURL, lat, lng, category });

  const report = {
    id: randId(),
    whenISO: nowISO(),
    reporter, category, details, lat, lng, photoDataURL, channel, phone,
    ai, status: ai.status
  };

  reports.push(report);
  save(LS_KEYS.REPORTS, reports);

  const base = ai.confidence >= 70 ? 10 : (ai.confidence >= 45 ? 6 : 2);
  const bonus = (details.length >= 80 ? 3 : 0) + (photoDataURL ? 5 : 0);
  addPoints(reporter, base + bonus);

  form.reset();
  updateMapLink();
  formMsg.textContent = `Report submitted. AI confidence: ${ai.confidence}%. You earned ${base + bonus} points.`;
  renderFeed(); renderLeaderboard(); if (isAdmin) renderAdminFeed();
});

/* ========= Feed actions ========= */
feedBody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  if (!isAdmin) {
    alert("Only admin can moderate reports.");
    return;
  }
});

/* ========= Admin Feed Renderer & Actions ========= */
function renderAdminFeed() {
  adminFeed.innerHTML = "";
  reports
    .slice()
    .sort((a,b) => new Date(b.whenISO) - new Date(a.whenISO))
    .forEach((r, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${idx+1}</td>
        <td>${new Date(r.whenISO).toLocaleString()}</td>
        <td>${escapeHtml(r.reporter)}</td>
        <td>${escapeHtml(r.category)}</td>
        <td>${r.ai.confidence}%</td>
        <td>${r.status}</td>
        <td>
          <button class="btn" data-action="promote" data-id="${r.id}">Promote</button>
          <button class="btn" data-action="flag" data-id="${r.id}">Flag</button>
          <button class="btn" data-action="del" data-id="${r.id}">Delete</button>
        </td>
      `;
      adminFeed.appendChild(tr);
    });
}

adminFeed?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  const r = reports.find(rep => rep.id === id);
  if (!r) return;

  if (btn.dataset.action === "promote") {
    r.status = "Validated";
    addPoints(r.reporter, 5);
  } else if (btn.dataset.action === "flag") {
    r.status = "Flagged";
  } else if (btn.dataset.action === "del") {
    const idx = reports.findIndex(rep => rep.id === id);
    if (idx >= 0) reports.splice(idx, 1);
  }
  save(LS_KEYS.REPORTS, reports);
  renderAdminFeed();
  renderFeed();
  renderLeaderboard();
});

/* ========= Filters ========= */
[statusFilter, filterText].forEach(inp => inp.addEventListener("input", renderFeed));

/* ========= Init ========= */
(function init() {
  document.getElementById("year").textContent = new Date().getFullYear();
  updateMapLink();
  renderFeed();
  renderLeaderboard();
})();
/* ========= User Signup & Login ========= */
const signupForm = el("signupForm");
const loginForm = el("loginForm");
const signupSection = el("signupSection");
const loginSection = el("loginSection");
const mainContent = el("mainContent");
const userDashboard = el("userDashboard");

const signupMsg = el("signupMsg");
const loginMsg = el("loginMsg");

// Dashboard fields
const dashName = el("dashName");
const dashEmail = el("dashEmail");
const dashNumber = el("dashNumber");
const dashAge = el("dashAge");
const dashGender = el("dashGender");
const dashUser = el("dashUser");

// LocalStorage key
const LS_USERS = "mw_users";
let users = load(LS_USERS, []);
let currentUser = null;

function saveUsers() { save(LS_USERS, users); }

// ===== Signup =====
signupForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const user = {
    name: el("su_name").value.trim(),
    email: el("su_email").value.trim(),
    number: el("su_number").value.trim(),
    age: el("su_age").value.trim(),
    gender: el("su_gender").value,
    username: el("su_username").value.trim(),
    password: el("su_password").value
  };

  if (users.find(u => u.username === user.username)) {
    signupMsg.textContent = "❌ Username already exists!";
    return;
  }

  users.push(user);
  saveUsers();
  signupMsg.textContent = "✅ Signup successful! Please log in.";
  signupForm.reset();
});

// ===== Login =====
loginForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const uname = el("li_username").value.trim();
  const pass = el("li_password").value;

  const user = users.find(u => u.username === uname && u.password === pass);
  if (!user) {
    loginMsg.textContent = "❌ Invalid username or password";
    return;
  }

  currentUser = user;
  showMainContent();
});

// ===== Show/Hide Sections =====
function showMainContent() {
  signupSection.style.display = "none";
  loginSection.style.display = "none";
  mainContent.style.display = "block";
  userDashboard.style.display = "block";

  dashName.textContent = currentUser.name;
  dashEmail.textContent = currentUser.email;
  dashNumber.textContent = currentUser.number;
  dashAge.textContent = currentUser.age;
  dashGender.textContent = currentUser.gender;
  dashUser.textContent = currentUser.username;
}

// ===== Logout =====
el("logoutUser")?.addEventListener("click", () => {
  currentUser = null;
  mainContent.style.display = "none";
  userDashboard.style.display = "none";
  signupSection.style.display = "block";
  loginSection.style.display = "block";
});
// Highlight active nav link on scroll
const sections = document.querySelectorAll("section");
const navLinks = document.querySelectorAll(".links a.chip");

window.addEventListener("scroll", () => {
  let current = "";
  sections.forEach((section) => {
    const sectionTop = section.offsetTop - 80;
    if (pageYOffset >= sectionTop) {
      current = section.getAttribute("id");
    }
  });

  navLinks.forEach((link) => {
    link.classList.remove("active");
    if (link.getAttribute("href") === "#" + current) {
      link.classList.add("active");
    }
  });
});

