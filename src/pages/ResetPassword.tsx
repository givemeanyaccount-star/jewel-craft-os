import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

type Stage = "waiting" | "ready" | "expired" | "nolink";

/** Read what the email link put in the address bar before anything else touches it. */
function readLinkInfo() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const get = (k: string) => hash.get(k) ?? query.get(k);
  return {
    type: get("type"),
    hasToken: !!(hash.get("access_token") || query.get("code") || query.get("token_hash")),
    errorCode: get("error_code") ?? get("error"),
    errorText: get("error_description"),
  };
}

const LINK = readLinkInfo();

const friendly = (msg: string) => {
  if (/weak|guess|pwned/i.test(msg)) return "That password is too common — please choose a less common one.";
  if (/same.*password|different from the old/i.test(msg)) return "Please choose a password different from the old one.";
  return msg;
};

const ResetPassword = () => {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>(
    LINK.errorCode ? "expired" : LINK.hasToken ? "waiting" : "nolink",
  );
  const [email, setEmail] = useState<string>("");
  const [resendEmail, setResendEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const unlocked = useRef(false);

  useEffect(() => {
    if (!LINK.hasToken) {
      // Opened without a valid link: never reuse someone else's signed-in session.
      return;
    }
    const unlock = (userEmail?: string | null) => {
      if (unlocked.current) return;
      unlocked.current = true;
      setEmail(userEmail ?? "");
      setStage("ready");
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) unlock(session?.user.email);
    });
    // The link's session replaces any previous one; confirm whose account it is.
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) unlock(data.user.email);
      else if (!unlocked.current) setStage("expired");
    }, 1500);
    return () => { clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return toast.error("Passwords do not match");
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(friendly(error.message));
    await logAudit({
      action: "password_set",
      target_user_id: userData.user?.id ?? null,
      target_email: userData.user?.email ?? null,
      details: { self_service: true },
    });
    toast.success("Password saved — please sign in");
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  const resend = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await supabase.auth.signOut();
    const { error } = await supabase.auth.resetPasswordForEmail(resendEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("New link sent — open the newest email and use it straight away");
  };

  const ResendForm = (
    <form onSubmit={resend} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="re">Email</Label>
        <Input id="re" type="email" required value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send a new link"}</Button>
      <Button type="button" variant="ghost" className="w-full" onClick={() => navigate("/auth")}>Back to sign in</Button>
    </form>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Set your password</CardTitle>
          <CardDescription>
            {stage === "ready" && (email ? <>Setting password for <b>{email}</b></> : "Choose a new password")}
            {stage === "waiting" && "Checking your link…"}
            {stage === "expired" && "This link has expired or was already used. Links work once and only for a short time."}
            {stage === "nolink" && "Open this page from the link in your email, or request a new link below."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stage === "ready" ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="np">New password</Label>
                <Input id="np" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp">Confirm password</Label>
                <Input id="cp" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save password"}</Button>
            </form>
          ) : stage === "waiting" ? null : ResendForm}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
