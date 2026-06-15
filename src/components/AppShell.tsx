"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const navItems = [
  { href: "/marketplace", label: "Products" },
  { href: "/dashboard",   label: "For Companies" },
  { href: "/diagnostic",  label: "Diagnose" },
];

const mobileItems = [
  { href: "/marketplace", icon: "🏠", label: "Home" },
  { href: "/marketplace", icon: "🔍", label: "Products" },
  { href: "/diagnostic",  icon: "🧠", label: "Diagnose" },
  { href: "/dashboard",   icon: "📊", label: "Dashboard" },
  { href: "/login",       icon: "👤", label: "Account" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [sessionUser, setSessionUser] = useState<string | null>(null);

  // Sync theme and session from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("fp-theme") as "dark" | "light" | null;
      if (stored) setTheme(stored);
    } catch { /* ignore */ }

    try {
      const session = localStorage.getItem("fixpilot-session");
      if (session) {
        const accountsRaw = localStorage.getItem("fixpilot-accounts");
        const accounts = accountsRaw ? JSON.parse(accountsRaw) : [];
        const account = accounts.find((a: any) => a.identifier === session);
        if (account && account.username) {
          setSessionUser(account.username);
        } else {
          setSessionUser(session);
        }
      }
    } catch { /* ignore */ }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("fp-theme", next); } catch { /* ignore */ }
  };

  return (
    <div className="app-shell">
      <main className="app-main">
        <nav className="mock-nav" aria-label="Primary navigation">
          <Link className="mock-nav-logo" href="/marketplace">
            <img 
              src="/logo.png" 
              alt="FixPilot Logo" 
              style={{ 
                width: "28px", 
                height: "28px", 
                objectFit: "contain",
                animation: "float 4s ease-in-out infinite"
              }} 
            />
            FixPilot
          </Link>

          <div className="mock-nav-links">
            {navItems.map((item) => (
              <Link
                className={`mock-nav-link ${pathname.startsWith(item.href) ? "active" : ""}`}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            {sessionUser ? (
              <span 
                className="mock-nav-username" 
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--violet-light)",
                  padding: "5px 12px",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "20px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                  marginLeft: "12px",
                  userSelect: "none",
                  transition: "all 0.2s"
                }} 
                onClick={() => {
                  if (confirm("Would you like to sign out?")) {
                    localStorage.removeItem("fixpilot-session");
                    setSessionUser(null);
                    window.location.reload();
                  }
                }} 
                title="Click to Sign Out"
              >
                👤 {sessionUser}
              </span>
            ) : (
              <Link className="mock-nav-cta" href="/login">
                Sign in
              </Link>
            )}
          </div>
        </nav>

        {children}
      </main>

      <nav className="mock-mobile-nav" aria-label="Mobile navigation">
        {mobileItems.map((item) => {
          const isAccount = item.href === "/login";
          const label = (isAccount && sessionUser) ? sessionUser : item.label;
          return (
            <Link
              className={`mock-mobile-nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}
              href={item.href}
              key={`${item.href}-${item.label}`}
            >
              <span className="mock-mobile-nav-icon">{item.icon}</span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
