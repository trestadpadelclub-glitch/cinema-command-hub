import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Loader2,
  Plus,
  UserPlus,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  Cpu,
  Users as UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { CINEMAPI_BASE, clearToken, isAuthed } from "@/lib/cinemapi";

type User = {
  id?: number | string;
  username: string;
  role: string;
  initials?: string | null;
  default_privacy?: string | null;
};

type Storage = {
  usage_percent?: number;
  used_gib?: number;
  total_gib?: number;
  free_gib?: number;
};

type Health = {
  status?: "healthy" | "warning" | "error" | string;
  details?: string;
};

type Settings = {
  ai_engine?: "gemini" | "local" | "off" | string;
  gemini_daily_limit?: number;
  local_worker_ip?: string;
  offline_fallback_action?: string;
};

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin — CinemaPi" }] }),
});

function AdminPage() {
  const navigate = useNavigate();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!isAuthed()) {
      navigate({ to: "/login", search: { redirect: "/admin" } });
    } else {
      setAuthReady(true);
    }
  }, [navigate]);

  const logout = () => {
    clearToken();
    navigate({ to: "/login", search: { redirect: "/admin" } });
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[image:var(--gradient-screen)] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[image:var(--gradient-screen)] text-foreground">
      <header className="border-b border-border/50 bg-background/40 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Tillbaka
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Pappas Backbone</h1>
            <p className="text-[11px] text-muted-foreground">Admin Dashboard</p>
          </div>
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 mr-1.5" /> Logga ut
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Tabs defaultValue="system">
          <TabsList className="mb-6">
            <TabsTrigger value="system">
              <HardDrive className="h-4 w-4 mr-1.5" /> System
            </TabsTrigger>
            <TabsTrigger value="ai">
              <Cpu className="h-4 w-4 mr-1.5" /> AI &amp; Inställningar
            </TabsTrigger>
            <TabsTrigger value="users">
              <UsersIcon className="h-4 w-4 mr-1.5" /> Familj
            </TabsTrigger>
          </TabsList>

          <TabsContent value="system" className="space-y-6">
            <SystemPanel />
          </TabsContent>
          <TabsContent value="ai">
            <SettingsPanel />
          </TabsContent>
          <TabsContent value="users">
            <UsersPanel />
          </TabsContent>
        </Tabs>
      </main>

      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  );
}

/* ============ Panel A: System ============ */

function SystemPanel() {
  const [storage, setStorage] = useState<Storage | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [storageErr, setStorageErr] = useState<string | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [s, h] = await Promise.allSettled([
        fetch(`${CINEMAPI_BASE}/api/system/storage`).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
        fetch(`${CINEMAPI_BASE}/api/system/health`).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
      ]);
      if (!alive) return;
      if (s.status === "fulfilled") setStorage(s.value);
      else setStorageErr(s.reason?.message || "Fel");
      if (h.status === "fulfilled") setHealth(h.value);
      else setHealthErr(h.reason?.message || "Fel");
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Storage */}
      <section className="rounded-xl border border-border bg-card/40 backdrop-blur p-6">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-4">
          Lagring
        </h3>
        {storageErr ? (
          <ErrorBox msg={storageErr} />
        ) : storage ? (
          <div className="flex items-center gap-6">
            <CircularProgress value={storage.usage_percent ?? 0} />
            <div className="space-y-1">
              <div className="text-2xl font-bold tabular-nums">
                {fmt(storage.used_gib)} <span className="text-sm text-muted-foreground">GiB</span>
              </div>
              <div className="text-xs text-muted-foreground">
                av {fmt(storage.total_gib)} GiB använt
              </div>
              {typeof storage.free_gib === "number" && (
                <div className="text-xs text-muted-foreground">
                  {fmt(storage.free_gib)} GiB ledigt
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {/* Health */}
      <section className="rounded-xl border border-border bg-card/40 backdrop-blur p-6">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-4">
          Systemhälsa
        </h3>
        {healthErr ? (
          <ErrorBox msg={healthErr} />
        ) : health ? (
          <div className="space-y-3">
            <HealthBadge status={health.status} />
            <pre className="max-h-40 overflow-auto rounded-md border border-border bg-background/60 p-3 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {(health.details ?? "").slice(0, 200) || "Inga detaljer"}
            </pre>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function fmt(n: number | undefined) {
  if (typeof n !== "number") return "—";
  return n.toFixed(1);
}

function HealthBadge({ status }: { status?: string }) {
  if (status === "healthy")
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-3 py-1 text-xs font-medium">
        <CheckCircle2 className="h-4 w-4" /> healthy
      </div>
    );
  if (status === "warning")
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 px-3 py-1 text-xs font-medium">
        <AlertTriangle className="h-4 w-4" /> warning
      </div>
    );
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-destructive/15 text-destructive border border-destructive/30 px-3 py-1 text-xs font-medium">
      <AlertTriangle className="h-4 w-4" /> {status ?? "unknown"}
    </div>
  );
}

function CircularProgress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (v / 100) * c;
  const color =
    v >= 90 ? "stroke-destructive" : v >= 75 ? "stroke-amber-400" : "stroke-primary";
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} className="stroke-muted/40" strokeWidth="8" fill="none" />
        <circle
          cx="50"
          cy="50"
          r={r}
          className={`${color} transition-[stroke-dashoffset] duration-700`}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold tabular-nums">{Math.round(v)}%</span>
      </div>
    </div>
  );
}

/* ============ Panel B: Settings ============ */

function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${CINEMAPI_BASE}/api/settings`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSettings(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fel");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch(`${CINEMAPI_BASE}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Inställningar sparade");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (error) return <ErrorBox msg={error} />;
  if (!settings) return null;

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => (s ? { ...s, [key]: value } : s));

  return (
    <form
      onSubmit={save}
      className="rounded-xl border border-border bg-card/40 backdrop-blur p-6 space-y-5 max-w-2xl"
    >
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        AI &amp; Systeminställningar
      </h3>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="AI-motor">
          <Select
            value={settings.ai_engine ?? "off"}
            onValueChange={(v) => update("ai_engine", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini">gemini</SelectItem>
              <SelectItem value="local">local</SelectItem>
              <SelectItem value="off">off</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Gemini dagsgräns">
          <Input
            type="number"
            min={0}
            value={settings.gemini_daily_limit ?? 0}
            onChange={(e) => update("gemini_daily_limit", Number(e.target.value))}
          />
        </Field>

        <Field label="Lokal worker (IP)">
          <Input
            value={settings.local_worker_ip ?? ""}
            onChange={(e) => update("local_worker_ip", e.target.value)}
            placeholder="192.168.86.x"
          />
        </Field>

        <Field label="Offline fallback">
          <Select
            value={settings.offline_fallback_action ?? "queue"}
            onValueChange={(v) => update("offline_fallback_action", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="queue">queue</SelectItem>
              <SelectItem value="skip">skip</SelectItem>
              <SelectItem value="local">local</SelectItem>
              <SelectItem value="error">error</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Spara"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/* ============ Panel C: Users ============ */

function UsersPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${CINEMAPI_BASE}/api/users`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setUsers((json.users ?? json ?? []) as User[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte hämta användare");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Familjemedlemmar
        </h3>
        <Button size="sm" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4 mr-1.5" /> Skapa användare
        </Button>
      </div>

      {error && <ErrorBox msg={error} />}

      <div className="rounded-xl border border-border bg-card/40 backdrop-blur overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            Inga användare än.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Användarnamn</TableHead>
                <TableHead>Roll</TableHead>
                <TableHead>Initialer</TableHead>
                <TableHead>Standard-privacy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={String(u.id ?? u.username)}>
                  <TableCell className="font-medium">{u.username}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{u.initials ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.default_privacy ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AddUserDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => {
          setOpen(false);
          load();
        }}
      />
    </section>
  );
}

function AddUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [initials, setInitials] = useState("");
  const [role, setRole] = useState("viewer");
  const [privacy, setPrivacy] = useState("public");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setUsername("");
      setPassword("");
      setInitials("");
      setRole("viewer");
      setPrivacy("public");
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${CINEMAPI_BASE}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          role,
          initials,
          default_privacy: privacy,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`Användare "${username}" skapad`);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte skapa användare");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lägg till familjemedlem</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Användarnamn">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </Field>
          <Field label="Lösenord">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Initialer">
              <Input
                value={initials}
                onChange={(e) => setInitials(e.target.value.toUpperCase())}
                maxLength={4}
              />
            </Field>
            <Field label="Roll">
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">viewer</SelectItem>
                  <SelectItem value="editor">editor</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Standard-privacy">
            <Select value={privacy} onValueChange={setPrivacy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">public</SelectItem>
                <SelectItem value="private">private</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1.5" /> Skapa
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {msg}
    </div>
  );
}
