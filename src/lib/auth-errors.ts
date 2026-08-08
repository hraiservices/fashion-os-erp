// Ported from handleSignInError, Stitching_Manager_Pro_v16.html ~line 3506.
export function mapAuthError(message: string | undefined): string {
  const msg = (message || "").toLowerCase();
  if (
    msg.includes("invalid login") ||
    msg.includes("invalid_credentials") ||
    msg.includes("invalid credentials") ||
    msg === "http 400" ||
    msg.includes("invalid password")
  ) {
    return "Wrong Password. Please try again.";
  }
  if (msg.includes("user not found") || msg.includes("no user") || msg === "http 404") {
    return "You are not Registered. Create your account.";
  }
  if (msg.includes("not confirmed") || msg.includes("email not confirmed")) {
    return "Please confirm your email first. Check your inbox.";
  }
  return message || "Sign in failed.";
}

// isValidEmail, line ~3520.
export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v || "").trim());
}

// normalizePhone, line ~3474.
export function normalizePhone(p: string): string {
  return p.replace(/\D/g, "").replace(/^91/, "").slice(-10);
}
