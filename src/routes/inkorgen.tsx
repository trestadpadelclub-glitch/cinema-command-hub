import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Check, X, Lock, ArrowLeft, Loader2, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

const API_BASE = "http://192.168.86.136:8000";

type PendingFile = {
  db_id: number | string;
  filename: string;
  tags?: string[];
  [k: string]: unknown;
};

type Status = "approved" | "rejected" | "private";

export const Route = createFileRoute("/inkorgen")({
  component: InkorgenPage,
  head: () => ({
    meta: [
      { title: "Inkorgen — CinemaPi" },
      { name: "description", content: "Hantera ohanterade foton i CinemaPi-inkorgen." },
    ],
  }),
});

function thumbUrl(filename: string) {
  return `${API_BASE}/api/media/thumbnail/${encodeURIComponent(filename)}`;
}

async function patchStatus(db_id: PendingFile["db_id"], body: { status: Status; tags?: string[] }) {
  const res = await fetch(`${API_BASE}/api/media/info/${db_id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json().catch(() => ({}));
}

function InkorgenPage() {
  const [view, setView] = useState<"focus" | "grid">(() => {
    if (typeof window === "undefined") return "focus";
    return (localStorage.getItem("inkorgen.view") as "focus" | "grid") || "focus";
  });
  const [files, setFiles] = useState<PendingFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("inkorgen.view", view);
  }, [view]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/files/search?status=pending`, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: PendingFile[] = Array.isArray(data?.files) ? data.files : [];
      setFiles(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte hämta filer");
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const removeLocal = useCallback((id: PendingFile["db_id"]) => {
    setFiles((prev) => (prev ? prev.filter((f) => f.db_id !== id) : prev));
  }, []);

  const handleAction = useCallback(
    async (file: PendingFile, status: Status, tags?: string[]) => {
      try {
        await patchStatus(file.db_id, status === "approved" ? { status, tags: tags ?? [] } : { status });
        removeLocal(file.db_id);
        toast.success(
          status === "approved" ? "Godkänd" : status === "private" ? "Sparad som privat" : "Slängd",
        );
      } catch (e) {
        toast.error("Misslyckades", {
          description: e instanceof Error ? e.message : "Okänt fel",
        });
      }
    },
    [removeLocal],
  );

  return (
    <div className="min-h-screen bg-[image:var(--gradient-screen)] text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <header className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[image:var(--gradient-projector)] shadow-[var(--cinema-glow)]">
              <Inbox className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Inkorgen</h1>
              <p className="text-xs text-muted-foreground">
                {files ? `${files.length} bilder väntar` : "Laddar…"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button variant="secondary" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Hem
              </Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Uppdatera"}
            </Button>
          </div>
        </header>

        <Tabs value={view} onValueChange={(v) => setView(v as "focus" | "grid")} className="mb-6">
          <TabsList>
            <TabsTrigger value="focus">Fokusläge</TabsTrigger>
            <TabsTrigger value="grid">Översiktsläge</TabsTrigger>
          </TabsList>
        </Tabs>

        {error && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Kunde inte hämta inkorgen: {error}
          </div>
        )}

        {loading && !files ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : files && files.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            Inkorgen är tom. Bra jobbat!
          </div>
        ) : view === "focus" ? (
          <FocusView files={files ?? []} onAction={handleAction} />
        ) : (
          <GridView files={files ?? []} onAction={handleAction} />
        )}
      </div>
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  );
}

/* ---------- FOCUS VIEW ---------- */

function FocusView({
  files,
  onAction,
}: {
  files: PendingFile[];
  onAction: (file: PendingFile, status: Status, tags?: string[]) => Promise<void>;
}) {
  const current = files[0];
  const [tagInput, setTagInput] = useState("");
  const [leaving, setLeaving] = useState<"left" | "right" | "up" | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTagInput("");
    setLeaving(null);
  }, [current?.db_id]);

  const parseTags = (s: string) =>
    s
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

  const trigger = useCallback(
    (status: Status) => {
      if (!current) return;
      const dir = status === "approved" ? "right" : status === "rejected" ? "left" : "up";
      setLeaving(dir);
      const tags = parseTags(tagInput);
      window.setTimeout(() => {
        onAction(current, status, tags);
      }, 180);
    },
    [current, tagInput, onAction],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return;
      if (e.key === "ArrowRight") trigger("approved");
      else if (e.key === "ArrowLeft") trigger("rejected");
      else if (e.key === "ArrowUp") {
        e.preventDefault();
        trigger("private");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trigger]);

  if (!current) return null;

  const transform =
    leaving === "right"
      ? "translate-x-[120%] rotate-6 opacity-0"
      : leaving === "left"
        ? "-translate-x-[120%] -rotate-6 opacity-0"
        : leaving === "up"
          ? "-translate-y-[120%] opacity-0"
          : "translate-x-0 translate-y-0 rotate-0 opacity-100";

  return (
    <div className="mx-auto max-w-xl">
      <div className="text-xs text-muted-foreground text-center mb-2">
        {files.length} kvar · ← Släng · ↑ Privat · → Godkänn
      </div>
      <div
        key={String(current.db_id)}
        className={`rounded-2xl border border-border bg-card shadow-lg overflow-hidden transition-all duration-200 ease-out ${transform}`}
      >
        <div className="aspect-[4/3] bg-black/40 flex items-center justify-center overflow-hidden">
          <img
            src={thumbUrl(current.filename)}
            alt={current.filename}
            className="max-h-full max-w-full object-contain"
            loading="eager"
          />
        </div>
        <div className="p-4 space-y-3">
          <div className="text-sm font-mono truncate text-muted-foreground">{current.filename}</div>
          <Input
            ref={inputRef}
            placeholder="Taggar (kommaseparerade)"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                trigger("approved");
              }
            }}
          />
          <div className="grid grid-cols-3 gap-2">
            <Button
              onClick={() => trigger("rejected")}
              className="bg-red-600 hover:bg-red-500 text-white h-14 text-base font-semibold"
            >
              <X className="h-5 w-5 mr-1.5" />
              Släng
            </Button>
            <Button
              onClick={() => trigger("private")}
              className="bg-blue-600 hover:bg-blue-500 text-white h-14 text-base font-semibold"
            >
              <Lock className="h-5 w-5 mr-1.5" />
              Privat
            </Button>
            <Button
              onClick={() => trigger("approved")}
              className="bg-emerald-600 hover:bg-emerald-500 text-white h-14 text-base font-semibold"
            >
              <Check className="h-5 w-5 mr-1.5" />
              Godkänn
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- GRID VIEW ---------- */

function GridView({
  files,
  onAction,
}: {
  files: PendingFile[];
  onAction: (file: PendingFile, status: Status, tags?: string[]) => Promise<void>;
}) {
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {files.map((f) => (
        <GridCard key={String(f.db_id)} file={f} onAction={onAction} />
      ))}
    </div>
  );
}

function GridCard({
  file,
  onAction,
}: {
  file: PendingFile;
  onAction: (file: PendingFile, status: Status, tags?: string[]) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const handle = async (status: Status) => {
    if (busy) return;
    setBusy(true);
    await onAction(file, status);
  };
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-card">
      <img
        src={thumbUrl(file.filename)}
        alt={file.filename}
        loading="lazy"
        className="h-full w-full object-cover transition-transform group-hover:scale-105"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] font-mono text-white/80 truncate opacity-0 group-hover:opacity-100 transition-opacity">
        {file.filename}
      </div>
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          title="Privat"
          onClick={() => handle("private")}
          disabled={busy}
          className="h-8 w-8 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-md flex items-center justify-center disabled:opacity-50"
        >
          <Lock className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Släng"
          onClick={() => handle("rejected")}
          disabled={busy}
          className="h-8 w-8 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-md flex items-center justify-center disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Godkänn"
          onClick={() => handle("approved")}
          disabled={busy}
          className="h-8 w-8 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-md flex items-center justify-center disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
      {busy && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-white" />
        </div>
      )}
    </div>
  );
}
