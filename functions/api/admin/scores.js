import {reservedName,displayRecord,CREATOR_RECORD} from '../../../lib/creator-identity.js';
import { scoreTable } from "../scores.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

function authorized(request, env) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return Boolean(env.ADMIN_TOKEN && token && token === env.ADMIN_TOKEN);
}

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env))
    return json({ error: "認証に失敗しました。" }, 401);
  try {
    const mode = new URL(request.url).searchParams.get("mode") ?? "time";
    if (!["time", "cosmos"].includes(mode))
      return json({ error: "モードが正しくありません。" }, 400);
    const table = await scoreTable(env, mode);
    const { results } = await env.DB.prepare(
      `SELECT id, player_name AS name, score, max_speed AS maxSpeed,
              best_combo AS bestCombo, created_at AS createdAt
       FROM ${table} ORDER BY created_at DESC, id DESC LIMIT 500`,
    ).all();
    const summary = await env.DB.prepare(
      `SELECT COUNT(*) AS total, COALESCE(MAX(score), 0) AS worldBest,
              COUNT(DISTINCT player_id) +
              COALESCE(SUM(CASE WHEN player_id IS NULL THEN 1 ELSE 0 END), 0)
              AS players FROM ${table}`,
    ).first();
    return json({ scores: (results ?? []).map(displayRecord), summary });
  } catch {
    return json({ error: "管理データを取得できませんでした。" }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  if (!authorized(request, env))
    return json({ error: "認証に失敗しました。" }, 401);
  try {
    const mode = new URL(request.url).searchParams.get("mode") ?? "time";
    if (!["time", "cosmos"].includes(mode))
      return json({ error: "モードが正しくありません。" }, 400);
    const table = await scoreTable(env, mode);
    const body = await request.json();
    const id = Number(body.id);
    const rawName = String(body.name ?? "")
      .trim()
      .replace(/[<>]/g, "");
    const name = reservedName(rawName) ? CREATOR_RECORD : rawName.slice(0,12);
    const score = Number(body.score);
    const maxSpeed = Number(body.maxSpeed);
    const bestCombo = Number(body.bestCombo);
    if (
      !Number.isInteger(id) ||
      id < 1 ||
      !name ||
      !Number.isInteger(score) ||
      score < 1 ||
      score > 100000000 ||
      !Number.isFinite(maxSpeed) ||
      maxSpeed < 1 ||
      (mode !== "cosmos" && maxSpeed > 8.1) ||
      !Number.isInteger(bestCombo) ||
      bestCombo < 0 ||
      bestCombo > 1000000
    ) {
      return json({ error: "編集内容が正しくありません。" }, 400);
    }
    const result = await env.DB.prepare(
      `UPDATE ${table} SET player_name = ?, score = ?, max_speed = ?, best_combo = ? WHERE id = ?`,
    )
      .bind(name, score, maxSpeed, bestCombo, id)
      .run();
    if (!result.meta?.changes)
      return json({ error: "該当する記録がありません。" }, 404);
    return json({ ok: true });
  } catch {
    return json({ error: "編集処理に失敗しました。" }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  if (!authorized(request, env))
    return json({ error: "認証に失敗しました。" }, 401);
  try {
    const mode = new URL(request.url).searchParams.get("mode") ?? "time";
    if (!["time", "cosmos"].includes(mode))
      return json({ error: "モードが正しくありません。" }, 400);
    const table = await scoreTable(env, mode);
    const body = await request.json();
    if (body.all === true) {
      const result = await env.DB.prepare(`DELETE FROM ${table}`).run();
      return json({ ok: true, deleted: result.meta?.changes ?? 0 });
    }
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1)
      return json({ error: "IDが正しくありません。" }, 400);
    const result = await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`)
      .bind(id)
      .run();
    if (!result.meta?.changes)
      return json({ error: "該当する記録がありません。" }, 404);
    return json({ ok: true, deleted: 1 });
  } catch {
    return json({ error: "削除処理に失敗しました。" }, 500);
  }
}


