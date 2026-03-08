const scrapeForm = document.getElementById("scrape-form");
const logoutBtn = document.getElementById("logout-btn");
const statusEl = document.getElementById("status");
const historyBody = document.getElementById("history-body");
const refreshBtn = document.getElementById("refresh-history");
const currentUserEl = document.getElementById("current-user");
const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const exportBtn = document.getElementById("export-btn");

const TOKEN_KEY = "scraper_token";
const USER_KEY = "scraper_user";
let currentQuery = "";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getUser() {
  return localStorage.getItem(USER_KEY);
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function setText(el, text) {
  el.textContent = text;
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiRequest(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
    ...authHeaders(),
  };
  const requestOptions = { ...options, headers };
  const res = await fetch(path, requestOptions);
  const data = await res.json();
  return { res, data };
}

function renderHistoryMessage(message) {
  historyBody.innerHTML = `<tr><td colspan="5">${message}</td></tr>`;
}

function renderHistoryRows(items) {
  historyBody.innerHTML = items
    .map(
      (item) => `
        <tr>
          <td>${item.id}</td>
          <td title="${item.url}">${item.url.slice(0, 38)}</td>
          <td>${item.status_code}</td>
          <td title="${item.title || ""}">${(item.title || "-").slice(0, 42)}</td>
          <td><button class="ghost delete-btn" data-id="${item.id}" type="button">Delete</button></td>
        </tr>
      `,
    )
    .join("");
}

function redirectToLogin() {
  clearAuth();
  window.location.href = "/login";
}

async function verifySession() {
  const token = getToken();
  if (!token) return redirectToLogin();
  const res = await fetch("/auth/me", { headers: authHeaders() });
  if (!res.ok) return redirectToLogin();
  const user = await res.json();
  setText(currentUserEl, `Logged in as: ${user.username}`);
}

async function loadHistory() {
  const params = new URLSearchParams({ limit: "15" });
  if (currentQuery) params.set("q", currentQuery);

  try {
    const { res, data } = await apiRequest(`/scrape/history?${params.toString()}`);
    if (res.status === 401) return redirectToLogin();
    if (!res.ok) return renderHistoryMessage(data.detail || "Failed to load history");
    if (!data.items || data.items.length === 0) return renderHistoryMessage("No history yet");
    renderHistoryRows(data.items);
  } catch (err) {
    renderHistoryMessage("Network error");
  }
}

logoutBtn.addEventListener("click", redirectToLogin);

scrapeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setText(statusEl, "Scraping...");

  const url = document.getElementById("url").value.trim();
  const verifySsl = document.getElementById("verify_ssl").checked;
  const params = new URLSearchParams({
    url,
    verify_ssl: String(verifySsl),
  });

  try {
    const { res, data } = await apiRequest(`/scrape?${params.toString()}`);
    if (res.status === 401) return redirectToLogin();
    if (!res.ok) {
      setText(statusEl, "Request failed");
      return;
    }
    setText(statusEl, "Scrape complete");
    await loadHistory();
  } catch (err) {
    setText(statusEl, "Network error");
  }
});

refreshBtn.addEventListener("click", loadHistory);
searchBtn.addEventListener("click", () => {
  currentQuery = searchInput.value.trim();
  loadHistory();
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  currentQuery = searchInput.value.trim();
  loadHistory();
});

historyBody.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.classList.contains("delete-btn")) return;

  const id = target.dataset.id;
  if (!id) return;
  const shouldDelete = window.confirm("Delete this history item?");
  if (!shouldDelete) return;

  const { res, data } = await apiRequest(`/scrape/history/${id}`, { method: "DELETE" });
  if (res.status === 401) return redirectToLogin();
  if (!res.ok) {
    setText(statusEl, data.detail || "Delete failed");
    return;
  }
  setText(statusEl, "History item deleted");
  await loadHistory();
});

exportBtn.addEventListener("click", async () => {
  const params = new URLSearchParams();
  if (currentQuery) params.set("q", currentQuery);
  const token = getToken();
  if (!token) return redirectToLogin();

  const res = await fetch(`/scrape/history/export?${params.toString()}`, {
    headers: authHeaders(),
  });
  if (res.status === 401) return redirectToLogin();
  if (!res.ok) {
    setText(statusEl, "Export failed");
    return;
  }

  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = "scrape_history.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
  setText(statusEl, "CSV exported");
});

verifySession().then(loadHistory);
