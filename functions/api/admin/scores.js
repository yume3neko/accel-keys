const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

function authorized(request, env) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return Boolean(env.ADMIN_TOKEN && token && token === env.ADMIN_TOKEN);
}

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) return json({ error: "認証に失敗しました。" }, 401);
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, player_name AS name, score, mode, max_speed AS maxSpeed,
              best_combo AS bestCombo, created_at AS createdAt
       FROM scores ORDER BY created_at DESC, id DESC LIMIT 500`
    ).all();
    const summary = await env.DB.prepare(
      `SELECT COUNT(*) AS total, COALESCE(MAX(score), 0) AS worldBest,
              COUNT(DISTINCT player_name) AS players FROM scores`
    ).first();
    return json({ scores: results ?? [], summary });
  } catch {
    return json({ error: "管理データを取得できませんでした。" }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  if (!authorized(request, env)) return json({ error: "認証に失敗しました。" }, 401);
  try {
    const body = await request.json();
    if (body.all === true) {
      const result = await env.DB.prepare("DELETE FROM scores").run();
      return json({ ok: true, deleted: result.meta?.changes ?? 0 });
    }
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) return json({ error: "IDが正しくありません。" }, 400);
    const result = await env.DB.prepare("DELETE FROM scores WHERE id = ?").bind(id).run();
    if (!result.meta?.changes) return json({ error: "該当する記録がありません。" }, 404);
    return json({ ok: true, deleted: 1 });
  } catch {
    return json({ error: "削除処理に失敗しました。" }, 500);
  }
}
