/**
 * localStorage を「外部ストア」として扱う 歯科リコール管理ストア。
 * ToDo ストアと同じく useSyncExternalStore と組み合わせて、
 * - サーバー／ハイドレーション時は空配列（不一致エラーなし）
 * - クライアントでは保存済みデータ
 * を安全に表示する。
 */

/** リコール（再来院）連絡のステータス */
export type RecallStatus = "pending" | "contacted" | "rebooked";

/** 連絡方法 */
export type ContactMethod = "phone" | "email" | "postcard";

/** 連絡履歴の1件 */
export type ContactLog = {
  id: string;
  method: ContactMethod;
  note?: string;
  contactedAt: number;
};

/** 予約結果の種類 */
export type VisitOutcome = "attended" | "cancelled" | "no_show";

/** 予約結果（来院・キャンセル・遅刻）の1件 */
export type Visit = {
  id: string;
  /** 予約日（YYYY-MM-DD） */
  date: string;
  outcome: VisitOutcome;
  /** 遅刻した分数（来院時のみ意味を持つ。0=時間通り） */
  lateMinutes: number;
  /** 治療内容（来院時のみ。例: メンテナンス） */
  treatment?: string;
  createdAt: number;
};

/** 患者1件 */
export type Patient = {
  id: string;
  /** カルテ番号（任意） */
  chartNo?: string;
  name: string;
  phone?: string;
  email?: string;
  /** 前回来院日（YYYY-MM-DD） */
  lastVisitAt: string;
  /** 推奨検診間隔（月） */
  intervalMonths: number;
  status: RecallStatus;
  logs: ContactLog[];
  /** 予約結果の履歴（来院・キャンセル・遅刻） */
  visits: Visit[];
  createdAt: number;
};

/** 「もうすぐ／期限切れ」とみなす日数のしきい値 */
export const SOON_DAYS = 30;

const STORAGE_KEY = "recall.patients.v1";

/** サーバー用の不変スナップショット（毎回同じ参照を返す） */
const SERVER_SNAPSHOT: Patient[] = [];

let patients: Patient[] = [];
let initialized = false;
const listeners = new Set<() => void>();

const VALID_STATUS: RecallStatus[] = ["pending", "contacted", "rebooked"];
const VALID_METHOD: ContactMethod[] = ["phone", "email", "postcard"];
const VALID_OUTCOME: VisitOutcome[] = ["attended", "cancelled", "no_show"];

function readFromStorage(): Patient[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p): p is Patient =>
          p &&
          typeof p.id === "string" &&
          typeof p.name === "string" &&
          typeof p.lastVisitAt === "string" &&
          typeof p.intervalMonths === "number",
      )
      .map((p) => ({
        id: p.id,
        chartNo: typeof p.chartNo === "string" ? p.chartNo : undefined,
        name: p.name,
        phone: typeof p.phone === "string" ? p.phone : undefined,
        email: typeof p.email === "string" ? p.email : undefined,
        lastVisitAt: p.lastVisitAt,
        intervalMonths: p.intervalMonths,
        status: VALID_STATUS.includes(p.status) ? p.status : "pending",
        logs: Array.isArray(p.logs)
          ? p.logs.filter(
              (l: unknown): l is ContactLog =>
                !!l &&
                typeof (l as ContactLog).id === "string" &&
                VALID_METHOD.includes((l as ContactLog).method) &&
                typeof (l as ContactLog).contactedAt === "number",
            )
          : [],
        visits: Array.isArray(p.visits)
          ? p.visits
              .filter(
                (v: unknown): v is Visit =>
                  !!v &&
                  typeof (v as Visit).id === "string" &&
                  typeof (v as Visit).date === "string" &&
                  VALID_OUTCOME.includes((v as Visit).outcome) &&
                  typeof (v as Visit).lateMinutes === "number",
              )
              .map((v: Visit) => ({
                ...v,
                treatment:
                  typeof v.treatment === "string" ? v.treatment : undefined,
              }))
          : [],
        createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
      }));
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
  } catch {
    // 保存領域が使えない場合は静かに無視する
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function ensureInitialized() {
  if (!initialized && typeof window !== "undefined") {
    patients = readFromStorage();
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
      patients = readFromStorage();
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
export function getSnapshot(): Patient[] {
  ensureInitialized();
  return patients;
}

/** useSyncExternalStore 用: サーバーのスナップショット */
export function getServerSnapshot(): Patient[] {
  return SERVER_SNAPSHOT;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 今日を YYYY-MM-DD で返す（ローカルタイム基準） */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD に nヶ月を足した YYYY-MM-DD を返す（月末はクランプ） */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const base = new Date(y, m - 1, d);
  const target = new Date(y, m - 1 + months, 1);
  // 月末日を超える場合はその月の最終日にクランプ（例: 1/31 + 1ヶ月 → 2/28）
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(base.getDate(), lastDay));
  const yy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** 次回検診予定日（前回来院日 + 推奨間隔） */
export function nextDueDate(p: Patient): string {
  return addMonths(p.lastVisitAt, p.intervalMonths);
}

/** 2つの YYYY-MM-DD の差（days2 - days1）を日数で返す */
function diffDays(fromISO: string, toISO: string): number {
  const [ay, am, ad] = fromISO.split("-").map(Number);
  const [by, bm, bd] = toISO.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86_400_000);
}

export type DueState = "overdue" | "soon" | "future";

/** 次回予定日が「期限切れ / もうすぐ / まだ先」のどれかを返す */
export function dueState(p: Patient): DueState {
  const days = diffDays(todayISO(), nextDueDate(p));
  if (days < 0) return "overdue";
  if (days <= SOON_DAYS) return "soon";
  return "future";
}

/** 次回予定日までの残り日数（マイナスなら超過日数） */
export function daysUntilDue(p: Patient): number {
  return diffDays(todayISO(), nextDueDate(p));
}

/** リコール連絡の対象か（未連絡 かつ 期限切れ or もうすぐ） */
export function isRecallTarget(p: Patient): boolean {
  return p.status === "pending" && dueState(p) !== "future";
}

/** 患者を追加 */
export function addPatient(input: {
  chartNo?: string;
  name: string;
  phone?: string;
  email?: string;
  lastVisitAt: string;
  intervalMonths: number;
}) {
  const name = input.name.trim();
  if (!name || !input.lastVisitAt) return;
  patients = [
    {
      id: newId(),
      chartNo: input.chartNo?.trim() || undefined,
      name,
      phone: input.phone?.trim() || undefined,
      email: input.email?.trim() || undefined,
      lastVisitAt: input.lastVisitAt,
      intervalMonths: input.intervalMonths > 0 ? input.intervalMonths : 6,
      status: "pending",
      logs: [],
      visits: [],
      createdAt: Date.now(),
    },
    ...patients,
  ];
  persist();
  emit();
}

/** 患者を削除 */
export function deletePatient(id: string) {
  patients = patients.filter((p) => p.id !== id);
  persist();
  emit();
}

/** 連絡ステータスを更新 */
export function setStatus(id: string, status: RecallStatus) {
  patients = patients.map((p) => (p.id === id ? { ...p, status } : p));
  persist();
  emit();
}

/** 連絡履歴を追加し、ステータスを「連絡済み」にする */
export function addContactLog(
  id: string,
  method: ContactMethod,
  note?: string,
) {
  patients = patients.map((p) =>
    p.id === id
      ? {
          ...p,
          status: p.status === "pending" ? "contacted" : p.status,
          logs: [
            {
              id: newId(),
              method,
              note: note?.trim() || undefined,
              contactedAt: Date.now(),
            },
            ...p.logs,
          ],
        }
      : p,
  );
  persist();
  emit();
}

/**
 * 予約結果（来院／キャンセル／無断キャンセル）を記録する。
 * 来院の場合は前回来院日を更新し、次回予定が再計算されるため
 * ステータスを「未連絡」に戻す（新しいリコールサイクルの開始）。
 */
export function addVisit(
  id: string,
  input: {
    date?: string;
    outcome: VisitOutcome;
    lateMinutes?: number;
    treatment?: string;
  },
) {
  const date = input.date || todayISO();
  const lateMinutes =
    input.outcome === "attended" && input.lateMinutes && input.lateMinutes > 0
      ? Math.round(input.lateMinutes)
      : 0;
  const treatment =
    input.outcome === "attended"
      ? input.treatment?.trim() || undefined
      : undefined;
  patients = patients.map((p) => {
    if (p.id !== id) return p;
    const visit: Visit = {
      id: newId(),
      date,
      outcome: input.outcome,
      lateMinutes,
      treatment,
      createdAt: Date.now(),
    };
    const visits = [visit, ...p.visits];
    // 来院なら来院日を更新してリコールサイクルをリセット
    if (input.outcome === "attended") {
      return { ...p, visits, lastVisitAt: date, status: "pending" };
    }
    return { ...p, visits };
  });
  persist();
  emit();
}

/** 予約結果の履歴を1件削除する */
export function deleteVisit(id: string, visitId: string) {
  patients = patients.map((p) =>
    p.id === id
      ? { ...p, visits: p.visits.filter((v) => v.id !== visitId) }
      : p,
  );
  persist();
  emit();
}

/** 患者ごとの来院・遅刻・キャンセル指標 */
export type PatientStats = {
  visitCount: number;
  attendedCount: number;
  cancelledCount: number;
  lateCount: number;
  /** リコール率（全予約に占める来院の割合＝来院率、0〜1） */
  recallRate: number;
  /** 遅刻率（来院に占める遅刻の割合、0〜1） */
  lateRate: number;
  /** 遅刻時の平均遅刻分数（遅刻がなければ 0） */
  avgLateMinutes: number;
  /** キャンセル率（全予約に占めるキャンセル＋無断の割合、0〜1） */
  cancelRate: number;
};

export function patientStats(p: Patient): PatientStats {
  const attended = p.visits.filter((v) => v.outcome === "attended");
  const cancelled = p.visits.filter((v) => v.outcome !== "attended");
  const late = attended.filter((v) => v.lateMinutes > 0);
  const totalLate = late.reduce((s, v) => s + v.lateMinutes, 0);
  return {
    visitCount: p.visits.length,
    attendedCount: attended.length,
    cancelledCount: cancelled.length,
    lateCount: late.length,
    recallRate: p.visits.length ? attended.length / p.visits.length : 0,
    lateRate: attended.length ? late.length / attended.length : 0,
    avgLateMinutes: late.length ? totalLate / late.length : 0,
    cancelRate: p.visits.length ? cancelled.length / p.visits.length : 0,
  };
}

/** 医院全体の指標 */
export type ClinicStats = {
  /** リコール率（全患者に占める再予約済みの割合、0〜1） */
  recallRate: number;
  /** キャンセル率（全予約に占めるキャンセル＋無断の割合、0〜1） */
  cancelRate: number;
  totalVisits: number;
};

export function clinicStats(list: Patient[]): ClinicStats {
  const total = list.length;
  const rebooked = list.filter((p) => p.status === "rebooked").length;
  const allVisits = list.flatMap((p) => p.visits);
  const cancelled = allVisits.filter((v) => v.outcome !== "attended").length;
  return {
    recallRate: total ? rebooked / total : 0,
    cancelRate: allVisits.length ? cancelled / allVisits.length : 0,
    totalVisits: allVisits.length,
  };
}

/** 0〜1 の割合を「42%」形式の文字列にする */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
