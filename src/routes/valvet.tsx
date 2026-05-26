import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  ArrowLeft,
  Loader2,
  Search,
  Sparkles,
  X,
  Mic,
  Square,
  Plus,
  LayoutGrid,
  Rows3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

const API_BASE = "http://192.168.86.136:8000";

type ApprovedFile = {
  db_id: number | string;
  filename: string;
  tags?: string[] | null;
  ai_description?: string | null;
  ai_tags?: string[] | null;
  created_at?: string | null;
  date?: string | null;
  width?: number | null;
  height?: number | null;
  [k: string]: unknown;
};

type VoiceMemo = {
  memo_id: number | string;
  created_at?: string | null;
  duration?: number | null;
  user?: string | null;
};

type ViewMode = "classic" | "masonry";

export const Route = createFileRoute("/valvet")({
  component: ValvetPage,
  head: () => ({
    meta: [
      { title: "Valvet — CinemaPi" },
      { name: "description", content: "Galleriet över godkända foton i CinemaPi." },
    ],
  }),
});

const thumbUrl = (f: string) => `${API_BASE}/api/media/thumbnail/${encodeURIComponent(f)}`;
const previewUrl = (f: string) => `${API_BASE}/api/media/preview/${encodeURIComponent(f)}`;

async function fetchApproved(query: string): Promise<ApprovedFile[]> {
  const params = new URLSearchParams({ status: "approved" });
  if (query.trim()) params.set("tags", query.trim());
  const res = await fetch(`${API_BASE}/api/files/search?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json.files ?? []) as ApprovedFile[];
}

async function patchInfo(db_id: ApprovedFile["db_id"], body: { tags?: string[] }) {
  const res = await fetch(`${API_BASE}/api/media/info/${db_id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json().catch(() => ({}));
}

function ValvetPage() {
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "classic";
    return (localStorage.getItem("valvet.view") as ViewMode) || "classic";
  });
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [files, setFiles] = useState<ApprovedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<ApprovedFile["db_id"] | null>(null);

  useEffect(() => {
    localStorage.setItem("valvet.view", view);
  }, [view]);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchApproved(debounced);
      setFiles(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte ladda galleriet");
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    load();
  }, [load]);

  const active = useMemo(
    () => files.find((f) => String(f.db_id) === String(activeId)) ?? null,
    [files, activeId],
  );

  const updateLocalTags = (db_id: ApprovedFile["db_id"], tags: string[]) => {
    setFiles((prev) =>
      prev.map((f) => (String(f.db_id) === String(db_id) ? { ...f, tags } : f)),
    );
  };

  return (
    <div className="min-h-screen bg-[image:var(--gradient-screen)] text-foreground">
      <header className="border-b border-border/50 bg-background/40 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Tillbaka
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Valvet</h1>
          <span className="text-xs text-muted-foreground ml-auto">
            {loading ? "Laddar…" : `${files.length} bilder`}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 space-y-5">
        {/* Stort centrerat sökfält */}
        <div className="mx-auto max-w-2xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sök bland taggar…"
              className="pl-10 h-12 text-base"
            />
          </div>
        </div>

        {/* Vyväljare */}
        <div className="flex justify-center">
          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="classic">
                <LayoutGrid className="h-4 w-4 mr-1.5" /> Klassiskt
              </TabsTrigger>
              <TabsTrigger value="masonry">
                <Rows3 className="h-4 w-4 mr-1.5" /> Masonry
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center text-muted-foreground py-20 text-sm">
            Inga bilder matchar sökningen.
          </div>
        ) : view === "classic" ? (
          <ClassicGrid files={files} onOpen={setActiveId} />
        ) : (
          <MasonryGrid files={files} onOpen={setActiveId} />
        )}
      </div>

      <Lightbox
        file={active}
        onClose={() => setActiveId(null)}
        onTagsUpdated={updateLocalTags}
      />
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  );
}

/* ============ Grids ============ */

function AiBadge() {
  return (
    <div
      title="AI-beskrivning tillgänglig"
      className="absolute top-2 right-2 z-10 inline-flex items-center justify-center h-7 w-7 rounded-full bg-background/80 backdrop-blur border border-border shadow-sm"
    >
      <Sparkles className="h-3.5 w-3.5 text-amber-400" />
    </div>
  );
}

function ClassicGrid({
  files,
  onOpen,
}: {
  files: ApprovedFile[];
  onOpen: (id: ApprovedFile["db_id"]) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {files.map((f) => (
        <button
          key={String(f.db_id)}
          onClick={() => onOpen(f.db_id)}
          className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-card hover:border-primary/60 transition-colors"
        >
          {f.ai_description && <AiBadge />}
          <img
            src={thumbUrl(f.filename)}
            alt={f.filename}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </button>
      ))}
    </div>
  );
}

function MasonryGrid({
  files,
  onOpen,
}: {
  files: ApprovedFile[];
  onOpen: (id: ApprovedFile["db_id"]) => void;
}) {
  return (
    <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-3 [column-fill:_balance]">
      {files.map((f) => (
        <button
          key={String(f.db_id)}
          onClick={() => onOpen(f.db_id)}
          className="group relative mb-3 block w-full overflow-hidden rounded-lg border border-border bg-card hover:border-primary/60 transition-colors break-inside-avoid"
        >
          {f.ai_description && <AiBadge />}
          <img
            src={thumbUrl(f.filename)}
            alt={f.filename}
            loading="lazy"
            className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </button>
      ))}
    </div>
  );
}

/* ============ Lightbox ============ */

function Lightbox({
  file,
  onClose,
  onTagsUpdated,
}: {
  file: ApprovedFile | null;
  onClose: () => void;
  onTagsUpdated: (id: ApprovedFile["db_id"], tags: string[]) => void;
}) {
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [localTags, setLocalTags] = useState<string[]>([]);

  useEffect(() => {
    setLocalTags(Array.isArray(file?.tags) ? (file?.tags as string[]) : []);
    setTagInput("");
  }, [file?.db_id]);

  if (!file) return null;

  const aiTags = Array.isArray(file.ai_tags) ? file.ai_tags : [];
  const date = file.created_at || file.date || null;

  const addTag = async () => {
    const t = tagInput.trim();
    if (!t || localTags.includes(t)) return;
    const next = [...localTags, t];
    setLocalTags(next);
    setTagInput("");
    setSaving(true);
    try {
      await patchInfo(file.db_id, { tags: next });
      onTagsUpdated(file.db_id, next);
    } catch (e) {
      toast.error("Kunde inte spara tagg");
      setLocalTags(localTags);
    } finally {
      setSaving(false);
    }
  };

  const removeTag = async (t: string) => {
    const next = localTags.filter((x) => x !== t);
    setLocalTags(next);
    setSaving(true);
    try {
      await patchInfo(file.db_id, { tags: next });
      onTagsUpdated(file.db_id, next);
    } catch {
      toast.error("Kunde inte ta bort tagg");
      setLocalTags(localTags);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl w-[95vw] p-0 overflow-hidden">
        <div className="grid md:grid-cols-[1.4fr_1fr] max-h-[90vh]">
          {/* Bild */}
          <div className="bg-black flex items-center justify-center min-h-[40vh] md:min-h-[60vh]">
            <img
              src={previewUrl(file.filename)}
              alt={file.filename}
              className="max-h-[90vh] w-auto max-w-full object-contain"
            />
          </div>

          {/* Sidopanel */}
          <div className="p-5 overflow-y-auto space-y-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-sm truncate">{file.filename}</h3>
                {date && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(date).toLocaleString("sv-SE")}
                  </p>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {file.ai_description && (
              <section>
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    AI-beskrivning
                  </h4>
                </div>
                <Textarea
                  readOnly
                  value={file.ai_description}
                  className="text-sm resize-none"
                  rows={4}
                />
              </section>
            )}

            {aiTags.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  AI-taggar
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {aiTags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-xs">
                      {t}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Mina taggar
              </h4>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {localTags.length === 0 && (
                  <span className="text-xs text-muted-foreground">Inga taggar än.</span>
                )}
                {localTags.map((t) => (
                  <Badge
                    key={t}
                    variant="default"
                    className="text-xs cursor-pointer"
                    onClick={() => removeTag(t)}
                    title="Klicka för att ta bort"
                  >
                    {t} <X className="h-3 w-3 ml-1" />
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Lägg till tagg…"
                  className="h-9"
                />
                <Button onClick={addTag} disabled={saving || !tagInput.trim()} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </section>

            <VoiceMemoSection db_id={file.db_id} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ============ Voice memos ============ */

function VoiceMemoSection({ db_id }: { db_id: ApprovedFile["db_id"] }) {
  const [memos, setMemos] = useState<VoiceMemo[]>([]);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/media/${db_id}/voice-memos`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setMemos((json.memos ?? json ?? []) as VoiceMemo[]);
    } catch {
      setMemos([]);
    } finally {
      setLoading(false);
    }
  }, [db_id]);

  useEffect(() => {
    load();
  }, [load]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setUploading(true);
        try {
          const fd = new FormData();
          fd.append("file", blob, `memo-${Date.now()}.webm`);
          const res = await fetch(`${API_BASE}/api/media/${db_id}/voice-memo`, {
            method: "POST",
            body: fd,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          toast.success("Röstanteckning sparad");
          await load();
        } catch (e) {
          toast.error("Kunde inte ladda upp röstanteckning");
        } finally {
          setUploading(false);
        }
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      toast.error("Mikrofonen är inte tillgänglig");
    }
  };

  const stopRecording = () => {
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Röstanteckningar
        </h4>
        {recording ? (
          <Button size="sm" variant="destructive" onClick={stopRecording}>
            <Square className="h-3.5 w-3.5 mr-1.5" /> Stoppa
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={startRecording} disabled={uploading}>
            <Mic className="h-3.5 w-3.5 mr-1.5" />
            {uploading ? "Laddar upp…" : "Spela in"}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground">Laddar…</div>
      ) : memos.length === 0 ? (
        <div className="text-xs text-muted-foreground">Inga röstanteckningar än.</div>
      ) : (
        <ul className="space-y-2">
          {memos.map((m) => (
            <li
              key={String(m.memo_id)}
              className="rounded-md border border-border bg-card/50 p-2"
            >
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                <span>{m.user ?? "Familj"}</span>
                <span>
                  {m.created_at ? new Date(m.created_at).toLocaleString("sv-SE") : ""}
                </span>
              </div>
              <audio
                controls
                preload="none"
                src={`${API_BASE}/api/voice-memos/${m.memo_id}/stream`}
                className="w-full h-9"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
