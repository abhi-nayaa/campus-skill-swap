const USERS_KEY = "campusSkillSwapUsers";
const SESSION_KEY = "campusSkillSwapSession";
const API_PORT = "3000";
const API_PATH = "/api";
const savedApiBase = localStorage.getItem("campusSkillSwapApiBase");
const pageProtocol = window.location.protocol === "https:" ? "https:" : "http:";
const pageHost = window.location.hostname;
const inferredHostBase = pageHost ? `${pageProtocol}//${pageHost}:${API_PORT}${API_PATH}` : "";
const API_BASES = Array.from(new Set([
  savedApiBase,
  inferredHostBase,
  `http://127.0.0.1:${API_PORT}${API_PATH}`,
  `http://localhost:${API_PORT}${API_PATH}`,
  `http://127.0.0.1:5000${API_PATH}`,
  `http://localhost:5000${API_PATH}`
].filter(Boolean)));
let activeApiBase = API_BASES[0];
let socket;
let currentSessionId = null;

function buildApiUrl(endpoint, base = activeApiBase) {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  return `${base}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

async function fetchWithApiFallback(endpoint, options = {}) {
  if (/^https?:\/\//i.test(endpoint)) return fetch(endpoint, options);

  let lastError = null;
  const candidates = [activeApiBase, ...API_BASES].filter(Boolean);
  const uniqueCandidates = Array.from(new Set(candidates));

  for (const base of uniqueCandidates) {
    try {
      const response = await fetch(buildApiUrl(endpoint, base), options);
      activeApiBase = base;
      localStorage.setItem("campusSkillSwapApiBase", base);
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError?.message || "NETWORK_UNREACHABLE");
}

function setMessage(element, message, type) {
  if (!element) return;
  element.textContent = message;
  element.className = `form-message ${type}`;
}

function showUiToast(message, type = "info") {
  const existing = document.querySelector(".campus-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `campus-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  window.setTimeout(() => toast.classList.add("show"), 10);
  window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 260);
  }, 3200);
}

function openSkillRequestDialog(skillName) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "campus-modal-overlay";
    overlay.innerHTML = `
      <div class="campus-modal-card" role="dialog" aria-modal="true" aria-labelledby="requestDialogTitle">
        <h3 id="requestDialogTitle">Request Session</h3>
        <p class="campus-modal-subtitle">Send a request for <strong>${skillName}</strong></p>
        <label for="requestMessageInput">Message</label>
        <textarea id="requestMessageInput" placeholder="Tell the teacher what you want to learn..." maxlength="280"></textarea>
        <label for="requestDateInput">Preferred date & time</label>
        <input id="requestDateInput" type="datetime-local">
        <div class="campus-modal-actions">
          <button type="button" class="btn campus-btn-outline-dark" data-action="cancel">Cancel</button>
          <button type="button" class="btn campus-btn-primary" data-action="submit">Send Request</button>
        </div>
      </div>
    `;

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });

    const messageInput = overlay.querySelector("#requestMessageInput");
    const dateInput = overlay.querySelector("#requestDateInput");
    const cancelBtn = overlay.querySelector('[data-action="cancel"]');
    const submitBtn = overlay.querySelector('[data-action="submit"]');

    cancelBtn.addEventListener("click", () => close(null));
    submitBtn.addEventListener("click", () => {
      const message = messageInput.value.trim();
      const date = dateInput.value;

      if (!message || !date) {
        showUiToast("Please add message and preferred date/time.", "error");
        return;
      }

      close({ message, date: new Date(date).toISOString() });
    });

    document.body.appendChild(overlay);
    messageInput.focus();
  });
}

function generateMeetLink() {
  return "https://meet.google.com/new";
}

function normalizeMeetLink(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) return value;
  if (/^meet\.google\.com\//i.test(value)) return `https://${value}`;
  if (/^[a-z]{3}-[a-z]{3}-[a-z]{3}$/i.test(value)) {
    return `https://meet.google.com/${value.toLowerCase()}`;
  }

  return value;
}

function isValidMeetLink(link) {
  if (!link) return false;
  try {
    const parsed = new URL(link);
    return parsed.protocol === "https:" && parsed.hostname === "meet.google.com";
  } catch {
    return false;
  }
}

function getDefaultSessionDateTime(preferredDateRaw) {
  let base = preferredDateRaw ? new Date(preferredDateRaw) : new Date();
  if (Number.isNaN(base.getTime())) base = new Date();

  const minimumLead = new Date(Date.now() + 30 * 60 * 1000);
  if (base < minimumLead) base = minimumLead;

  const pad = (num) => String(num).padStart(2, "0");
  const date = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
  const time = `${pad(base.getHours())}:${pad(base.getMinutes())}`;

  return { date, time };
}

function extractId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value._id || value.id || "");
}

function normalizeSessionStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function isSessionParticipant(session, userId) {
  const currentUserId = String(userId || "");
  const studentId = extractId(session.student_id);
  const teacherId = extractId(session.teacher_id);
  return Boolean(currentUserId && (currentUserId === studentId || currentUserId === teacherId));
}

function canShowChatForSession(session, userId) {
  if (!isSessionParticipant(session, userId)) return false;
  const status = normalizeSessionStatus(session.status);
  if (status === "pending" || status === "rejected") return false;
  return status === "accepted" || status === "scheduled" || status === "ongoing" || status === "completed" || status === "";
}

function openSessionSetupDialog(skillName) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "campus-modal-overlay";
    overlay.innerHTML = `
      <div class="campus-modal-card" role="dialog" aria-modal="true" aria-labelledby="sessionDialogTitle">
        <h3 id="sessionDialogTitle">Schedule Session</h3>
        <p class="campus-modal-subtitle">Set details for <strong>${skillName}</strong></p>

        <label for="sessionModeInput">Mode</label>
        <select id="sessionModeInput">
          <option value="Online">Online</option>
          <option value="Offline">Offline</option>
        </select>

        <div id="onlineFields">
          <label for="sessionMeetLinkInput">Google Meet Link</label>
          <div class="campus-inline-actions">
            <input id="sessionMeetLinkInput" type="url" placeholder="https://meet.google.com/...">
            <button type="button" class="btn campus-btn-outline-dark" data-action="generateMeet">Generate</button>
          </div>
        </div>

        <div id="offlineFields" style="display:none;">
          <label for="sessionLocationInput">Location</label>
          <input id="sessionLocationInput" type="text" placeholder="Library discussion room / campus cafe">
        </div>

        <label for="sessionDateInput">Session date</label>
        <input id="sessionDateInput" type="date">

        <label for="sessionTimeInput">Session time</label>
        <input id="sessionTimeInput" type="time">

        <div class="campus-modal-actions">
          <button type="button" class="btn campus-btn-outline-dark" data-action="cancel">Cancel</button>
          <button type="button" class="btn campus-btn-primary" data-action="submit">Create Session</button>
        </div>
      </div>
    `;

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });

    const modeInput = overlay.querySelector("#sessionModeInput");
    const onlineFields = overlay.querySelector("#onlineFields");
    const offlineFields = overlay.querySelector("#offlineFields");
    const meetLinkInput = overlay.querySelector("#sessionMeetLinkInput");
    const locationInput = overlay.querySelector("#sessionLocationInput");
    const dateInput = overlay.querySelector("#sessionDateInput");
    const timeInput = overlay.querySelector("#sessionTimeInput");

    modeInput.addEventListener("change", () => {
      const isOnline = modeInput.value === "Online";
      onlineFields.style.display = isOnline ? "block" : "none";
      offlineFields.style.display = isOnline ? "none" : "block";
    });

    overlay.querySelector('[data-action="generateMeet"]').addEventListener("click", () => {
      meetLinkInput.value = generateMeetLink();
    });

    overlay.querySelector('[data-action="cancel"]').addEventListener("click", () => close(null));
    overlay.querySelector('[data-action="submit"]').addEventListener("click", () => {
      const mode = modeInput.value;
      const date = dateInput.value;
      const time = timeInput.value;
      const meet_link = normalizeMeetLink(meetLinkInput.value);
      const location = locationInput.value.trim();

      if (!date || !time) {
        showUiToast("Please choose session date and time.", "error");
        return;
      }

      if (mode === "Online" && !meet_link) {
        showUiToast("Please add or generate a meet link.", "error");
        return;
      }
      if (mode === "Online" && !isValidMeetLink(meet_link)) {
        showUiToast("Please enter a valid Google Meet link.", "error");
        return;
      }

      if (mode === "Offline" && !location) {
        showUiToast("Please enter an offline location.", "error");
        return;
      }

      close({ mode, date, time, meet_link, location });
    });

    document.body.appendChild(overlay);
    dateInput.focus();
  });
}

function openConfirmDialog(title, message, confirmLabel = "Confirm") {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "campus-modal-overlay";
    overlay.innerHTML = `
      <div class="campus-modal-card" role="dialog" aria-modal="true">
        <h3>${title}</h3>
        <p class="campus-modal-subtitle">${message}</p>
        <div class="campus-modal-actions">
          <button type="button" class="btn campus-btn-outline-dark" data-action="cancel">Cancel</button>
          <button type="button" class="btn campus-btn-primary" data-action="confirm">${confirmLabel}</button>
        </div>
      </div>
    `;

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });

    overlay.querySelector('[data-action="cancel"]').addEventListener("click", () => close(false));
    overlay.querySelector('[data-action="confirm"]').addEventListener("click", () => close(true));
    document.body.appendChild(overlay);
  });
}

function openFeedbackDialog() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "campus-modal-overlay";
    overlay.innerHTML = `
      <div class="campus-modal-card" role="dialog" aria-modal="true">
        <h3>Session Feedback</h3>
        <p class="campus-modal-subtitle">Share genuine feedback to help the community.</p>

        <label for="feedbackRatingInput">Rating</label>
        <select id="feedbackRatingInput">
          <option value="5">5 - Excellent</option>
          <option value="4">4 - Good</option>
          <option value="3">3 - Average</option>
          <option value="2">2 - Needs improvement</option>
          <option value="1">1 - Poor</option>
        </select>

        <label for="feedbackReviewInput">Review</label>
        <textarea id="feedbackReviewInput" placeholder="What went well? What can improve?" maxlength="300"></textarea>

        <div class="campus-modal-actions">
          <button type="button" class="btn campus-btn-outline-dark" data-action="cancel">Cancel</button>
          <button type="button" class="btn campus-btn-primary" data-action="submit">Submit Feedback</button>
        </div>
      </div>
    `;

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });

    const reviewInput = overlay.querySelector("#feedbackReviewInput");
    overlay.querySelector('[data-action="cancel"]').addEventListener("click", () => close(null));
    overlay.querySelector('[data-action="submit"]').addEventListener("click", () => {
      const rating = parseInt(overlay.querySelector("#feedbackRatingInput").value, 10);
      const review = reviewInput.value.trim();
      if (!review) {
        showUiToast("Please add your feedback review.", "error");
        return;
      }
      close({ rating, review });
    });

    document.body.appendChild(overlay);
    reviewInput.focus();
  });
}

function setupNavigation() {
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.href = button.dataset.nav;
    });
  });
}

// Keep floating skills UI magic
function createSkillTag(container, skills) {
  const tag = document.createElement("span");
  const duration = 16000 + Math.random() * 12000;
  const startX = Math.random() * 88;
  const startY = 8 + Math.random() * 74;
  const moveX = -120 + Math.random() * 240;
  const moveY = -140 + Math.random() * 160;
  const delay = Math.random() * 2000;
  const size = 54 + Math.random() * 34;
  const rotation = -18 + Math.random() * 36;
  const skill = skills[Math.floor(Math.random() * skills.length)];

  tag.className = "skill-tag";
  tag.setAttribute("aria-hidden", "true");
  tag.style.left = `${startX}%`;
  tag.style.top = `${startY}%`;
  tag.style.setProperty("--icon-size", `${size}px`);
  tag.style.setProperty("--icon-size-mobile", `${Math.max(46, size - 14)}px`);
  tag.style.setProperty("--move-x", `${moveX}px`);
  tag.style.setProperty("--move-y", `${moveY}px`);
  tag.style.setProperty("--rotate-end", `${rotation}deg`);
  tag.style.setProperty("--float-duration", `${duration}ms`);
  tag.style.animationDelay = `${delay}ms`;
  tag.style.color = Math.random() > 0.5 ? "rgba(255, 255, 255, 0.17)" : "rgba(215, 154, 88, 0.18)";
  tag.innerHTML = skill.icon;

  tag.addEventListener("animationend", () => {
    tag.remove();
    createSkillTag(container, skills);
  });

  container.appendChild(tag);
}

function setupFloatingSkills() {
  const container = document.querySelector(".floating-skills");
  if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const skills = [
    { name: "Dance", icon: '<svg viewBox="0 0 24 24"><path d="M13 4c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2Z"></path><path d="m11 7 2 3 3 1"></path><path d="m10 10-2 3-3 2"></path><path d="m13 11 1 4 3 4"></path><path d="m9 13-1 4-2 3"></path></svg>' },
    { name: "Programming", icon: '<svg viewBox="0 0 24 24"><path d="m15 4 5 5"></path><path d="m14 5 2-2 5 5-2 2"></path><path d="M11 8 8 11"></path><path d="M7.5 10.5a4 4 0 1 0 6 6l5-5-6-6-5 5Z"></path></svg>' },
    { name: "Art", icon: '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 0 0 16h1.2a2 2 0 0 0 1.7-3.1l-.4-.7a1.9 1.9 0 0 1 1.6-2.9H18a4 4 0 0 0 4-4c0-2.9-4.5-5.3-10-5.3Z"></path></svg>' },
  ];

  const totalTags = window.innerWidth < 768 ? 7 : 11;
  for (let index = 0; index < totalTags; index += 1) {
    window.setTimeout(() => createSkillTag(container, skills), index * 280);
  }
}

// -------------------------------------------------------------
// CORE SPA ROUTING & API UTILS
// -------------------------------------------------------------

async function fetchWrapper(endpoint, method = "GET", body = null) {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "login.html";
    throw new Error("No token found");
  }

  const options = {
    method,
    headers: {
      "Authorization": `Bearer ${token}`
    }
  };

  if (body) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetchWithApiFallback(endpoint, options);
  } catch (error) {
    throw new Error("Cannot reach the server. Please ensure backend is running on port 5000.");
  }
  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "login.html";
    return;
  }

  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}

function setupSpaRouting() {
  const navLinks = document.querySelectorAll('[data-nav-section]');
  const sections = document.querySelectorAll('.spa-section');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const sectionName = link.getAttribute('data-nav-section');
      
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      
      sections.forEach(s => s.classList.remove('active'));
      const activeSection = document.getElementById(`section-${sectionName}`);
      if (activeSection) {
        activeSection.classList.add('active');
      }

      const sidebar = document.getElementById("dashboardSidebar");
      if (sidebar && sidebar.classList.contains("open")) {
        sidebar.classList.remove("open");
      }

      loadSpaData(sectionName);
    });
  });

  const logoutBtns = document.querySelectorAll('#sidebarLogoutBtn, #logoutBtn');
  logoutBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('token');
      localStorage.removeItem(SESSION_KEY);
      window.location.href = 'login.html';
    });
  });

  const requestTabs = document.querySelectorAll("[data-spa-request-tab]");
  const requestPanels = document.querySelectorAll("[data-spa-request-panel]");
  requestTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const selectedTab = tab.getAttribute("data-spa-request-tab");
      requestTabs.forEach((item) => item.classList.remove("active"));
      requestPanels.forEach((panel) => panel.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(`[data-spa-request-panel="${selectedTab}"]`)?.classList.add("active");
    });
  });

  const sidebarToggle = document.getElementById("sidebarToggle");
  const sidebar = document.getElementById("dashboardSidebar");
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", () => sidebar.classList.toggle("open"));
  }

  const profileToggle = document.getElementById("profileToggle");
  const profileDropdown = document.getElementById("profileDropdown");
  if (profileToggle && profileDropdown) {
    profileToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle("open");
    });
    document.addEventListener("click", () => {
      profileDropdown.classList.remove("open");
    });
  }

  const notificationToggle = document.getElementById("notificationToggle");
  const notificationDropdown = document.getElementById("notificationDropdown");
  if (notificationToggle && notificationDropdown) {
    notificationToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      notificationDropdown.classList.toggle("open");
      if (notificationDropdown.classList.contains("open")) {
        loadNotifications();
      }
    });
    document.addEventListener("click", () => {
        notificationDropdown.classList.remove("open");
    });
  }

  document.getElementById('markAllRead')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
        await fetchWrapper('/notifications/read', 'PATCH');
        loadNotifications();
    } catch (err) { console.error(err); }
  });

  initSocket();

  // Set Profile Name globally
  const userSession = JSON.parse(localStorage.getItem(SESSION_KEY));
  if (userSession) {
    const profileMeta = document.querySelector('.profile-meta strong');
    const profileSubtext = document.querySelector('.profile-meta small');
    const profileAvatar = document.querySelector('.profile-avatar');
    if (profileMeta) profileMeta.textContent = userSession.name;
    if (profileSubtext) profileSubtext.textContent = userSession.year ? `Year ${userSession.year}` : 'Member';
    if (profileAvatar) profileAvatar.textContent = userSession.name.substring(0, 2).toUpperCase();
    if (userSession.role === 'admin') {
        document.getElementById('adminSidebarLink')?.classList.remove('d-none');
    }
  }

  // Load initial section
  loadSpaData('dashboard');
}

// -------------------------------------------------------------
// SECTION LOADERS
// -------------------------------------------------------------

function loadSpaData(section) {
  switch(section) {
    case 'dashboard': loadDashboardSummary(); break;
    case 'browse-skills': loadBrowseSkills(); break;
    case 'my-skills': loadMySkills(); break;
    case 'requests': loadRequests(); break;
    case 'sessions': loadSessions(); break;
    case 'credits': loadCredits(); break;
    case 'profile': loadProfile(); break;
  }
}

async function loadDashboardSummary() {
  try {
    const data = await fetchWrapper('/dashboard');
    const creditPill = document.querySelector('.credit-pill strong');
    if (creditPill) creditPill.textContent = data.user.credits;
    
    const statsCards = document.querySelectorAll('#section-dashboard .stats-card strong');
    if (statsCards.length >= 5) {
      statsCards[0].textContent = data.user.credits || 0;
      statsCards[1].textContent = data.user.skills?.length || 0;
      statsCards[2].textContent = data.skillsLearning?.length || 0;
      statsCards[3].textContent = data.pendingRequests?.length || 0;
      statsCards[4].textContent = data.upcomingSessions?.length || 0;
    }

    const activityContainer = document.getElementById('dashboardRecentActivity');
    if (activityContainer) {
      activityContainer.innerHTML = '';
      if (data.upcomingSessions.length === 0 && data.pendingRequests.length === 0 && data.creditHistory.length === 0) {
        activityContainer.innerHTML = '<p>No recent activity.</p>';
      } else {
        data.creditHistory.forEach(t => activityContainer.insertAdjacentHTML('beforeend', `<p class="mb-1 small text-white-50">[${new Date(t.date).toLocaleDateString()}] Credit: ${t.type === 'positive' ? '+' : '-'}${t.amount} for ${t.reason}</p>`));
        data.pendingRequests.forEach(req => activityContainer.insertAdjacentHTML('beforeend', `<p class="mb-1 small font-weight-bold">Pending: ${req.student_id ? req.student_id.name : 'Unknown User'} requested ${req.skill_id?.skill_name || 'Skill'}</p>`));
        data.upcomingSessions.forEach(sess => activityContainer.insertAdjacentHTML('beforeend', `<p class="mb-1 small">Session: ${sess.skill} with ${sess.partnerName}</p>`));
      }
    }
    loadLeaderboard();
  } catch (err) {
    console.error(err);
  }
}

async function loadLeaderboard() {
  const container = document.getElementById('leaderboardContainer');
  if (!container) return;
  try {
    const data = await fetchWrapper('/users/leaderboard');
    container.innerHTML = data.map((teacher, index) => `
      <div class="leaderboard-item">
        <div class="leaderboard-rank">#${index + 1}</div>
        <div class="leaderboard-info">
          <span class="leaderboard-name">${teacher.name}</span>
          <span class="leaderboard-stats">${teacher.rating.toFixed(1)} ⭐ | ${teacher.numSessionsTaught} sessions</span>
        </div>
      </div>
    `).join('') || '<p>No rankings available yet.</p>';
  } catch (err) { console.error(err); }
}

async function loadNotifications() {
    const list = document.getElementById('notificationList');
    const badge = document.getElementById('notificationBadge');
    if (!list) return;

    try {
        const data = await fetchWrapper('/notifications');
        const unreadCount = data.filter(n => !n.is_read).length;
        
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.classList.remove('d-none');
        } else {
            badge.classList.add('d-none');
        }

        if (data.length === 0) {
            list.innerHTML = '<p class="p-3 text-center">No notifications</p>';
            return;
        }

        list.innerHTML = data.map(n => `
            <div class="notification-item ${n.is_read ? '' : 'unread'}">
                <p>${n.message}</p>
                <small>${new Date(n.createdAt).toLocaleString()}</small>
            </div>
        `).join('');
    } catch (err) { console.error(err); }
}

function initSocket() {
    const token = localStorage.getItem("token");
    if (!token) return;

    socket = io("http://127.0.0.1:5000", {
        auth: { token }
    });

    socket.on("connect", () => console.log("Socket connected"));
    socket.on("receive_message", (data) => {
        if (data.sessionId === currentSessionId) {
            appendMessage(data);
        } else {
            console.log("New message in another session", data);
        }
    });

    socket.on("display_typing", (data) => {
        if (data.sessionId === currentSessionId) {
            const indicator = document.getElementById('typingIndicator');
            if (indicator) {
                indicator.textContent = `${data.userName} is typing...`;
                indicator.classList.remove('d-none');
                clearTimeout(window.typingTimeout);
                window.typingTimeout = setTimeout(() => indicator.classList.add('d-none'), 3000);
            }
        }
    });

    socket.on("error", (err) => showUiToast(err.message || "Socket error", "error"));
}

async function loadBrowseSkills(page = 1) {
  const container = document.getElementById('browseSkillsContainer');
  const pagination = document.getElementById('skillsPagination');
  const search = document.getElementById('searchBrowseSkills')?.value || '';
  const category = document.getElementById('filterCategory')?.value || '';
  const mode = document.getElementById('filterMode')?.value || '';

  const query = new URLSearchParams({ page, limit: 6, excludeMine: 'false' });
  if (search) query.append('search', search);
  if (category) query.append('category', category);
  if (mode) query.append('mode', mode);

  container.innerHTML = "<p>Loading skills...</p>";
  try {
    const data = await fetchWrapper(`/skills?${query.toString()}`);
    if (!data.skills || data.skills.length === 0) {
      container.innerHTML = "<p>No skills available matching your filters. Try another keyword/category or clear filters.</p>";
      pagination.innerHTML = "";
      return;
    }

    container.innerHTML = data.skills.map((skill) => {
      const sessionData = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
      const myUserId = sessionData.id || '';
      const teacherName = skill.user_id?.name || 'Unknown';
      const teacherId = skill.user_id?._id || '';
      const isOwnSkill = myUserId && teacherId && myUserId === teacherId;
      const avgRating = skill.feedbackSummary?.avgRating || '0.0';
      const reviewCount = skill.feedbackSummary?.reviewCount || 0;
      const latestReview = skill.feedbackSummary?.latestReview || 'No feedback yet.';
      const ctaLabel = isOwnSkill ? 'Your Skill' : 'Request Session';

      return `
      <article class="skill-card">
        <h3>${skill.skill_name}</h3>
        <p><strong>Teacher:</strong> ${teacherName}</p>
        <p><strong>Level:</strong> ${skill.level} | <strong>Mode:</strong> ${skill.mode} | <strong>Credits:</strong> ${skill.credits_required}</p>
        <p><strong>Rating:</strong> ${avgRating} &#9733; (${reviewCount} reviews)</p>
        <p>${skill.description || 'No description provided.'}</p>
        <p class="skill-feedback-preview"><strong>Latest feedback:</strong> ${latestReview}</p>
        <div class="card-action-row mt-2">
          <button class="btn campus-btn-primary" ${(teacherId && !isOwnSkill) ? '' : 'disabled'} onclick="requestSessionId('${teacherId}', '${skill._id}', '${skill.skill_name}')">${ctaLabel}</button>
        </div>
      </article>
      `;
    }).join('');

    let pagHtml = '';
    for (let i = 1; i <= data.pages; i++) {
      pagHtml += `<button class="btn btn-sm ${i === data.page ? 'active' : 'btn-outline-secondary'}" onclick="loadBrowseSkills(${i})">${i}</button>`;
    }
    pagination.innerHTML = pagHtml;
  } catch (e) {
    container.innerHTML = `<p class='text-danger'>Error loading skills: ${e.message || 'Unknown error'}</p>`;
  }
}

async function loadPublicSkillsPage() {
  const container = document.getElementById('browseSkillsContainer');
  const pagination = document.getElementById('skillsPagination');
  if (!container) return;

  container.innerHTML = "<p>Loading skills...</p>";
  if (pagination) pagination.innerHTML = "";

  try {
    const response = await fetchWithApiFallback('/public/stats');
    const data = await response.json().catch(() => ({}));
    const topSkills = Array.isArray(data.topSkills) ? data.topSkills : [];

    if (topSkills.length === 0) {
      container.innerHTML = "<p>No public skills available right now.</p>";
      return;
    }

    container.innerHTML = topSkills.map((skill) => `
      <article class="skill-card">
        <h3>${skill.skill_name || 'Skill'}</h3>
        <p><strong>Teacher:</strong> ${skill.teacher_name || 'Campus Mentor'}</p>
        <p><strong>Category:</strong> ${skill.category || 'General'}</p>
        <p>${skill.description || 'Exchange practical skills with motivated peers.'}</p>
        <div class="card-action-row mt-2">
          <a class="btn campus-btn-primary" href="login.html">Login to Request</a>
        </div>
      </article>
    `).join('');
  } catch (error) {
    container.innerHTML = `<p class='text-danger'>Error loading skills: ${error.message || 'Unknown error'}</p>`;
  }
}

function initStandaloneSkillsPage() {
  const hasToken = Boolean(localStorage.getItem("token"));
  const authNotice = document.getElementById("skillsAuthNotice");
  const searchInput = document.getElementById("searchBrowseSkills");
  const categorySelect = document.getElementById("filterCategory");
  const modeSelect = document.getElementById("filterMode");

  if (hasToken) {
    if (authNotice) authNotice.classList.add("d-none");
    if (searchInput) searchInput.disabled = false;
    if (categorySelect) categorySelect.disabled = false;
    if (modeSelect) modeSelect.disabled = false;
    loadBrowseSkills();
    return;
  }

  if (authNotice) authNotice.classList.remove("d-none");
  if (searchInput) searchInput.disabled = true;
  if (categorySelect) categorySelect.disabled = true;
  if (modeSelect) modeSelect.disabled = true;
  loadPublicSkillsPage();
}

let browseTimeout;
document.getElementById('searchBrowseSkills')?.addEventListener('input', () => {
  clearTimeout(browseTimeout);
  browseTimeout = setTimeout(loadBrowseSkills, 300);
});
document.getElementById('filterCategory')?.addEventListener('change', loadBrowseSkills);
document.getElementById('filterMode')?.addEventListener('change', loadBrowseSkills);

window.requestSessionId = async (teacherId, skillId, skillName) => {
  if (!teacherId || !skillId) {
    showUiToast("Skill data is incomplete. Please refresh and try again.", "error");
    return;
  }

  const requestInput = await openSkillRequestDialog(skillName);
  if (!requestInput) return;

  try {
    await fetchWrapper('/requests', 'POST', {
      teacher_id: teacherId,
      skill_id: skillId,
      message: requestInput.message,
      preferred_date: requestInput.date
    });
    showUiToast('Request sent successfully!', "success");
    if (document.querySelector('[data-page="dashboard"]')) {
      loadSpaData('requests');
    }
  } catch (e) {
    showUiToast(e.message || "Could not create request.", "error");
  }
};

async function loadMySkills() {
  const tbody = document.getElementById('mySkillsTableBody');
  tbody.innerHTML = "<tr><td colspan='5'>Loading your skills...</td></tr>";
  try {
    const skills = await fetchWrapper('/skills/my');
    if (skills.length === 0) {
      tbody.innerHTML = "<tr><td colspan='5'>You haven't added any skills yet.</td></tr>";
      return;
    }
    tbody.innerHTML = skills.map(skill => `
      <tr>
        <td>${skill.skill_name}</td>
        <td>${skill.category}</td>
        <td>${skill.level}</td>
        <td>${skill.mode}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="deleteMySkill('${skill._id}')">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch(e) { tbody.innerHTML = "<tr><td colspan='5' class='text-danger'>Error loading your skills.</td></tr>"; }
}

window.deleteMySkill = async (id) => {
  const ok = await openConfirmDialog("Delete Skill", "Are you sure you want to delete this skill?", "Delete");
  if (!ok) return;
  try {
    await fetchWrapper(`/skills/${id}`, 'DELETE');
    loadMySkills();
  } catch(e) { showUiToast(e.message || "Failed to delete skill.", "error"); }
};

document.getElementById('addSkillForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    skill_name: document.getElementById('modalSkillName').value,
    category: document.getElementById('modalSkillCategory').value,
    level: document.getElementById('modalSkillLevel').value,
    mode: document.getElementById('modalSkillMode').value,
    description: document.getElementById('modalSkillDesc').value,
    credits_required: 1
  };
  try {
    await fetchWrapper('/skills', 'POST', payload);
    document.getElementById('addSkillForm').reset();
    document.querySelector('#addSkillModal .btn-close').click();
    loadMySkills();
  } catch(err) {
    document.getElementById('skillModalMessage').textContent = err.message;
  }
});

async function loadRequests() {
  const incContainer = document.getElementById('incomingRequestsContainer');
  const sentContainer = document.getElementById('sentRequestsContainer');
  incContainer.innerHTML = "<p>Loading...</p>";
  sentContainer.innerHTML = "<p>Loading...</p>";
  
  try {
    const [incoming, sent] = await Promise.all([
      fetchWrapper('/requests/incoming'),
      fetchWrapper('/requests/sent')
    ]);

    incContainer.innerHTML = incoming.length === 0 ? "<p>No incoming requests.</p>" : incoming.map(r => `
      <article class="request-card">
        <div class="request-content">
          <h5 class="request-title">${r.student_id ? r.student_id.name : 'Unknown User'} wants to learn ${r.skill_id?.skill_name || 'Skill'}</h5>
          <p class="request-meta">Preferred Date: ${new Date(r.preferred_date).toLocaleString()}</p>
          <p class="request-message"><strong>Message:</strong> ${r.message || 'No message provided.'}</p>
        </div>
        <div class="request-side">
          <span class="request-status-chip ${String(r.status || '').toLowerCase()}">${r.status}</span>
          ${r.status === 'Pending' ? `
            <div class="request-actions">
              <button class="btn campus-btn-primary btn-sm" onclick="respondRequest('${r._id}', 'Accepted', '${r.skill_id?._id}', '${r.student_id?._id}', '${r.preferred_date ? new Date(r.preferred_date).toISOString() : ''}')">Accept</button>
              <button class="btn btn-outline-danger btn-sm" onclick="respondRequest('${r._id}', 'Rejected')">Reject</button>
            </div>
          ` : ``}
        </div>
      </article>
    `).join('');

    sentContainer.innerHTML = sent.length === 0 ? "<p>No sent requests.</p>" : sent.map(r => `
      <article class="request-card">
        <div class="request-content">
          <h5 class="request-title">You requested ${r.skill_id?.skill_name || 'Skill'} from ${r.teacher_id ? r.teacher_id.name : 'Unknown'}</h5>
          <p class="request-meta">Preferred Date: ${new Date(r.preferred_date).toLocaleString()}</p>
          <p class="request-message"><strong>Your message:</strong> ${r.message || 'No message provided.'}</p>
        </div>
        <div class="request-side">
          <span class="request-status-chip ${String(r.status || '').toLowerCase()}">${r.status}</span>
        </div>
      </article>
    `).join('');
  } catch (e) {
    console.error(e);
    incContainer.innerHTML = `<p class="text-danger">Error loading incoming requests: ${e.message || 'Unknown error'}</p>`;
    sentContainer.innerHTML = `<p class="text-danger">Error loading sent requests: ${e.message || 'Unknown error'}</p>`;
  }
}

window.respondRequest = async (id, status, skillId, studentId, preferredDate) => {
  try {
    if (status === 'Accepted') {
      await fetchWrapper(`/requests/${id}/accept`, 'PATCH');

      let sessionPlan = await openSessionSetupDialog('Accepted request');
      if (!sessionPlan) {
        const defaults = getDefaultSessionDateTime(preferredDate);
        sessionPlan = {
          mode: "Online",
          meet_link: "https://meet.google.com/new",
          location: "",
          date: defaults.date,
          time: defaults.time
        };
        showUiToast("Request accepted. Auto-scheduled an online session so chat can start.", "info");
      }

      try {
        await fetchWrapper('/sessions', 'POST', { 
            request_id: id, 
            skill_id: skillId, 
            student_id: studentId, 
            mode: sessionPlan.mode,
            meet_link: sessionPlan.meet_link || '',
            location: sessionPlan.location || '',
            date: sessionPlan.date, 
            time: sessionPlan.time 
        });
        showUiToast('Request accepted and session scheduled!', 'success');
      } catch (sessionErr) {
        const msg = sessionErr?.message || '';
        if (/already created/i.test(msg)) {
          showUiToast('Session already created for this request.', 'info');
        } else {
          showUiToast(`Request accepted, but session setup failed: ${msg}`, 'error');
        }
      }
    } else {
      await fetchWrapper(`/requests/${id}/reject`, 'PATCH');
      showUiToast('Request rejected.', 'info');
    }
  } catch (e) {
    showUiToast(e.message || "Failed to update request.", "error");
  } finally {
    loadRequests();
    loadSessions();
  }
};

async function loadSessions() {
  const container = document.getElementById('sessionsContainer');
  container.innerHTML = "<p>Loading sessions...</p>";
  try {
    const sessions = await fetchWrapper('/sessions/my');
    if (sessions.length === 0) {
      const sentRequests = await fetchWrapper('/requests/sent').catch(() => []);
      const acceptedPending = Array.isArray(sentRequests)
        ? sentRequests.filter((r) => r.status === 'Accepted')
        : [];

      if (!acceptedPending.length) {
        container.innerHTML = "<p>No sessions found.</p>";
        return;
      }

      container.innerHTML = acceptedPending.map((r) => `
        <article class="session-card session-card-modern p-3 border rounded mb-3 shadow-sm">
          <div>
            <h5>${r.skill_id?.skill_name || 'Skill'} (with ${r.teacher_id?.name || 'Teacher'})</h5>
            <p class="mb-1"><strong>Status:</strong> Accepted, waiting for schedule details</p>
            <p class="mb-0"><strong>Preferred Date:</strong> ${r.preferred_date ? new Date(r.preferred_date).toLocaleString() : 'Not shared'}</p>
          </div>
        </article>
      `).join('');
      return;
    }
    const myId = JSON.parse(localStorage.getItem(SESSION_KEY)).id;
    container.innerHTML = sessions.map(s => {
      const teacherId = extractId(s.teacher_id);
      const studentId = extractId(s.student_id);
      const isTeacher = teacherId === String(myId);
      const partner = isTeacher ? (s.student_id?.name || 'Partner') : (s.teacher_id?.name || 'Partner');
      const role = isTeacher ? "Teaching" : "Learning";
      const status = normalizeSessionStatus(s.status);
      const showChat = canShowChatForSession(s, myId);
      const showComplete = !isTeacher && status === 'scheduled';
      const showFeedback = !isTeacher && status === 'completed';
      const normalizedMeetLink = normalizeMeetLink(s.meet_link || "");
      const canOpenMeetLink = isValidMeetLink(normalizedMeetLink);
      const meetingInfo = s.mode === 'Online'
        ? canOpenMeetLink
          ? `Meet Link: <a class="session-link" href="${normalizedMeetLink}" target="_blank" rel="noopener noreferrer">${normalizedMeetLink}</a>`
          : `Meet Link: <strong>Not shared yet</strong>`
        : `Location: <strong>${s.location || 'To be discussed in chat'}</strong>`;

      console.debug("[sessions] user-session-ids", {
        loggedInUserId: String(myId),
        sessionId: s._id,
        sessionStudentId: studentId,
        sessionTeacherId: teacherId,
        status,
        canChat: showChat
      });

      return `
      <article class="session-card session-card-modern p-3 border rounded mb-3 shadow-sm">
        <div class="d-flex justify-content-between align-items-start">
            <div>
                <h5>${s.skill_id?.skill_name || 'Skill'} (${role} with ${partner})</h5>
                <p class="mb-1"><strong>Mode:</strong> ${s.mode} | <strong>Status:</strong> ${s.status}</p>
                <p class="mb-1">${meetingInfo}</p>
                ${s.date ? `<p class="mb-0"><strong>Date:</strong> ${new Date(s.date).toLocaleDateString()} at ${s.time}</p>` : ''}
            </div>
            <div class="d-flex flex-column gap-2">
                ${showChat ? `<button class="btn btn-sm btn-outline-info" onclick="openChat('${s._id}', '${partner}')">Chat</button>` : ''}
                ${showComplete ? `<button class="btn btn-sm btn-success" onclick="completeSession('${s._id}')">Complete & Transfer Credits</button>` : ''}
                ${showFeedback ? `<button class="btn btn-sm btn-warning" onclick="openFeedbackModal('${s._id}')">Give Feedback</button>` : ''}
            </div>
        </div>
      </article>
    `}).join('');
  } catch(e) { container.innerHTML = `<p class='text-danger'>Error loading sessions: ${e.message || 'Unknown error'}</p>`; }
}

window.completeSession = async (id) => {
    const ok = await openConfirmDialog(
      "Complete Session",
      "Confirm completion? 2 credits will be transferred from learner to teacher.",
      "Complete"
    );
    if (!ok) return;
    try {
        await fetchWrapper(`/sessions/${id}/complete`, 'PATCH');
        showUiToast("Session completed. 2 credits transferred.", "success");
        loadSessions();
    } catch (e) { showUiToast(e.message || "Failed to complete session.", "error"); }
};

window.openChat = async (sessionId, partnerName) => {
    currentSessionId = sessionId;
    document.getElementById('chatPartnerName').textContent = `Chat with ${partnerName}`;
    document.getElementById('chatMessages').innerHTML = '<p class="text-center p-3">Loading messages...</p>';
    
    const modal = new bootstrap.Modal(document.getElementById('chatModal'));
    modal.show();

    if (socket) {
      socket.emit('join_session_chat', sessionId);
    } else {
      showUiToast("Realtime chat is reconnecting. Message history is still available.", "info");
    }

    try {
        const messages = await fetchWrapper(`/chat/history/${sessionId}`);
        displayMessages(messages);
    } catch (err) { console.error(err); }
};

function displayMessages(messages) {
    const container = document.getElementById('chatMessages');
    container.innerHTML = messages.map(msg => renderMsg(msg)).join('') || '<p class="text-center p-3">No messages yet. Say hi!</p>';
    container.scrollTop = container.scrollHeight;
}

function renderMsg(msg) {
    const myId = JSON.parse(localStorage.getItem(SESSION_KEY)).id;
    const senderId = msg.sender_id?._id || msg.sender_id || msg.senderId;
    const senderName = msg.sender_id?.name || msg.senderName || 'Partner';
    const messageText = msg.message || '';
    const timestampRaw = msg.createdAt || msg.timestamp || msg.date || new Date().toISOString();
    const safeDate = new Date(timestampRaw);
    const timeLabel = Number.isNaN(safeDate.getTime())
      ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : safeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isMe = senderId === myId;

    return `
        <div class="message-bubble ${isMe ? 'message-sent' : 'message-received'}">
            ${!isMe ? `<span class="message-sender">${senderName}</span>` : ''}
            <span>${messageText}</span>
            <small class="message-time">${timeLabel}</small>
        </div>
    `;
}

function appendMessage(data) {
    const container = document.getElementById('chatMessages');
    if (container.querySelector('.text-white-50')) container.innerHTML = '';
    container.insertAdjacentHTML('beforeend', renderMsg(data));
    container.scrollTop = container.scrollHeight;
}

document.getElementById('chatForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message || !currentSessionId || !socket) return;

    socket.emit('send_message', { sessionId: currentSessionId, message });
    input.value = '';
});

document.getElementById('chatInput')?.addEventListener('input', () => {
    if (currentSessionId && socket) {
        socket.emit('typing', { sessionId: currentSessionId, isTyping: true });
    }
});

async function loadCredits() {
  const tbody = document.getElementById('creditsHistoryTable');
  const feedbackBody = document.getElementById('feedbackHistoryTable');
  tbody.innerHTML = "<tr><td colspan='3'>Loading history...</td></tr>";
  if (feedbackBody) feedbackBody.innerHTML = "<tr><td colspan='5'>Loading feedback...</td></tr>";
  try {
    const data = await fetchWrapper('/dashboard');
    document.getElementById('creditsBalanceDisplay').textContent = data.user.credits;
    const creditPill = document.querySelector('.credit-pill strong');
    if (creditPill) creditPill.textContent = data.user.credits;
    if (data.creditHistory.length === 0) {
      tbody.innerHTML = "<tr><td colspan='3'>No credit activity yet.</td></tr>";
    } else {
      tbody.innerHTML = data.creditHistory.map(item => `
        <tr>
          <td>${new Date(item.date).toLocaleDateString()}</td>
          <td>${item.reason}</td>
          <td class="${item.type === 'positive' ? 'text-success' : 'text-danger'}">
            ${item.type === 'positive' ? '+' : '-'}${item.amount} credits
          </td>
        </tr>
      `).join('');
    }

    if (!feedbackBody) return;
    if (!data.feedbackHistory || data.feedbackHistory.length === 0) {
      feedbackBody.innerHTML = "<tr><td colspan='5'>No feedback activity yet.</td></tr>";
      return;
    }

    feedbackBody.innerHTML = data.feedbackHistory.map((item) => `
      <tr>
        <td>${new Date(item.date).toLocaleDateString()}</td>
        <td><span class="feedback-type-chip ${item.type}">${item.type === 'given' ? 'Given' : 'Received'}</span></td>
        <td>${item.counterpart}</td>
        <td>${item.rating}/5</td>
        <td>${item.review || 'No written review.'}</td>
      </tr>
    `).join('');
  } catch(e) { tbody.innerHTML = "<tr><td colspan='3' class='text-danger'>Error loading history.</td></tr>"; }
}

async function loadProfile() {
  try {
    const user = await fetchWrapper('/users/profile');
    document.getElementById('profileName').value = user.name;
    document.getElementById('profileEmail').value = user.email;
    document.getElementById('profileCampus').value = user.campus || '';
    document.getElementById('profileYear').value = user.year || '';
    document.getElementById('profileBio').value = user.bio || '';
    const profileSubtext = document.querySelector('.profile-meta small');
    if (profileSubtext) profileSubtext.textContent = user.year ? `Year ${user.year}` : 'Member';
  } catch (e) { console.error(e); }
}

document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    name: document.getElementById('profileName').value,
    campus: document.getElementById('profileCampus').value,
    year: document.getElementById('profileYear').value,
    bio: document.getElementById('profileBio').value
  };
  try {
    const res = await fetchWrapper('/users/profile', 'PUT', payload);
    document.getElementById('profileMessage').className = "text-success mt-2";
    document.getElementById('profileMessage').textContent = "Profile updated safely!";
    
    const session = JSON.parse(localStorage.getItem(SESSION_KEY));
    session.name = res.name;
    session.year = res.year || '';
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    if (document.querySelector('.profile-meta strong')) document.querySelector('.profile-meta strong').textContent = res.name;
    const profileSubtext = document.querySelector('.profile-meta small');
    if (profileSubtext) profileSubtext.textContent = res.year ? `Year ${res.year}` : 'Member';
  } catch (err) {
    document.getElementById('profileMessage').className = "text-danger mt-2";
    document.getElementById('profileMessage').textContent = err.message;
  }
});

async function postJsonAuth(url, payload) {
  let response;
  try {
    response = await fetchWithApiFallback(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error("Cannot reach the server. Start backend on port 5000 and retry.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed.");
  return data;
}

function handleRegister() {
    const addBtn = document.getElementById('addSkillRow');
    const container = document.getElementById('skillsContainer');

    if (addBtn && container) {
        addBtn.addEventListener('click', () => {
            const row = document.createElement('div');
            row.className = 'skill-row';
            row.innerHTML = `
                <input name="skill_name" type="text" placeholder="Skill name, e.g. Guitar" required minlength="2" maxlength="50">
                <select name="skill_level" required>
                    <option value="">Select level</option>
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                </select>
                <button class="remove-skill-btn" type="button" aria-label="Remove skill">x</button>
            `;
            container.appendChild(row);

            row.querySelector('.remove-skill-btn').addEventListener('click', () => {
                row.remove();
            });
        });

        // Initial row's remove button
        container.querySelector('.remove-skill-btn')?.addEventListener('click', (e) => {
            e.target.closest('.skill-row').remove();
        });
    }

    document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const message = document.getElementById('registerMessage');
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnLabel = submitBtn?.textContent || "Create Account";
        
        const skills = [];
        const skillRows = form.querySelectorAll('.skill-row');
        skillRows.forEach(row => {
            const name = row.querySelector('[name="skill_name"]').value;
            const level = row.querySelector('[name="skill_level"]').value;
            if (name && level) skills.push({ name, level });
        });

        const payload = {
            name: form.name.value,
            email: form.email.value,
            password: form.password.value,
            contact: form.contact.value,
            campus: form.campus.value,
            department: form.department.value,
            year: form.year.value,
            bio: form.bio.value,
            skills
        };

        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Creating Account...";
            }
            setMessage(message, "Creating account...", "info");
            const result = await postJsonAuth("/auth/register", payload);
            localStorage.setItem("token", result.token);
            localStorage.setItem(SESSION_KEY, JSON.stringify(result.user));
            window.location.href = "dashboard.html";
        } catch (error) {
            setMessage(message, error.message || "Unable to register right now. Please try again.", "error");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnLabel;
            }
        }
    });
}
function handleLogin() {
  const form = document.getElementById("loginForm");
  const message = document.getElementById("loginMessage");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnLabel = submitBtn?.textContent || "Login";
    const formData = new FormData(form);
    const email = formData.get("email").trim().toLowerCase();
    const password = formData.get("password").trim();
    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Logging in...";
      }
      const result = await postJsonAuth("/auth/login", { email, password });
      localStorage.setItem("token", result.token);
      localStorage.setItem(SESSION_KEY, JSON.stringify(result.user));
      window.location.href = result.user?.role === "admin" ? "admin.html" : "dashboard.html";
    } catch (error) {
      setMessage(message, error.message || "Invalid email or password.", "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnLabel;
      }
    }
  });
}

function handleForgotPassword() {
  const form = document.getElementById("forgotPasswordForm");
  const message = document.getElementById("forgotMessage");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnLabel = submitBtn?.textContent || "Send Reset Link";
    const formData = new FormData(form);
    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending...";
      }
      const result = await postJsonAuth("/auth/forgotpassword", { email: formData.get("email").trim() });
      setMessage(message, result.message, "success");
      form.reset();
    } catch (error) {
      setMessage(message, error.message, "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnLabel;
      }
    }
  });
}

window.openFeedbackModal = (sessionId) => {
    openFeedbackDialog().then((feedback) => {
      if (!feedback) return;
      submitFeedback(sessionId, feedback.rating, feedback.review);
    });
};

async function submitFeedback(sessionId, rating, review) {
    try {
        await fetchWrapper('/feedback', 'POST', { session_id: sessionId, rating: parseInt(rating), review });
        showUiToast("Feedback submitted. Rating updated.", "success");
        loadSessions();
        loadDashboardSummary();
    } catch (e) { showUiToast(e.message || "Failed to submit feedback.", "error"); }
}

async function loadLandingSkills() {
    const container = document.getElementById('landingSkillsContainer');
    if (!container) return;

    const fallbackSkills = [
        {
            skill_name: "Public Speaking",
            description: "Practice confident speaking for classes, interviews, and events.",
            button: "Exchange Skill",
            icon: '<svg viewBox="0 0 24 24"><path d="M12 2v10"></path><path d="M8 6h8"></path><rect x="6" y="12" width="12" height="8" rx="2"></rect></svg>'
        },
        {
            skill_name: "UI/UX Design",
            description: "Learn wireframing, prototypes, and user-first digital product design.",
            button: "Learn More",
            icon: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 10h18"></path><path d="M8 4v6"></path></svg>'
        },
        {
            skill_name: "Python Basics",
            description: "Build coding fundamentals with real beginner-friendly mini projects.",
            button: "Exchange Skill",
            icon: '<svg viewBox="0 0 24 24"><path d="M8 8h8v4H8z"></path><path d="M8 16h8v-4H8z"></path><path d="M6 6h12"></path><path d="M6 18h12"></path></svg>'
        },
        {
            skill_name: "Video Editing",
            description: "Edit reels and project videos with clean transitions and pacing.",
            button: "Learn More",
            icon: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="12" height="12" rx="2"></rect><path d="m15 10 6-3v10l-6-3z"></path></svg>'
        },
        {
            skill_name: "Data Analytics",
            description: "Understand dashboards, trends, and decision-ready data storytelling.",
            button: "Exchange Skill",
            icon: '<svg viewBox="0 0 24 24"><path d="M4 19h16"></path><path d="M7 15v-4"></path><path d="M12 15V9"></path><path d="M17 15v-7"></path></svg>'
        },
        {
            skill_name: "Guitar Essentials",
            description: "Master chords, rhythm, and smooth transitions for popular songs.",
            button: "Learn More",
            icon: '<svg viewBox="0 0 24 24"><path d="M7 17a3 3 0 1 0 4 4l3-3-4-4-3 3Z"></path><path d="m14 11 3-3"></path><path d="M16 4h4v4"></path></svg>'
        }
    ];

    const renderCards = (skills) => {
        container.innerHTML = skills.slice(0, 6).map((skill) => `
            <article class="landing-skill-card">
                <div class="landing-skill-top">
                    <span class="landing-skill-icon" aria-hidden="true">${skill.icon}</span>
                    <h3 class="landing-skill-title">${skill.skill_name}</h3>
                </div>
                <p class="landing-skill-desc">${skill.description || 'Exchange practical skills with motivated peers.'}</p>
                <a class="landing-skill-btn" href="skills.html">${skill.button}</a>
            </article>
        `).join('');
    };

    renderCards(fallbackSkills);

    try {
        const res = await fetchWithApiFallback("/public/stats");
        const data = await res.json();

        if (data.userCount) {
            document.getElementById('statUserCount').textContent = `${data.userCount}+`;
            document.getElementById('statSessionCount').textContent = `${data.sessionCount}+`;
            document.getElementById('statSkillCount').textContent = `${data.skillCount}+`;
        }

        const topSkills = Array.isArray(data.topSkills) ? data.topSkills : [];
        if (topSkills.length === 0) return;

        const liveSkills = fallbackSkills.map((fallback, index) => {
            const live = topSkills[index];
            if (!live) return fallback;
            return {
                ...fallback,
                skill_name: live.skill_name || fallback.skill_name,
                description: live.description || fallback.description
            };
        });

        renderCards(liveSkills);
    } catch (err) {
        console.error("Stats fetch failed", err);
    }
}
document.addEventListener("DOMContentLoaded", () => {
  setupNavigation();
  setupFloatingSkills();
  handleLogin();
  handleForgotPassword();
  
  if (document.querySelector('[data-page="register"]')) {
    handleRegister();
  }
  if (document.querySelector('[data-page="dashboard"]')) {
    setupSpaRouting();
  }
  if (document.querySelector('[data-page="landing"]')) {
    loadLandingSkills();
  }
  if (document.querySelector('[data-page="skills"]')) {
    initStandaloneSkillsPage();
  }
});


