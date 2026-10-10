"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Settings as SettingsIcon, Users,
  Bell,
  BellOff,
  Key,
  Lock,
  ShieldCheck,
  ToggleRight,
  Save,
  ExternalLink,
  Calendar,
  Edit,
  Cloud,
  Slack as SlackIcon,
  Mail,
  CheckCircle,
  XCircle,
} from "@/components/icons";
import { formatDate } from "@/lib/utils";

// Inline settings data — migrate to API once settings endpoint is available
const settingsData = {
  workspace: {
    name: "Acme Industries",
    id: "org_01",
    members: 12,
    plan: "Enterprise",
  },
  notificationPrefs: {
    email: true,
    push: false,
    findings: true,
    tickets: true,
    system: false,
  },
  security: {
    mfaEnabled: true,
    lastPasswordChange: "2025-09-15T00:00:00Z",
    activeSessions: 2,
  },
  integrations: [
    { id: "aws", name: "AWS S3 + EC2", status: "connected" as const, lastSync: "2025-10-08T14:00:00Z" },
    { id: "slack", name: "Slack", status: "disconnected" as const },
    { id: "email", name: "SMTP", status: "connected" as const, lastSync: "2025-10-07T18:00:00Z" },
  ],
};

export default function SettingsPage() {
  const [email, setEmail] = useState(settingsData.notificationPrefs.email);
  const [push, setPush] = useState(settingsData.notificationPrefs.push);
  const [findings, setFindings] = useState(settingsData.notificationPrefs.findings);
  const [tickets, setTickets] = useState(settingsData.notificationPrefs.tickets);
  const [system, setSystem] = useState(settingsData.notificationPrefs.system);

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

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-display font-bold text-gradient-hero">
              Settings
            </h1>
            <p className="mt-1 text-secondary-text">
              Configure your workspace, notifications, security, and integrations
            </p>
          </div>
          <Button size="sm">
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 gap-6 lg:grid-cols-3"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Workspace */}
        <motion.div variants={item} className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-primary-text flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Workspace
              </CardTitle>
              <CardDescription>
                Manage your organization and team settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Label className="text-secondary-text">Organization</Label>
                  <Input
                    defaultValue={settingsData.workspace.name}
                    className="mt-1 bg-surface/50 border-border focus:border-primary"
                  />
                </div>
                <div>
                  <Label className="text-secondary-text">Workspace ID</Label>
                  <Input
                    defaultValue={settingsData.workspace.id}
                    className="mt-1 bg-surface/50 border-border focus:border-primary"
                    readOnly
                  />
                </div>
                <div>
                  <Label className="text-secondary-text">Plan</Label>
                  <Input
                    defaultValue={settingsData.workspace.plan}
                    className="mt-1 bg-surface/50 border-border focus:border-primary"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface/30 p-3">
                <div>
                  <span className="font-medium text-primary-text">
                    {settingsData.workspace.members} team members
                  </span>
                  <p className="text-sm text-secondary-text">Manage team access and roles</p>
                </div>
                <Button variant="outline" size="sm">
                  <Edit className="h-4 w-4 mr-2" />
                  Manage Team
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Notifications */}
        <motion.div variants={item} className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-primary-text flex items-center gap-2">
                <Bell className="h-5 w-5 text-secondary" />
                Notifications
              </CardTitle>
              <CardDescription>
                Choose how you receive alerts and updates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="email-notifications" className="text-secondary-text">
                  Email notifications
                </Label>
                <Switch
                  id="email-notifications"
                  checked={email}
                  onCheckedChange={setEmail}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="push-notifications" className="text-secondary-text">
                  Push notifications
                </Label>
                <Switch
                  id="push-notifications"
                  checked={push}
                  onCheckedChange={setPush}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="finding-alerts" className="text-secondary-text">
                  Finding alerts
                </Label>
                <Switch
                  id="finding-alerts"
                  checked={findings}
                  onCheckedChange={setFindings}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="ticket-updates" className="text-secondary-text">
                  Ticket updates
                </Label>
                <Switch
                  id="ticket-updates"
                  checked={tickets}
                  onCheckedChange={setTickets}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="system-alerts" className="text-secondary-text">
                  System alerts
                </Label>
                <Switch
                  id="system-alerts"
                  checked={system}
                  onCheckedChange={setSystem}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Security */}
        <motion.div variants={item} className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-primary-text flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-success" />
                Security
              </CardTitle>
              <CardDescription>
                Authentication and access control settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg bg-surface/30 p-3">
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-warning" />
                  <div>
                    <p className="font-medium text-primary-text">Multi-Factor Auth</p>
                    <p className="text-xs text-secondary-text">
                      Last changed: {formatDate(settingsData.security.lastPasswordChange)}
                    </p>
                  </div>
                </div>
                <Badge variant={settingsData.security.mfaEnabled ? "success" : "warning"}>
                  {settingsData.security.mfaEnabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface/30 p-3">
                <div className="flex items-center gap-3">
                  <Key className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium text-primary-text">API Keys</p>
                    <p className="text-xs text-secondary-text">2 active keys</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  <Edit className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface/30 p-3">
                <div className="flex items-center gap-3">
                  <ToggleRight className="h-5 w-5 text-secondary-text" />
                  <div>
                    <p className="font-medium text-primary-text">Active Sessions</p>
                    <p className="text-xs text-secondary-text">
                      {settingsData.security.activeSessions} devices logged in
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  Manage
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Integrations */}
        <motion.div variants={item} className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-primary-text flex items-center gap-2">
                <Cloud className="h-5 w-5 text-primary" />
                Integrations
              </CardTitle>
              <CardDescription>
                Manage connected services and data sources
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsData.integrations.map((integration) => {
                const Icon = integration.status === "connected" ? CheckCircle : XCircle;
                const iconColor = integration.status === "connected" ? "text-success" : "text-critical";
                return (
                  <motion.div
                    key={integration.id}
                    className="flex items-center justify-between rounded-lg bg-surface/30 p-3"
                    whileHover={{ backgroundColor: "rgba(23, 34, 53, 0.5)" }}
                  >
                    <div className="flex items-center gap-3">
                      {integration.name.includes("Slack") ? (
                        <SlackIcon className="h-5 w-5 text-secondary-text" />
                      ) : integration.name.includes("SMTP") ? (
                        <Mail className="h-5 w-5 text-secondary-text" />
                      ) : (
                        <Cloud className="h-5 w-5 text-secondary-text" />
                      )}
                      <div>
                        <p className="font-medium text-primary-text">{integration.name}</p>
                        {integration.lastSync && (
                          <p className="text-xs text-secondary-text">
                            Last sync: {formatDate(integration.lastSync)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={integration.status === "connected" ? "success" : "default"}>
                        <Icon className={`h-3 w-3 mr-1 ${iconColor}`} />
                        {integration.status}
                      </Badge>
                      <Button variant="ghost" size="icon-sm">
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>

        {/* Preferences */}
        <motion.div variants={item} className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-primary-text">Application Preferences</CardTitle>
              <CardDescription>
                Customize your Inspectra AI experience
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-surface/30 p-4">
                  <p className="text-sm text-secondary-text">Theme</p>
                  <p className="mt-1 font-medium text-primary-text">Dark (System)</p>
                </div>
                <div className="rounded-lg bg-surface/30 p-4">
                  <p className="text-sm text-secondary-text">Language</p>
                  <p className="mt-1 font-medium text-primary-text">English (US)</p>
                </div>
                <div className="rounded-lg bg-surface/30 p-4">
                  <p className="text-sm text-secondary-text">Date Format</p>
                  <p className="mt-1 font-medium text-primary-text">MM/DD/YYYY</p>
                </div>
                <div className="rounded-lg bg-surface/30 p-4">
                  <p className="text-sm text-secondary-text">CV Engine</p>
                  <p className="mt-1 font-medium text-primary-text">OpenCV 5.0 + COOL</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
