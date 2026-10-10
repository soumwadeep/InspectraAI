"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Download,
  Upload,
  Plus,
  Calendar,
  FileImage,
  FileOutput,
  CheckCircle,
  Clock3,
  RefreshCw,
} from "@/components/icons";
import { formatDate } from "@/lib/utils";

// Inline report data — migrate to API once reports endpoint is available
const mockReports = [
  {
    id: "rep_001",
    title: "Q4 2025 Equipment Inspection Summary",
    type: "PDF" as const,
    status: "ready" as const,
    generatedAt: "2025-10-08T12:00:00Z",
    generatedBy: "Alex Chen",
    itemCount: 12,
    fileSize: "4.2 MB",
  },
  {
    id: "rep_002",
    title: "Findings Export - October 2025",
    type: "CSV" as const,
    status: "ready" as const,
    generatedAt: "2025-10-07T18:30:00Z",
    generatedBy: "Sarah Kim",
    itemCount: 47,
    fileSize: "2.1 MB",
  },
  {
    id: "rep_003",
    title: "Agent Performance Report",
    type: "JSON" as const,
    status: "processing" as const,
    generatedAt: "2025-10-08T14:00:00Z",
    generatedBy: "System",
    itemCount: 0,
    fileSize: "-",
  },
];

const reportTypeIcons = {
  PDF: <FileImage className="h-5 w-5 text-critical" />,
  CSV: <FileOutput className="h-5 w-5 text-success" />,
  JSON: <FileText className="h-5 w-5 text-primary" />,
};

const reportTypeColors = {
  PDF: "critical",
  CSV: "success",
  JSON: "info",
} as const;

const statusVariant = {
  ready: "success",
  processing: "info",
  failed: "critical",
} as const;

const statusDot = {
  ready: "bg-success",
  processing: "bg-primary",
  failed: "bg-critical",
} as const;

export default function ReportsPage() {
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

  const readyCount = mockReports.filter((r) => r.status === "ready").length;
  const processingCount = mockReports.filter((r) => r.status === "processing").length;

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
              Reports &amp; Exports
            </h1>
            <p className="mt-1 text-secondary-text">
              Generate and download inspection reports, findings exports, and compliance documents
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Calendar className="h-4 w-4 mr-2" />
              This Month
            </Button>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Generate Report
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-4"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item}>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-primary-text">{mockReports.length}</div>
              <p className="text-sm text-secondary-text">Total Reports</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={item}>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-success">{readyCount}</div>
              <p className="text-sm text-secondary-text">Ready</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={item}>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-primary">{processingCount}</div>
              <p className="text-sm text-secondary-text">Processing</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={item}>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-secondary-text">4.2 MB</div>
              <p className="text-sm text-secondary-text">Total Storage</p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Reports Grid */}
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        {mockReports.map((report, i) => (
          <motion.div
            key={report.id}
            variants={item}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.05 }}
          >
            <Card className="group transition-all duration-300 hover:border-primary/30">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {reportTypeIcons[report.type]}
                    <div>
                      <CardTitle className="text-primary-text">{report.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {report.type} • Generated by {report.generatedBy}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant={reportTypeColors[report.type]}>
                    {report.type}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-secondary-text">Generated</span>
                    <span className="text-primary-text">{formatDate(report.generatedAt)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-secondary-text">Items</span>
                    <span className="text-primary-text">{report.itemCount} records</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-secondary-text">File Size</span>
                    <span className="text-primary-text">{report.fileSize}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={statusDot[report.status]} className="h-2 w-2 rounded-full animate-pulse" />
                      <span className="text-xs text-secondary-text">
                        {report.status === "ready" ? "Ready for download" : "Generating..."}
                      </span>
                    </div>
                    {report.status === "ready" ? (
                      <Button size="sm" className="opacity-0 transition-opacity group-hover:opacity-100">
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled>
                        <Clock3 className="h-4 w-4 mr-2 animate-spin" />
                        {report.status}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Report Templates */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Report Templates</CardTitle>
            <CardDescription>
              Pre-configured report formats for compliance and stakeholder needs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <motion.div
                className="glass rounded-lg p-4 text-center transition-all duration-300 hover:border-primary/30 hover:bg-surface-elevated/50"
                whileHover={{ scale: 1.02 }}
              >
                <FileImage className="mx-auto h-10 w-10 text-critical" />
                <h3 className="mt-3 font-medium text-primary-text">Inspection Summary</h3>
                <p className="mt-1 text-xs text-secondary-text">
                  Full equipment inspection report with findings and recommendations
                </p>
                <Button size="sm" className="mt-3 w-full">
                  Generate
                </Button>
              </motion.div>

              <motion.div
                className="glass rounded-lg p-4 text-center transition-all duration-300 hover:border-primary/30 hover:bg-surface-elevated/50"
                whileHover={{ scale: 1.02 }}
              >
                <FileOutput className="mx-auto h-10 w-10 text-success" />
                <h3 className="mt-3 font-medium text-primary-text">Findings Export</h3>
                <p className="mt-1 text-xs text-secondary-text">
                  CSV export of all findings with metadata for analysis
                </p>
                <Button size="sm" className="mt-3 w-full">
                  Generate
                </Button>
              </motion.div>

              <motion.div
                className="glass rounded-lg p-4 text-center transition-all duration-300 hover:border-primary/30 hover:bg-surface-elevated/50"
                whileHover={{ scale: 1.02 }}
              >
                <FileText className="mx-auto h-10 w-10 text-primary" />
                <h3 className="mt-3 font-medium text-primary-text">Compliance Report</h3>
                <p className="mt-1 text-xs text-secondary-text">
                  JSON export for system integration and compliance auditing
                </p>
                <Button size="sm" className="mt-3 w-full">
                  Generate
                </Button>
              </motion.div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
