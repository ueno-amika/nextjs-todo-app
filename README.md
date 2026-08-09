# 天気予報アプリ

都市名や現在地から、**気温・天気・湿度・降水確率**を表示する Next.js アプリです。
カレンダー（日付ボタン）で週間予報の中から日付を選び、その日の予報に切り替えられます。

- データ元: [OpenWeatherMap](https://openweathermap.org/api)（現在天気 + 5日/3時間予報）
- API キーはサーバー側の Route Handler (`/api/weather`) でのみ使用し、ブラウザには渡しません。

## セットアップ

1. OpenWeatherMap で無料アカウントを作成し、API キーを取得します。
   https://openweathermap.org/api （キーは発行後、有効化まで数分〜数十分かかることがあります）

2. `.env.example` を参考に `.env.local` を作成し、キーを設定します。

   ```bash
   OPENWEATHER_API_KEY=あなたのAPIキー
   ```

3. 開発サーバーを起動します。

   ```bash
   npm run dev
   ```

   [http://localhost:3000](http://localhost:3000) を開きます。

## 使い方

- 上部の入力欄に都市名（例: `Tokyo`, `Osaka`, `London`）を入れて「検索」。
- 「📍 現在地」で端末の位置情報から取得（ブラウザの許可が必要）。
- 「日付を選ぶ」の日付ボタンで、週間予報の中の任意の日に切り替え。
- 各日は最高/最低気温・湿度・降水確率と、3時間ごとの詳細を表示します。

## 主なファイル

- `src/app/page.tsx` … トップページ（天気アプリ）
- `src/components/weather-app.tsx` … 画面（検索・現在地・カレンダー・表示）
- `src/app/api/weather/route.ts` … OpenWeatherMap を叩くサーバー側 API
- `src/lib/weather.ts` … 取得・整形ロジック（サーバー専用）
- `src/app/todo/page.tsx` … 以前の ToDo アプリ（`/todo` に退避）

## デプロイ（Vercel）

GitHub の main ブランチへ push すると Vercel が自動デプロイします。
Vercel 側でも環境変数 `OPENWEATHER_API_KEY` を設定してください
（Project → Settings → Environment Variables）。
