@AGENTS.md

# プロジェクト概要

歯科クリニック向けの**リコール（定期検診の再来院）管理**アプリ。
次回検診日の自動計算・連絡対象の抽出・各種指標・リコールメール送信を提供する。
トップ（`/`）が唯一のアプリ画面。

# 技術スタック

- Next.js 16（App Router / Turbopack）
- React 19 / TypeScript
- Tailwind CSS v4
- Resend（メール送信）
- Vercel（ホスティング）
- Supabase … 型定義（`src/types/database.ts`）とマイグレーションが残っているが、現状フロントは localStorage 動作

# コマンド

```bash
npm run dev     # 開発サーバー
npm run build   # 本番ビルド
npm run lint    # ESLint
```

# アーキテクチャ規約

- **クライアント状態は localStorage を外部ストア化**：`src/lib/*-store.ts` に実装し、`useSyncExternalStore` で購読する。SSRとの不一致を避けるため `getServerSnapshot`（安定した空スナップショット）を必ず用意する。参考：`src/lib/recall-store.ts`。
- **秘密キーはサーバー専用**：API キー等は Route Handler（`src/app/api/*/route.ts`）内で `process.env` からのみ参照し、クライアントに渡さない。例：`/api/recall-email`（Resend）。
- **Tailwind v4**：`src/app/globals.css` で `@import "tailwindcss"`。共通クラスは `@layer components`（例：`.input`）。
- UIは日本語・レスポンシブ（スマホ優先）。ダークモードは `prefers-color-scheme`。
- **コードを書く前に** `AGENTS.md` と `node_modules/next/dist/docs/` の該当ガイドを読む（このNext.jsは独自版で、APIや作法が学習データと異なる）。

# ディレクトリ構成（主要）

```
src/
  app/
    page.tsx                   トップ＝リコール管理
    api/recall-email/route.ts  Resend でメール送信（サーバー側・秘密キー使用）
    layout.tsx                 共通レイアウト
    globals.css                Tailwind v4 エントリ
  components/
    recall-app.tsx             リコール管理の画面
  lib/
    recall-store.ts            患者・予約・指標のロジック（localStorage）
    recall-settings.ts         メールテンプレート設定
  types/database.ts            Supabase 生成型
supabase/migrations/           Supabase マイグレーション
requirements-recall.md         リコール管理の要件定義書
```

# 運用ルール

- 応答・コミットメッセージ・UIは**日本語**。
- 画面に関わる変更は**ブラウザで動作確認**する（Claude Preview）。テストデータは確認後に消す（ユーザー指示があれば残す）。
- `.env*` は**編集しない**（保護対象。キーの追記はユーザーが行う）。必要なキーは `.env.example` を参照。
- **コミット・push はユーザーが依頼したときのみ**。このリポジトリは各機能を **main に直接コミット**する運用。
- 新機能は Plan Mode（設計→確認→実装）で進め、いきなり実装しない。
