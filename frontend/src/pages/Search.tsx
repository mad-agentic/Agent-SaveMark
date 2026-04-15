import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Search as SearchIcon, Loader2, Sparkles, AlignLeft, StickyNote, Zap, Tag, Star, Archive, MessageCircle, SendHorizontal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { api } from "@/api/client";
import { BookmarkCard } from "@/components/bookmark/BookmarkCard";
import NoteCard from "@/components/bookmark/NoteCard";
import type { Note } from "@/hooks/use-notes";

interface Item {
  id: string;
  item_type: string;
  source_platform: string;
  url: string | null;
  title: string | null;
  description: string | null;
  content: string | null;
  summary: string | null;
  media: Array<{ type: string; url: string; role: string }>;
  item_metadata: Record<string, unknown>;
  is_favorite: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  title_snippet?: string | null;
  content_snippet?: string | null;
  sources?: string[];
}

interface SearchFilters {
  platforms: Array<{ name: string; count: number }>;
  types: string[];
  tags: Array<{ name: string; slug: string; count: number }>;
}

interface UnifiedResult {
  items: Item[];
  notes: Note[];
  total: number;
}

interface ChatSource {
  item_id: string;
  title: string;
  url: string | null;
  snippet: string;
}

interface ChatResponse {
  answer: string;
  sources: ChatSource[];
}

interface ChatConfigResponse {
  provider: string;
  active_model: string;
  available_models: string[];
  model_fetch_status: "connected" | "failed";
  model_fetch_message: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
}

const PLATFORM_LABELS: Record<string, string> = {
  generic: "Web",
  youtube: "YouTube",
  github: "GitHub",
  reddit: "Reddit",
  twitter: "Twitter",
  hackernews: "Hacker News",
  stackoverflow: "Stack Overflow",
  wikipedia: "Wikipedia",
  arxiv: "arXiv",
  medium: "Medium",
  substack: "Substack",
  mastodon: "Mastodon",
  bluesky: "Bluesky",
  instagram: "Instagram",
  tiktok: "TikTok",
  spotify: "Spotify",
  goodreads: "Goodreads",
};

const TYPE_LABELS: Record<string, string> = {
  url: "Link",
  note: "Note",
  image: "Image",
  video: "Video",
  audio: "Audio",
  document: "Document",
  pdf: "PDF",
  article: "Article",
  file: "File",
};

const PROVIDER_LABELS: Record<string, string> = {
  ollama: "Ollama",
  groq: "Groq",
  nvidia: "NVIDIA",
  custom: "Custom",
};

const CHAT_MODEL_STORAGE_PREFIX = "search-chat-model:";

type SearchMode = "fulltext" | "semantic" | "hybrid";

function formatPlatformLabel(raw: string | undefined | null): string {
  if (!raw) return "";
  const cleaned = raw.replace(/^SourcePlatform\./, "");
  return PLATFORM_LABELS[cleaned] ?? cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function formatTypeLabel(raw: string | undefined | null): string {
  if (!raw) return "";
  return TYPE_LABELS[raw] ?? raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default function Search() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<SearchMode>("fulltext");
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [selectedChatModel, setSelectedChatModel] = useState("");
  const chatboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (location.hash !== "#chatbox") return;
    requestAnimationFrame(() => {
      chatboxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [location.hash]);

  const { data: filters } = useQuery<SearchFilters>({
    queryKey: ["search-filters"],
    queryFn: () => api.get("/api/v1/search/filters"),
  });

  const { data: chatConfig } = useQuery<ChatConfigResponse>({
    queryKey: ["chat-config"],
    queryFn: () => api.get("/api/v1/ai/chat-config"),
  });

  useEffect(() => {
    if (!chatConfig) return;

    const storageKey = `${CHAT_MODEL_STORAGE_PREFIX}${chatConfig.provider}`;
    const savedModel = window.localStorage.getItem(storageKey);

    setSelectedChatModel((current) => {
      if (current && chatConfig.available_models.includes(current)) {
        return current;
      }

      if (savedModel && chatConfig.available_models.includes(savedModel)) {
        return savedModel;
      }

      return chatConfig.active_model || chatConfig.available_models[0] || "";
    });
  }, [chatConfig]);

  useEffect(() => {
    if (!chatConfig || !selectedChatModel) return;
    window.localStorage.setItem(`${CHAT_MODEL_STORAGE_PREFIX}${chatConfig.provider}`, selectedChatModel);
  }, [chatConfig, selectedChatModel]);

  // Build filter params
  const filterParams = new URLSearchParams();
  if (selectedPlatform) filterParams.set("source_platform", selectedPlatform);
  if (selectedType) filterParams.set("item_type", selectedType);
  if (selectedTag) filterParams.set("tag", selectedTag);
  if (showFavorites) filterParams.set("is_favorite", "true");
  if (showArchived) filterParams.set("is_archived", "true");
  const filterStr = filterParams.toString() ? `&${filterParams.toString()}` : "";

  // Unified search (items + notes) — default mode
  const unifiedUrl = query.length >= 2
    ? `/api/v1/search/unified?q=${encodeURIComponent(query)}${filterStr}`
    : null;

  const { data: unifiedResults, isLoading: unifiedLoading, isFetching: unifiedFetching } =
    useQuery<UnifiedResult>({
      queryKey: ["search-unified", query, selectedPlatform, selectedType, selectedTag, showFavorites, showArchived],
      queryFn: () => api.get(unifiedUrl!),
      enabled: mode === "fulltext" && query.length >= 2,
    });

  // Semantic search
  const semanticUrl = query.length >= 2
    ? `/api/v1/search/semantic?q=${encodeURIComponent(query)}${filterStr}`
    : null;

  const { data: semanticResults, isLoading: semanticLoading, isFetching: semanticFetching } =
    useQuery<Item[]>({
      queryKey: ["search-semantic", query, selectedPlatform, selectedType],
      queryFn: () => api.get(semanticUrl!),
      enabled: mode === "semantic" && query.length >= 2,
    });

  // Hybrid search
  const hybridUrl = query.length >= 2
    ? `/api/v1/search/hybrid?q=${encodeURIComponent(query)}${filterStr}`
    : null;

  const { data: hybridResults, isLoading: hybridLoading, isFetching: hybridFetching } =
    useQuery<Item[]>({
      queryKey: ["search-hybrid", query, selectedPlatform, selectedType],
      queryFn: () => api.get(hybridUrl!),
      enabled: mode === "hybrid" && query.length >= 2,
    });

  const items = mode === "fulltext"
    ? (unifiedResults?.items ?? [])
    : mode === "semantic"
    ? (semanticResults ?? [])
    : (hybridResults ?? []);

  const notes = mode === "fulltext" ? (unifiedResults?.notes ?? []) : [];
  const isLoading = mode === "fulltext" ? unifiedLoading : mode === "semantic" ? semanticLoading : hybridLoading;
  const isFetching = mode === "fulltext" ? unifiedFetching : mode === "semantic" ? semanticFetching : hybridFetching;
  const totalResults = items.length + notes.length;
  const showSkeleton = (isLoading || isFetching) && query.length >= 2;

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(input);
      if (input) {
        setSearchParams({ q: input });
      } else {
        setSearchParams({});
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [input, setSearchParams]);

  const modes: { key: SearchMode; label: string; icon: typeof AlignLeft; desc: string }[] = [
    { key: "fulltext", label: "Full-text", icon: AlignLeft, desc: "Keyword search with fuzzy fallback" },
    { key: "hybrid", label: "Hybrid", icon: Zap, desc: "Keyword + AI semantic combined" },
    { key: "semantic", label: "Semantic", icon: Sparkles, desc: "AI meaning-based search" },
  ];

  const handleAskChat = async () => {
    const message = chatInput.trim();
    if (!message || chatLoading) return;

    setChatError(null);
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: message }]);
    setChatLoading(true);

    try {
      const response = await api.post<ChatResponse>("/api/v1/ai/chat-search", {
        message,
        model: selectedChatModel || null,
        limit: 6,
        item_type: selectedType,
        source_platform: selectedPlatform,
        is_favorite: showFavorites ? true : null,
        is_archived: showArchived ? true : null,
        tag: selectedTag,
      });

      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.answer,
          sources: response.sources,
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to get AI response";
      setChatError(message);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I could not answer right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="animate-fade-in p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <SearchIcon className="h-6 w-6 text-sky-600" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Search
        </h1>
      </div>

      <div ref={chatboxRef} className="mb-6 rounded-2xl border border-sky-100 dark:border-sky-900/40 bg-gradient-to-br from-sky-50 to-cyan-50 dark:from-gray-900 dark:to-gray-950 p-4 sm:p-5">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-sky-600" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">AI Chatbox</h2>
            <span className="text-xs text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-950/70 px-2 py-0.5 rounded-full">
              Fast answer from your saved knowledge
            </span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="inline-flex items-center rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-sky-100 dark:bg-gray-900/70 dark:text-gray-200 dark:ring-gray-800">
              Provider: {PROVIDER_LABELS[chatConfig?.provider ?? ""] ?? (chatConfig?.provider || "Unknown")}
            </span>
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <span>Model</span>
              <select
                value={selectedChatModel}
                onChange={(e) => setSelectedChatModel(e.target.value)}
                disabled={!chatConfig || chatConfig.available_models.length <= 1 || chatLoading}
                className="min-w-0 rounded-lg border border-sky-100 bg-white px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
              >
                {(chatConfig?.available_models.length ? chatConfig.available_models : [chatConfig?.active_model || "Default model"])
                  .filter(Boolean)
                  .map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
              </select>
            </label>
            {chatConfig && (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                  chatConfig.model_fetch_status === "connected"
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900"
                    : "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900"
                }`}
                title={chatConfig.model_fetch_message ?? undefined}
              >
                {chatConfig.model_fetch_status === "connected" ? "Connected" : "Failed to fetch models"}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-sky-100 dark:border-gray-800 bg-white/90 dark:bg-gray-900/80 p-3 mb-3 max-h-72 overflow-y-auto space-y-3">
          {chatMessages.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Ask anything about your saved links and notes. The AI will answer with evidence from matched items.
            </p>
          ) : (
            chatMessages.map((msg, idx) => (
              <div key={`${msg.role}-${idx}`} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-sky-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                  }`}
                >
                  {msg.content}
                  {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-1">
                      <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Sources</p>
                      {msg.sources.slice(0, 3).map((source) => (
                        <Link
                          key={source.item_id}
                          to={`/item/${source.item_id}`}
                          className="block text-xs underline text-sky-700 dark:text-sky-300 hover:text-sky-800 dark:hover:text-sky-200"
                        >
                          {source.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAskChat();
              }
            }}
            placeholder="Ask AI to find insights from your SaveMark..."
            className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-600"
          />
          <button
            onClick={() => void handleAskChat()}
            disabled={chatLoading || !chatInput.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
            Ask
          </button>
        </div>

        {chatError && <p className="mt-2 text-xs text-red-500">{chatError}</p>}
        {!chatError && chatConfig && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Chat will use <span className="font-medium text-gray-700 dark:text-gray-200">{selectedChatModel || chatConfig.active_model}</span> on {PROVIDER_LABELS[chatConfig.provider] ?? chatConfig.provider}.
          </p>
        )}
        {!chatError && chatConfig?.model_fetch_status === "failed" && chatConfig.model_fetch_message && (
          <p className="mt-1 text-xs text-rose-500 dark:text-rose-300">{chatConfig.model_fetch_message}</p>
        )}
      </div>

      <div className="relative mb-4">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search your knowledge base... (try tag:ml is:favorite after:2024-01)"
          autoFocus
          className="w-full pl-12 pr-12 py-3.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-600 transition-all duration-200 shadow-sm"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {showSkeleton && <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />}
          <button
            type="button"
            onClick={() => chatboxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            title="Open AI Chatbox"
            className="p-1.5 rounded-lg text-gray-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search mode toggle */}
      <div className="flex items-center gap-2 mb-4">
        {modes.map(({ key, label, icon: Icon, desc }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            title={desc}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer ${
              mode === key
                ? "bg-sky-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:shadow-sm"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Quick filter toggles */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setShowFavorites(!showFavorites)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
            showFavorites
              ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-700"
              : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
          }`}
        >
          <Star className="h-3 w-3" />
          Favorites
        </button>
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
            showArchived
              ? "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 ring-1 ring-slate-400"
              : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
          }`}
        >
          <Archive className="h-3 w-3" />
          Archived
        </button>
      </div>

      {/* Platform + Type + Tag filter chips */}
      {(filters?.platforms?.length || filters?.types?.length || filters?.tags?.length) ? (
        <div className="flex flex-wrap gap-2 mb-6">
          {filters?.platforms?.map((p) => (
            <button
              key={p.name}
              onClick={() => setSelectedPlatform(selectedPlatform === p.name ? null : p.name)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer ${
                selectedPlatform === p.name
                  ? "bg-sky-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:shadow-sm"
              }`}
            >
              {formatPlatformLabel(p.name)} ({p.count})
            </button>
          ))}
          {filters?.types?.map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(selectedType === type ? null : type)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer ${
                selectedType === type
                  ? "bg-violet-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:shadow-sm"
              }`}
            >
              {formatTypeLabel(type)}
            </button>
          ))}
          {filters?.tags?.slice(0, 15).map((t) => (
            <button
              key={t.slug}
              onClick={() => setSelectedTag(selectedTag === t.slug ? null : t.slug)}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer ${
                selectedTag === t.slug
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:shadow-sm"
              }`}
            >
              <Tag className="h-3 w-3" />
              {t.name} ({t.count})
            </button>
          ))}
        </div>
      ) : null}

      {!query || query.length < 2 ? (
        <div className="text-center py-16 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <SearchIcon className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-700 dark:text-gray-300 text-lg font-medium mb-1">
            Search your knowledge base
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 max-w-md mx-auto">
            Type at least 2 characters. Try URLs, keywords, or filters like{" "}
            <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-xs">tag:ml</code>{" "}
            <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-xs">is:favorite</code>{" "}
            <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-xs">after:2024-01</code>
          </p>
        </div>
      ) : showSkeleton && totalResults === 0 ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              <div className="w-16 h-16 rounded-xl animate-pulse bg-gray-100 dark:bg-gray-800 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
                <div className="h-4 w-3/4 animate-pulse bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-3 w-1/2 animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : totalResults === 0 && !isLoading ? (
        <div className="text-center py-16 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <SearchIcon className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-700 dark:text-gray-300 text-lg font-medium mb-1">
            No results for &ldquo;{query}&rdquo;
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {mode === "fulltext"
              ? "Try different keywords, a URL, or switch to Hybrid/Semantic search"
              : "Try different keywords or switch to Full-text search"}
          </p>
        </div>
      ) : (
        <div>
          {totalResults > 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {totalResults} result{totalResults !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
              {mode === "hybrid" && <span className="ml-1 text-xs text-sky-500">(keyword + semantic fusion)</span>}
            </p>
          )}

          {/* Note results */}
          {notes.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <StickyNote className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Notes ({notes.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {notes.map((note) => (
                  <NoteCard key={note.id} note={note} />
                ))}
              </div>
            </div>
          )}

          {/* Item results */}
          {items.length > 0 && (
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <div key={item.id}>
                  <BookmarkCard item={item} variant="list" />
                  {item.content_snippet && (
                    <p
                      className="mt-1 ml-2 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 [&_mark]:bg-yellow-200 [&_mark]:dark:bg-yellow-800 [&_mark]:rounded-sm [&_mark]:px-0.5"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.content_snippet, { ALLOWED_TAGS: ["mark"] }) }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
