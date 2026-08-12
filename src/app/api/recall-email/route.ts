/**
 * POST /api/recall-email
 * body: { from?: string; to: string; subject: string; text: string }
 *
 * Resend（https://resend.com）経由でリコールメールを送信する。
 * API キーはサーバー側の環境変数 RESEND_API_KEY で管理し、クライアントには晒さない。
 */
export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          "メール送信の設定が未完了です。.env.local に RESEND_API_KEY を設定して開発サーバーを再起動してください。",
      },
      { status: 501 },
    );
  }

  let body: {
    from?: string;
    to?: string;
    subject?: string;
    text?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "リクエストの形式が不正です" },
      { status: 400 },
    );
  }

  const { from, to, subject, text } = body;
  if (!to || !subject || !text) {
    return Response.json(
      { error: "to・subject・text は必須です" },
      { status: 400 },
    );
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from || process.env.RESEND_FROM || "onboarding@resend.dev",
        to,
        subject,
        text,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: data?.message || "メールの送信に失敗しました" },
        { status: res.status },
      );
    }
    return Response.json({ id: data?.id ?? null });
  } catch (e) {
    console.error(e);
    return Response.json(
      { error: "メール送信中にサーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
