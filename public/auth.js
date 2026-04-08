const SESSION_KEY = "wpp_session";

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function setSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

async function refreshSession() {
  const session = getSession();
  if (!session?.refresh_token) return null;

  const res = await fetch("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });

  if (!res.ok) {
    clearSession();
    return null;
  }

  const data = await res.json();
  setSession(data);
  return data;
}

// Garante sessão válida e verifica role. Redireciona se necessário.
async function requireSession(allowedRoles) {
  let session = getSession();

  if (!session) {
    location.href = "/login.html";
    return null;
  }

  // Renova se expirar nos próximos 60s
  if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
    session = await refreshSession();
    if (!session) {
      location.href = "/login.html";
      return null;
    }
  }

  if (allowedRoles && !allowedRoles.includes(session.role)) {
    if (session.role === "gestor")        location.href = "/admin.html";
    else if (session.role === "cliente")  location.href = "/cliente.html";
    else                                  location.href = "/";
    return null;
  }

  return session;
}

async function logout() {
  await fetch("/auth/logout", { method: "POST" }).catch(() => {});
  clearSession();
  location.href = "/login.html";
}

function authHeaders(session) {
  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}
