/**
 * OpenWeatherMap 連携（サーバー専用）。
 * API キーは環境変数 OPENWEATHER_API_KEY から読み、クライアントには渡さない。
 */

const BASE = "https://api.openweathermap.org/data/2.5";

/** クライアントに返す整形済みの天気データ */
export type WeatherData = {
  /** 表示用の地点名（例: "東京都, JP"） */
  location: string;
  /** 地点の座標（お気に入りの再取得などに使う） */
  coord: { lat: number; lon: number };
  /** 現在の天気 */
  current: CurrentWeather;
  /** 日別にまとめた予報（今日を含め最大6日程度） */
  daily: DailyForecast[];
};

export type CurrentWeather = {
  temp: number;
  feelsLike: number;
  humidity: number;
  description: string;
  icon: string;
  /** 直近の降水確率(0-100)。現在天気APIには無いため予報の先頭から補完 */
  pop: number;
};

export type DailyForecast = {
  /** YYYY-MM-DD（地点のローカル日付） */
  date: string;
  tempMin: number;
  tempMax: number;
  humidity: number;
  /** その日の最大降水確率(0-100) */
  pop: number;
  description: string;
  icon: string;
  /** 3時間ごとの詳細 */
  hourly: HourlyForecast[];
};

export type HourlyForecast = {
  /** "HH:mm" 表記（地点のローカル時刻） */
  time: string;
  temp: number;
  humidity: number;
  pop: number;
  description: string;
  icon: string;
};

/** OpenWeatherMap のエラーを表す（HTTPステータスを保持） */
export class WeatherApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "WeatherApiError";
  }
}

type Query = { city: string } | { lat: number; lon: number };

function apiKey(): string {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) {
    throw new WeatherApiError(
      500,
      "OPENWEATHER_API_KEY が未設定です。.env.local に設定してください。",
    );
  }
  return key;
}

function buildUrl(path: string, query: Query, key: string): string {
  const params = new URLSearchParams({
    appid: key,
    units: "metric",
    lang: "ja",
  });
  if ("city" in query) {
    params.set("q", query.city);
  } else {
    params.set("lat", String(query.lat));
    params.set("lon", String(query.lon));
  }
  return `${BASE}/${path}?${params.toString()}`;
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  // 天気は頻繁に変わるためキャッシュせず毎回取得
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      typeof data.message === "string"
        ? data.message
        : "天気の取得に失敗しました";
    throw new WeatherApiError(res.status, message);
  }
  return data;
}

/** UTCの秒 + タイムゾーンオフセット秒 → 地点ローカルのDate */
function toLocal(dtSec: number, tzOffsetSec: number): Date {
  return new Date((dtSec + tzOffsetSec) * 1000);
}

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  // getUTC* を使うのは toLocal で既にオフセットを足しているため
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function hm(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** 現在天気 + 5日/3時間予報を取得し、クライアント用に整形して返す */
export async function getWeather(query: Query): Promise<WeatherData> {
  const key = apiKey();
  const [current, forecast] = await Promise.all([
    fetchJson(buildUrl("weather", query, key)),
    fetchJson(buildUrl("forecast", query, key)),
  ]);

  const city = forecast.city as {
    timezone?: number;
    name?: string;
    country?: string;
    coord?: { lat: number; lon: number };
  };
  const tz = city?.timezone ?? 0;
  const cityName = city?.name ?? "";
  const country = city?.country ?? "";
  const location = [cityName, country].filter(Boolean).join(", ");
  const coord = { lat: city?.coord?.lat ?? 0, lon: city?.coord?.lon ?? 0 };

  const list = (forecast.list as ForecastEntry[]) ?? [];

  // 日別にグルーピング
  const byDate = new Map<string, HourlyForecast[]>();
  for (const item of list) {
    const local = toLocal(item.dt, tz);
    const date = ymd(local);
    const hourly: HourlyForecast = {
      time: hm(local),
      temp: Math.round(item.main.temp),
      humidity: item.main.humidity,
      pop: Math.round((item.pop ?? 0) * 100),
      description: item.weather[0]?.description ?? "",
      icon: item.weather[0]?.icon ?? "01d",
    };
    const arr = byDate.get(date) ?? [];
    arr.push(hourly);
    byDate.set(date, arr);
  }

  const daily: DailyForecast[] = [...byDate.entries()].map(([date, hours]) => {
    const temps = hours.map((h) => h.temp);
    const pops = hours.map((h) => h.pop);
    const humidities = hours.map((h) => h.humidity);
    // その日の代表天気: 正午に最も近い時刻のものを採用
    const rep =
      hours.find((h) => h.time >= "12:00") ??
      hours[Math.floor(hours.length / 2)];
    return {
      date,
      tempMin: Math.min(...temps),
      tempMax: Math.max(...temps),
      humidity: Math.round(
        humidities.reduce((a, b) => a + b, 0) / humidities.length,
      ),
      pop: Math.max(...pops),
      description: rep.description,
      icon: rep.icon,
      hourly: hours,
    };
  });

  const cur = current as CurrentApiResponse;
  const currentWeather: CurrentWeather = {
    temp: Math.round(cur.main.temp),
    feelsLike: Math.round(cur.main.feels_like),
    humidity: cur.main.humidity,
    description: cur.weather[0]?.description ?? "",
    icon: cur.weather[0]?.icon ?? "01d",
    pop: daily[0]?.hourly[0]?.pop ?? 0,
  };

  return { location, coord, current: currentWeather, daily };
}

// --- OpenWeatherMap のレスポンス型（必要な部分のみ） ---

type ForecastEntry = {
  dt: number;
  main: { temp: number; humidity: number };
  weather: { description: string; icon: string }[];
  pop?: number;
};

type CurrentApiResponse = {
  main: { temp: number; feels_like: number; humidity: number };
  weather: { description: string; icon: string }[];
};
