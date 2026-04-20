import { useEffect, useState } from "react";
import { Brain, BookOpen, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_MASTER_INSTRUCTIONS,
  getMasterInstructions,
  setMasterInstructions,
} from "@/lib/knowledgeBase";

export function KnowledgeBaseDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    if (open) setText(getMasterInstructions());
  }, [open]);

  const handleSave = () => {
    setMasterInstructions(text);
    toast.success("Knowledge Base sparad");
    setOpen(false);
  };

  const handleReset = () => {
    setText(DEFAULT_MASTER_INSTRUCTIONS);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BookOpen className="h-4 w-4 mr-1.5" />
          Knowledge Base
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Cinema Brain — Master Instructions
          </DialogTitle>
          <DialogDescription>
            Definiera utrustning, rum och kalibreringsregler. Skickas till AI:n vid varje
            "AI Analyze". Sparas lokalt i webbläsaren.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="kb-text" className="text-xs uppercase tracking-wider text-muted-foreground">
            Master Instructions
          </Label>
          <Textarea
            id="kb-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="font-mono text-xs min-h-[340px] resize-y"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Återställ standard
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Avbryt
          </Button>
          <Button onClick={handleSave}>Spara</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
