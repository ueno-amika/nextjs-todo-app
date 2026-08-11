/**
 * localStorage を「外部ストア」として扱う ToDo ストア。
 * React の useSyncExternalStore と組み合わせることで、
 * - サーバー／ハイドレーション時は空配列（不一致エラーなし）
 * - クライアントでは保存済みデータ
 * を安全に表示できる。
 */

/** タスク内の小項目（チェックリスト） */
export type SubTask = {
  id: string;
  text: string;
  done: boolean;
};

export type Todo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  /** 期限（YYYY-MM-DD）。未設定なら undefined */
  due?: string;
  /** カテゴリ／タグ（未設定なら undefined） */
  tags?: string[];
  /** サブタスク（未設定なら undefined） */
  subtasks?: SubTask[];
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
    return parsed
      .filter(
        (t): t is Todo =>
          t &&
          typeof t.id === "string" &&
          typeof t.text === "string" &&
          typeof t.done === "boolean",
      )
      .map((t) => ({
        ...t,
        // 壊れたデータを避けるため配列だけ通す
        tags: Array.isArray(t.tags)
          ? t.tags.filter((x: unknown) => typeof x === "string")
          : undefined,
        subtasks: Array.isArray(t.subtasks)
          ? t.subtasks.filter(
              (s: unknown): s is SubTask =>
                !!s &&
                typeof (s as SubTask).id === "string" &&
                typeof (s as SubTask).text === "string" &&
                typeof (s as SubTask).done === "boolean",
            )
          : undefined,
      }));
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

/** タグを整形（トリム・空削除・重複排除）。空なら undefined */
function normalizeTags(tags?: string[]): string[] | undefined {
  if (!tags) return undefined;
  const cleaned = Array.from(
    new Set(tags.map((t) => t.trim()).filter(Boolean)),
  );
  return cleaned.length > 0 ? cleaned : undefined;
}

export function addTodo(text: string, due?: string, tags?: string[]) {
  const trimmed = text.trim();
  if (!trimmed) return; // 空文字は追加しない
  todos = [
    {
      id: newId(),
      text: trimmed,
      done: false,
      createdAt: Date.now(),
      due: due || undefined,
      tags: normalizeTags(tags),
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
  todos = todos.map((t) => (t.id === id ? { ...t, due: due || undefined } : t));
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

/** タスクのタグを丸ごと更新（空なら未設定にする） */
export function setTags(id: string, tags: string[]) {
  todos = todos.map((t) =>
    t.id === id ? { ...t, tags: normalizeTags(tags) } : t,
  );
  persist();
  emit();
}

/** サブタスクを追加（空文字は無視） */
export function addSubtask(id: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  todos = todos.map((t) =>
    t.id === id
      ? {
          ...t,
          subtasks: [
            ...(t.subtasks ?? []),
            { id: newId(), text: trimmed, done: false },
          ],
        }
      : t,
  );
  persist();
  emit();
}

/** サブタスクの完了状態を切り替える */
export function toggleSubtask(id: string, subId: string) {
  todos = todos.map((t) =>
    t.id === id
      ? {
          ...t,
          subtasks: (t.subtasks ?? []).map((s) =>
            s.id === subId ? { ...s, done: !s.done } : s,
          ),
        }
      : t,
  );
  persist();
  emit();
}

/** サブタスクを削除（空になったら未設定にする） */
export function deleteSubtask(id: string, subId: string) {
  todos = todos.map((t) => {
    if (t.id !== id) return t;
    const rest = (t.subtasks ?? []).filter((s) => s.id !== subId);
    return { ...t, subtasks: rest.length > 0 ? rest : undefined };
  });
  persist();
  emit();
}
