"use client";

import { useEffect, useState } from "react";
import { Workspace } from "@/components/Workspace";
import { LoginForm } from "@/components/LoginForm";
import { AUTH_EXPIRED_EVENT, getStoredAuth, logoutUser } from "@/lib/auth";

export default function Home() {
  const [username, setUsername] = useState<string | null>(() =>
    typeof window !== "undefined" ? getStoredAuth().username : null
  );

  useEffect(() => {
    const handleExpired = () => setUsername(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    setUsername(null);
  };

  if (!username) {
    return <LoginForm onLoginSuccess={setUsername} />;
  }

  return <Workspace key={username} username={username} onLogout={handleLogout} />;
}
