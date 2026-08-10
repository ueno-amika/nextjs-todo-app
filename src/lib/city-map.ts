/**
 * 日本語の都市・都道府県名を、OpenWeatherMap が認識できる英語名に変換する。
 * 辞書に無い入力（英語の都市名など）はそのまま返すので、海外都市もそのまま検索できる。
 */

const JP_TO_EN: Record<string, string> = {
  // 主要都市
  東京: "Tokyo",
  大阪: "Osaka",
  京都: "Kyoto",
  横浜: "Yokohama",
  名古屋: "Nagoya",
  札幌: "Sapporo",
  福岡: "Fukuoka",
  神戸: "Kobe",
  仙台: "Sendai",
  広島: "Hiroshima",
  那覇: "Naha",
  沖縄: "Naha",
  金沢: "Kanazawa",
  新潟: "Niigata",
  静岡: "Shizuoka",
  岡山: "Okayama",
  熊本: "Kumamoto",
  鹿児島: "Kagoshima",
  長崎: "Nagasaki",
  奈良: "Nara",
  和歌山: "Wakayama",
  岐阜: "Gifu",
  長野: "Nagano",
  富山: "Toyama",
  福井: "Fukui",
  甲府: "Kofu",
  前橋: "Maebashi",
  宇都宮: "Utsunomiya",
  水戸: "Mito",
  福島: "Fukushima",
  山形: "Yamagata",
  秋田: "Akita",
  盛岡: "Morioka",
  青森: "Aomori",
  松江: "Matsue",
  鳥取: "Tottori",
  山口: "Yamaguchi",
  高松: "Takamatsu",
  徳島: "Tokushima",
  松山: "Matsuyama",
  高知: "Kochi",
  佐賀: "Saga",
  大分: "Oita",
  宮崎: "Miyazaki",
  津: "Tsu",
  大津: "Otsu",
  // 都道府県名（県庁所在地などに寄せる）
  北海道: "Sapporo",
  神奈川: "Yokohama",
  千葉: "Chiba",
  埼玉: "Saitama",
  愛知: "Nagoya",
  兵庫: "Kobe",
  宮城: "Sendai",
  石川: "Kanazawa",
  // 海外の主要都市（日本語表記）
  ロンドン: "London",
  パリ: "Paris",
  ニューヨーク: "New York",
  ソウル: "Seoul",
  台北: "Taipei",
  香港: "Hong Kong",
  シンガポール: "Singapore",
  バンコク: "Bangkok",
  シドニー: "Sydney",
  ハワイ: "Honolulu",
  ホノルル: "Honolulu",
  ロサンゼルス: "Los Angeles",
};

/**
 * 入力を検索用のクエリ文字列に変換する。
 * - 日本語名 → 英語名
 * - 「大阪市」「東京都」など末尾の 都/道/府/県/市 を除いても照合
 * - 見つからなければそのまま返す（英語都市名などをそのまま検索）
 */
export function toCityQuery(input: string): string {
  const trimmed = input.trim();
  if (JP_TO_EN[trimmed]) return JP_TO_EN[trimmed];

  const stripped = trimmed.replace(/[都道府県市区町村]$/, "");
  if (JP_TO_EN[stripped]) return JP_TO_EN[stripped];

  return trimmed;
}
