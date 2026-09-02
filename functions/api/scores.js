const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT player_name AS name, score, mode, max_speed AS maxSpeed, best_combo AS bestCombo, created_at AS createdAt
       FROM scores ORDER BY score DESC, created_at ASC LIMIT 10`,
    ).all();
    return json({ scores: results ?? [], worldBest: results?.[0]?.score ?? 0 });
  } catch (error) {
    return json(
      { error: "ランキングを取得できませんでした。D1の設定をご確認ください。" },
      500,
    );
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const rawName = String(body.name ?? "")
      .trim()
      .replace(/[<>]/g, "");
    const normalizedName = rawName.normalize("NFKC").replace(/\s/g, "");
    const creatorName =
      normalizedName === "ゆめみねこ" ||
      normalizedName === "ゆめみねこ(製作者)";
    const token =
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (creatorName && (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN)) {
      return json(
        { error: "製作者名での登録には管理者パスワードが必要です。" },
        401,
      );
    }
    const name = creatorName ? "ゆめみねこ（製作者）" : rawName.slice(0, 12);
    const score = Number(body.score),
      maxSpeed = Number(body.maxSpeed),
      bestCombo = Number(body.bestCombo);
    const mode = body.mode === "hits" ? "hits" : "time";
    if (
      !name ||
      !Number.isInteger(score) ||
      score < 1 ||
      score > 100000000 ||
      !Number.isFinite(maxSpeed) ||
      maxSpeed < 1 ||
      maxSpeed > 8.1 ||
      !Number.isInteger(bestCombo) ||
      bestCombo < 0 ||
      bestCombo > 1000000
    ) {
      return json({ error: "スコアデータが正しくありません。" }, 400);
    }
    await env.DB.prepare(
      `INSERT INTO scores (player_name, score, mode, max_speed, best_combo) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(name, score, mode, maxSpeed, bestCombo)
      .run();
    await env.DB.prepare(
      `DELETE FROM scores WHERE id NOT IN (SELECT id FROM scores ORDER BY score DESC, created_at ASC LIMIT 500)`,
    ).run();
    const best = await env.DB.prepare(
      `SELECT MAX(score) AS score FROM scores`,
    ).first();
    return json({ ok: true, worldBest: best?.score ?? score }, 201);
  } catch (error) {
    return json({ error: "スコアを保存できませんでした。" }, 500);
  }
}
