"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Mode = "signin" | "signup";
type Account = {
  identifier: string;
  username: string;
  password: string;
  createdAt: string;
};

const STORAGE_KEY = "fixpilot-accounts";
const SESSION_KEY = "fixpilot-session";

export function LoginView() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeSession, setActiveSession] = useState<{ identifier: string; username: string } | null>(null);

  useEffect(() => {
    try {
      const session = localStorage.getItem(SESSION_KEY);
      if (session) {
        const accountsRaw = localStorage.getItem(STORAGE_KEY);
        const accounts: Account[] = accountsRaw ? JSON.parse(accountsRaw) : [];
        const account = accounts.find((a) => a.identifier === session);
        setActiveSession({
          identifier: session,
          username: (account && account.username) || session,
        });
      }
    } catch { /* ignore */ }
  }, []);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    const normalizedIdentifier = identifier.trim().toLowerCase();
    if (!normalizedIdentifier || !password) {
      setError("Enter your email or mobile number and password.");
      return;
    }

    if (mode === "signup") {
      const cleanUsername = username.trim();
      if (!cleanUsername) {
        setError("Username is required.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      const accounts = getAccounts();
      if (accounts.some((account) => account.identifier === normalizedIdentifier)) {
        setError("An account already exists for this email or mobile number.");
        return;
      }
      if (accounts.some((account) => account.username && account.username.toLowerCase() === cleanUsername.toLowerCase())) {
        setError("Username is already taken.");
        return;
      }

      const next = [
        ...accounts,
        {
          identifier: normalizedIdentifier,
          username: cleanUsername,
          password,
          createdAt: new Date().toISOString(),
        },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      localStorage.setItem(SESSION_KEY, normalizedIdentifier);
      setMessage("Account created. You are signed in.");
      setTimeout(() => router.push("/dashboard"), 500);
      return;
    }

    const account = getAccounts().find((item) => item.identifier === normalizedIdentifier);
    if (!account) {
      setError("No account exists for this email or mobile number. Create an account first, then sign in.");
      return;
    }
    if (account.password !== password) {
      setError("Incorrect password. Enter the password you set when you created the account.");
      return;
    }

    localStorage.setItem(SESSION_KEY, normalizedIdentifier);
    setMessage("Signed in successfully.");
    setTimeout(() => router.push("/dashboard"), 500);
  }

  if (activeSession) {
    return (
      <div className="auth-layout">
        <section className="auth-panel" style={{ textAlign: "center" }}>
          <div className="page-kicker">FixPilot Account</div>
          <h1 className="auth-title">Welcome, {activeSession.username}</h1>
          <p className="auth-copy" style={{ marginBottom: "24px" }}>
            You are currently signed in as <strong>{activeSession.identifier}</strong>.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "320px", margin: "0 auto" }}>
            <button
              className="btn-primary"
              onClick={() => router.push("/dashboard")}
              type="button"
            >
              Go to Dashboard
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                if (confirm("Are you sure you want to sign out?")) {
                  localStorage.removeItem(SESSION_KEY);
                  setActiveSession(null);
                  window.location.reload();
                }
              }}
              type="button"
            >
              Sign out
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="auth-layout">
      <section className="auth-panel">
        <div className="page-kicker">FixPilot Account</div>
        <h1 className="auth-title">{mode === "signin" ? "Sign in" : "Create your account"}</h1>
        <p className="auth-copy">
          Use your email or mobile number with the password you set when creating the account.
        </p>

        <div className="auth-tabs" role="tablist">
          <button
            className={`auth-tab ${mode === "signin" ? "active" : ""}`}
            onClick={() => {
              setMode("signin");
              setError("");
              setMessage("");
            }}
            type="button"
          >
            Sign in
          </button>
          <button
            className={`auth-tab ${mode === "signup" ? "active" : ""}`}
            onClick={() => {
              setMode("signup");
              setError("");
              setMessage("");
            }}
            type="button"
          >
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}
          {message && <div className="form-success">{message}</div>}

          {mode === "signup" && (
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                className="form-input"
                onChange={(event) => setUsername(event.target.value)}
                placeholder="e.g. johndoe"
                value={username}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email or mobile number</label>
            <input
              autoComplete="username"
              className="form-input"
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="you@example.com or +91 98765 43210"
              value={identifier}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="form-input"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </div>

          {mode === "signup" && (
            <div className="form-group">
              <label className="form-label">Confirm password</label>
              <input
                autoComplete="new-password"
                className="form-input"
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                value={confirmPassword}
              />
            </div>
          )}

          <button className="btn-primary auth-submit" type="submit">
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </section>
    </div>
  );
}

function getAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
