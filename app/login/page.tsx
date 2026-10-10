"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Lock, Mail, Shield } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";

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
        description: "Please enter your email and password.",
        variant: "destructive",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Login failed. Please try again.";
      toast({
        title: "Login failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 h-[600px] w-[600px] rounded-full bg-secondary/5 blur-3xl" />
      </div>

      <motion.div
        className="relative w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div className="glass-strong rounded-2xl p-8">
          <div className="mb-8 flex items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Shield className="h-6 w-6" />
            </div>
            <div className="ml-3">
              <h1 className="text-2xl font-bold text-gradient-hero">
                Inspectra AI
              </h1>
              <p className="text-sm text-secondary-text">
                Autonomous Visual Inspection Platform
              </p>
            </div>
          </div>

          <div className="mb-6 text-center">
            <h2 className="text-title font-bold text-primary-text">
              Welcome Back
            </h2>
            <p className="mt-1 text-sm text-secondary-text">
              Enter your credentials to access the platform
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-secondary-text">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-text" />
                <Input
                  type="email"
                  placeholder="you@company.com"
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-secondary-text">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-text" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-text hover:text-primary"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border bg-surface/50 text-primary focus:ring-primary"
                />
                <span className="text-sm text-secondary-text">
                  Remember me
                </span>
              </label>
              <Link
                href="#"
                className="text-sm text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleLogin}
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              Sign In
            </Button>
          </div>

          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 border-t border-border" />
            <span className="text-xs text-secondary-text">OR</span>
            <div className="flex-1 border-t border-border" />
          </div>

          <p className="text-center text-sm text-secondary-text">
            Don't have an account?
            <Link
              href="/register"
              className="ml-1 text-primary hover:underline"
            >
              Sign up
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
