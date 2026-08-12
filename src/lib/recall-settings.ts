/**
 * リコールメールの設定（クリニック名・送信元・件名/本文テンプレート）を
 * localStorage で保持する。ToDo/リコールストアと同じ useSyncExternalStore 方式。
 *
 * ※ 送信に使う Resend の API キーはサーバー側の環境変数で管理し、
 *   ここ（クライアント）には保存しない。
 */

export type EmailSettings = {
  /** クリニック名（本文/件名の {clinic} に入る） */
  clinicName: string;
  /** 送信元アドレス（Resend で認証済みのドメイン。テストは onboarding@resend.dev） */
  fromEmail: string;
  /** 件名テンプレート */
  subjectTemplate: string;
  /** 本文テンプレート（プレーンテキスト） */
  bodyTemplate: string;
};

export const DEFAULT_SETTINGS: EmailSettings = {
  clinicName: "○○歯科クリニック",
  fromEmail: "onboarding@resend.dev",
  subjectTemplate: "{clinic}より 定期検診のご案内",
  bodyTemplate: `{name} 様

いつも当院をご利用いただきありがとうございます。
前回のご来院から一定期間が経過し、そろそろ定期検診のお時期です。

次回検診の目安：{nextDue}

ご都合のよい日時でのご予約をお願いいたします。
ご不明な点がございましたらお気軽にご連絡ください。

{clinic}`,
};

const STORAGE_KEY = "recall.emailSettings.v1";

let settings: EmailSettings = DEFAULT_SETTINGS;
let initialized = false;
const listeners = new Set<() => void>();

function readFromStorage(): EmailSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_SETTINGS;
    return {
      clinicName:
        typeof parsed.clinicName === "string"
          ? parsed.clinicName
          : DEFAULT_SETTINGS.clinicName,
      fromEmail:
        typeof parsed.fromEmail === "string"
          ? parsed.fromEmail
          : DEFAULT_SETTINGS.fromEmail,
      subjectTemplate:
        typeof parsed.subjectTemplate === "string"
          ? parsed.subjectTemplate
          : DEFAULT_SETTINGS.subjectTemplate,
      bodyTemplate:
        typeof parsed.bodyTemplate === "string"
          ? parsed.bodyTemplate
          : DEFAULT_SETTINGS.bodyTemplate,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function ensureInitialized() {
  if (!initialized && typeof window !== "undefined") {
    settings = readFromStorage();
    initialized = true;
  }
}

export function subscribeSettings(listener: () => void): () => void {
  ensureInitialized();
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      settings = readFromStorage();
      for (const l of listeners) l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getSettings(): EmailSettings {
  ensureInitialized();
  return settings;
}

export function getServerSettings(): EmailSettings {
  return DEFAULT_SETTINGS;
}

export function updateSettings(next: EmailSettings) {
  settings = {
    clinicName: next.clinicName.trim() || DEFAULT_SETTINGS.clinicName,
    fromEmail: next.fromEmail.trim() || DEFAULT_SETTINGS.fromEmail,
    subjectTemplate: next.subjectTemplate,
    bodyTemplate: next.bodyTemplate,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 保存できない場合は静かに無視
  }
  for (const l of listeners) l();
}

/** テンプレート内の {key} を vars の値に置換する */
export function renderTemplate(
  tpl: string,
  vars: Record<string, string>,
): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] !== undefined ? vars[k] : `{${k}}`,
  );
}
