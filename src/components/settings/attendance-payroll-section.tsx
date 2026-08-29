"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Crosshair, Clock } from "lucide-react";
import { useShopLocations, useSaveShopLocation, useDeleteShopLocation } from "@/hooks/use-shop-locations";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { useCurrentUser } from "@/hooks/use-current-user";
import { DEFAULT_ATTENDANCE_SETTINGS, type AttendanceSettings } from "@/lib/attendance-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface LocationDraft {
  id?: string;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  geofenceRadiusM: string;
}

const BLANK_LOCATION: LocationDraft = { name: "", address: "", latitude: "", longitude: "", geofenceRadiusM: "200" };

const NO_WEEKLY_OFF = "none";
const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function LocationForm({ draft, onChange, onCancel, onSave, saving }: { draft: LocationDraft; onChange: (d: LocationDraft) => void; onCancel: () => void; onSave: () => void; saving: boolean }) {
  const [locating, setLocating] = useState(false);

  function useCurrentPosition() {
    if (!navigator.geolocation) return toast.error("This browser doesn't support location");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ ...draft, latitude: String(pos.coords.latitude), longitude: String(pos.coords.longitude) });
        setLocating(false);
      },
      () => {
        toast.error("Could not get your location — check browser permissions");
        setLocating(false);
      },
      { enableHighAccuracy: true }
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Name</Label>
          <Input placeholder="e.g. Main Store" className="h-9" value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Address</Label>
          <Input placeholder="Optional" className="h-9" value={draft.address} onChange={(e) => onChange({ ...draft, address: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Latitude</Label>
          <Input placeholder="e.g. 19.0760" className="h-9" value={draft.latitude} onChange={(e) => onChange({ ...draft, latitude: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Longitude</Label>
          <Input placeholder="e.g. 72.8777" className="h-9" value={draft.longitude} onChange={(e) => onChange({ ...draft, longitude: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Geofence radius (meters)</Label>
          <Input type="number" inputMode="numeric" min={10} className="h-9" value={draft.geofenceRadiusM} onChange={(e) => onChange({ ...draft, geofenceRadiusM: e.target.value })} />
        </div>
        <div className="flex items-end">
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={useCurrentPosition} disabled={locating}>
            <Crosshair className="size-3.5" /> {locating ? "Locating…" : "Use my current location"}
          </Button>
        </div>
      </div>
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" className="h-11 px-4 text-base sm:h-7 sm:px-2.5 sm:text-[0.8rem]" onClick={onCancel}>Cancel</Button>
        <Button type="button" size="sm" className="h-11 px-4 text-base sm:h-7 sm:px-2.5 sm:text-[0.8rem]" onClick={onSave} disabled={saving}>Save location</Button>
      </div>
    </div>
  );
}

export function AttendancePayrollSection() {
  const { data: user } = useCurrentUser();
  const { data: locations, isLoading: locationsLoading } = useShopLocations();
  const saveLocation = useSaveShopLocation();
  const deleteLocation = useDeleteShopLocation();

  const { data: attendanceSettings, isLoading: settingsLoading, save: saveSettings } = useAppSetting<AttendanceSettings>("attendanceSettings", DEFAULT_ATTENDANCE_SETTINGS);
  const [draftSettings, setDraftSettings] = useState<AttendanceSettings>(DEFAULT_ATTENDANCE_SETTINGS);

  const [editing, setEditing] = useState<LocationDraft | null>(null);

  useSyncFromSource(attendanceSettings, (s) => {
    if (s) setDraftSettings(s);
  });

  async function handleSaveLocation() {
    if (!editing) return;
    const lat = parseFloat(editing.latitude);
    const lng = parseFloat(editing.longitude);
    if (!editing.name.trim()) return toast.error("Name is required");
    if (Number.isNaN(lat) || Number.isNaN(lng)) return toast.error("Latitude and longitude are required");
    try {
      await saveLocation.mutateAsync({
        id: editing.id,
        name: editing.name,
        address: editing.address,
        latitude: lat,
        longitude: lng,
        geofenceRadiusM: parseInt(editing.geofenceRadiusM, 10) || 200,
        active: true,
        userEmail: user?.email,
      });
      toast.success("Location saved");
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save location");
    }
  }

  async function handleDeleteLocation(id: string, name: string) {
    try {
      await deleteLocation.mutateAsync({ id, name, userEmail: user?.email });
      toast.success("Location deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete location");
    }
  }

  async function handleSaveSettings() {
    try {
      await saveSettings.mutateAsync(draftSettings);
      toast.success("Attendance settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <MapPin className="size-4" /> Shop locations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Each employee is assigned to one location — self check-in is only accepted within that location&apos;s geofence radius.
          </p>

          {locationsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="space-y-2">
              {(locations || []).map((l) => (
                <div key={l.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{l.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {l.address ? `${l.address} · ` : ""}{l.latitude}, {l.longitude} · {l.geofenceRadiusM}m radius
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${l.name}`}><Trash2 className="size-3.5" /></Button>} />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {l.name}?</AlertDialogTitle>
                        <AlertDialogDescription>Employees assigned to this location will need a new one before they can check in.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteLocation(l.id, l.name)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}

          {editing ? (
            <LocationForm draft={editing} onChange={setEditing} onCancel={() => setEditing(null)} onSave={handleSaveLocation} saving={saveLocation.isPending} />
          ) : (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(BLANK_LOCATION)}>
              <Plus className="size-3.5" /> Add location
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="size-4" /> Shift & overtime
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settingsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Standard shift (hours)</Label>
                  <NumberInput min={1} max={24} className="h-10" value={draftSettings.standardShiftHours} onChange={(v) => setDraftSettings({ ...draftSettings, standardShiftHours: v })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Overtime rate (₹/hour)</Label>
                  <p className="text-[11px] text-muted-foreground">Flat rate for every hour worked beyond the standard shift, same for all employees.</p>
                  <NumberInput min={0} step={0.5} className="h-10" value={draftSettings.otRatePerHour} onChange={(v) => setDraftSettings({ ...draftSettings, otRatePerHour: v })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Weekly off day</Label>
                  <p className="text-[11px] text-muted-foreground">Excluded automatically when counting leave-request days.</p>
                  <Select
                    value={draftSettings.weeklyOffDay == null ? NO_WEEKLY_OFF : String(draftSettings.weeklyOffDay)}
                    onValueChange={(v) => v && setDraftSettings({ ...draftSettings, weeklyOffDay: v === NO_WEEKLY_OFF ? null : parseInt(v, 10) })}
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_WEEKLY_OFF}>No fixed weekly off</SelectItem>
                      {DAY_LABELS.map((label, i) => (
                        <SelectItem key={i} value={String(i)}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button size="sm" className="h-11 px-4 text-base sm:h-7 sm:px-2.5 sm:text-[0.8rem]" onClick={handleSaveSettings} disabled={saveSettings.isPending}>
                {saveSettings.isPending ? "Saving…" : "Save"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
