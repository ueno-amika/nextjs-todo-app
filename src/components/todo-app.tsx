"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  addTodo,
  clearDone,
  deleteTodo,
  getServerSnapshot,
  getSnapshot,
  setDue,
  subscribe,
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
  overdue:
    "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  today:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  future:
    "border-black/10 bg-black/[0.03] text-black/60 dark:border-white/15 dark:bg-white/5 dark:text-white/60",
  done: "border-black/10 bg-transparent text-black/35 dark:border-white/10 dark:text-white/35",
};

/** サーバー／ハイドレーション中は false、マウント後に true になる（スケルトン表示用） */
function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export default function TodoApp() {
  const todos = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useHydrated();

  const [input, setInput] = useState("");
  const [dueInput, setDueInput] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = useMemo(() => todos.filter((t) => !t.done).length, [todos]);
  const doneCount = todos.length - remaining;

  const visibleTodos = useMemo(() => {
    switch (filter) {
      case "active":
        return todos.filter((t) => !t.done);
      case "done":
        return todos.filter((t) => t.done);
      default:
        return todos;
    }
  }, [todos, filter]);

  function handleAdd() {
    const text = input.trim();
    if (!text) return; // 空文字は追加しない（バリデーション）
    addTodo(text, dueInput || undefined);
    setInput("");
    setDueInput("");
    inputRef.current?.focus();
  }

  const canAdd = input.trim().length > 0;

  return (
    <div className="w-full max-w-xl">
      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.03] sm:p-8">
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
              : " "}
          </p>
        </div>

        {/* 入力フォーム */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="やることを入力…"
            aria-label="新しいタスク"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-black/15 bg-transparent px-4 py-3 text-base outline-none transition placeholder:text-black/40 focus:border-black/40 focus:ring-2 focus:ring-black/10 dark:border-white/20 dark:placeholder:text-white/35 dark:focus:border-white/50 dark:focus:ring-white/10"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={dueInput}
              onChange={(e) => setDueInput(e.target.value)}
              aria-label="期限（任意）"
              className="min-w-0 flex-1 rounded-xl border border-black/15 bg-transparent px-3 py-3 text-base outline-none transition focus:border-black/40 focus:ring-2 focus:ring-black/10 dark:border-white/20 dark:focus:border-white/50 dark:focus:ring-white/10 dark:[color-scheme:dark] sm:w-[9.5rem] sm:flex-none"
            />
            <button
              type="submit"
              disabled={!canAdd}
              className="shrink-0 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
            >
              追加
            </button>
          </div>
        </form>

        {/* フィルター */}
        {hydrated && todos.length > 0 && (
          <div
            className="mt-5 flex items-center gap-1"
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
                  : filter === "active"
                    ? "未完了のタスクはありません 🎉"
                    : "完了したタスクはまだありません"}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {visibleTodos.map((todo) => (
                <li
                  key={todo.id}
                  className="group flex items-start gap-3 rounded-xl border border-black/10 px-3 py-3 transition hover:border-black/20 dark:border-white/10 dark:hover:border-white/25"
                >
                  {/* 完了トグル */}
                  <input
                    id={`cb-${todo.id}`}
                    type="checkbox"
                    checked={todo.done}
                    onChange={() => toggleTodo(todo.id)}
                    className="mt-0.5 size-5 shrink-0 cursor-pointer accent-foreground"
                    aria-label={`「${todo.text}」を${
                      todo.done ? "未完了に戻す" : "完了にする"
                    }`}
                  />

                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={`cb-${todo.id}`}
                      className={`block cursor-pointer break-words text-base transition ${
                        todo.done
                          ? "text-black/40 line-through dark:text-white/40"
                          : ""
                      }`}
                    >
                      {todo.text}
                    </label>

                    {/* 期限バッジ（クリックで変更、× で解除） */}
                    <div className="mt-1.5 flex items-center gap-1">
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
                                <rect x="3" y="4" width="18" height="18" rx="2" />
                                <path d="M16 2v4M8 2v4M3 10h18" />
                              </svg>
                              {info ? info.label : "期限を設定"}
                            </span>
                            <input
                              type="date"
                              value={todo.due ?? ""}
                              onChange={(e) => setDue(todo.id, e.target.value)}
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
                    </div>
                  </div>

                  {/* 削除 */}
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    aria-label={`「${todo.text}」を削除`}
                    className="shrink-0 rounded-lg p-2 text-black/40 opacity-100 transition hover:bg-red-500/10 hover:text-red-600 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500/40 sm:opacity-0 sm:group-hover:opacity-100 dark:text-white/40 dark:hover:text-red-400"
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
                </li>
              ))}
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
