"use client";

import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { PwaInstaller } from "@/components/app-shell/pwa-installer";
import { CommandTrigger } from "@/components/app-shell/command-palette";
import { MobileNavTrigger } from "@/components/app-shell/mobile-nav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Topbar() {
  const router = useRouter();
  const { data: user } = useCurrentUser();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initial = user?.email?.[0]?.toUpperCase() || "?";

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4 lg:px-6">
      <MobileNavTrigger />
      <div className="min-w-0 flex-1">
        <CommandTrigger />
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <PwaInstaller />
        <ThemeToggle />
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button type="button" aria-label="Account menu" className="rounded-full p-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <Avatar className="size-11 sm:size-8">
                  <AvatarFallback className="text-xs">{initial}</AvatarFallback>
                </Avatar>
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-sm font-medium">{user?.email}</p>
                <p className="text-xs capitalize text-muted-foreground">{user?.role}</p>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings/account")}>
              <User className="size-4" /> Account
            </DropdownMenuItem>
            <DropdownMenuItem onClick={signOut}>
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
