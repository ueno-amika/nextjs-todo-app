import type { Metadata } from "next";
import TodoApp from "@/components/todo-app";

export const metadata: Metadata = {
  title: "ToDo リスト",
  description:
    "タスクの追加・完了・削除ができ、ブラウザに保存される ToDo アプリ",
};

export default function TodoPage() {
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:py-16">
      <TodoApp />
    </main>
  );
}
