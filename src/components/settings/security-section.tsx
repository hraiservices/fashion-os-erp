"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * SecuritySection(), Stitching_Manager_Pro_v16.html ~line 13293. The old app verified
 * curPass via a re-auth call before changing it (client.auth.changePassword); Supabase's
 * updateUser doesn't take a current password, so we re-verify by signing in with it first.
 */
export function SecuritySection() {
  const { data: user } = useCurrentUser();
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [cfPass, setCfPass] = useState("");
  const [loading, setLoading] = useState(false);

  async function changePassword() {
    if (!curPass || !newPass || !cfPass) return toast.error("All fields required");
    if (newPass !== cfPass) return toast.error("New passwords do not match");
    if (newPass.length < 6) return toast.error("Password must be at least 6 characters");
    if (!user?.email) return;

    setLoading(true);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: curPass });
    if (verifyError) {
      setLoading(false);
      return toast.error("Current password is incorrect");
    }
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setLoading(false);
    if (error) return toast.error(error.message || "Failed to change password");
    toast.success("Password changed successfully");
    setCurPass("");
    setNewPass("");
    setCfPass("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Change password</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Logged in as <b>{user?.email}</b>
        </p>
        <div className="space-y-2">
          <Label>Current password</Label>
          <Input type="password" value={curPass} onChange={(e) => setCurPass(e.target.value)} placeholder="Enter current password" />
        </div>
        <div className="space-y-2">
          <Label>New password</Label>
          <Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Min. 6 characters" />
        </div>
        <div className="space-y-2">
          <Label>Confirm new password</Label>
          <Input type="password" value={cfPass} onChange={(e) => setCfPass(e.target.value)} placeholder="Repeat new password" />
        </div>
        <Button className="w-full" disabled={loading} onClick={changePassword}>
          {loading ? "Changing…" : "Change password"}
        </Button>
      </CardContent>
    </Card>
  );
}
