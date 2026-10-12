"use client";

/**
 * Register equipment.
 *
 * The list page has linked here since the first commit, but the route did not
 * exist, so Next matched `/dashboard/equipment/new` against the `[id]` page and
 * rendered "Equipment not found". `api.equipment.create` and
 * `uploadReferenceImage` were already written and had no caller anywhere.
 *
 * The reference image is part of this form on purpose: an asset with no
 * reference has nothing to align a capture against, so the first inspection of
 * a new asset fails at registration rather than at the start.
 */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { AlertTriangle, ArrowLeft, FileImage, Package, X } from "@/components/icons";
import { api } from "@/lib/api";
import { useEquipment } from "@/lib/hooks";
import { entry } from "@/lib/motion/presets";

const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;

interface FormState {
  name: string;
  category: string;
  location: string;
  description: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  installationDate: string;
  inspectionSchedule: string;
}

const EMPTY: FormState = {
  name: "",
  category: "",
  location: "",
  description: "",
  manufacturer: "",
  model: "",
  serialNumber: "",
  installationDate: "",
  inspectionSchedule: "",
};

/** Only the three columns the backend marks nullable=False. */
const REQUIRED: Array<{ key: keyof FormState; label: string }> = [
  { key: "name", label: "Name" },
  { key: "category", label: "Category" },
  { key: "location", label: "Location" },
];

export default function NewEquipmentPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const { data: existing } = useEquipment();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Offered as suggestions, not a closed list: `equipment.category` is a free
  // text column, so restricting it to what already exists would invent a
  // constraint the API does not have.
  const knownCategories = useMemo(
    () => [...new Set((existing ?? []).map((item) => item.category).filter(Boolean))].sort(),
    [existing],
  );

  const missing = REQUIRED.filter(({ key }) => form[key].trim().length === 0);

  const mutation = useMutation<EquipmentResult, Error, void>({
    mutationFn: async () => {
      const created = await api.equipment.create({
        name: form.name.trim(),
        category: form.category.trim(),
        location: form.location.trim(),
        description: form.description.trim() || undefined,
        manufacturer: form.manufacturer.trim() || undefined,
        model: form.model.trim() || undefined,
        serialNumber: form.serialNumber.trim() || undefined,
        installationDate: form.installationDate || undefined,
        inspectionSchedule: form.inspectionSchedule || undefined,
      });
      if (referenceFile) {
        // A failed upload must not be reported as a lost asset: the equipment
        // row exists either way, so the id is returned and the caller is told.
        await api.equipment.uploadReferenceImage(created.id, referenceFile).catch((error) => {
          throw new ReferenceUploadError(created.id, error.message);
        });
      }
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast({
        title: `${created.name} registered`,
        description: referenceFile
          ? "Reference image stored — inspections can align against it."
          : "No reference image yet, so the first inspection cannot compare against a baseline.",
      });
      router.push(`/dashboard/equipment/${created.id}`);
    },
    onError: (error) => {
      toast({
        title: error instanceof ReferenceUploadError ? "Equipment created, reference missing" : "Could not register equipment",
        description: error.message,
        variant: "destructive",
      });
      if (error instanceof ReferenceUploadError) {
        router.push(`/dashboard/equipment/${error.equipmentId}`);
      }
    },
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function acceptFile(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Not an image", description: `${file.type || "unknown type"} is not readable by the vision pipeline.`, variant: "destructive" });
      return;
    }
    if (file.size > MAX_REFERENCE_BYTES) {
      toast({ title: "Image too large", description: `${(file.size / 1024 / 1024).toFixed(1)} MB exceeds the 10 MB limit.`, variant: "destructive" });
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setReferenceFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  return (
    <motion.div className="space-y-6" variants={entry.boot} initial="hidden" animate="visible">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/equipment">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Equipment
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-display font-bold text-gradient-hero">Register equipment</h1>
        <p className="mt-1 text-secondary-text">
          An asset is the thing a capture is compared against. Without a reference image the
          agent has no baseline and reports registration failure instead of change.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-primary-text">Identity</CardTitle>
          <CardDescription>
            Name, category and location are required by the API. Everything else is stored
            verbatim and shown on the asset page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="name"
              label="Name"
              required
              value={form.name}
              onChange={(value) => set("name", value)}
              placeholder="Conveyor drive unit"
              error={touched && !form.name.trim() ? "Required" : null}
            />
            <div className="space-y-1.5">
              <Label htmlFor="category" className="text-secondary-text">
                Category <Required />
              </Label>
              <Input
                id="category"
                list="known-categories"
                value={form.category}
                onChange={(event) => set("category", event.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="pump"
                aria-invalid={touched && !form.category.trim() ? "true" : undefined}
              />
              <datalist id="known-categories">
                {knownCategories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
              {touched && !form.category.trim() ? (
                <p className="text-xs text-critical-text">Required</p>
              ) : knownCategories.length ? (
                <p className="text-xs text-secondary-text">
                  Free text. {knownCategories.length} categor{knownCategories.length === 1 ? "y" : "ies"} already in
                  this workspace are offered as suggestions.
                </p>
              ) : null}
            </div>
            <Field
              id="location"
              label="Location"
              required
              value={form.location}
              onChange={(value) => set("location", value)}
              placeholder="Line A · north end"
              error={touched && !form.location.trim() ? "Required" : null}
            />
            <Field
              id="serialNumber"
              label="Serial number"
              value={form.serialNumber}
              onChange={(value) => set("serialNumber", value)}
              placeholder="optional"
            />
            <Field
              id="manufacturer"
              label="Manufacturer"
              value={form.manufacturer}
              onChange={(value) => set("manufacturer", value)}
              placeholder="optional"
            />
            <Field
              id="model"
              label="Model"
              value={form.model}
              onChange={(value) => set("model", value)}
              placeholder="optional"
            />
            <div className="space-y-1.5">
              <Label htmlFor="installationDate" className="text-secondary-text">
                Installation date
              </Label>
              <Input
                id="installationDate"
                type="date"
                value={form.installationDate}
                onChange={(event) => set("installationDate", event.target.value)}
              />
              <p className="text-xs text-secondary-text">
                Stored as a date. The asset page shows it verbatim.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inspectionSchedule" className="text-secondary-text">
                Inspection schedule
              </Label>
              <Select
                id="inspectionSchedule"
                value={form.inspectionSchedule}
                onChange={(event) => set("inspectionSchedule", event.target.value)}
              >
                <option value="">Not scheduled</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </Select>
              <p className="text-xs text-secondary-text">
                The column is free text; these are the values the dashboard displays unchanged.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-secondary-text">
              Description
            </Label>
            <Textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder="What this asset is and what a defect on it looks like."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-primary-text">Reference image</CardTitle>
          <CardDescription>
            The homography target. Upload the capture taken from the viewpoint inspections will
            be photographed from — registration is scored on feature overlap, so a mismatched
            angle fails rather than drifting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => acceptFile(event.target.files?.[0])}
          />

          {referenceFile ? (
            <div className="flex items-start gap-4">
              <div className="h-24 w-32 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-elevated/50">
                {previewUrl ? (
                  /* The bytes are a local File the user just picked, not a next/image target. */
                  <img src={previewUrl} alt="Selected reference" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary-text">{referenceFile.name}</p>
                <p className="telemetry mt-0.5 text-xs text-secondary-text">
                  {(referenceFile.size / 1024).toFixed(0)} KB · {referenceFile.type}
                </p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={clearReference}>
                  <X className="mr-2 h-3.5 w-3.5" />
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                <FileImage className="mr-2 h-4 w-4" />
                Choose image
              </Button>
              <span className="text-xs text-secondary-text">PNG or JPEG, up to 10 MB.</span>
            </div>
          )}

          {!referenceFile && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs leading-relaxed text-secondary-text">
                Skipping this leaves the asset with no baseline. Inspections still run, but the
                agent cannot register a capture to anything and will pause for human input.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-secondary-text">
          {missing.length
            ? `${missing.length} required field${missing.length === 1 ? "" : "s"} still empty: ${missing.map(({ label }) => label).join(", ")}`
            : "Ready to register."}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/equipment">Cancel</Link>
          </Button>
          <Button
            onClick={() => {
              setTouched(true);
              if (missing.length === 0) mutation.mutate();
            }}
            disabled={mutation.isPending}
            loading={mutation.isPending}
          >
            <Package className="mr-2 h-4 w-4" />
            Register equipment
          </Button>
        </div>
      </div>
    </motion.div>
  );

  function clearReference() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setReferenceFile(null);
    setPreviewUrl(null);
  }
}

/**
 * Raised when the asset exists but its reference did not. The id has to travel
 * with the failure, or the user loses the row they just created.
 */
class ReferenceUploadError extends Error {
  constructor(public readonly equipmentId: string, cause: string) {
    super(`The asset was saved, but its reference image was not: ${cause}`);
    this.name = "ReferenceUploadError";
  }
}

type EquipmentResult = Awaited<ReturnType<typeof api.equipment.create>>;

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-secondary-text">
        {label} {required ? <Required /> : null}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? "true" : undefined}
      />
      {error ? <p className="text-xs text-critical-text">{error}</p> : null}
    </div>
  );
}

function Required() {
  return (
    <Badge variant="outline" className="telemetry ml-1 px-1 py-0 text-[9px] uppercase">
      required
    </Badge>
  );
}
