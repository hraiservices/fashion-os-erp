"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Mail, RotateCcw, Share2 } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useShareContacts } from "@/hooks/use-targets";
import { mailtoHref, waChatHref, waPickerHref, type ShareContact, type ShareMessage } from "@/lib/targets-share";
import { cn } from "@/lib/utils";

/**
 * A "Share" button for any Targets item. Tapping it opens a panel with the message already written (editable), and
 * three ways to send it: WhatsApp, Email or Copy — to anyone (WhatsApp / the mail app ask who) or straight to a team
 * member from the list. `build` runs when the button is tapped, so the message always reflects what is on screen.
 */
export function ShareButton({
  title,
  build,
  label = "Share",
  iconOnly = false,
  variant = "outline",
  size = "default",
  className,
  disabled,
}: {
  /** The panel's heading, e.g. "Share task". */
  title: string;
  /** Makes the message; `origin` is this app's address, for the "Open:" link. */
  build: (origin: string) => ShareMessage;
  label?: string;
  /** A square icon button, for tight spots (the label stays available to screen readers). */
  iconOnly?: boolean;
  variant?: "outline" | "ghost" | "default" | "secondary";
  /** "sm" matches the small Export / Print buttons beside it in a report header. */
  size?: "default" | "sm";
  className?: string;
  disabled?: boolean;
}) {
  const [message, setMessage] = useState<ShareMessage | null>(null);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        aria-label={iconOnly ? title : undefined}
        title={iconOnly ? title : undefined}
        className={cn(size === "sm" ? "gap-1" : "h-11 gap-1.5 sm:h-9", iconOnly && "w-11 px-0 sm:w-9", className)}
        onClick={() => setMessage(build(window.location.origin))}
      >
        <Share2 className={size === "sm" ? "size-3.5" : "size-4"} />
        {!iconOnly && label}
      </Button>
      {message && <ShareDialog title={title} message={message} onClose={() => setMessage(null)} />}
    </>
  );
}

const ACTION = "h-16 flex-col gap-1 rounded-xl text-xs";

function ShareDialog({ title, message, onClose }: { title: string; message: ShareMessage; onClose: () => void }) {
  const [text, setText] = useState(message.text);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const contacts = useShareContacts(true);
  const firstAction = useRef<HTMLButtonElement>(null);
  const current: ShareMessage = { subject: message.subject, text };

  const team = useMemo(() => contacts.data?.contacts ?? [], [contacts.data]);
  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? team.filter((c) => c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q)) : team;
  }, [team, query]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Message copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the text and copy it by hand");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* Focus starts on the first send button, not the message box: on a phone the box would raise the keyboard before anyone chose to type. */}
      <DialogContent className="grid-cols-1 sm:max-w-md" initialFocus={firstAction}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Change the message if you like, then choose where to send it.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Message" className="max-h-[40dvh] min-h-32 min-w-0 overflow-y-auto break-words leading-snug" />
          {text !== message.text && (
            <button type="button" onClick={() => setText(message.text)} className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary">
              <RotateCcw className="size-3.5" /> Restore original message
            </button>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Send to anyone</p>
          <div className="grid grid-cols-3 gap-2">
            <Button ref={firstAction} variant="outline" className={ACTION} nativeButton={false} render={<a href={waPickerHref(text)} target="_blank" rel="noopener noreferrer" />}>
              <WhatsAppIcon className="size-5 text-[#25D366]" /> WhatsApp
            </Button>
            <Button variant="outline" className={ACTION} nativeButton={false} render={<a href={mailtoHref(null, current)} />}>
              <Mail className="size-5" /> Email
            </Button>
            <Button type="button" variant="outline" className={ACTION} onClick={copy}>
              {copied ? <Check className="size-5 text-emerald-600" /> : <Copy className="size-5" />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Or send to a team member</p>
          {contacts.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : contacts.isError ? (
            <p className="text-sm text-muted-foreground">Couldn&apos;t load your team — the buttons above still work.</p>
          ) : team.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other team members to list yet.</p>
          ) : (
            <>
              {team.length > 6 && <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search team" aria-label="Search team" className="h-11" />}
              <ul className="max-h-64 overflow-y-auto rounded-xl border">
                {people.map((c) => (
                  <PersonRow key={c.id} contact={c} message={current} showEmail={!!contacts.data?.emailsIncluded} />
                ))}
                {people.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">Nobody matches &ldquo;{query}&rdquo;.</li>}
              </ul>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PersonRow({ contact, message, showEmail }: { contact: ShareContact; message: ShareMessage; showEmail: boolean }) {
  const wa = waChatHref(contact.mobile, message.text);
  const mail = contact.email ? mailtoHref(contact.email, message) : null;
  const iconBtn = "size-11 shrink-0 sm:size-9";
  return (
    <li className="flex min-h-14 items-center gap-2 border-b px-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{contact.name}</p>
        <p className="truncate text-xs capitalize text-muted-foreground">{contact.role}</p>
      </div>
      {wa ? (
        <Button variant="outline" size="icon" className={iconBtn} aria-label={`WhatsApp ${contact.name}`} title={`WhatsApp ${contact.name}`} nativeButton={false} render={<a href={wa} target="_blank" rel="noopener noreferrer" />}>
          <WhatsAppIcon className="size-4 text-[#25D366]" />
        </Button>
      ) : (
        <Button variant="outline" size="icon" className={iconBtn} disabled aria-label={`${contact.name} has no WhatsApp number`} title="No valid mobile number on file">
          <WhatsAppIcon className="size-4" />
        </Button>
      )}
      {showEmail &&
        (mail ? (
          <Button variant="outline" size="icon" className={iconBtn} aria-label={`Email ${contact.name}`} title={`Email ${contact.name}`} nativeButton={false} render={<a href={mail} />}>
            <Mail className="size-4" />
          </Button>
        ) : (
          <Button variant="outline" size="icon" className={iconBtn} disabled aria-label={`${contact.name} has no email`} title="No email on file — they don't have a login">
            <Mail className="size-4" />
          </Button>
        ))}
    </li>
  );
}
