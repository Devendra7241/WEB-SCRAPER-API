import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";

const h = React.createElement;
const TOKEN_KEY = "scraper_token";
const USER_KEY = "scraper_user";

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function getStoredUser() {
  return localStorage.getItem(USER_KEY) || "";
}

function setAuth(token, username) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function apiRequest(path, { token = "", method = "GET", body, parseJson = true } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!parseJson) return { res };
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function navigate(path, setPath) {
  window.history.pushState({}, "", path);
  setPath(path);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function LoginView({ setToken, setUsername, setPath }) {
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginStatus, setLoginStatus] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerStatus, setRegisterStatus] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  async function onLoginSubmit(event) {
    event.preventDefault();
    setLoginStatus("Logging in...");
    const { res, data } = await apiRequest("/auth/login", {
      method: "POST",
      body: { username: loginUsername.trim(), password: loginPassword },
    });
    if (!res.ok) {
      setLoginStatus(data.detail || "Login failed");
      return;
    }
    setAuth(data.access_token, data.user.username);
    setToken(data.access_token);
    setUsername(data.user.username);
    navigate("/dashboard", setPath);
  }

  async function onRegisterSubmit(event) {
    event.preventDefault();
    setRegisterStatus("Registering...");
    const { res, data } = await apiRequest("/auth/register", {
      method: "POST",
      body: {
        username: regUsername.trim(),
        email: regEmail.trim(),
        password: regPassword,
      },
    });
    if (!res.ok) {
      setRegisterStatus(data.detail || "Register failed");
      return;
    }
    setRegisterStatus("Register success. Ab login karo.");
    setRegUsername("");
    setRegEmail("");
    setRegPassword("");
    setRegisterOpen(false);
    setLoginStatus("Account created. Please login.");
  }

  return h(
    React.Fragment,
    null,
    h("header", { className: "hero" }, [
      h("p", { className: "kicker", key: "k" }, "WEB SCRAPER API"),
      h("h1", { key: "h" }, "Welcome Back"),
      h("p", { className: "subtitle", key: "s" }, "Agar account hai to direct login karo. Naya account ho to create karo."),
    ]),
    h("section", { className: "card auth-card" }, [
      h("h2", { key: "h2" }, "Login"),
      h(
        "form",
        { className: "form form-2 form-login", onSubmit: onLoginSubmit, key: "form" },
        [
          h("input", {
            key: "u",
            type: "text",
            placeholder: "Username",
            required: true,
            value: loginUsername,
            onChange: (e) => setLoginUsername(e.target.value),
          }),
          h("input", {
            key: "p",
            type: "password",
            placeholder: "Password",
            required: true,
            value: loginPassword,
            onChange: (e) => setLoginPassword(e.target.value),
          }),
          h("button", { key: "b", type: "submit" }, "Login"),
        ],
      ),
      h("p", { className: "status", key: "st" }, loginStatus),
      h("div", { className: "auth-footer", key: "f" }, [
        h("span", { key: "sp" }, "New user?"),
        h(
          "button",
          { key: "btn", type: "button", className: "ghost", onClick: () => setRegisterOpen(true) },
          "Create account",
        ),
      ]),
    ]),
    registerOpen
      ? h("div", { className: "modal", onClick: () => setRegisterOpen(false) }, [
          h(
            "div",
            { className: "modal-card", onClick: (e) => e.stopPropagation(), key: "mc" },
            [
              h("div", { className: "auth-head", key: "ah" }, [
                h("h2", { key: "h" }, "Create Account"),
                h("button", { key: "c", type: "button", className: "ghost", onClick: () => setRegisterOpen(false) }, "Close"),
              ]),
              h(
                "form",
                { className: "form form-2", onSubmit: onRegisterSubmit, key: "rf" },
                [
                  h("input", {
                    key: "ru",
                    type: "text",
                    placeholder: "Username",
                    required: true,
                    value: regUsername,
                    onChange: (e) => setRegUsername(e.target.value),
                  }),
                  h("input", {
                    key: "re",
                    type: "email",
                    placeholder: "Email",
                    required: true,
                    value: regEmail,
                    onChange: (e) => setRegEmail(e.target.value),
                  }),
                  h("input", {
                    key: "rp",
                    type: "password",
                    placeholder: "Password",
                    required: true,
                    value: regPassword,
                    onChange: (e) => setRegPassword(e.target.value),
                  }),
                  h("button", { key: "rb", type: "submit" }, "Register"),
                ],
              ),
              h("p", { className: "status", key: "rs" }, registerStatus),
            ],
          ),
        ])
      : null,
  );
}

function DashboardView({ token, username, setToken, setUsername, setPath }) {
  const [url, setUrl] = useState("");
  const [verifySsl, setVerifySsl] = useState(true);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [historyItems, setHistoryItems] = useState([]);
  const [detailItem, setDetailItem] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (search.trim()) params.set("q", search.trim());
    return params.toString();
  }, [search]);

  const filteredSortedItems = useMemo(() => {
    const filtered = historyItems.filter((item) => {
      if (statusFilter === "success") return item.status_code >= 200 && item.status_code < 400;
      if (statusFilter === "error") return item.status_code >= 400;
      return true;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortBy === "oldest") return a.id - b.id;
      if (sortBy === "status_asc") return a.status_code - b.status_code;
      if (sortBy === "status_desc") return b.status_code - a.status_code;
      return b.id - a.id;
    });
    return sorted;
  }, [historyItems, statusFilter, sortBy]);

  function logout() {
    clearAuth();
    setToken("");
    setUsername("");
    navigate("/login", setPath);
  }

  async function loadHistory() {
    const { res, data } = await apiRequest(`/scrape/history?${queryString}`, { token });
    if (res.status === 401) return logout();
    if (!res.ok) {
      setStatus(data.detail || "History load failed");
      return;
    }
    setHistoryItems(data.items || []);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const { res } = await apiRequest("/auth/me", { token });
      if (!active) return;
      if (!res.ok) logout();
    })();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    loadHistory();
  }, [queryString]);

  async function onScrapeSubmit(event) {
    event.preventDefault();
    setStatus("Scraping...");
    const params = new URLSearchParams({ url: url.trim(), verify_ssl: String(verifySsl) });
    const { res, data } = await apiRequest(`/scrape?${params.toString()}`, { token });
    if (res.status === 401) return logout();
    if (!res.ok) {
      setStatus(data.detail || "Scrape failed");
      return;
    }
    setStatus("Scrape complete");
    setUrl("");
    await loadHistory();
  }

  async function onDelete(historyId) {
    const ok = window.confirm("Delete this history item?");
    if (!ok) return;
    const { res, data } = await apiRequest(`/scrape/history/${historyId}`, {
      token,
      method: "DELETE",
    });
    if (res.status === 401) return logout();
    if (!res.ok) {
      setStatus(data.detail || "Delete failed");
      return;
    }
    setStatus("History item deleted");
    await loadHistory();
  }

  async function onExport() {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    const { res } = await apiRequest(`/scrape/history/export?${params.toString()}`, {
      token,
      parseJson: false,
    });
    if (res.status === 401) return logout();
    if (!res.ok) {
      setStatus("Export failed");
      return;
    }
    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = "scrape_history.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(downloadUrl);
    setStatus("CSV exported");
  }

  async function onViewDetails(historyId) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailItem(null);
    const { res, data } = await apiRequest(`/scrape/history/${historyId}`, { token });
    if (res.status === 401) return logout();
    if (!res.ok) {
      setDetailLoading(false);
      setStatus(data.detail || "Details load failed");
      return;
    }
    setDetailItem(data.item || null);
    setDetailLoading(false);
  }

  function statusClassName(code) {
    if (code >= 200 && code < 400) return "status-pill status-success";
    if (code >= 400 && code < 500) return "status-pill status-warn";
    return "status-pill status-error";
  }

  return h(
    React.Fragment,
    null,
    h("header", { className: "hero hero-row" }, [
      h("div", { key: "left" }, [
        h("p", { className: "kicker", key: "k" }, "WEB SCRAPER API"),
        h("h1", { key: "h" }, "Scrape Dashboard"),
        h("p", { className: "subtitle", key: "s" }, `Logged in as: ${username || getStoredUser()}`),
      ]),
      h("button", { className: "ghost", type: "button", onClick: logout, key: "b" }, "Logout"),
    ]),
    h("section", { className: "card" }, [
      h("h2", { key: "h2" }, "Run Scrape"),
      h(
        "form",
        { className: "form", onSubmit: onScrapeSubmit, key: "form" },
        [
          h("input", {
            key: "url",
            type: "url",
            required: true,
            placeholder: "https://example.com",
            value: url,
            onChange: (e) => setUrl(e.target.value),
          }),
          h("label", { className: "check", key: "check" }, [
            h("input", {
              type: "checkbox",
              checked: verifySsl,
              onChange: (e) => setVerifySsl(e.target.checked),
              key: "cb",
            }),
            "Verify SSL",
          ]),
          h("button", { type: "submit", key: "btn" }, "Scrape"),
        ],
      ),
      h("p", { className: "status", key: "st" }, status),
    ]),
    h("section", { className: "card" }, [
      h("div", { className: "card-head", key: "ch" }, [
        h("h2", { key: "h" }, "History"),
        h("div", { className: "history-actions", key: "ha" }, [
          h("input", {
            key: "q",
            type: "text",
            placeholder: "Search URL/title",
            value: search,
            onChange: (e) => setSearch(e.target.value),
          }),
          h(
            "select",
            {
              key: "sf",
              value: statusFilter,
              onChange: (e) => setStatusFilter(e.target.value),
            },
            [
              h("option", { key: "a", value: "all" }, "All Status"),
              h("option", { key: "s", value: "success" }, "Success"),
              h("option", { key: "e", value: "error" }, "Error"),
            ],
          ),
          h(
            "select",
            {
              key: "sb",
              value: sortBy,
              onChange: (e) => setSortBy(e.target.value),
            },
            [
              h("option", { key: "n", value: "newest" }, "Newest First"),
              h("option", { key: "o", value: "oldest" }, "Oldest First"),
              h("option", { key: "sa", value: "status_asc" }, "Status Asc"),
              h("option", { key: "sd", value: "status_desc" }, "Status Desc"),
            ],
          ),
          h("button", { key: "ex", type: "button", onClick: onExport }, "Export CSV"),
          h("button", { key: "rf", type: "button", className: "ghost", onClick: loadHistory }, "Refresh"),
        ]),
      ]),
      h("div", { className: "table-wrap", key: "tw" }, [
        h("table", { key: "tb" }, [
          h("thead", { key: "th" }, [
            h("tr", { key: "trh" }, [
              h("th", { key: "i" }, "ID"),
              h("th", { key: "u" }, "URL"),
              h("th", { key: "cr" }, "Created At"),
              h("th", { key: "s" }, "Status"),
              h("th", { key: "t" }, "Title"),
              h("th", { key: "h1" }, "H1"),
              h("th", { key: "ln" }, "Links"),
              h("th", { key: "a" }, "Action"),
            ]),
          ]),
          h(
            "tbody",
            { key: "bd" },
            filteredSortedItems.length
              ? filteredSortedItems.map((item) =>
                  h("tr", { key: item.id }, [
                    h("td", { key: "id" }, String(item.id)),
                    h("td", { key: "url", title: item.url }, item.url),
                    h("td", { key: "cr", title: item.created_at || "" }, formatDateTime(item.created_at)),
                    h("td", { key: "st" }, h("span", { className: statusClassName(item.status_code) }, String(item.status_code))),
                    h("td", { key: "ti", title: item.title || "" }, item.title || "-"),
                    h("td", { key: "h1" }, String(item.h1_count ?? 0)),
                    h("td", { key: "ln" }, String(item.links_count ?? 0)),
                    h(
                      "td",
                      { key: "ac" },
                      [
                        h(
                          "button",
                          { key: "vw", type: "button", className: "ghost delete-btn", onClick: () => onViewDetails(item.id) },
                          "View",
                        ),
                        h(
                          "button",
                          { key: "dl", type: "button", className: "ghost delete-btn", onClick: () => onDelete(item.id) },
                          "Delete",
                        ),
                      ],
                    ),
                  ]),
                )
              : [h("tr", { key: "empty" }, h("td", { colSpan: 8 }, "No history found"))],
          ),
        ]),
      ]),
    ]),
    detailOpen
      ? h("div", { className: "modal", onClick: () => setDetailOpen(false) }, [
          h("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), key: "dc" }, [
            h("div", { className: "auth-head", key: "dh" }, [
              h("h2", { key: "h" }, "Scrape Details"),
              h(
                "button",
                { type: "button", className: "ghost", key: "cl", onClick: () => setDetailOpen(false) },
                "Close",
              ),
            ]),
            detailLoading
              ? h("p", { className: "status", key: "ld" }, "Loading details...")
              : detailItem
                ? h("div", { className: "detail-grid", key: "dg" }, [
                    h("p", { key: "i" }, `ID: ${detailItem.id}`),
                    h("p", { key: "u", title: detailItem.url || "" }, `URL: ${detailItem.url || "-"}`),
                    h("p", { key: "c" }, `Created: ${formatDateTime(detailItem.created_at)}`),
                    h("p", { key: "s" }, `Status: ${detailItem.status_code}`),
                    h("p", { key: "t", title: detailItem.title || "" }, `Title: ${detailItem.title || "-"}`),
                    h("p", { key: "m", title: detailItem.meta_description || "" }, `Meta: ${detailItem.meta_description || "-"}`),
                    h("p", { key: "h1" }, `H1 Count: ${detailItem.h1_count ?? 0}`),
                    h("p", { key: "ln" }, `Links Count: ${detailItem.links_count ?? 0}`),
                  ])
                : h("p", { className: "status", key: "nf" }, "Details not found"),
          ]),
        ])
      : null,
  );
}

function App() {
  const [token, setToken] = useState(getStoredToken());
  const [username, setUsername] = useState(getStoredUser());
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const showDashboard = path === "/dashboard";
  const showLogin = path === "/login" || path === "/";

  return h("div", null, [
    h("div", { className: "bg-shape bg-shape-1", key: "b1" }),
    h("div", { className: "bg-shape bg-shape-2", key: "b2" }),
    h(
      "main",
      { className: "container", key: "m" },
      showDashboard && token
        ? h(DashboardView, { token, username, setToken, setUsername, setPath })
        : showLogin
          ? h(LoginView, { setToken, setUsername, setPath })
          : h(LoginView, { setToken, setUsername, setPath }),
    ),
  ]);
}

createRoot(document.getElementById("root")).render(h(App));
