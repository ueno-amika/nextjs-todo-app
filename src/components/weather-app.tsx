"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { toCityQuery } from "@/lib/city-map";
import type { DailyForecast, WeatherData } from "@/lib/weather";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const FAVORITES_KEY = "weather-favorites";

/** お気に入り都市（座標で正確に再取得できるよう保持） */
type Favorite = { label: string; lat: number; lon: number };

/** "2026-08-09" → "8/9(土)" */
function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

/** OpenWeatherMap のアイコンURL */
function iconUrl(icon: string): string {
  return `https://openweathermap.org/img/wn/${icon}@2x.png`;
}

/**
 * 機能③：天気アイコンに応じた背景グラデーション。
 * アイコンコードの先頭2桁で天気を判定（01=快晴, 02〜04=雲, 09/10=雨, 11=雷, 13=雪, 50=霧）。
 * 半透明にしてライト/ダーク両方で文字が読めるようにする。
 */
function weatherBackground(icon: string): string {
  const code = icon.slice(0, 2);
  switch (code) {
    case "01":
      return "bg-gradient-to-br from-amber-300/30 to-sky-400/30";
    case "02":
    case "03":
    case "04":
      return "bg-gradient-to-br from-slate-300/40 to-slate-500/30";
    case "09":
    case "10":
      return "bg-gradient-to-br from-sky-500/30 to-blue-700/30";
    case "11":
      return "bg-gradient-to-br from-indigo-500/30 to-purple-700/30";
    case "13":
      return "bg-gradient-to-br from-sky-200/50 to-blue-300/40";
    case "50":
      return "bg-gradient-to-br from-slate-400/30 to-gray-500/30";
    default:
      return "bg-black/[0.02] dark:bg-white/5";
  }
}

type Params = { city: string } | { lat: number; lon: number };

function toQuery(params: Params): string {
  const sp = new URLSearchParams();
  if ("city" in params) sp.set("city", params.city);
  else {
    sp.set("lat", String(params.lat));
    sp.set("lon", String(params.lon));
  }
  return sp.toString();
}

export default function WeatherApp() {
  const [input, setInput] = useState("");
  const [data, setData] = useState<WeatherData | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  const load = useCallback(async (params: Params) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/weather?${toQuery(params)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "取得に失敗しました");
      const weather = json as WeatherData;
      setData(weather);
      setSelectedDate(weather.daily[0]?.date ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初回マウント時に東京の天気とお気に入りを読み込む
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- マウント時の初回フェッチ
    load({ city: "Tokyo" });
    try {
      const saved = localStorage.getItem(FAVORITES_KEY);
      if (saved) setFavorites(JSON.parse(saved) as Favorite[]);
    } catch {
      // localStorage が使えない環境は無視
    }
  }, [load]);

  // お気に入りの変更をブラウザに保存（外部システムとの同期）
  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      // 保存に失敗しても致命的ではない
    }
  }, [favorites]);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const raw = input.trim();
    if (raw) load({ city: toCityQuery(raw) }); // 機能①：日本語→英語変換
  }

  function onGeolocate() {
    if (!navigator.geolocation) {
      setError("この端末では現在地を取得できません");
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => load({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {
        setError("現在地の取得を許可してください");
        setLoading(false);
      },
    );
  }

  // 機能②：表示中の地点をお気に入りに追加／削除
  const isFavorite = !!data && favorites.some((f) => f.label === data.location);

  function toggleFavorite() {
    if (!data) return;
    if (isFavorite) {
      setFavorites((prev) => prev.filter((f) => f.label !== data.location));
    } else {
      setFavorites((prev) => [
        ...prev,
        { label: data.location, lat: data.coord.lat, lon: data.coord.lon },
      ]);
    }
  }

  const selected =
    data?.daily.find((d) => d.date === selectedDate) ?? data?.daily[0] ?? null;

  return (
    <div className="w-full max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          天気予報
        </h1>
        <p className="mt-1 text-sm text-black/50 dark:text-white/50">
          都市を検索するか、現在地から気温・天気・湿度・降水確率を表示します。
        </p>
      </header>

      {/* 検索フォーム */}
      <form onSubmit={onSearch} className="mb-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="都市名（例: 東京 / 大阪 / London）"
          aria-label="都市名"
          className="min-w-0 flex-1 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:bg-white/5 dark:focus:border-white/40"
        />
        <button
          type="submit"
          className="bg-foreground text-background shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
          disabled={loading}
        >
          検索
        </button>
        <button
          type="button"
          onClick={onGeolocate}
          className="shrink-0 rounded-lg border border-black/10 px-3 py-2 text-sm font-medium transition-colors hover:bg-black/[0.03] disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5"
          disabled={loading}
          title="現在地から取得"
        >
          📍 現在地
        </button>
      </form>

      {/* 機能②：お気に入り都市 */}
      {favorites.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {favorites.map((f) => (
            <span
              key={f.label}
              className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-black/[0.03] py-1 pr-1 pl-3 text-xs dark:border-white/15 dark:bg-white/5"
            >
              <button
                type="button"
                onClick={() => load({ lat: f.lat, lon: f.lon })}
                className="font-medium hover:underline"
                title={`${f.label} の天気を表示`}
              >
                ⭐ {f.label}
              </button>
              <button
                type="button"
                onClick={() =>
                  setFavorites((prev) =>
                    prev.filter((x) => x.label !== f.label),
                  )
                }
                aria-label={`${f.label} をお気に入りから削除`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-black/40 hover:bg-black/10 hover:text-black/70 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/70"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}

      {loading && !data && (
        <p className="text-sm text-black/50 dark:text-white/50">読み込み中…</p>
      )}

      {data && (
        <div className={loading ? "opacity-60 transition-opacity" : ""}>
          {/* 現在の天気（機能③：天気で背景が変化） */}
          <section
            className={`mb-6 rounded-2xl border border-black/10 p-5 transition-colors dark:border-white/10 ${weatherBackground(
              data.current.icon,
            )}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-black/70 dark:text-white/70">
                {data.location}
              </p>
              {/* 機能②：お気に入り登録トグル */}
              <button
                type="button"
                onClick={toggleFavorite}
                aria-pressed={isFavorite}
                className="shrink-0 rounded-full border border-black/10 bg-white/40 px-2 py-1 text-xs font-medium backdrop-blur transition-colors hover:bg-white/70 dark:border-white/20 dark:bg-black/20 dark:hover:bg-black/40"
              >
                {isFavorite ? "⭐ 登録済み" : "☆ お気に入り"}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-4">
              <Image
                src={iconUrl(data.current.icon)}
                alt={data.current.description}
                width={80}
                height={80}
                className="h-20 w-20"
                unoptimized
              />
              <div>
                <div className="text-5xl font-bold">{data.current.temp}°</div>
                <div className="text-sm text-black/70 dark:text-white/70">
                  {data.current.description}・体感 {data.current.feelsLike}°
                </div>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Metric label="湿度" value={`${data.current.humidity}%`} />
              <Metric label="降水確率" value={`${data.current.pop}%`} />
            </dl>
          </section>

          {/* カレンダー（日付選択） */}
          <section className="mb-4">
            <h2 className="mb-2 text-sm font-medium text-black/60 dark:text-white/60">
              日付を選ぶ
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {data.daily.map((day) => (
                <DateButton
                  key={day.date}
                  day={day}
                  active={day.date === selected?.date}
                  onClick={() => setSelectedDate(day.date)}
                />
              ))}
            </div>
          </section>

          {/* 選択日の詳細 */}
          {selected && <DayDetail day={selected} />}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/40 px-3 py-2 dark:bg-black/20">
      <dt className="text-xs text-black/50 dark:text-white/50">{label}</dt>
      <dd className="text-base font-semibold">{value}</dd>
    </div>
  );
}

function DateButton({
  day,
  active,
  onClick,
}: {
  day: DailyForecast;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 flex-col items-center gap-1 rounded-xl border px-3 py-2 transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-black/10 hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/5"
      }`}
    >
      <span className="text-xs font-medium">{formatDate(day.date)}</span>
      <Image
        src={iconUrl(day.icon)}
        alt={day.description}
        width={40}
        height={40}
        className="h-10 w-10"
        unoptimized
      />
      <span className="text-xs">
        {day.tempMax}° / {day.tempMin}°
      </span>
    </button>
  );
}

function DayDetail({ day }: { day: DailyForecast }) {
  return (
    <section className="rounded-2xl border border-black/10 bg-black/[0.02] p-5 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{formatDate(day.date)}</h3>
        <span className="text-sm text-black/60 dark:text-white/60">
          {day.description}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <Metric
          label="最高 / 最低"
          value={`${day.tempMax}° / ${day.tempMin}°`}
        />
        <Metric label="湿度" value={`${day.humidity}%`} />
        <Metric label="降水確率" value={`${day.pop}%`} />
      </dl>

      <h4 className="mt-4 mb-2 text-xs font-medium text-black/50 dark:text-white/50">
        時間ごと（3時間おき）
      </h4>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {day.hourly.map((h) => (
          <div
            key={h.time}
            className="flex shrink-0 flex-col items-center gap-0.5 rounded-lg bg-black/[0.03] px-3 py-2 text-center dark:bg-white/5"
          >
            <span className="text-xs text-black/50 dark:text-white/50">
              {h.time}
            </span>
            <Image
              src={iconUrl(h.icon)}
              alt={h.description}
              width={36}
              height={36}
              className="h-9 w-9"
              unoptimized
            />
            <span className="text-sm font-semibold">{h.temp}°</span>
            <span className="text-[11px] text-sky-600 dark:text-sky-400">
              ☔{h.pop}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
