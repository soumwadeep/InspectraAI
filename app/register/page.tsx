"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Lock, Mail, User, Shield } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();

  const handleRegister = () => {
    router.push("/dashboard");
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 h-[600px] w-[600px] rounded-full bg-secondary/5 blur-3xl" />
      </div>

      <motion.div
        className="relative w-full max-w-lg"
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
              Create Your Account
            </h2>
            <p className="mt-1 text-sm text-secondary-text">
              Start your 14-day free trial. No credit card required.
            </p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleRegister(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-secondary-text">
                  First Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-text" />
                  <Input type="text" placeholder="Alex" className="pl-10" required />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-secondary-text">
                  Last Name
                </label>
                <Input type="text" placeholder="Chen" required />
              </div>
            </div>

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
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-secondary-text">
                Organization
              </label>
              <div className="relative">
                <Shield className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-text" />
                <Input type="text" placeholder="Acme Industries" className="pl-10" required />
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
                  required
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

            <div className="space-y-2">
              <label className="text-xs font-medium text-secondary-text">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-text" />
                <Input
                  type={showConfirm ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-text hover:text-primary"
                >
                  {showConfirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg">
              Create Account
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 border-t border-border" />
            <span className="text-xs text-secondary-text">OR</span>
            <div className="flex-1 border-t border-border" />
          </div>

          <p className="text-center text-sm text-secondary-text">
            Already have an account?
            <Link
              href="/login"
              className="ml-1 text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
