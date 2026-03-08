const registerForm = document.getElementById("register-form");
const loginForm = document.getElementById("login-form");
const loginStatusEl = document.getElementById("login-status");
const registerStatusEl = document.getElementById("register-status");
const showRegisterBtn = document.getElementById("show-register-btn");
const hideRegisterBtn = document.getElementById("hide-register-btn");
const registerModal = document.getElementById("register-modal");

const TOKEN_KEY = "scraper_token";
const USER_KEY = "scraper_user";

function setText(el, text) {
  el.textContent = text;
}

function setAuth(token, username) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

async function apiRequest(path, options = {}) {
  const res = await fetch(path, options);
  const data = await res.json();
  return { res, data };
}

function showRegister() {
  registerModal.classList.remove("hidden");
  setText(registerStatusEl, "");
}

function hideRegister() {
  registerModal.classList.add("hidden");
}

async function checkExistingLogin() {
  const token = getToken();
  if (!token) return;
  const res = await fetch("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok) window.location.href = "/dashboard";
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setText(registerStatusEl, "Registering...");

  const payload = {
    username: document.getElementById("reg_username").value.trim(),
    email: document.getElementById("reg_email").value.trim(),
    password: document.getElementById("reg_password").value,
  };

  try {
    const { res, data } = await apiRequest("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setText(registerStatusEl, res.ok ? "Register success. Ab login karo." : data.detail || "Register failed");
    if (res.ok) {
      registerForm.reset();
      hideRegister();
      setText(loginStatusEl, "Account created. Please login.");
    }
  } catch (err) {
    setText(registerStatusEl, "Network error");
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setText(loginStatusEl, "Logging in...");

  const payload = {
    username: document.getElementById("login_username").value.trim(),
    password: document.getElementById("login_password").value,
  };

  try {
    const { res, data } = await apiRequest("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setText(loginStatusEl, data.detail || "Login failed");
      return;
    }
    setAuth(data.access_token, data.user.username);
    window.location.href = "/dashboard";
  } catch (err) {
    setText(loginStatusEl, "Network error");
  }
});

showRegisterBtn.addEventListener("click", showRegister);
hideRegisterBtn.addEventListener("click", hideRegister);
registerModal.addEventListener("click", (event) => {
  if (event.target === registerModal) hideRegister();
});

checkExistingLogin();
