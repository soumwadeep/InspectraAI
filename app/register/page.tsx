"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { AuthBrand, AuthShell } from "@/components/auth/auth-shell";

/**
 * Defined at module scope on purpose. Declaring it inside the page component
 * gives it a new identity on every render, which remounts the labelled input and
 * drops focus after the first keystroke.
 */
function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-kicker uppercase text-secondary-text">
      {children}
    </label>
  );
}

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register } = useAuth();
  const { toast } = useToast();

  const handleRegister = async () => {
    if (!firstName || !lastName || !email || !organization || !password) {
      toast({
        title: "Missing fields",
        description: "All fields are required.",
        variant: "destructive",
      });
      return;
    }
    if (password !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Confirm the same password in both fields.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        email,
        password,
        name: `${firstName} ${lastName}`,
        organization_name: organization,
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Could not reach the API. Start it from backend/ with python3 -m uvicorn app.main:app --port 8000.";
      toast({
        title: "Registration failed",
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
          headline="Create an organization workspace."
          caption="You become its administrator: approvals and ticket closure need that role."
        />
      }
      footer={
        <>
          Already have a workspace?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleRegister();
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="reg-first">First name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-text" />
              <Input
                id="reg-first"
                autoComplete="given-name"
                placeholder="Alex"
                className="pl-10"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-last">Last name</Label>
            <Input
              id="reg-last"
              autoComplete="family-name"
              placeholder="Chen"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reg-email">Email address</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-text" />
            <Input
              id="reg-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              className="pl-10"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reg-org">Organization</Label>
          <Input
            id="reg-org"
            autoComplete="organization"
            placeholder="Actizant Works"
            value={organization}
            onChange={(event) => setOrganization(event.target.value)}
            required
          />
          <p className="text-xs text-secondary-text/80">
            A new workspace is created; the name only needs to be unique as a URL
            slug, so two companies with the same name can both register.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reg-password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-text" />
            <Input
              id="reg-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="••••••••"
              className="pl-10 pr-10"
              minLength={8}
              maxLength={72}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
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
          <p className="text-xs text-secondary-text/80">
            8 to 72 bytes. The limit is bcrypt&apos;s, not a policy choice — it
            ignores anything past 72 bytes rather than rejecting it.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reg-confirm">Confirm password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-text" />
            <Input
              id="reg-confirm"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              placeholder="••••••••"
              className="pl-10 pr-10"
              minLength={8}
              maxLength={72}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirm((visible) => !visible)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-text hover:text-primary"
              aria-label={showConfirm ? "Hide password" : "Show password"}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={isSubmitting}
          loading={isSubmitting}
        >
          Create workspace
        </Button>
      </form>
    </AuthShell>
  );
}
