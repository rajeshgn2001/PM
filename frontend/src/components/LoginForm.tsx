"use client";

import { useState, type FormEvent } from "react";
import { loginUser, registerUser } from "@/lib/auth";

type LoginFormProps = {
  onLoginSuccess: (username: string) => void;
};

export const LoginForm = ({ onLoginSuccess }: LoginFormProps) => {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignIn = mode === "signin";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await (mode === "signin" ? loginUser : registerUser)(username, password);
      if (result.success) {
        onLoginSuccess(username.trim());
      } else {
        setError(result.error ?? "Something went wrong");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--surface)] px-4 py-12">
      {/* Background gradients */}
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <div className="relative w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white/90 p-8 shadow-[var(--shadow)] backdrop-blur sm:p-10">
        <div className="h-1.5 w-16 rounded-full bg-[var(--accent-yellow)]" />

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
            {isSignIn ? "Welcome Back" : "Get Started"}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            Kanban Studio
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
            {isSignIn
              ? "Sign in to access your project boards."
              : "Create an account to start planning with your own boards."}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-xs font-semibold uppercase tracking-wider text-[var(--navy-dark)]"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={isSignIn ? "user" : "Choose a username"}
              autoComplete="username"
              required
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:bg-white"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-wider text-[var(--navy-dark)]"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignIn ? "password" : "At least 6 characters"}
              autoComplete={isSignIn ? "current-password" : "new-password"}
              required
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 w-full rounded-full bg-[var(--secondary-purple)] px-6 py-3.5 text-xs font-semibold uppercase tracking-widest text-white shadow-md transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
          >
            {isSubmitting ? "Please wait..." : isSignIn ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--gray-text)]">
          {isSignIn ? "New to Kanban Studio?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(isSignIn ? "register" : "signin");
              setError(null);
            }}
            className="font-semibold text-[var(--primary-blue)] hover:underline"
          >
            {isSignIn ? "Create an account" : "Sign in"}
          </button>
        </p>

        {isSignIn && (
          <div className="mt-6 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--gray-text)]">
              Demo Credentials
            </p>
            <p className="mt-1 font-mono text-xs font-semibold text-[var(--primary-blue)]">
              user / password
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
