"use client";

import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldCheck,
  Server,
  Globe,
  ToggleRight,
  LogOut,
  Cloud,
} from "@/components/icons";
import { useAuth } from "@/lib/auth-context";
import { useSystemHealth } from "@/lib/hooks";
import { useTheme } from "@/lib/theme-provider";
import { formatDate } from "@/lib/utils";

/**
 * Mirrors the fallback in `lib/api.ts`. `lib/api.ts` does not export its base
 * URL, so this is the same expression rather than a second source of truth.
 */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Copied from the error message in `components/mission/system-health-panel.tsx`. */
const BACKEND_START_COMMAND = "python3 -m uvicorn app.main:app --port 8000";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 25 } },
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg bg-surface/30 p-3">
      <span className="text-sm text-secondary-text">{label}</span>
      <span className="break-all text-right text-sm font-medium text-primary-text">
        {value}
      </span>
    </div>
  );
}

function ApiOffline({ reason }: { reason?: string }) {
  return (
    <div className="rounded-lg bg-critical/10 p-3 text-xs text-critical">
      <p className="font-medium">
        <code className="font-mono">GET /health</code> failed
        {reason ? `: ${reason}` : " — the API did not answer."}
      </p>
      <p className="mt-2">
        If the backend process is not running, start it from{" "}
        <code className="font-mono">backend/</code> with{" "}
        <code className="font-mono">{BACKEND_START_COMMAND}</code>.
      </p>
      <p className="mt-2">
        A 401/403 means the request reached the API but the stored token was rejected — sign out
        below and sign in again.
      </p>
    </div>
  );
}

/**
 * Settings that a "complete" settings page would show and this backend cannot
 * serve. Each entry names the missing source instead of faking a value, because
 * the competition rules forbid presenting unimplemented features as real.
 */
const unavailable: Array<{ label: string; reason: string }> = [
  {
    label: "Notification preferences",
    reason:
      "No endpoint accepts or stores them, so every switch that used to sit on this page persisted nothing. They have been deleted rather than decorated.",
  },
  {
    label: "Multi-factor authentication",
    reason:
      "app/api/auth.py implements email + password JWT login only. There is no TOTP, no recovery codes, and no password-change route, so the previous 'MFA Enabled' badge and 'last password change' date had no source.",
  },
  {
    label: "Active sessions",
    reason:
      "The access token is a stateless JWT and no session table exists, so a device count cannot be read. The '2 active sessions' row was invented.",
  },
  {
    label: "Team members",
    reason:
      "organization_members is in the schema but no route returns it, and GET /api/auth/me exposes only organization_id. The '12 members' figure was invented.",
  },
  {
    label: "Organization name and plan",
    reason:
      "UserRead has no organization name and the schema has no plan column, so 'Acme Industries' and 'Enterprise' were invented. Only the organization id is shown below.",
  },
  {
    label: "API keys",
    reason: "No key table and no issuing endpoint exist.",
  },
  {
    label: "AWS S3 + EC2 integration",
    reason:
      "Not implemented: boto3 is not in backend/requirements.txt, uploads are served from local disk, and nothing in the backend ever assigns the s3_key columns. The 'connected' status and its last-sync timestamp were invented.",
  },
  {
    label: "Slack and SMTP",
    reason: "Neither client appears anywhere in backend/app.",
  },
  {
    label: "Language, date format, CV engine selection",
    reason:
      "No preference store and no second OpenCV build to choose; the only real engine version is the one reported under System health.",
  },
];

export default function SettingsPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const {
    data: health,
    isLoading: healthLoading,
    isError: healthError,
    error: healthQueryError,
  } = useSystemHealth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-display font-bold text-gradient-hero">Settings</h1>
        <p className="mt-1 text-secondary-text">
          Only what the API can actually read: your signed-in identity, the API origin, and
          live process health. Everything this page used to fake is now listed as unavailable.
        </p>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Account — every field is one GET /api/auth/me response */}
        <motion.div variants={item}>
          <Card>
            <CardHeader>
              <CardTitle className="text-primary-text flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Account
              </CardTitle>
              <CardDescription>
                Signed-in identity from <code className="font-mono">GET /api/auth/me</code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {authLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : user ? (
                <>
                  <Row label="Name" value={user.name} />
                  <Row label="Email" value={user.email} />
                  <Row label="Role" value={user.role} />
                  <Row label="Organization id" value={user.organizationId} />
                  <Row label="User id" value={user.id} />
                  <div className="flex items-center justify-between rounded-lg bg-surface/30 p-3">
                    <span className="text-sm text-secondary-text">Account status</span>
                    <Badge variant={user.isActive ? "success" : "critical"}>
                      {user.isActive ? "active" : "disabled"}
                    </Badge>
                  </div>
                  <Row label="Account created" value={formatDate(user.createdAt)} />
                </>
              ) : (
                <p className="text-sm text-warning">
                  No session on this device. Identity comes from the API and requires a token,
                  so there is nothing to display until you sign in.
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* System health — live /health read */}
        <motion.div variants={item}>
          <Card>
            <CardHeader>
              <CardTitle className="text-primary-text flex items-center gap-2">
                <Server className="h-5 w-5 text-secondary" />
                System health
              </CardTitle>
              <CardDescription>
                Read live from <code className="font-mono">GET /health</code>, refreshed every
                15s
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {healthLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : healthError ? (
                <ApiOffline reason={healthQueryError?.message} />
              ) : health ? (
                <>
                  <Row label="Status" value={health.status} />
                  <Row label="Application" value={`${health.app} ${health.version}`} />
                  <Row label="OpenCV version" value={health.opencv} />
                  <div className="flex items-center justify-between rounded-lg bg-surface/30 p-3">
                    <span className="text-sm text-secondary-text">Database</span>
                    <Badge
                      variant={health.database === "connected" ? "success" : "critical"}
                    >
                      {health.database}
                    </Badge>
                  </div>
                  <Row label="Schema revision" value={health.schema_revision} />
                </>
              ) : (
                <p className="text-sm text-warning">
                  The request finished without returning a health payload, so there is nothing to
                  report. Reload this page; if it repeats, the API is not serving{" "}
                  <code className="font-mono">/health</code>.
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* API endpoint */}
        <motion.div variants={item}>
          <Card>
            <CardHeader>
              <CardTitle className="text-primary-text flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                API origin
              </CardTitle>
              <CardDescription>
                Where this client sends every request
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Row label="NEXT_PUBLIC_API_URL" value={API_ORIGIN} />
              <p className="text-xs text-secondary-text">
                Set in <code className="font-mono">.env.local</code>; the client falls back to{" "}
                <code className="font-mono">http://localhost:8000</code> when it is unset.
                Requests are unproxied <code className="font-mono">fetch</code> calls, so a
                failure here is the same failure the health card above reports.
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Appearance */}
        <motion.div variants={item}>
          <Card>
            <CardHeader>
              <CardTitle className="text-primary-text flex items-center gap-2">
                <ToggleRight className="h-5 w-5 text-secondary" />
                Appearance
              </CardTitle>
              <CardDescription>
                Theme selected on this device: {theme === "dark" ? "Dark" : "Light"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" size="sm" onClick={toggleTheme}>
                <ToggleRight className="mr-2 h-4 w-4" />
                Switch to {theme === "dark" ? "Light" : "Dark"}
              </Button>
              <p className="text-xs text-secondary-text">
                This button really toggles the <code className="font-mono">light</code>/
                <code className="font-mono">dark</code> class on the document element and saves
                the choice in <code className="font-mono">localStorage</code>. Do not judge it by
                the colours: the <code className="font-mono">.dark</code> token block in{" "}
                <code className="font-mono">app/globals.css</code> is currently identical to{" "}
                <code className="font-mono">:root</code>, so choosing Dark changes nothing on
                screen. Light does change the palette. There is no preference stored on the
                server.
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Sign out */}
        <motion.div variants={item} className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-primary-text flex items-center gap-2">
                <LogOut className="h-5 w-5 text-critical" />
                Sign out
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="destructive" size="sm" onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out of this device
              </Button>
              <p className="text-xs text-secondary-text">
                Removes the stored JWT and returns to the login screen. The token is stateless
                and the backend keeps no session table, so it cannot be revoked server-side.
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* What is missing, stated plainly */}
        <motion.div variants={item} className="lg:col-span-2">
          <Card className="border-border/50 bg-surface-elevated/30">
            <CardHeader>
              <CardTitle className="text-primary-text flex items-center gap-2">
                <Cloud className="h-5 w-5 text-secondary-text" />
                Not implemented by this backend
              </CardTitle>
              <CardDescription>
                Earlier revisions of this page showed these as configured facts. They are
                removed, and this is why.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {unavailable.map((entry) => (
                <div key={entry.label} className="rounded-lg bg-surface/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-primary-text">{entry.label}</span>
                    <Badge variant="outline">no data source</Badge>
                  </div>
                  <p className="mt-1 text-xs text-secondary-text">{entry.reason}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
