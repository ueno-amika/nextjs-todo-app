/**
 * localStorage を「外部ストア」として扱う ToDo ストア。
 * React の useSyncExternalStore と組み合わせることで、
 * - サーバー／ハイドレーション時は空配列（不一致エラーなし）
 * - クライアントでは保存済みデータ
 * を安全に表示できる。
 */

export type Todo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  /** 期限（YYYY-MM-DD）。未設定なら undefined */
  due?: string;
};

const STORAGE_KEY = "todos.v1";

/** サーバー用の不変スナップショット（毎回同じ参照を返す） */
const SERVER_SNAPSHOT: Todo[] = [];

let todos: Todo[] = [];
let initialized = false;
const listeners = new Set<() => void>();

function readFromStorage(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is Todo =>
        t &&
        typeof t.id === "string" &&
        typeof t.text === "string" &&
        typeof t.done === "boolean"
    );
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // 保存領域が使えない場合は静かに無視する
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function ensureInitialized() {
  if (!initialized && typeof window !== "undefined") {
    todos = readFromStorage();
    initialized = true;
  }
}

/** useSyncExternalStore 用: 購読 */
export function subscribe(listener: () => void): () => void {
  ensureInitialized();
  listeners.add(listener);

  // 別タブでの変更にも追従する
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      todos = readFromStorage();
      emit();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** useSyncExternalStore 用: クライアントのスナップショット */
export function getSnapshot(): Todo[] {
  ensureInitialized();
  return todos;
}

/** useSyncExternalStore 用: サーバーのスナップショット */
export function getServerSnapshot(): Todo[] {
  return SERVER_SNAPSHOT;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function addTodo(text: string, due?: string) {
  const trimmed = text.trim();
  if (!trimmed) return; // 空文字は追加しない
  todos = [
    {
      id: newId(),
      text: trimmed,
      done: false,
      createdAt: Date.now(),
      due: due || undefined,
    },
    ...todos,
  ];
  persist();
  emit();
}

/** タスクの本文を編集する（空文字なら変更しない） */
export function editTodo(id: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  todos = todos.map((t) => (t.id === id ? { ...t, text: trimmed } : t));
  persist();
  emit();
}

/** タスクの期限を更新（空文字で期限を外す） */
export function setDue(id: string, due: string) {
  todos = todos.map((t) =>
    t.id === id ? { ...t, due: due || undefined } : t
  );
  persist();
  emit();
}

export function toggleTodo(id: string) {
  todos = todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  persist();
  emit();
}

export function deleteTodo(id: string) {
  todos = todos.filter((t) => t.id !== id);
  persist();
  emit();
}

export function clearDone() {
  todos = todos.filter((t) => !t.done);
  persist();
  emit();
}
