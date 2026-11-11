"use server";

function safeCallback(url: unknown): string {
  const s = typeof url === "string" ? url : "/dashboard";
  // Nur relative Pfade (kein Open Redirect)
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/dashboard";
}

export async function signInAction(formData: FormData) {
  const { signIn } = await import("@/auth");
  await signIn("discord", { redirectTo: safeCallback(formData.get("callbackUrl")) });
}

export async function signOutAction() {
  const { signOut } = await import("@/auth");
  await signOut({ redirectTo: "/" });
}

/** Nur lokal (DEV_LOGIN=true, nicht in Produktion). */
export async function devSignInAction(formData: FormData) {
  const { isDevLoginEnabled } = await import("@/lib/auth/dev");
  if (!isDevLoginEnabled()) throw new Error("Dev-Login ist deaktiviert.");
  const { signIn } = await import("@/auth");
  await signIn("dev-login", {
    userId: String(formData.get("userId") ?? ""),
    redirectTo: safeCallback(formData.get("callbackUrl")),
  });
}
