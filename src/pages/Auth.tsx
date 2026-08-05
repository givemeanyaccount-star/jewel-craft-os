import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const Auth = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "forgot" | "activate">("signin");
  const [resetEmail, setResetEmail] = useState("");

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    navigate("/", { replace: true });
  };

  const onGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("Google sign-in failed");
  };

  const onEmailLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(
      mode === "activate" ? "Link sent — check your email to set your password" : "Reset link sent — check your email",
    );
    setMode("signin");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">JewelMaster OS</CardTitle>
          <CardDescription>
            {mode === "signin" ? "Sign in to continue" : mode === "activate" ? "Set your password" : "Reset your password"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode !== "signin" ? (
            <form onSubmit={onEmailLink} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="remail">Email</Label>
                <Input id="remail" type="email" required value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  {mode === "activate"
                    ? "Enter the email your administrator used to create your account. We'll email a link to create your password."
                    : "We'll email you a link to set a new password."}
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Sending…" : "Send link"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("signin")}>
                Back to sign in
              </Button>
            </form>
          ) : (
            <form onSubmit={onSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => { setResetEmail(email); setMode("forgot"); }}
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => { setResetEmail(email); setMode("activate"); }}
                >
                  First time here? Set your password
                </button>
              </div>
            </form>
          )}

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or</span>
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={onGoogle}>
            Continue with Google
          </Button>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Accounts are created by an administrator. Google sign-in gives read-only access until an admin assigns a role.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};


export default Auth;
