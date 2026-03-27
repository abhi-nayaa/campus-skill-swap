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
let adminUsersCache = [];

function buildApiUrl(endpoint, base = activeApiBase) {
    if (/^https?:\/\//i.test(endpoint)) return endpoint;
    return `${base}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
}

async function fetchWithApiFallback(endpoint, options = {}) {
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

async function fetchAdmin(endpoint, method = "GET", body = null) {
    const token = localStorage.getItem("token");
    if (!token) {
        window.location.href = "login.html";
        return null;
    }

    const options = {
        method,
        headers: { "Authorization": `Bearer ${token}` }
    };

    if (body) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
    }

    let response;
    try {
        response = await fetchWithApiFallback(endpoint, options);
    } catch (error) {
        throw new Error("Cannot reach server. Ensure backend is running on port 5000.");
    }

    const data = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
        alert("Not authorized as Admin");
        window.location.href = "dashboard.html";
        return null;
    }

    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
}

function renderUsers(users) {
    const tbody = document.getElementById('adminUsersTable');
    if (!tbody) return;

    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">No users found.</td></tr>';
        return;
    }

    tbody.innerHTML = users.map((u) => `
        <tr>
            <td>${u.name}</td>
            <td>${u.email}</td>
            <td><span class="badge ${u.role === 'admin' ? 'bg-danger' : 'bg-info'}">${u.role}</span></td>
            <td>${u.credits}</td>
            <td>${u.phone || 'N/A'}</td>
            <td>
                <button class="btn btn-sm btn-outline-danger user-delete-btn" onclick="deleteUser('${u._id}')">Delete User</button>
            </td>
        </tr>
    `).join('');
}

async function loadAdminData() {
    await Promise.all([
        loadStats(),
        loadUsers(),
        loadSkills(),
        loadSessions(),
        loadCredits(),
        loadFeedback()
    ]);
}

async function loadStats() {
    try {
        const stats = await fetchAdmin('/admin/stats');
        if (!stats) return;
        document.getElementById('statUsers').textContent = stats.userCount;
        document.getElementById('statSessions').textContent = stats.sessionCount;
        document.getElementById('statSkills').textContent = stats.skillCount;
        document.getElementById('statCompleted').textContent = stats.completedSessions;
    } catch (err) {
        console.error(err);
    }
}

async function loadUsers() {
    try {
        const users = await fetchAdmin('/admin/users');
        if (!users) return;
        adminUsersCache = users;
        renderUsers(users);
    } catch (err) {
        console.error(err);
    }
}

async function loadSessions() {
    try {
        const sessions = await fetchAdmin('/admin/sessions');
        const tbody = document.getElementById('adminSessionsTable');
        if (!tbody || !sessions) return;

        if (!sessions.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">No sessions found.</td></tr>';
            return;
        }

        tbody.innerHTML = sessions.map((s) => `
            <tr>
                <td>${s.skill_id?.skill_name || 'Deleted Skill'}</td>
                <td>${s.teacher_id?.name || 'N/A'}</td>
                <td>${s.student_id?.name || 'N/A'}</td>
                <td><span class="badge bg-secondary">${s.status}</span></td>
                <td>${new Date(s.createdAt).toLocaleDateString()}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

async function loadCredits() {
    try {
        const credits = await fetchAdmin('/admin/credits');
        const tbody = document.getElementById('adminCreditsTable');
        if (!tbody || !credits) return;

        if (!credits.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">No credit history yet.</td></tr>';
            return;
        }

        tbody.innerHTML = credits.map((entry) => `
            <tr>
                <td>${entry.from_user?.name || 'System'}</td>
                <td>${entry.to_user?.name || 'System'}</td>
                <td>${entry.amount}</td>
                <td>${entry.reason}</td>
                <td>${new Date(entry.createdAt).toLocaleDateString()}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

async function loadFeedback() {
    try {
        const feedback = await fetchAdmin('/admin/feedback');
        const tbody = document.getElementById('adminFeedbackTable');
        if (!tbody || !feedback) return;

        if (!feedback.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">No feedback submitted yet.</td></tr>';
            return;
        }

        tbody.innerHTML = feedback.map((item) => `
            <tr>
                <td>${item.student_id?.name || 'N/A'}</td>
                <td>${item.teacher_id?.name || 'N/A'}</td>
                <td>${item.rating}/5</td>
                <td>${item.review || 'No review provided.'}</td>
                <td>${new Date(item.createdAt).toLocaleDateString()}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

async function loadSkills() {
    try {
        const skills = await fetchAdmin('/admin/skills');
        const tbody = document.getElementById('adminSkillsTable');
        if (!tbody || !skills) return;

        if (!skills.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">No skills listed yet.</td></tr>';
            return;
        }

        tbody.innerHTML = skills.map((s) => `
            <tr>
                <td>${s.skill_name}</td>
                <td>${s.category}</td>
                <td>${s.user_id?.name || 'N/A'}</td>
                <td>${s.credits_required}</td>
                <td>${s.mode}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

window.deleteUser = async (id) => {
    if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;
    try {
        await fetchAdmin(`/admin/users/${id}`, 'DELETE');
        await loadUsers();
    } catch (err) {
        alert(err.message);
    }
};

document.addEventListener("DOMContentLoaded", () => {
    loadAdminData();

    document.getElementById('adminRefreshBtn')?.addEventListener('click', loadAdminData);

    document.getElementById('adminUserSearch')?.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        if (!query) {
            renderUsers(adminUsersCache);
            return;
        }
        const filtered = adminUsersCache.filter((user) =>
            user.name?.toLowerCase().includes(query) ||
            user.email?.toLowerCase().includes(query)
        );
        renderUsers(filtered);
    });
});
