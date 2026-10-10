"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SeverityIndicator } from "@/components/ui/severity-indicator";
import { QualityMetrics } from "@/lib/types";
import {
  Camera,
  Play,
  Pause,
  Square,
  Maximize2,
  RefreshCw,
  Bot,
  AlertTriangle,
  CheckCircle,
  Eye,
} from "@/components/icons";

// Inline quality metrics — migrate to API once quality metrics endpoint is available
const mockQualityMetrics: QualityMetrics = {
  blurScore: 88,
  exposureScore: 95,
  glareEstimate: 12,
  imageCoverage: 94,
  alignmentConfidence: 87,
  inspectionSuitability: "sufficient",
  reasons: [],
};

const detectionResults = [
  {
    id: 1,
    type: "Corrosion",
    confidence: 0.87,
    location: "Bearing housing, upper left",
    severity: "warning" as const,
    status: "detected",
  },
  {
    id: 2,
    type: "Surface Cracking",
    confidence: 0.64,
    location: "Seal area, lower right",
    severity: "critical" as const,
    status: "detecting",
  },
];

export default function LiveInspectionPage() {
  const [isLive, setIsLive] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display font-bold text-gradient-hero">
            Live Inspection
          </h1>
          <p className="mt-1 text-secondary-text">
            Real-time camera feed with computer vision overlay
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={isLive ? "outline" : "default"} size="sm" onClick={() => setIsLive(!isLive)}>
            {isLive ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {isLive ? "Pause" : "Start"}
          </Button>
          <Button variant="outline" size="sm">
            <Square className="h-4 w-4 mr-2" />
            Stop
          </Button>
          <Button variant="outline" size="sm">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Camera Feed */}
        <motion.div className="xl:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-primary-text">Camera Feed</CardTitle>
                <p className="text-sm text-secondary-text">
                  Compressor Unit #1 — CV overlay active
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={isLive ? "success" : "warning"}>
                  {isLive ? "LIVE" : "PAUSED"}
                </Badge>
                <Button variant="ghost" size="icon-sm">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="relative aspect-video bg-gradient-to-br from-surface to-background">
                {/* Simulated camera feed */}
                <div className="absolute inset-4 rounded-lg border-2 border-dashed border-border/50">
                  <div className="absolute inset-0 rounded-lg" style={{
                    backgroundImage: "radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.03) 0%, transparent 70%)",
                  }}>
                    {/* CV overlay - bounding boxes */}
                    <div className="absolute top-1/3 left-1/4 h-20 w-24 rounded border-2 border-critical animate-pulse-glow">
                      <span className="absolute -top-6 left-0 text-xs font-medium text-critical">87% Corrosion</span>
                    </div>
                    <div className="absolute top-1/2 right-1/3 h-16 w-20 rounded border-2 border-warning animate-pulse-glow">
                      <span className="absolute -top-6 left-0 text-xs font-medium text-warning">64% Crack</span>
                    </div>
                  </div>
                  <div className="absolute bottom-4 left-4 right-4 flex justify-center">
                    <Camera className="h-6 w-6 text-secondary-text/30" />
                    <span className="ml-2 text-xs text-secondary-text">
                      Feed quality: Good · FPS: 30
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Side Panel */}
        <motion.div className="space-y-6">
          {/* Quality Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-secondary-text">
                Image Quality
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Blur Score", value: mockQualityMetrics.blurScore, max: 100, color: "success" },
                { label: "Exposure", value: mockQualityMetrics.exposureScore, max: 100, color: "success" },
                { label: "Glare", value: mockQualityMetrics.glareEstimate, max: 100, color: "warning" },
                { label: "Coverage", value: mockQualityMetrics.imageCoverage, max: 100, color: "success" },
                { label: "Alignment", value: mockQualityMetrics.alignmentConfidence, max: 100, color: "success" },
              ].map((metric) => (
                <div key={metric.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-secondary-text">{metric.label}</span>
                    <span className="text-primary-text">{metric.value}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-elevated">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-primary to-secondary transition-all"
                      style={{ width: `${metric.value}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-2">
                <Badge variant={mockQualityMetrics.inspectionSuitability === "sufficient" ? "success" : "warning"}>
                  {mockQualityMetrics.inspectionSuitability}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Detection Results */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="text-primary-text">Detections</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsProcessing(!isProcessing)}
                  disabled={!isLive}
                >
                  {isProcessing ? <Pause className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                  <span className="ml-1 text-xs">
                    {isProcessing ? "Stop Analysis" : "Run Analysis"}
                  </span>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {detectionResults.map((det) => (
                  <motion.div
                    key={det.id}
                    className="rounded-lg border border-border/50 p-3 transition-colors hover:bg-surface/50"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-warning" />
                        <span className="text-sm font-medium text-primary-text">
                          {det.type}
                        </span>
                      </div>
                      <SeverityIndicator severity={det.severity} size="sm" />
                    </div>
                    <p className="mt-1 text-xs text-secondary-text">
                      Location: {det.location}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-secondary-text">Confidence</span>
                          <span className="text-primary-text">{Math.round(det.confidence * 100)}%</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-surface-elevated">
                          <div
                            className="h-1.5 rounded-full bg-gradient-to-r from-warning to-critical"
                            style={{ width: `${det.confidence * 100}%` }}
                          />
                        </div>
                      </div>
                      <Badge variant={det.status === "detected" ? "success" : "info"}>
                        {det.status}
                      </Badge>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-secondary-text">
                Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="default" size="sm" className="w-full justify-start">
                <Eye className="h-4 w-4 mr-2" />
                Capture Frame
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <Bot className="h-4 w-4 mr-2" />
                Run Full Analysis
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <CheckCircle className="h-4 w-4 mr-2" />
                Review & Save
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
