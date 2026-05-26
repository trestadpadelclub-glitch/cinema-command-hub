import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Loader2, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { CINEMAPI_BASE, setToken } from "@/lib/cinemapi";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : "/valvet",
  }),
  head: () => ({ meta: [{ title: "Logga in — CinemaPi" }] }),
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Försök först som form-data (OAuth2PasswordRequestForm), fall tillbaka till JSON.
      const fd = new URLSearchParams();
      fd.set("username", username);
      fd.set("password", password);
      let res = await fetch(`${CINEMAPI_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: fd.toString(),
      });
      if (res.status === 415 || res.status === 422) {
        res = await fetch(`${CINEMAPI_BASE}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
      }
      if (!res.ok) {
        throw new Error(`Inloggning misslyckades (${res.status})`);
      }
      const data = await res.json();
      const token: string | undefined =
        data.access_token || data.token || data.jwt;
      if (!token) throw new Error("Ingen token i svaret");
      setToken(token);
      toast.success("Inloggad");
      navigate({ to: redirect || "/valvet" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Inloggning misslyckades");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[image:var(--gradient-screen)] flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-border bg-card/70 backdrop-blur p-8 shadow-2xl space-y-6"
      >
        <div className="flex flex-col items-center text-center gap-2">
          <div className="h-12 w-12 rounded-xl bg-[image:var(--gradient-projector)] flex items-center justify-center shadow-[var(--cinema-glow)]">
            <Film className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">CinemaPi</h1>
          <p className="text-xs text-muted-foreground">Logga in för att fortsätta</p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Användarnamn</label>
            <Input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Lösenord</label>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Logga in"}
        </Button>
      </form>
      <Toaster theme="dark" position="top-center" richColors />
    </div>
  );
}
