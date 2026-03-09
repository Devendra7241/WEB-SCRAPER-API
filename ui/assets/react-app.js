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
      h("p", { className: "subtitle", key: "s" }, ),
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
  const pageSize = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [historyItems, setHistoryItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [detailItem, setDetailItem] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ limit: String(pageSize), page: String(currentPage) });
    if (search.trim()) params.set("q", search.trim());
    params.set("status", statusFilter);
    return params.toString();
  }, [search, pageSize, currentPage, statusFilter]);

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
    const apiTotalPages = Math.max(1, Number(data.total_pages || 1));
    setTotalItems(Number(data.total || 0));
    setTotalPages(apiTotalPages);
    if (currentPage > apiTotalPages) {
      setCurrentPage(apiTotalPages);
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

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  async function onScrapeSubmit(event) {
    event.preventDefault();
    setStatus("Scraping...");
    const params = new URLSearchParams({
      url: url.trim(),
      verify_ssl: String(verifySsl),
    });
    const { res, data } = await apiRequest(`/scrape?${params.toString()}`, { token });
    if (res.status === 401) return logout();
    if (!res.ok) {
      setStatus(data.detail || "Scrape failed");
      return;
    }
    setStatus(
      `Scrape complete: ${data.crawled_pages || 1} page(s), links ${data.links_count || 0}, emails ${data.emails_count || 0}, phones ${data.phones_count || 0}`,
    );
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

  function onPrevPage() {
    setCurrentPage((prev) => (prev > 1 ? prev - 1 : 1));
  }

  function onNextPage() {
    setCurrentPage((prev) => (prev < totalPages ? prev + 1 : totalPages));
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
          h("button", { key: "ex", type: "button", onClick: onExport }, "Export CSV"),
          h("button", { key: "rf", type: "button", className: "ghost", onClick: loadHistory }, "Refresh"),
        ]),
      ]),
      h("div", { className: "table-wrap", key: "tw" }, [
        h("div", { className: "pagination", key: "pg-top" }, [
          h(
            "p",
            { key: "info", className: "small" },
            `Page ${currentPage} of ${totalPages} (${totalItems} items)`,
          ),
          h("div", { key: "btns", className: "pagination-actions" }, [
            h(
              "button",
              {
                key: "prev",
                type: "button",
                className: "ghost",
                disabled: currentPage <= 1,
                onClick: onPrevPage,
              },
              "Prev",
            ),
            h(
              "button",
              {
                key: "next",
                type: "button",
                className: "ghost",
                disabled: currentPage >= totalPages,
                onClick: onNextPage,
              },
              "Next",
            ),
          ]),
        ]),
        h("table", { key: "tb" }, [
          h("thead", { key: "th" }, [
            h("tr", { key: "trh" }, [
              h("th", { key: "u" }, "URL"),
              h("th", { key: "cr" }, "Created At"),
              h("th", { key: "t" }, "Title"),
              h("th", { key: "h1" }, "H1"),
              h("th", { key: "ln" }, "Links"),
              h("th", { key: "em" }, "Email"),
              h("th", { key: "ph" }, "Mobile"),
              h("th", { key: "a" }, "Action"),
            ]),
          ]),
          h(
            "tbody",
            { key: "bd" },
            historyItems.length
              ? historyItems.map((item) =>
                  h("tr", { key: item.id }, [
                    h("td", { key: "url", title: item.url }, item.url),
                    h("td", { key: "cr", title: item.created_at || "" }, formatDateTime(item.created_at)),
                    h("td", { key: "ti", title: item.title || "" }, item.title || "-"),
                    h("td", { key: "h1" }, String(item.h1_count ?? 0)),
                    h("td", { key: "ln" }, String(item.links_count ?? 0)),
                    h(
                      "td",
                      { key: "em", title: (item.sample_emails || []).join(", ") || "" },
                      item.primary_email || "-",
                    ),
                    h(
                      "td",
                      { key: "ph", title: (item.sample_phones || []).join(", ") || "" },
                      item.primary_phone || "-",
                    ),
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
                    h("p", { key: "em" }, `Emails Found: ${detailItem.payload?.emails_count ?? 0}`),
                    h("p", { key: "ph" }, `Phones Found: ${detailItem.payload?.phones_count ?? 0}`),
                    h("p", { key: "cp" }, `Crawled Pages: ${detailItem.payload?.crawled_pages ?? 1}`),
                    h("p", { key: "fp" }, `Failed Pages: ${detailItem.payload?.failed_pages ?? 0}`),
                    detailItem.payload?.sample_emails?.length
                      ? h(
                          "div",
                          { key: "el", className: "page-list" },
                          [
                            h("p", { key: "elh", className: "small" }, "Sample Emails"),
                            ...detailItem.payload.sample_emails.slice(0, 12).map((email, index) =>
                              h("p", { key: `em-${index}`, title: email }, `${index + 1}. ${email}`),
                            ),
                          ],
                        )
                      : null,
                    detailItem.payload?.sample_phones?.length
                      ? h(
                          "div",
                          { key: "pln", className: "page-list" },
                          [
                            h("p", { key: "plnh", className: "small" }, "Sample Phones"),
                            ...detailItem.payload.sample_phones.slice(0, 12).map((phone, index) =>
                              h("p", { key: `ph-${index}`, title: phone }, `${index + 1}. ${phone}`),
                            ),
                          ],
                        )
                      : null,
                    detailItem.payload?.pages?.length
                      ? h(
                          "div",
                          { key: "pl", className: "page-list" },
                          detailItem.payload.pages.slice(0, 12).map((page, index) =>
                            h(
                              "p",
                              { key: `${page.url}-${index}`, title: page.url || "" },
                              `${index + 1}. [${page.status_code ?? "ERR"}] ${page.url || "-"}`,
                            ),
                          ),
                        )
                      : null,
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
