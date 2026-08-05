type Props = {
  /** タスクのタイトル */
  title: string;
  /** 期限（例: "8/7(金)"）。省略可 */
  due?: string;
  /** 完了済みなら true */
  done?: boolean;
};

export default function TaskCard({ title, due, done = false }: Props) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 shadow-sm transition hover:border-black/20 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/25">
      <h3
        className={`text-base font-medium ${
          done ? "text-black/40 line-through dark:text-white/40" : ""
        }`}
      >
        {title}
      </h3>
      {due && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-black/[0.03] px-2 py-0.5 text-xs text-black/60 dark:bg-white/5 dark:text-white/60">
          📅 {due}
        </p>
      )}
    </div>
  );
}
