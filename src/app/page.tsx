import WeatherApp from "@/components/weather-app";

export default function Home() {
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
      <WeatherApp />
    </main>
  );
}
