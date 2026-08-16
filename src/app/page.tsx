import type { Metadata } from "next";
import RecallApp from "@/components/recall-app";

export const metadata: Metadata = {
  title: "リコール管理",
  description:
    "歯科の次回検診予定を自動計算し、連絡すべき患者を一覧・管理できるリコール管理アプリ",
};

export default function Home() {
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
      <RecallApp />
    </main>
  );
}
