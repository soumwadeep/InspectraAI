"use client";

/**
 * Edit a registered asset.
 *
 * Both the equipment list and the equipment detail page had "Edit" controls
 * pointing at /dashboard/equipment/{id}/edit, a route that was never created, so
 * every one of them 404'd. The backend has accepted PATCH on this resource the
 * whole time.
 *
 * The form is prefilled from the row the API returned and sends only what
 * changed. `EquipmentUpdate` applies with `exclude_unset=True`, so an omitted
 * key leaves the column alone — which is why untouched fields are not submitted
 * rather than resubmitted as their existing values.
 *
 * `assigned_inspector_id` is deliberately absent: no endpoint lists organization
 * members, so a picker here would either be a fake list or an empty one.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { AlertTriangle, ArrowLeft, Save } from "@/components/icons";
import { api } from "@/lib/api";
import { useEquipment, useEquipmentDetail } from "@/lib/hooks";
import { entry } from "@/lib/motion/presets";

/** Values of EquipmentStatusEnum, exactly as the column stores them. */
const STATUSES = ["operational", "warning", "critical", "maintenance", "offline"] as const;

interface FormState {
  name: string;
  category: string;
  location: string;
  description: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  status: string;
}

function fromEquipment(e: {
  name: string;
  category: string;
  location: string;
  description: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  status: string;
}): FormState {
  return {
    name: e.name ?? "",
    category: e.category ?? "",
    location: e.location ?? "",
    description: e.description ?? "",
    manufacturer: e.manufacturer ?? "",
    model: e.model ?? "",
    serialNumber: e.serialNumber ?? "",
    status: e.status ?? "operational",
  };
}

export default function EditEquipmentPage() {
  const params = useParams();
  const equipmentId = (params.id as string) ?? "";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const detail = useEquipmentDetail(equipmentId);
  const { data: allEquipment } = useEquipment();

  const [form, setForm] = useState<FormState | null>(null);
  const [touched, setTouched] = useState(false);

  // Seed the form once the row arrives, and only once — otherwise a refetch
  // while the operator is mid-edit would silently overwrite their typing.
  useEffect(() => {
    if (detail.data && !form) setForm(fromEquipment(detail.data));
  }, [detail.data, form]);

  const knownCategories = useMemo(
    () => [...new Set((allEquipment ?? []).map((item) => item.category).filter(Boolean))].sort(),
    [allEquipment],
  );

  const dirty = useMemo(() => {
    if (!form || !detail.data) return [] as Array<keyof FormState>;
    const original = fromEquipment(detail.data);
    return (Object.keys(form) as Array<keyof FormState>).filter(
      (key) => form[key].trim() !== original[key].trim(),
    );
  }, [form, detail.data]);

  if ((detail.isLoading && !detail.data) || !form) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!detail.data) {
    return (
      <motion.div className="flex flex-col items-center justify-center py-12" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <AlertTriangle className="h-12 w-12 text-warning/60" />
        <p className="mt-4 text-secondary-text">No equipment with this id was returned.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/dashboard/equipment">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Equipment
          </Link>
        </Button>
      </motion.div>
    );
  }

  const missing = (["name", "category", "location"] as const).filter(
    (key) => form[key].trim().length === 0,
  );

  async function save() {
    if (!form || missing.length > 0) return;
    const original = fromEquipment(detail.data!);
    // Send only what changed. The backend applies with exclude_unset, so an
    // omitted key leaves the column untouched.
    const patch: Record<string, string> = {};
    const keyMap: Record<keyof FormState, string> = {
      name: "name",
      category: "category",
      location: "location",
      description: "description",
      manufacturer: "manufacturer",
      model: "model",
      serialNumber: "serial_number",
      status: "status",
    };
    for (const key of dirty) {
      patch[keyMap[key]] = form[key].trim();
    }
    if (Object.keys(patch).length === 0) {
      toast({ title: "Nothing to save", description: "No field differs from the stored row." });
      return;
    }
    try {
      const updated = await api.equipment.update(equipmentId, patch);
      queryClient.setQueryData(["equipment", equipmentId], updated);
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      setForm(fromEquipment(updated));
      toast({
        title: "Equipment updated",
        description: `${Object.keys(patch).length} field(s) written via PATCH /api/equipment.`,
      });
    } catch (error) {
      toast({
        title: "Update rejected",
        description: error instanceof Error ? error.message : "the API refused the request",
        variant: "destructive",
      });
    }
  }

  return (
    <motion.div className="space-y-6" variants={entry.boot} initial="hidden" animate="visible">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/dashboard/equipment/${equipmentId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to {detail.data.name}
          </Link>
        </Button>
        {dirty.length > 0 && (
          <Badge variant="info">{dirty.length} unsaved change{dirty.length === 1 ? "" : "s"}</Badge>
        )}
      </div>

      <div>
        <h1 className="text-display font-bold text-gradient-hero">Edit equipment</h1>
        <p className="mt-1 text-secondary-text">
          Only changed fields are sent. Name, category and location are required by the API.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-primary-text">Identity</CardTitle>
          <CardDescription>
            Stored exactly as entered — nothing here is normalised or inferred by the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="name"
              label="Name"
              required
              dirty={dirty.includes("name")}
              value={form.name}
              onChange={(value) => setForm({ ...form, name: value })}
              onBlur={() => setTouched(true)}
              error={touched && !form.name.trim() ? "Required" : null}
            />
            <div className="space-y-1.5">
              <Label htmlFor="category" className="text-secondary-text">
                Category{" "}
                <Required />
                {dirty.includes("category") ? <Changed /> : null}
              </Label>
              <Input
                id="category"
                list="known-categories"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                onBlur={() => setTouched(true)}
              />
              <datalist id="known-categories">
                {knownCategories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
              <p className="text-xs text-secondary-text">
                Free text — the column is a String(100), so this is a suggestion list, not a
                closed set.
              </p>
            </div>
            <Field
              id="location"
              label="Location"
              required
              dirty={dirty.includes("location")}
              value={form.location}
              onChange={(value) => setForm({ ...form, location: value })}
              onBlur={() => setTouched(true)}
              error={touched && !form.location.trim() ? "Required" : null}
            />
            <div className="space-y-1.5">
              <Label htmlFor="status" className="text-secondary-text">
                Status {dirty.includes("status") ? <Changed /> : null}
              </Label>
              <Select
                id="status"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-secondary-text">
                One of the five values <code className="font-mono">EquipmentStatusEnum</code>{" "}
                stores.
              </p>
            </div>
            <Field
              id="manufacturer"
              label="Manufacturer"
              dirty={dirty.includes("manufacturer")}
              value={form.manufacturer}
              onChange={(value) => setForm({ ...form, manufacturer: value })}
            />
            <Field
              id="model"
              label="Model"
              dirty={dirty.includes("model")}
              value={form.model}
              onChange={(value) => setForm({ ...form, model: value })}
            />
            <Field
              id="serialNumber"
              label="Serial number"
              dirty={dirty.includes("serialNumber")}
              value={form.serialNumber}
              onChange={(value) => setForm({ ...form, serialNumber: value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-secondary-text">
              Description {dirty.includes("description") ? <Changed /> : null}
            </Label>
            <Textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-secondary-text">
          {missing.length
            ? `Required fields still empty: ${missing.join(", ")}`
            : dirty.length
              ? `${dirty.length} field(s) differ from the stored row.`
              : "No changes to save."}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/dashboard/equipment/${equipmentId}`}>Cancel</Link>
          </Button>
          <Button
            onClick={() => {
              setTouched(true);
              if (missing.length === 0) void save();
            }}
            disabled={missing.length > 0 || dirty.length === 0}
          >
            <Save className="mr-2 h-4 w-4" />
            Save changes
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  required,
  dirty,
  error,
  onBlur,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  dirty?: boolean;
  error?: string | null;
  onBlur?: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-secondary-text">
        {label} {required ? <Required /> : null}
        {dirty ? <Changed /> : null}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
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

function Changed() {
  return (
    <Badge variant="info" className="ml-1 px-1 py-0 text-[9px] uppercase">
      changed
    </Badge>
  );
}
