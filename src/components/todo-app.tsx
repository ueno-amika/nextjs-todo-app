"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  addTodo,
  clearDone,
  deleteTodo,
  getServerSnapshot,
  getSnapshot,
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
    addTodo(text);
    setInput("");
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
          className="flex gap-2"
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
          <button
            type="submit"
            disabled={!canAdd}
            className="shrink-0 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            追加
          </button>
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
                  className="group flex items-center gap-3 rounded-xl border border-black/10 px-3 py-3 transition hover:border-black/20 dark:border-white/10 dark:hover:border-white/25"
                >
                  {/* 完了トグル */}
                  <label className="flex flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={todo.done}
                      onChange={() => toggleTodo(todo.id)}
                      className="size-5 shrink-0 cursor-pointer accent-foreground"
                      aria-label={`「${todo.text}」を${
                        todo.done ? "未完了に戻す" : "完了にする"
                      }`}
                    />
                    <span
                      className={`min-w-0 break-words text-base transition ${
                        todo.done
                          ? "text-black/40 line-through dark:text-white/40"
                          : ""
                      }`}
                    >
                      {todo.text}
                    </span>
                  </label>

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
