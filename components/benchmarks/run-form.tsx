"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Play } from "@/components/icons";
import { entry } from "@/lib/motion/presets";

export interface BenchmarkRunBody {
  name: string;
  description?: string;
  config: {
    pairs: number;
    seed: number;
    iou_threshold: number;
  };
}

interface RunFormProps {
  isPending: boolean;
  error: string | null;
  /**
   * Measured `timing.per_pair_ms` of a previous stored run, when one exists.
   * Used only to show a size estimate derived from a real measurement; if it is
   * undefined the form says there is nothing to estimate from.
   */
  lastPerPairMs?: number;
  onRun: (body: BenchmarkRunBody) => void;
}

/** Integer input clamp with an explicit invalid marker (empty/NaN never becomes 0). */
function readInt(value: string, min: number, max: number): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function readFloat(value: string, min: number, max: number): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

export function RunForm({ isPending, error, lastPerPairMs, onRun }: RunFormProps) {
  const [name, setName] = useState("Synthetic corpus run");
  const [description, setDescription] = useState("");
  const [pairs, setPairs] = useState("32");
  const [seed, setSeed] = useState("7");
  // 0.3, not 0.5: precision/recall are threshold-dependent, and the documented
  // baseline (P 0.886 / R 0.689 over 32 pairs at seed 7) is measured at IoU >= 0.3.
  // Defaulting to 0.5 made a first run reproduce P 0.486 / R 0.378 — both correct,
  // but the mismatch reads like the headline number was invented.
  const [iou, setIou] = useState("0.3");
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Honest pending state: the endpoint is one blocking call with no progress
  // reporting, so the only real number while it runs is client wall-clock.
  useEffect(() => {
    if (!isPending) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isPending]);

  function submit() {
    const errors: string[] = [];
    if (name.trim().length === 0) errors.push("Name is required.");
    const pairsValue = readInt(pairs, 1, 128);
    if (pairsValue === null) errors.push("Pairs must be a whole number between 1 and 128.");
    const seedValue = readInt(seed, 0, 2_147_483_647);
    if (seedValue === null) errors.push("Seed must be a whole number of at least 0.");
    const iouValue = readFloat(iou, 0, 1);
    if (iouValue === null) errors.push("IoU threshold must be a number between 0 and 1.");
    setFieldErrors(errors);
    if (errors.length > 0 || pairsValue === null || seedValue === null || iouValue === null) return;

    onRun({
      name: name.trim(),
      description: description.trim() === "" ? undefined : description.trim(),
      config: { pairs: pairsValue, seed: seedValue, iou_threshold: iouValue },
    });
  }

  const requestedPairs = readInt(pairs, 1, 128);

  return (
    <motion.div variants={entry.boot} initial="hidden" animate="visible">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary-text">
            <Play className="h-5 w-5 text-primary" />
            New measured run
          </CardTitle>
          <CardDescription>
            <code className="font-mono">POST /api/benchmarks/run</code> generates a labelled
            synthetic corpus from the seed and measures the real detection pipeline against it.
            The same seed and pair count reproduce the same corpus.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bench-name">Run name</Label>
              <Input
                id="bench-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isPending}
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bench-description">Description (optional)</Label>
              <Input
                id="bench-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={isPending}
                maxLength={300}
                placeholder="What this run is checking"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bench-pairs">Pairs</Label>
              <Input
                id="bench-pairs"
                type="number"
                inputMode="numeric"
                min={1}
                max={128}
                step={1}
                value={pairs}
                onChange={(event) => setPairs(event.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bench-seed">Seed</Label>
                <Input
                  id="bench-seed"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bench-iou">IoU threshold</Label>
                <Input
                  id="bench-iou"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={iou}
                  onChange={(event) => setIou(event.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-secondary-text">
            {lastPerPairMs !== undefined && requestedPairs !== null ? (
              <>
                Last stored run measured{" "}
                <span className="telemetry text-primary-text">
                  {lastPerPairMs.toFixed(1)} ms/pair
                </span>
                , so {requestedPairs} pairs is roughly{" "}
                {(lastPerPairMs * requestedPairs / 1000).toFixed(0)}s of work. Estimates come from
                that stored measurement, not from a table.
              </>
            ) : (
              <>
                A run takes several seconds; there is no progress endpoint, so no percentage is
                shown while it executes. No stored run exists yet to estimate duration from.
              </>
            )}
          </p>

          {fieldErrors.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-critical/10 p-3 text-sm text-critical">
              {fieldErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-critical/10 p-3 text-sm text-critical">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">The run failed</p>
                <p className="text-xs">{error}</p>
              </div>
            </div>
          )}

          {isPending ? (
            <div
              role="status"
              className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"
            >
              <p className="font-medium text-primary-text">
                Measuring — {elapsedSeconds}s elapsed
              </p>
              <p className="mt-1 text-xs text-secondary-text">
                The API runs the pipeline over every pair in one blocking call and reports no
                progress, so the elapsed seconds above are the only number available until it
                answers.
              </p>
            </div>
          ) : (
            <Button onClick={submit}>Run benchmark</Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
