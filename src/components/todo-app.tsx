"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  addSubtask,
  addTodo,
  clearDone,
  deleteSubtask,
  deleteTodo,
  editTodo,
  getServerSnapshot,
  getSnapshot,
  setDue,
  setTags,
  subscribe,
  toggleSubtask,
  toggleTodo,
} from "@/lib/todo-store";

/** 表示フィルター */
type Filter = "all" | "active" | "done";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "active", label: "未完了" },
  { value: "done", label: "完了" },
];

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** ローカルの今日を YYYY-MM-DD で返す */
function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 「8/5(火)」の形式に整形 */
function formatDue(due: string): string {
  const d = new Date(`${due}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

type DueTone = "overdue" | "today" | "future" | "done";

/** 期限の状態（色分け用）とラベルを求める */
function dueInfo(due: string, done: boolean): { tone: DueTone; label: string } {
  const today = todayStr();
  const base = formatDue(due);
  if (done) return { tone: "done", label: base };
  if (due < today) return { tone: "overdue", label: `${base}・期限切れ` };
  if (due === today) return { tone: "today", label: `${base}・今日` };
  return { tone: "future", label: base };
}

const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  today:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  future:
    "border-black/10 bg-black/[0.03] text-black/60 dark:border-white/15 dark:bg-white/5 dark:text-white/60",
  done: "border-black/10 bg-transparent text-black/35 dark:border-white/10 dark:text-white/35",
};

/** 「仕事, 私用」→ ["仕事","私用"]（トリム・空削除・重複排除） */
function parseTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  );
}

/** サーバー／ハイドレーション中は false、マウント後に true になる（スケルトン表示用） */
function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export default function TodoApp() {
  const todos = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useHydrated();

  const [input, setInput] = useState("");
  const [dueInput, setDueInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // 検索キーワード
  const [query, setQuery] = useState("");
  // 絞り込み中のタグ（null = 絞り込みなし）
  const [activeTag, setActiveTag] = useState<string | null>(null);
  // 編集中のタスクID（null = 編集していない）と、その編集テキスト／タグ
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editTags, setEditTags] = useState("");
  // サブタスクを展開中のタスクID 集合と、追加用の下書き
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [subDrafts, setSubDrafts] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = useMemo(() => todos.filter((t) => !t.done).length, [todos]);
  const doneCount = todos.length - remaining;

  // 既存タスクに付いている全タグ（重複なし）
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const t of todos) for (const tag of t.tags ?? []) set.add(tag);
    return Array.from(set);
  }, [todos]);

  const visibleTodos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return todos.filter((t) => {
      // ステータス
      if (filter === "active" && t.done) return false;
      if (filter === "done" && !t.done) return false;
      // タグ絞り込み
      if (activeTag && !(t.tags ?? []).includes(activeTag)) return false;
      // キーワード（本文・タグ・サブタスクを横断）
      if (q) {
        const hit =
          t.text.toLowerCase().includes(q) ||
          (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q)) ||
          (t.subtasks ?? []).some((s) => s.text.toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [todos, filter, activeTag, query]);

  function handleAdd() {
    const text = input.trim();
    if (!text) return; // 空文字は追加しない（バリデーション）
    addTodo(text, dueInput || undefined, parseTags(tagInput));
    setInput("");
    setDueInput("");
    setTagInput("");
    inputRef.current?.focus();
  }

  const canAdd = input.trim().length > 0;

  function startEdit(id: string, text: string, tags?: string[]) {
    setEditingId(id);
    setEditText(text);
    setEditTags((tags ?? []).join(", "));
  }

  function saveEdit() {
    if (editingId) {
      editTodo(editingId, editText);
      setTags(editingId, parseTags(editTags));
    }
    setEditingId(null);
    setEditText("");
    setEditTags("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
    setEditTags("");
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAddSubtask(id: string) {
    const text = (subDrafts[id] ?? "").trim();
    if (!text) return;
    addSubtask(id, text);
    setSubDrafts((d) => ({ ...d, [id]: "" }));
  }

  return (
    <div className="w-full max-w-xl">
      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm sm:p-8 dark:border-white/10 dark:bg-white/[0.03]">
        {/* 見出し */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            ToDo リスト
          </h1>
          <p
            className="mt-1 text-sm text-black/55 dark:text-white/55"
            aria-live="polite"
          >
            {hydrated
              ? todos.length === 0
                ? "タスクはまだありません"
                : `未完了 ${remaining} 件 / 全 ${todos.length} 件`
              : " "}
          </p>
        </div>

        {/* 入力フォーム */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
          className="flex flex-col gap-2"
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="やることを入力…"
              aria-label="新しいタスク"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-xl border border-black/15 bg-transparent px-4 py-3 text-base transition outline-none placeholder:text-black/40 focus:border-black/40 focus:ring-2 focus:ring-black/10 dark:border-white/20 dark:placeholder:text-white/35 dark:focus:border-white/50 dark:focus:ring-white/10"
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={dueInput}
                onChange={(e) => setDueInput(e.target.value)}
                aria-label="期限（任意）"
                className="min-w-0 flex-1 rounded-xl border border-black/15 bg-transparent px-3 py-3 text-base transition outline-none focus:border-black/40 focus:ring-2 focus:ring-black/10 sm:w-[9.5rem] sm:flex-none dark:border-white/20 dark:[color-scheme:dark] dark:focus:border-white/50 dark:focus:ring-white/10"
              />
              <button
                type="submit"
                disabled={!canAdd}
                className="bg-foreground text-background shrink-0 rounded-xl px-5 py-3 text-sm font-semibold transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
              >
                追加
              </button>
            </div>
          </div>
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="タグ（カンマ区切り・任意） 例: 仕事, 買い物"
            aria-label="タグ（任意・カンマ区切り）"
            autoComplete="off"
            className="min-w-0 rounded-xl border border-black/15 bg-transparent px-4 py-2.5 text-sm transition outline-none placeholder:text-black/40 focus:border-black/40 focus:ring-2 focus:ring-black/10 dark:border-white/20 dark:placeholder:text-white/35 dark:focus:border-white/50 dark:focus:ring-white/10"
          />
        </form>

        {/* 検索 */}
        {hydrated && todos.length > 0 && (
          <div className="relative mt-5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-black/35 dark:text-white/35"
              aria-hidden
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="タスク・タグ・サブタスクを検索…"
              aria-label="タスクを検索"
              className="w-full rounded-xl border border-black/15 bg-transparent py-2.5 pr-3 pl-9 text-sm transition outline-none placeholder:text-black/40 focus:border-black/40 focus:ring-2 focus:ring-black/10 dark:border-white/20 dark:placeholder:text-white/35 dark:focus:border-white/50 dark:focus:ring-white/10"
            />
          </div>
        )}

        {/* タグ絞り込み */}
        {hydrated && allTags.length > 0 && (
          <div
            className="mt-3 flex flex-wrap items-center gap-1.5"
            aria-label="タグで絞り込み"
          >
            <button
              onClick={() => setActiveTag(null)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activeTag === null
                  ? "bg-foreground text-background"
                  : "border border-black/10 text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/10"
              }`}
            >
              すべてのタグ
            </button>
            {allTags.map((tag) => {
              const active = activeTag === tag;
              return (
                <button
                  key={tag}
                  onClick={() => setActiveTag(active ? null : tag)}
                  aria-pressed={active}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    active
                      ? "bg-indigo-600 text-white"
                      : "border border-indigo-500/25 bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300"
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        )}

        {/* フィルター */}
        {hydrated && todos.length > 0 && (
          <div
            className="mt-4 flex items-center gap-1"
            role="tablist"
            aria-label="フィルター"
          >
            {FILTERS.map((f) => {
              const active = filter === f.value;
              return (
                <button
                  key={f.value}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f.value)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-foreground text-background"
                      : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        )}

        {/* リスト本体 */}
        <div className="mt-4">
          {!hydrated ? (
            // 読み込み中のスケルトン（レイアウトのガタつき防止）
            <ul className="space-y-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className="h-[52px] animate-pulse rounded-xl bg-black/5 dark:bg-white/5"
                />
              ))}
            </ul>
          ) : visibleTodos.length === 0 ? (
            // 空状態（何をすればいいか分かるメッセージ）
            <div className="rounded-2xl border border-dashed border-black/15 px-6 py-12 text-center dark:border-white/15">
              <p className="text-sm text-black/55 dark:text-white/55">
                {todos.length === 0
                  ? "上の入力欄から最初のタスクを追加しましょう ✏️"
                  : query.trim() || activeTag
                    ? "条件に一致するタスクはありません 🔍"
                    : filter === "active"
                      ? "未完了のタスクはありません 🎉"
                      : "完了したタスクはまだありません"}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {visibleTodos.map((todo) => {
                const subs = todo.subtasks ?? [];
                const subDone = subs.filter((s) => s.done).length;
                const isOpen = expanded.has(todo.id);
                return (
                  <li
                    key={todo.id}
                    className="group rounded-xl border border-black/10 px-3 py-3 transition hover:border-black/20 dark:border-white/10 dark:hover:border-white/25"
                  >
                    <div className="flex items-start gap-3">
                      {/* 完了トグル */}
                      <input
                        id={`cb-${todo.id}`}
                        type="checkbox"
                        checked={todo.done}
                        onChange={() => toggleTodo(todo.id)}
                        className="accent-foreground mt-0.5 size-5 shrink-0 cursor-pointer"
                        aria-label={`「${todo.text}」を${
                          todo.done ? "未完了に戻す" : "完了にする"
                        }`}
                      />

                      <div className="min-w-0 flex-1">
                        {editingId === todo.id ? (
                          <div className="flex flex-col gap-1.5">
                            <input
                              autoFocus
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit();
                                if (e.key === "Escape") cancelEdit();
                              }}
                              aria-label="タスクを編集"
                              className="w-full rounded-lg border border-black/30 bg-transparent px-2 py-1 text-base outline-none focus:border-black/50 focus:ring-2 focus:ring-black/10 dark:border-white/40 dark:focus:border-white/60 dark:focus:ring-white/10"
                            />
                            <input
                              value={editTags}
                              onChange={(e) => setEditTags(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit();
                                if (e.key === "Escape") cancelEdit();
                              }}
                              placeholder="タグ（カンマ区切り）"
                              aria-label="タグを編集"
                              className="w-full rounded-lg border border-black/20 bg-transparent px-2 py-1 text-sm outline-none focus:border-black/50 focus:ring-2 focus:ring-black/10 dark:border-white/30 dark:focus:border-white/60 dark:focus:ring-white/10"
                            />
                          </div>
                        ) : (
                          <label
                            htmlFor={`cb-${todo.id}`}
                            onDoubleClick={() =>
                              startEdit(todo.id, todo.text, todo.tags)
                            }
                            className={`block cursor-pointer text-base break-words transition ${
                              todo.done
                                ? "text-black/40 line-through dark:text-white/40"
                                : ""
                            }`}
                          >
                            {todo.text}
                          </label>
                        )}

                        {/* メタ情報：タグ・期限・サブタスク */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {/* タグチップ（クリックで絞り込み） */}
                          {(todo.tags ?? []).map((tag) => (
                            <button
                              key={tag}
                              onClick={() =>
                                setActiveTag(activeTag === tag ? null : tag)
                              }
                              className="inline-flex items-center rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-500/20 dark:text-indigo-300"
                            >
                              #{tag}
                            </button>
                          ))}

                          {/* 期限バッジ（クリックで変更、× で解除） */}
                          {(() => {
                            const info = todo.due
                              ? dueInfo(todo.due, todo.done)
                              : null;
                            return (
                              <span className="relative inline-flex items-center">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
                                    info
                                      ? DUE_TONE_CLASS[info.tone]
                                      : "border-dashed border-black/20 text-black/40 dark:border-white/25 dark:text-white/40"
                                  }`}
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="size-3.5"
                                    aria-hidden
                                  >
                                    <rect
                                      x="3"
                                      y="4"
                                      width="18"
                                      height="18"
                                      rx="2"
                                    />
                                    <path d="M16 2v4M8 2v4M3 10h18" />
                                  </svg>
                                  {info ? info.label : "期限を設定"}
                                </span>
                                <input
                                  type="date"
                                  value={todo.due ?? ""}
                                  onChange={(e) =>
                                    setDue(todo.id, e.target.value)
                                  }
                                  aria-label={`「${todo.text}」の期限を変更`}
                                  className="absolute inset-0 cursor-pointer opacity-0"
                                />
                              </span>
                            );
                          })()}
                          {todo.due && (
                            <button
                              onClick={() => setDue(todo.id, "")}
                              aria-label={`「${todo.text}」の期限を解除`}
                              className="rounded-full p-0.5 text-black/35 transition hover:bg-black/5 hover:text-black/70 dark:text-white/35 dark:hover:bg-white/10 dark:hover:text-white/70"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="size-3.5"
                                aria-hidden
                              >
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </button>
                          )}

                          {/* サブタスク開閉トグル */}
                          <button
                            onClick={() => toggleExpand(todo.id)}
                            aria-expanded={isOpen}
                            className="inline-flex items-center gap-1 rounded-full border border-black/10 px-2 py-0.5 text-xs font-medium text-black/55 transition hover:bg-black/5 dark:border-white/15 dark:text-white/55 dark:hover:bg-white/10"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={`size-3.5 transition-transform ${
                                isOpen ? "rotate-90" : ""
                              }`}
                              aria-hidden
                            >
                              <path d="m9 18 6-6-6-6" />
                            </svg>
                            {subs.length > 0
                              ? `サブタスク ${subDone}/${subs.length}`
                              : "サブタスク"}
                          </button>
                        </div>
                      </div>

                      {/* 操作ボタン */}
                      {editingId === todo.id ? (
                        <div className="flex shrink-0 items-center gap-1">
                          {/* 保存 */}
                          <button
                            onClick={saveEdit}
                            aria-label="編集を保存"
                            className="rounded-lg p-2 text-green-600 transition hover:bg-green-500/10 focus-visible:ring-2 focus-visible:ring-green-500/40 dark:text-green-400"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="size-5"
                              aria-hidden
                            >
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          </button>
                          {/* キャンセル */}
                          <button
                            onClick={cancelEdit}
                            aria-label="編集をキャンセル"
                            className="rounded-lg p-2 text-black/40 transition hover:bg-black/5 hover:text-black/70 focus-visible:ring-2 focus-visible:ring-black/20 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/70"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="size-5"
                              aria-hidden
                            >
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <div className="flex shrink-0 items-center gap-0.5">
                          {/* 編集 */}
                          <button
                            onClick={() =>
                              startEdit(todo.id, todo.text, todo.tags)
                            }
                            aria-label={`「${todo.text}」を編集`}
                            className="rounded-lg p-2 text-black/40 opacity-100 transition hover:bg-black/5 hover:text-black/70 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-black/20 sm:opacity-0 sm:group-hover:opacity-100 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/70"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="size-5"
                              aria-hidden
                            >
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                          </button>
                          {/* 削除 */}
                          <button
                            onClick={() => deleteTodo(todo.id)}
                            aria-label={`「${todo.text}」を削除`}
                            className="rounded-lg p-2 text-black/40 opacity-100 transition hover:bg-red-500/10 hover:text-red-600 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500/40 sm:opacity-0 sm:group-hover:opacity-100 dark:text-white/40 dark:hover:text-red-400"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="size-5"
                              aria-hidden
                            >
                              <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
                              <path d="M10 11v6M14 11v6" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* サブタスク（チェックリスト） */}
                    {isOpen && (
                      <div className="mt-3 space-y-1.5 border-t border-black/5 pt-3 pl-8 dark:border-white/10">
                        {subs.map((s) => (
                          <div
                            key={s.id}
                            className="group/sub flex items-center gap-2"
                          >
                            <input
                              id={`sub-${s.id}`}
                              type="checkbox"
                              checked={s.done}
                              onChange={() => toggleSubtask(todo.id, s.id)}
                              className="accent-foreground size-4 shrink-0 cursor-pointer"
                              aria-label={`サブタスク「${s.text}」を${
                                s.done ? "未完了に戻す" : "完了にする"
                              }`}
                            />
                            <label
                              htmlFor={`sub-${s.id}`}
                              className={`min-w-0 flex-1 cursor-pointer text-sm break-words transition ${
                                s.done
                                  ? "text-black/40 line-through dark:text-white/40"
                                  : "text-black/75 dark:text-white/75"
                              }`}
                            >
                              {s.text}
                            </label>
                            <button
                              onClick={() => deleteSubtask(todo.id, s.id)}
                              aria-label={`サブタスク「${s.text}」を削除`}
                              className="rounded p-1 text-black/35 opacity-100 transition hover:bg-red-500/10 hover:text-red-600 sm:opacity-0 sm:group-hover/sub:opacity-100 dark:text-white/35 dark:hover:text-red-400"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="size-3.5"
                                aria-hidden
                              >
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleAddSubtask(todo.id);
                          }}
                          className="flex items-center gap-2 pt-0.5"
                        >
                          <input
                            value={subDrafts[todo.id] ?? ""}
                            onChange={(e) =>
                              setSubDrafts((d) => ({
                                ...d,
                                [todo.id]: e.target.value,
                              }))
                            }
                            placeholder="サブタスクを追加…"
                            aria-label="サブタスクを追加"
                            autoComplete="off"
                            className="min-w-0 flex-1 rounded-lg border border-black/15 bg-transparent px-2.5 py-1.5 text-sm transition outline-none placeholder:text-black/35 focus:border-black/40 focus:ring-2 focus:ring-black/10 dark:border-white/20 dark:placeholder:text-white/30 dark:focus:border-white/50 dark:focus:ring-white/10"
                          />
                          <button
                            type="submit"
                            disabled={!(subDrafts[todo.id] ?? "").trim()}
                            className="shrink-0 rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10"
                          >
                            追加
                          </button>
                        </form>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* フッター操作 */}
        {hydrated && doneCount > 0 && (
          <div className="mt-5 flex justify-end border-t border-black/5 pt-4 dark:border-white/10">
            <button
              onClick={clearDone}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-black/55 transition hover:bg-black/5 hover:text-black/80 dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white/80"
            >
              完了済みを削除（{doneCount}）
            </button>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-black/40 dark:text-white/35">
        データはこのブラウザに保存されます（閉じても残ります）
      </p>
    </div>
  );
}
