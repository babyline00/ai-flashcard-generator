"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Brain,
  Download,
  FileText,
  Globe,
  Image as ImageIcon,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

// ---------- shared types ----------
type CardType = "cloze" | "qa" | "image";

interface CardData {
  id: string;
  deckId: string;
  type: CardType;
  front: string;
  back: string;
  imagePrompt: string | null;
  tags: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

interface DeckData {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { cards: number };
  cards?: CardData[];
}

interface StatsData {
  decks: number;
  cards: number;
  clozeCards: number;
  qaCards: number;
  imageCards: number;
}

interface ExportResponse {
  filename: string;
  content: string;
}

// ---------- small helpers ----------
const TYPE_LABELS: Record<CardType, string> = {
  cloze: "Cloze",
  qa: "Q&A",
  image: "Image",
};

const TYPE_BADGE_VARIANT: Record<CardType, "default" | "secondary" | "outline"> = {
  cloze: "default",
  qa: "secondary",
  image: "outline",
};

function downloadFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- main page ----------
export default function Page() {
  // --- source input state ---
  const [sourceType, setSourceType] = useState<"text" | "pdf" | "url">("text");
  const [textSource, setTextSource] = useState("");
  const [urlSource, setUrlSource] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  // --- generation options ---
  const [deckName, setDeckName] = useState("");
  const [deckDescription, setDeckDescription] = useState("");
  const [count, setCount] = useState(10);
  const [targetDeckId, setTargetDeckId] = useState<string>("__new__");

  // --- data state ---
  const [decks, setDecks] = useState<DeckData[]>([]);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [cards, setCards] = useState<CardData[]>([]);
  const [stats, setStats] = useState<StatsData>({
    decks: 0,
    cards: 0,
    clozeCards: 0,
    qaCards: 0,
    imageCards: 0,
  });

  // --- async state ---
  const [generating, setGenerating] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  // ---------- data fetching ----------
  const fetchDecks = useCallback(async () => {
    try {
      const res = await fetch("/api/decks");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DeckData[] = await res.json();
      setDecks(data);
    } catch (e) {
      console.error("[fetchDecks]", e);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      if (!res.ok) return;
      const data: StatsData = await res.json();
      setStats(data);
    } catch (e) {
      console.error("[fetchStats]", e);
    }
  }, []);

  const fetchDeck = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/decks/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DeckData = await res.json();
      setActiveDeckId(id);
      setCards(data.cards ?? []);
    } catch (e) {
      console.error("[fetchDeck]", e);
      toast.error("Failed to load deck");
      setCards([]);
    }
  }, []);

  useEffect(() => {
    fetchDecks();
    fetchStats();
  }, [fetchDecks, fetchStats]);

  // ---------- generate handler ----------
  async function handleGenerate() {
    if (generating) return;

    // Validate source.
    let source: string | File | null = null;
    if (sourceType === "text") {
      if (!textSource.trim()) {
        toast.error("Paste some text first.");
        return;
      }
      source = textSource;
    } else if (sourceType === "pdf") {
      if (!pdfFile) {
        toast.error("Select a PDF file first.");
        return;
      }
      source = pdfFile;
    } else {
      if (!urlSource.trim()) {
        toast.error("Enter a URL first.");
        return;
      }
      source = urlSource;
    }

    const wantNewDeck = targetDeckId === "__new__";
    if (wantNewDeck && !deckName.trim()) {
      toast.error("Name the new deck first.");
      return;
    }

    setGenerating(true);
    try {
      // Build the request body.
      let res: Response;
      if (sourceType === "pdf" && source instanceof File) {
        const fd = new FormData();
        fd.append("file", source);
        fd.append("sourceType", "pdf");
        fd.append("count", String(count));
        if (wantNewDeck) {
          fd.append("deckName", deckName.trim());
          if (deckDescription.trim()) fd.append("deckDescription", deckDescription.trim());
        } else {
          fd.append("deckId", targetDeckId);
        }
        res = await fetch("/api/cards/generate", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/cards/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: source,
            sourceType: sourceType,
            count,
            deckId: wantNewDeck ? undefined : targetDeckId,
            deckName: wantNewDeck ? deckName.trim() : undefined,
            deckDescription: wantNewDeck ? deckDescription.trim() : undefined,
          }),
        });
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }
      const data: { deck: DeckData; cards: CardData[] } = await res.json();
      toast.success(`Generated ${data.cards.length} card(s).`);
      setActiveDeckId(data.deck.id);
      setCards(data.cards);
      setTextSource("");
      setUrlSource("");
      setPdfFile(null);
      setDeckName("");
      setDeckDescription("");
      setTargetDeckId("__new__");
      fetchDecks();
      fetchStats();
    } catch (e) {
      console.error("[generate]", e);
      toast.error(`Generation failed: ${(e as Error).message}`);
    } finally {
      setGenerating(false);
    }
  }

  // ---------- card handlers ----------
  async function handleSaveCard(card: CardData, draft: { front: string; back: string; tags: string }) {
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: CardData = await res.json();
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, ...updated } : c)));
      toast.success("Saved.");
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  async function handleDeleteCard(card: CardData) {
    if (!confirm("Delete this card?")) return;
    try {
      const res = await fetch(`/api/cards/${card.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      fetchDecks();
      fetchStats();
      toast.success("Card deleted.");
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  async function handleRegenerateCard(card: CardData) {
    if (regeneratingId) return;
    setRegeneratingId(card.id);
    try {
      const res = await fetch(`/api/cards/${card.id}/regenerate`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: CardData = await res.json();
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, ...updated } : c)));
      toast.success("Card regenerated.");
    } catch (e) {
      toast.error(`Regenerate failed: ${(e as Error).message}`);
    } finally {
      setRegeneratingId(null);
    }
  }

  // ---------- deck handlers ----------
  async function handleSelectDeck(deck: DeckData) {
    if (activeDeckId === deck.id) return;
    await fetchDeck(deck.id);
  }

  async function handleRenameDeck(deck: DeckData) {
    const name = prompt("Rename deck", deck.name);
    if (!name || name.trim() === deck.name) return;
    try {
      const res = await fetch(`/api/decks/${deck.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchDecks();
      toast.success("Deck renamed.");
    } catch (e) {
      toast.error(`Rename failed: ${(e as Error).message}`);
    }
  }

  async function handleDeleteDeck(deck: DeckData) {
    if (!confirm(`Delete deck "${deck.name}" and all its cards?`)) return;
    try {
      const res = await fetch(`/api/decks/${deck.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (activeDeckId === deck.id) {
        setActiveDeckId(null);
        setCards([]);
      }
      fetchDecks();
      fetchStats();
      toast.success("Deck deleted.");
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  async function handleExport(deck: DeckData, format: "anki-tsv" | "anki-cloze-tsv" | "quizlet-csv") {
    try {
      const res = await fetch(`/api/decks/${deck.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ExportResponse = await res.json();
      const mime =
        format === "quizlet-csv" ? "text/csv" : "text/tab-separated-values";
      downloadFile(data.filename, data.content, mime);
      toast.success(`Exported ${data.filename}`);
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`);
    }
  }

  // ---------- derived state ----------
  const activeDeck = useMemo(
    () => decks.find((d) => d.id === activeDeckId) ?? null,
    [decks, activeDeckId],
  );

  // ---------- render ----------
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-md bg-primary text-primary-foreground grid place-items-center">
              <Brain className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">
                AI-Powered Flashcard Generator
              </h1>
              <p className="text-xs text-muted-foreground leading-tight">
                Text · PDF · URL → cloze, Q&A, image-suggestion cards
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="secondary">{stats.decks} decks</Badge>
            <Badge variant="secondary">{stats.cards} cards</Badge>
            <Badge variant="outline">{stats.clozeCards} cloze</Badge>
            <Badge variant="outline">{stats.qaCards} qa</Badge>
            <Badge variant="outline">{stats.imageCards} image</Badge>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT: source input form */}
        <section className="lg:col-span-4 xl:col-span-3">
          <Card className="lg:sticky lg:top-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4" />
                Source
              </CardTitle>
              <CardDescription>
                Paste text, drop a PDF, or share a URL — the AI does the rest.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs
                value={sourceType}
                onValueChange={(v) => setSourceType(v as typeof sourceType)}
              >
                <TabsList className="w-full">
                  <TabsTrigger value="text" className="flex-1 gap-1">
                    <FileText className="size-3.5" /> Text
                  </TabsTrigger>
                  <TabsTrigger value="pdf" className="flex-1 gap-1">
                    <Upload className="size-3.5" /> PDF
                  </TabsTrigger>
                  <TabsTrigger value="url" className="flex-1 gap-1">
                    <Globe className="size-3.5" /> URL
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="text" className="mt-3">
                  <Label htmlFor="text-source">Paste markdown or plain text</Label>
                  <Textarea
                    id="text-source"
                    className="mt-1.5 min-h-40 font-mono text-xs"
                    placeholder="Paste an article, lecture notes, or your study material here..."
                    value={textSource}
                    onChange={(e) => setTextSource(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {textSource.length.toLocaleString()} chars
                  </p>
                </TabsContent>
                <TabsContent value="pdf" className="mt-3">
                  <Label htmlFor="pdf-input">Upload a PDF</Label>
                  <input
                    id="pdf-input"
                    type="file"
                    accept="application/pdf"
                    className="mt-1.5 block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:font-medium file:cursor-pointer"
                    onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                  />
                  {pdfFile && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Selected: {pdfFile.name} ({(pdfFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="url" className="mt-3">
                  <Label htmlFor="url-source">Page URL</Label>
                  <Input
                    id="url-source"
                    type="url"
                    placeholder="https://en.wikipedia.org/wiki/Photosynthesis"
                    value={urlSource}
                    onChange={(e) => setUrlSource(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    We fetch the HTML, strip scripts/styles, and extract the main text.
                  </p>
                </TabsContent>
              </Tabs>

              <Separator />

              <div className="space-y-2">
                <Label>Deck</Label>
                <Select
                  value={targetDeckId}
                  onValueChange={(v) => setTargetDeckId(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a deck" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new__">+ New deck</SelectItem>
                    {decks.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {targetDeckId === "__new__" && (
                  <div className="space-y-2 pt-1">
                    <Input
                      placeholder="Deck name (e.g. Biology 101)"
                      value={deckName}
                      onChange={(e) => setDeckName(e.target.value)}
                    />
                    <Textarea
                      placeholder="Optional deck description"
                      className="min-h-16 text-xs"
                      value={deckDescription}
                      onChange={(e) => setDeckDescription(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="count">Card count</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="count"
                    type="number"
                    min={1}
                    max={40}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Math.min(40, Number(e.target.value) || 1)))}
                    className="w-24"
                  />
                  <span className="text-xs text-muted-foreground">
                    Split across cloze, Q&A, image (4/4/2 by default).
                  </span>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" /> Generate cards
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* CENTER: cards list */}
        <section className="lg:col-span-5 xl:col-span-6">
          <Card className="flex flex-col">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Layers className="size-4" />
                  {activeDeck ? activeDeck.name : "All cards"}
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  {cards.length} card{cards.length === 1 ? "" : "s"}
                </span>
              </CardTitle>
              <CardDescription>
                {activeDeck
                  ? activeDeck.description || "Click a card to edit. Regenerate or delete at any time."
                  : "Generate cards from a source to see them here."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[calc(100vh-260px)]">
                <div className="p-4 space-y-3 flashgen-scroll">
                  {cards.length === 0 ? (
                    <EmptyState />
                  ) : (
                    cards.map((card) => (
                      <CardRow
                        key={card.id}
                        card={card}
                        onSave={handleSaveCard}
                        onDelete={handleDeleteCard}
                        onRegenerate={handleRegenerateCard}
                        regenerating={regeneratingId === card.id}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </section>

        {/* RIGHT: decks sidebar */}
        <section className="lg:col-span-3">
          <Card className="flex flex-col">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Layers className="size-4" /> Decks
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  {decks.length}
                </span>
              </CardTitle>
              <CardDescription>Click a deck to view its cards.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[calc(100vh-260px)]">
                <div className="p-3 space-y-2 flashgen-scroll">
                  {decks.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      No decks yet. Generate your first set of cards.
                    </div>
                  ) : (
                    decks.map((deck) => (
                      <DeckRow
                        key={deck.id}
                        deck={deck}
                        active={deck.id === activeDeckId}
                        onSelect={handleSelectDeck}
                        onRename={handleRenameDeck}
                        onDelete={handleDeleteDeck}
                        onExport={handleExport}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="mt-auto border-t bg-card">
        <div className="container mx-auto px-4 py-3 text-xs text-muted-foreground flex justify-between items-center flex-wrap gap-2">
          <span>AI-Powered Flashcard Generator · MVP</span>
          <span className="text-right">
            Multi-format ingest · 3 card types · Anki/Quizlet TSV/CSV export
          </span>
        </div>
      </footer>
    </div>
  );
}

// ---------- empty state ----------
function EmptyState() {
  return (
    <div className="p-10 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
      <Sparkles className="size-6 mx-auto mb-2 opacity-60" />
      No cards to show yet. Paste source text on the left and hit
      <span className="font-medium"> Generate cards</span>.
    </div>
  );
}

// ---------- card row (editable) ----------
function CardRow(props: {
  card: CardData;
  onSave: (card: CardData, draft: { front: string; back: string; tags: string }) => Promise<void>;
  onDelete: (card: CardData) => Promise<void>;
  onRegenerate: (card: CardData) => Promise<void>;
  regenerating: boolean;
}) {
  const { card, onSave, onDelete, onRegenerate, regenerating } = props;
  const [editing, setEditing] = useState(false);
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [tags, setTags] = useState(card.tags);

  useEffect(() => {
    if (!editing) {
      setFront(card.front);
      setBack(card.back);
      setTags(card.tags);
    }
  }, [card.front, card.back, card.tags, editing]);

  const typeIcon =
    card.type === "cloze" ? (
      <Tag className="size-3.5" />
    ) : card.type === "qa" ? (
      <FileText className="size-3.5" />
    ) : (
      <ImageIcon className="size-3.5" />
    );

  return (
    <div className="rounded-lg border bg-card text-card-foreground p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={TYPE_BADGE_VARIANT[card.type]} className="gap-1">
            {typeIcon}
            {TYPE_LABELS[card.type]}
          </Badge>
          <span className="text-xs text-muted-foreground">#{card.order}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => {
              if (editing) {
                onSave(card, { front, back, tags }).then(() => setEditing(false));
              } else {
                setEditing(true);
              }
            }}
            title={editing ? "Save" : "Edit"}
          >
            {editing ? <Save className="size-3.5" /> : <FileText className="size-3.5" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => onRegenerate(card)}
            disabled={regenerating}
            title="Regenerate"
          >
            {regenerating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(card)}
            title="Delete"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            className="min-h-20 text-sm"
            value={front}
            onChange={(e) => setFront(e.target.value)}
            placeholder="Front (cloze / question / image prompt)"
          />
          <Textarea
            className="min-h-16 text-sm"
            value={back}
            onChange={(e) => setBack(e.target.value)}
            placeholder="Back (answer / extra / image description)"
          />
          <Input
            className="text-xs"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tags, comma, separated"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X className="size-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={() => onSave(card, { front, back, tags }).then(() => setEditing(false))}>
              <Save className="size-3.5" /> Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-sm font-medium">{card.front}</div>
          {card.back && (
            <div className="text-sm text-muted-foreground whitespace-pre-wrap">
              {card.back}
            </div>
          )}
          {card.type === "image" && card.imagePrompt && (
            <div className="text-xs italic text-muted-foreground border-l-2 pl-2">
              image prompt: {card.imagePrompt}
            </div>
          )}
          {card.tags && (
            <div className="flex flex-wrap gap-1 pt-1">
              {card.tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
                .map((t) => (
                  <Badge key={t} variant="outline" className="text-xs">
                    {t}
                  </Badge>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- deck row ----------
function DeckRow(props: {
  deck: DeckData;
  active: boolean;
  onSelect: (deck: DeckData) => void;
  onRename: (deck: DeckData) => void;
  onDelete: (deck: DeckData) => void;
  onExport: (deck: DeckData, format: "anki-tsv" | "anki-cloze-tsv" | "quizlet-csv") => void;
}) {
  const { deck, active, onSelect, onRename, onDelete, onExport } = props;
  const cardCount = deck._count?.cards ?? deck.cards?.length ?? 0;
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div
      className={`rounded-md border p-3 cursor-pointer transition-colors ${
        active ? "border-primary bg-accent/50" : "hover:bg-accent/30"
      }`}
      onClick={() => onSelect(deck)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">{deck.name}</div>
          <div className="text-xs text-muted-foreground">
            {cardCount} card{cardCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      {deck.description && (
        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
          {deck.description}
        </div>
      )}
      <div
        className="flex items-center gap-1 mt-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => onRename(deck)}
        >
          Rename
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setExportOpen((v) => !v)}
        >
          <Download className="size-3" /> Export
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-destructive hover:text-destructive"
          onClick={() => onDelete(deck)}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      {exportOpen && (
        <div
          className="mt-2 flex flex-col gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs justify-start"
            onClick={() => onExport(deck, "anki-tsv")}
          >
            Anki Basic (.txt)
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs justify-start"
            onClick={() => onExport(deck, "anki-cloze-tsv")}
          >
            Anki Cloze (.txt)
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs justify-start"
            onClick={() => onExport(deck, "quizlet-csv")}
          >
            Quizlet (.csv)
          </Button>
        </div>
      )}
    </div>
  );
}
