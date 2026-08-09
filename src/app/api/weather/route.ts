import type { NextRequest } from "next/server";
import { getWeather, WeatherApiError } from "@/lib/weather";

/**
 * GET /api/weather?city=Tokyo
 * GET /api/weather?lat=35.68&lon=139.76
 * OpenWeatherMap を server 側で叩き、API キーをクライアントに晒さずに天気を返す。
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const city = searchParams.get("city")?.trim();
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  try {
    let data;
    if (lat && lon) {
      data = await getWeather({ lat: Number(lat), lon: Number(lon) });
    } else if (city) {
      data = await getWeather({ city });
    } else {
      return Response.json(
        { error: "city か lat/lon のいずれかを指定してください" },
        { status: 400 },
      );
    }
    return Response.json(data);
  } catch (e) {
    if (e instanceof WeatherApiError) {
      const message =
        e.status === 404 ? "都市が見つかりませんでした" : e.message;
      return Response.json({ error: message }, { status: e.status });
    }
    console.error(e);
    return Response.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
