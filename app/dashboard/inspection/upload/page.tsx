"use client";

import { motion } from "framer-motion";
import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import { useEquipment } from "@/lib/hooks";
import {
  UploadCloud,
  FileImage,
  X,
  Play,
  Bot,
  CheckCircle,
  AlertTriangle,
  Clock,
  Scan,
} from "@/components/icons";

const inspectionSteps = [
  { id: 1, name: "Upload", description: "Upload inspection images" },
  { id: 2, name: "Quality Check", description: "Analyze image quality" },
  { id: 3, name: "Alignment", description: "Align with reference images" },
  { id: 4, name: "Analysis", description: "Detect defects and anomalies" },
  { id: 5, name: "Review", description: "Review findings and create reports" },
];

export default function UploadInspectPage() {
  const [currentStep, setCurrentStep] = useState(2);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { data: equipment, isLoading: equipmentLoading } = useEquipment();

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    setUploadedFiles([...uploadedFiles, ...files]);
  }, [uploadedFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setUploadedFiles([...uploadedFiles, ...Array.from(e.target.files)]);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const handleAnalyze = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setCurrentStep(3);
      setIsAnalyzing(false);
    }, 3000);
  };

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div>
        <h1 className="text-display font-bold text-gradient-hero">
          Upload &amp; Analyze
        </h1>
        <p className="mt-1 text-secondary-text">
          Upload inspection images and let the agent analyze them with computer vision
        </p>
      </div>

      {/* Steps Indicator */}
      <div className="flex items-center justify-between">
        {inspectionSteps.map((step) => {
          const isActive = step.id === currentStep;
          const isCompleted = step.id < currentStep;
          const isPending = step.id > currentStep;
          return (
            <motion.div
              key={step.id}
              className="flex flex-col items-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: step.id * 0.1 }}
            >
              <div className={
                `relative flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium
                 ${isActive ? "bg-primary text-background shadow-glow-cyan" : ""}
                 ${isCompleted ? "bg-success text-background" : ""}
                 ${isPending ? "bg-surface-elevated text-secondary-text" : ""}`}
              >
                <StatusDot
                  status={isActive ? "processing" : isCompleted ? "online" : "idle"}
                  size="sm"
                  showPulse={isActive}
                />
                {isCompleted && <CheckCircle className="h-4 w-4" />}
              </div>
              <span className="mt-2 text-xs font-medium text-secondary-text">
                {step.name}
              </span>
              <span className="text-xs text-secondary-text/60">
                {step.description}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Upload Area */}
      {currentStep === 1 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Select Equipment</CardTitle>
            </CardHeader>
            <CardContent>
              {equipmentLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select equipment for inspection" />
                  </SelectTrigger>
                  <SelectContent>
                    {(equipment ?? []).map((eq) => (
                      <SelectItem key={eq.id} value={eq.id}>
                        {eq.name} — {eq.category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Upload Images</CardTitle>
              <CardDescription>
                Drag & drop images or click to browse
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="relative flex h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border/50 bg-surface/30 p-6 text-center transition-colors hover:border-primary/50 hover:bg-surface/50"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <UploadCloud className="h-12 w-12 text-secondary-text/50" />
                <p className="mt-2 text-sm text-secondary-text">
                  Drag images here or click to browse
                </p>
                <p className="text-xs text-secondary-text/60">
                  Supports: JPG, PNG, TIFF (max 50MB each)
                </p>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="sr-only"
                  onChange={handleFileSelect}
                />
              </div>

              {uploadedFiles.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {uploadedFiles.map((file, i) => (
                    <div key={i} className="relative rounded-lg border border-border/50 p-2">
                      <FileImage className="mx-auto h-8 w-8 text-secondary-text/50" />
                      <p className="mt-1 text-xs text-primary-text truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-secondary-text/60">
                        {(file.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                      <button
                        onClick={() => removeFile(i)}
                        className="absolute -top-1 -right-1 rounded-full bg-critical p-0.5 text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {uploadedFiles.length > 0 && (
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setUploadedFiles([])}>
                    Clear All
                  </Button>
                  <Button size="sm" onClick={handleAnalyze} disabled={isAnalyzing}>
                    {isAnalyzing ? (
                      <>
                        <Clock className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Analyze Images
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Results View */}
      {currentStep === 3 && (
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Agent Investigation</CardTitle>
              <CardDescription>
                The agent is analyzing your images for defects
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg bg-surface/30 p-4">
                  <span className="text-sm text-secondary-text">Agent Status</span>
                  <Badge variant="success">Active</Badge>
                </div>

                <div className="space-y-3">
                  {[
                    { tool: "analyze_image_quality", status: "completed", time: "2.4s" },
                    { tool: "align_with_reference", status: "completed", time: "3.1s" },
                    { tool: "detect_visual_changes", status: "running", time: "0.0s" },
                  ].map((step, i) => (
                    <motion.div
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-surface/20 p-3"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={
                            `flex h-8 w-8 items-center justify-center rounded-lg
                             ${step.status === "completed" ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}>
                          <Scan className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-primary-text">{step.tool}</p>
                          <p className="text-xs text-secondary-text">Step {i + 1} of 6</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={step.status === "completed" ? "success" : "info"}>
                          {step.status}
                        </Badge>
                        <span className="text-xs text-secondary-text">{step.time}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="rounded-lg bg-surface/20 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    <span className="text-sm font-medium text-primary-text">
                      Finding: Corrosion detected (87% confidence)
                    </span>
                  </div>
                  <p className="text-xs text-secondary-text">
                    The agent has detected potential corrosion on the bearing housing.
                    Recommended action: Create a maintenance ticket for further inspection.
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm">
                    <Clock className="h-4 w-4 mr-2" />
                    Review Later
                  </Button>
                  <Button size="sm">
                    <Bot className="h-4 w-4 mr-2" />
                    Continue Analysis
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
