"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { AuthBrand, AuthShell } from "@/components/auth/auth-shell";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();

  const handleLogin = async () => {
    if (!email || !password) {
      toast({
        title: "Missing fields",
        description: "Email and password are both required.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Could not reach the API. Start it from backend/ with python3 -m uvicorn app.main:app --port 8000.";
      toast({
        title: "Sign in failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      brand={
        <AuthBrand
          headline="Sign in to your inspection workspace."
          caption="See the problem. Investigate the cause. Act before failure."
        />
      }
      footer={
        <>
          No workspace yet?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Create an organization
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="login-email"
            className="text-kicker uppercase text-secondary-text"
          >
            Email address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-text" />
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              className="pl-10"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="login-password"
            className="text-kicker uppercase text-secondary-text"
          >
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-text" />
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              className="pl-10 pr-10"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleLogin();
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-text hover:text-primary"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button
          className="w-full"
          size="lg"
          onClick={handleLogin}
          disabled={isSubmitting}
          loading={isSubmitting}
        >
          Sign in
        </Button>

        {/*
          "Remember me" and "Forgot password?" were removed rather than styled: the
          checkbox had no handler and the link pointed at `#`. There is no
          password-reset endpoint in the backend, and the token is kept in this
          browser for its full lifetime either way, so both implied capability
          that does not exist.
        */}
        <p className="text-center text-xs text-secondary-text">
          Access tokens are stored in this browser and expire after 24 hours.
        </p>
      </div>
    </AuthShell>
  );
}
