"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  addContactLog,
  addPatient,
  addVisit,
  clinicStats,
  daysUntilDue,
  deletePatient,
  deleteVisit,
  dueState,
  formatPercent,
  getServerSnapshot,
  getSnapshot,
  isRecallTarget,
  nextDueDate,
  patientStats,
  setStatus,
  subscribe,
  todayISO,
  type ContactMethod,
  type DueState,
  type Patient,
  type RecallStatus,
  type VisitOutcome,
} from "@/lib/recall-store";
import {
  getServerSettings,
  getSettings,
  renderTemplate,
  subscribeSettings,
  updateSettings,
  type EmailSettings,
} from "@/lib/recall-settings";

const STATUS_LABEL: Record<RecallStatus, string> = {
  pending: "未連絡",
  contacted: "連絡済み",
  rebooked: "再予約済み",
};

const STATUS_BADGE: Record<RecallStatus, string> = {
  pending: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  contacted:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  rebooked:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
};

const DUE_BADGE: Record<DueState, string> = {
  overdue: "bg-rose-600 text-white",
  soon: "bg-amber-500 text-white",
  future: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

const METHOD_LABEL: Record<ContactMethod, string> = {
  phone: "電話",
  email: "メール",
  postcard: "はがき",
};

const OUTCOME_LABEL: Record<VisitOutcome, string> = {
  attended: "来院",
  cancelled: "キャンセル",
  no_show: "無断キャンセル",
};

const OUTCOME_BADGE: Record<VisitOutcome, string> = {
  attended:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  cancelled:
    "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  no_show: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

type StatusFilter = "all" | RecallStatus;

function dueBadgeText(p: Patient): string {
  const days = daysUntilDue(p);
  if (days < 0) return `${-days}日超過`;
  if (days === 0) return "本日";
  return `あと${days}日`;
}

export default function RecallApp() {
  const patients = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [targetOnly, setTargetOnly] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const targetCount = useMemo(
    () => patients.filter(isRecallTarget).length,
    [patients],
  );
  const pendingCount = useMemo(
    () => patients.filter((p) => p.status === "pending").length,
    [patients],
  );
  const clinic = useMemo(() => clinicStats(patients), [patients]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return patients
      .filter((p) => {
        if (targetOnly && !isRecallTarget(p)) return false;
        if (statusFilter !== "all" && p.status !== statusFilter) return false;
        if (q) {
          // カルテ番号または名前でのみ検索
          const hay = `${p.chartNo ?? ""} ${p.name}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(nextDueDate(a)).getTime() -
          new Date(nextDueDate(b)).getTime(),
      );
  }, [patients, query, statusFilter, targetOnly]);

  return (
    <div className="w-full max-w-3xl">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            リコール管理
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            次回検診の予定を自動計算し、連絡すべき患者と来院実績を管理します。
          </p>
        </div>
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          ✉ メール設定
        </button>
      </header>

      {settingsOpen && (
        <EmailSettingsPanel onClose={() => setSettingsOpen(false)} />
      )}

      {/* 医院全体の指標 */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <SummaryCard
          label="リコール率"
          value={formatPercent(clinic.recallRate)}
          hint="再予約済み ÷ 全患者"
          accent="emerald"
        />
        <SummaryCard
          label="キャンセル率"
          value={formatPercent(clinic.cancelRate)}
          hint={`全 ${clinic.totalVisits} 予約中`}
          accent="rose"
        />
      </div>

      {/* 件数サマリー */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <SummaryCard label="登録患者" value={patients.length} />
        <SummaryCard label="連絡対象" value={targetCount} accent="rose" />
        <SummaryCard label="未連絡" value={pendingCount} accent="amber" />
      </div>

      <PatientForm />

      {/* 絞り込み */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="カルテ番号・名前で検索"
          className="min-w-40 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="all">すべての状態</option>
          <option value="pending">未連絡</option>
          <option value="contacted">連絡済み</option>
          <option value="rebooked">再予約済み</option>
        </select>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
          <input
            type="checkbox"
            checked={targetOnly}
            onChange={(e) => setTargetOnly(e.target.checked)}
            className="h-4 w-4 accent-rose-600"
          />
          連絡対象のみ
        </label>
      </div>

      {/* 一覧 */}
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {patients.length === 0
            ? "まだ患者が登録されていません。上のフォームから追加してください。"
            : "条件に一致する患者がいません。"}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((p) => (
            <PatientCard key={p.id} patient={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: "rose" | "amber" | "emerald";
}) {
  const color =
    accent === "rose"
      ? "text-rose-600 dark:text-rose-400"
      : accent === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : accent === "emerald"
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-slate-900 dark:text-slate-100";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
      {hint && (
        <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
          {hint}
        </div>
      )}
    </div>
  );
}

function PatientForm() {
  const [open, setOpen] = useState(false);
  const [chartNo, setChartNo] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [lastVisitAt, setLastVisitAt] = useState(todayISO());
  const [intervalMonths, setIntervalMonths] = useState(6);

  function reset() {
    setChartNo("");
    setName("");
    setPhone("");
    setEmail("");
    setLastVisitAt(todayISO());
    setIntervalMonths(6);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !lastVisitAt) return;
    addPatient({ chartNo, name, phone, email, lastVisitAt, intervalMonths });
    reset();
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-6 w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 transition hover:border-sky-400 hover:text-sky-600 dark:border-slate-700 dark:text-slate-300"
      >
        ＋ 患者を登録
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="カルテ番号">
          <input
            value={chartNo}
            onChange={(e) => setChartNo(e.target.value)}
            className="input"
            placeholder="12345"
          />
        </Field>
        <Field label="氏名（必須）">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="input"
            placeholder="山田 太郎"
          />
        </Field>
        <Field label="電話番号">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input"
            placeholder="090-1234-5678"
          />
        </Field>
        <Field label="メール">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="taro@example.com"
          />
        </Field>
        <Field label="前回来院日（必須）">
          <input
            type="date"
            value={lastVisitAt}
            onChange={(e) => setLastVisitAt(e.target.value)}
            required
            className="input"
          />
        </Field>
        <Field label="推奨検診間隔">
          <select
            value={intervalMonths}
            onChange={(e) => setIntervalMonths(Number(e.target.value))}
            className="input"
          >
            <option value={1}>1ヶ月</option>
            <option value={3}>3ヶ月</option>
            <option value={4}>4ヶ月</option>
            <option value={6}>6ヶ月</option>
            <option value={12}>12ヶ月</option>
          </select>
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          キャンセル
        </button>
        <button
          type="submit"
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          登録する
        </button>
      </div>
    </form>
  );
}

function PatientCard({ patient: p }: { patient: Patient }) {
  const [expanded, setExpanded] = useState(false);
  const state = dueState(p);
  const stats = patientStats(p);

  return (
    <li className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* 折りたたみ時：名前＋ステータス（クリックで開閉） */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
        aria-expanded={expanded}
      >
        <span className="flex min-w-0 items-center gap-2">
          {p.chartNo && (
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              No.{p.chartNo}
            </span>
          )}
          <span className="truncate font-semibold">{p.name}</span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status]}`}
          >
            {STATUS_LABEL[p.status]}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${DUE_BADGE[state]}`}
          >
            {dueBadgeText(p)}
          </span>
          <span className="text-slate-400">{expanded ? "▲" : "▼"}</span>
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          {/* 名前の下に一列：tel・リコール率・キャンセル率・遅刻率＋時間 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {p.phone && (
              <span className="text-slate-600 dark:text-slate-300">
                ☎ {p.phone}
              </span>
            )}
            <span className="text-emerald-600 dark:text-emerald-400">
              リコール率 {formatPercent(stats.recallRate)}
            </span>
            <span
              className={
                stats.cancelRate > 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-slate-500 dark:text-slate-400"
              }
            >
              キャンセル率 {formatPercent(stats.cancelRate)}
            </span>
            <span
              className={
                stats.lateRate > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-slate-500 dark:text-slate-400"
              }
            >
              遅刻率 {formatPercent(stats.lateRate)}
              {stats.lateCount > 0 &&
                `（平均 ${Math.round(stats.avgLateMinutes)}分）`}
            </span>
          </div>

          <div className="text-xs text-slate-400 dark:text-slate-500">
            前回来院 {p.lastVisitAt} ／ 次回 {nextDueDate(p)} ／ 間隔{" "}
            {p.intervalMonths}ヶ月
          </div>

          {/* リコールメール送信 */}
          <RecallMailSection patient={p} />

          {/* 予約履歴 */}
          <div>
            <h3 className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              予約履歴
            </h3>
            {p.visits.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                まだ予約履歴はありません。
              </p>
            ) : (
              <ul className="space-y-1.5">
                {p.visits.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"
                  >
                    <span
                      className={`rounded px-1.5 py-0.5 ${OUTCOME_BADGE[v.outcome]}`}
                    >
                      {OUTCOME_LABEL[v.outcome]}
                    </span>
                    <span className="text-slate-400">{v.date}</span>
                    {v.treatment && (
                      <span className="text-slate-600 dark:text-slate-300">
                        {v.treatment}
                      </span>
                    )}
                    {v.outcome === "attended" && v.lateMinutes > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        {v.lateMinutes}分遅刻
                      </span>
                    )}
                    <button
                      onClick={() => deleteVisit(p.id, v.id)}
                      className="ml-auto text-slate-400 hover:text-rose-600"
                      aria-label="削除"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 記録フォーム */}
          <VisitForm patient={p} />
          <ContactSection patient={p} />

          {/* 操作 */}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            <label className="text-xs text-slate-500 dark:text-slate-400">
              状態
            </label>
            <select
              value={p.status}
              onChange={(e) => setStatus(p.id, e.target.value as RecallStatus)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="pending">未連絡</option>
              <option value="contacted">連絡済み</option>
              <option value="rebooked">再予約済み</option>
            </select>
            <button
              onClick={() => {
                if (confirm(`「${p.name}」を削除しますか？`))
                  deletePatient(p.id);
              }}
              className="ml-auto rounded-lg px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
            >
              削除
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

const TREATMENT_OPTIONS = [
  "メンテナンス",
  "定期検診",
  "クリーニング",
  "虫歯治療",
  "歯周病治療",
  "その他",
];

function VisitForm({ patient: p }: { patient: Patient }) {
  const [date, setDate] = useState(todayISO());
  const [outcome, setOutcome] = useState<VisitOutcome>("attended");
  const [lateMinutes, setLateMinutes] = useState(0);
  const [treatment, setTreatment] = useState(TREATMENT_OPTIONS[0]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    addVisit(p.id, { date, outcome, lateMinutes, treatment });
    setDate(todayISO());
    setOutcome("attended");
    setLateMinutes(0);
    setTreatment(TREATMENT_OPTIONS[0]);
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        予約結果を記録
      </h3>
      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
        />
        <select
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as VisitOutcome)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="attended">来院</option>
          <option value="cancelled">キャンセル</option>
          <option value="no_show">無断キャンセル</option>
        </select>
        {outcome === "attended" && (
          <>
            <select
              value={treatment}
              onChange={(e) => setTreatment(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
            >
              {TREATMENT_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              遅刻
              <input
                type="number"
                min={0}
                value={lateMinutes}
                onChange={(e) => setLateMinutes(Number(e.target.value))}
                className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
              />
              分
            </label>
          </>
        )}
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
        >
          記録
        </button>
      </form>
    </div>
  );
}

function ContactSection({ patient: p }: { patient: Patient }) {
  const [method, setMethod] = useState<ContactMethod>("phone");
  const [note, setNote] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    addContactLog(p.id, method, note);
    setNote("");
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        連絡を記録
      </h3>
      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-center gap-2"
      >
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as ContactMethod)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="phone">電話</option>
          <option value="email">メール</option>
          <option value="postcard">はがき</option>
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="メモ（任意）"
          className="min-w-32 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900"
        >
          連絡を記録
        </button>
      </form>

      {p.logs.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {p.logs.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"
            >
              <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
                {METHOD_LABEL[l.method]}
              </span>
              <span className="text-slate-400">
                {new Date(l.contactedAt).toLocaleDateString("ja-JP")}
              </span>
              {l.note && <span className="truncate">{l.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmailSettingsPanel({ onClose }: { onClose: () => void }) {
  const saved = useSyncExternalStore(
    subscribeSettings,
    getSettings,
    getServerSettings,
  );
  const [draft, setDraft] = useState<EmailSettings>(saved);
  const [savedNote, setSavedNote] = useState(false);

  function set<K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSavedNote(false);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateSettings(draft);
    setSavedNote(true);
  }

  return (
    <form
      onSubmit={handleSave}
      className="mb-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">メール設定</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          閉じる
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="クリニック名">
          <input
            value={draft.clinicName}
            onChange={(e) => set("clinicName", e.target.value)}
            className="input"
          />
        </Field>
        <Field label="送信元アドレス（要 Resend 認証ドメイン）">
          <input
            value={draft.fromEmail}
            onChange={(e) => set("fromEmail", e.target.value)}
            className="input"
            placeholder="onboarding@resend.dev"
          />
        </Field>
      </div>

      <Field label="件名テンプレート">
        <input
          value={draft.subjectTemplate}
          onChange={(e) => set("subjectTemplate", e.target.value)}
          className="input"
        />
      </Field>

      <Field label="本文テンプレート">
        <textarea
          value={draft.bodyTemplate}
          onChange={(e) => set("bodyTemplate", e.target.value)}
          rows={9}
          className="input font-mono leading-relaxed"
        />
      </Field>

      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        使える差し込みタグ：<code>{"{name}"}</code> <code>{"{clinic}"}</code>{" "}
        <code>{"{nextDue}"}</code> <code>{"{chartNo}"}</code>。 送信には
        <code> .env.local</code> の <code>RESEND_API_KEY</code> 設定が必要です。
      </p>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          保存する
        </button>
        {savedNote && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            保存しました
          </span>
        )}
      </div>
    </form>
  );
}

type SendState = "idle" | "sending" | "sent" | "error";

function RecallMailSection({ patient: p }: { patient: Patient }) {
  const settings = useSyncExternalStore(
    subscribeSettings,
    getSettings,
    getServerSettings,
  );
  const [state, setState] = useState<SendState>("idle");
  const [message, setMessage] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const vars = {
    name: p.name,
    clinic: settings.clinicName,
    nextDue: nextDueDate(p),
    chartNo: p.chartNo ?? "",
  };
  const subject = renderTemplate(settings.subjectTemplate, vars);
  const bodyText = renderTemplate(settings.bodyTemplate, vars);

  async function handleSend() {
    if (!p.email) return;
    setState("sending");
    setMessage("");
    try {
      const res = await fetch("/api/recall-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: settings.fromEmail,
          to: p.email,
          subject,
          text: bodyText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState("error");
        setMessage(data?.error ?? "送信に失敗しました");
        return;
      }
      addContactLog(p.id, "email", "定期検診の案内メールを送信");
      setState("sent");
    } catch {
      setState("error");
      setMessage("通信エラーが発生しました");
    }
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        リコールメール
      </h3>
      {!p.email ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          メールアドレスが未登録のため送信できません。
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-600 dark:text-slate-300">
              宛先 {p.email}
            </span>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="text-sky-600 hover:underline dark:text-sky-400"
            >
              {showPreview ? "プレビューを隠す" : "プレビュー"}
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={state === "sending"}
              className="ml-auto rounded-lg bg-sky-600 px-3 py-1.5 font-medium text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {state === "sending" ? "送信中…" : "メールを送信"}
            </button>
          </div>

          {state === "sent" && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              ✓ 送信しました（連絡履歴に記録しました）
            </p>
          )}
          {state === "error" && (
            <p className="text-xs text-rose-600 dark:text-rose-400">
              {message}
            </p>
          )}

          {showPreview && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/50">
              <div className="font-semibold text-slate-700 dark:text-slate-200">
                件名：{subject}
              </div>
              <pre className="mt-2 font-sans whitespace-pre-wrap text-slate-600 dark:text-slate-300">
                {bodyText}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}
