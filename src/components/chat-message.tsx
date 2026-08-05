type Props = {
  /** 発言者の名前 */
  name: string;
  /** メッセージ本文 */
  message: string;
  /** 自分の発言なら true（右寄せ・色付き表示になる） */
  isMine?: boolean;
};

export default function ChatMessage({ name, message, isMine = false }: Props) {
  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[80%]">
        {!isMine && (
          <p className="mb-1 px-1 text-xs text-black/50 dark:text-white/50">
            {name}
          </p>
        )}
        <div
          className={`rounded-2xl px-4 py-2 text-sm ${
            isMine
              ? "bg-foreground text-background"
              : "bg-black/5 text-foreground dark:bg-white/10"
          }`}
        >
          {message}
        </div>
      </div>
    </div>
  );
}
