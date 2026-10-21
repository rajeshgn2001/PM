"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import { getStoredAuth, logoutUser } from "@/lib/auth";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return getStoredAuth().isAuthenticated;
    }
    return false;
  });
  const [username, setUsername] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return getStoredAuth().username || "user";
    }
    return "user";
  });

  useEffect(() => {
    const auth = getStoredAuth();
    setIsAuthenticated(auth.isAuthenticated);
    if (auth.username) {
      setUsername(auth.username);
    }
  }, []);

  const handleLoginSuccess = (user: string) => {
    setUsername(user);
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    await logoutUser();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

  return <KanbanBoard onLogout={handleLogout} username={username} />;
}
