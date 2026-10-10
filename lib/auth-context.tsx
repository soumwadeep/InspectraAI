"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, clearToken } from "./api";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  isActive: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    name: string;
    organization_name: string;
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    initAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function initAuth() {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const u = await api.auth.me();
      setUser(u);
    } catch {
      clearToken();
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const { user: u } = await api.auth.login(email, password);
    setUser(u);
    router.push("/dashboard");
  }

  async function register(data: {
    email: string;
    password: string;
    name: string;
    organization_name: string;
  }) {
    const { user: u } = await api.auth.register(data);
    setUser(u);
    router.push("/dashboard");
  }

  function logout() {
    api.auth.logout();
    setUser(null);
    router.push("/login");
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function useRequireAuth() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  return { user, loading };
}
