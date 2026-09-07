import {identifyName,displayRecord,CREATOR_RECORD} from '../../lib/creator-identity.js';
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });

const PLAYER_COOKIE = "accel_player_id";
const PLAYER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readPlayerId(request) {
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === PLAYER_COOKIE)?.[1];
  return value && PLAYER_ID_PATTERN.test(value) ? value.toLowerCase() : null;
}

function getPlayer(request) {
  const existing = readPlayerId(request);
  if (existing) return { id: existing, headers: {} };
  const id = crypto.randomUUID();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return {
    id,
    headers: {
      "set-cookie": `${PLAYER_COOKIE}=${id}; Path=/; Max-Age=315360000; HttpOnly; SameSite=Lax${secure}`,
    },
  };
}

function normalizeReplay(value) {
  if (!value || typeof value !== "object") return null;
  const duration = Number(value.duration);
  const lineOffset = Number(value.lineOffset);
  const missLimit = Number(value.missLimit ?? 3);
  if (
    value.version !== 1 ||
    !Number.isInteger(duration) ||
    duration < 0 ||
    duration > 3600000 ||
    !Number.isFinite(lineOffset) ||
    lineOffset < -15 ||
    lineOffset > 160 ||
    !Number.isInteger(missLimit) ||
    (missLimit !== 3 && missLimit !== 4) ||
    !Array.isArray(value.events) ||
    value.events.length > 12000
  )
    return null;
  const events = [];
  for (const event of value.events) {
    if (!Array.isArray(event) || event.length < 3) return null;
    const type = Number(event[0]);
    const time = Number(event[1]);
    const noteId = Number(event[2]);
    if (
      !Number.isInteger(type) ||
      type < 0 ||
      type > 2 ||
      !Number.isInteger(time) ||
      time < 0 ||
      time > duration + 1000 ||
      !Number.isInteger(noteId) ||
      noteId < 1
    )
      return null;
    if (type === 0) {
      const lane = Number(event[3]);
      if (!Number.isInteger(lane) || lane < 0 || lane > 3) return null;
      events.push([0, time, noteId, lane]);
    } else if (type === 1) {
      const judgement = Number(event[3]);
      if (!Number.isInteger(judgement) || judgement < 0 || judgement > 2)
        return null;
      events.push([1, time, noteId, judgement]);
    } else events.push([2, time, noteId]);
  }
  return { version: 1, duration, lineOffset, missLimit, events };
}

// The original scores table restricts mode to time/hits. Keep all existing
// records intact and provision the independent cosmos leaderboard on first use.
export async function scoreTable(env, mode) {
  if (mode !== "cosmos") return "scores";
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scores_cosmos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    score INTEGER NOT NULL CHECK(score > 0),
    mode TEXT NOT NULL DEFAULT 'cosmos',
    max_speed REAL NOT NULL,
    best_combo INTEGER NOT NULL,
    player_id TEXT UNIQUE,
    perfect_count INTEGER NOT NULL DEFAULT 0,
    great_count INTEGER NOT NULL DEFAULT 0,
    good_count INTEGER NOT NULL DEFAULT 0,
    miss_count INTEGER NOT NULL DEFAULT 0,
    high_speed REAL NOT NULL DEFAULT 1,
    replay_data TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  return "scores_cosmos";
}

export async function onRequestGet({ request, env }) {
  const player = getPlayer(request);
  try {
    const params = new URL(request.url).searchParams;
    const mode = params.get("mode") ?? "time";
    if (!["time", "cosmos"].includes(mode))
      return json({ error: "モードが正しくありません。" }, 400, player.headers);
    const table = await scoreTable(env, mode);
    const id = Number(params.get("id"));
    if (Number.isInteger(id) && id > 0) {
      const record = await env.DB.prepare(
        `SELECT id, player_name AS name, score, max_speed AS maxSpeed,
                best_combo AS bestCombo, perfect_count AS perfect,
                great_count AS great, good_count AS good, miss_count AS miss,
                high_speed AS highSpeed, replay_data AS replay,
                created_at AS createdAt
         FROM ${table} WHERE id = ?`,
      )
        .bind(id)
        .first();
      if (!record)
        return json({ error: "記録が見つかりません。" }, 404, player.headers);
      let replay = null;
      try {
        replay = record.replay ? JSON.parse(record.replay) : null;
      } catch {}
      return json({ record: { ...displayRecord(record), replay } }, 200, player.headers);
    }
    const { results } = await env.DB.prepare(
      `SELECT id, player_name AS name, score, max_speed AS maxSpeed,
              best_combo AS bestCombo, created_at AS createdAt
       FROM ${table} ORDER BY score DESC, created_at ASC LIMIT 10`,
    ).all();
    return json(
      { scores: (results ?? []).map(displayRecord), worldBest: results?.[0]?.score ?? 0 },
      200,
      player.headers,
    );
  } catch (error) {
    return json(
      { error: "ランキングを取得できませんでした。D1の設定をご確認ください。" },
      500,
      player.headers,
    );
  }
}

export async function onRequestPost({ request, env }) {
  const player = getPlayer(request);
  try {
    const body = await request.json();
    const mode = body.mode ?? "time";
    if (!["time", "cosmos"].includes(mode))
      return json({ error: "モードが正しくありません。" }, 400, player.headers);
    const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")??"";
    let identity;
    try{identity=identifyName(body.name,token,env);}catch(e){return json({error:e.message,code:e.code},e.status,player.headers);}
    const name=identity.creator?CREATOR_RECORD:identity.name;
    const score = Number(body.score),
      maxSpeed = Number(body.maxSpeed),
      bestCombo = Number(body.bestCombo),
      perfect = Number(body.perfect ?? 0),
      great = Number(body.great ?? 0),
      good = Number(body.good ?? 0),
      miss = Number(body.miss ?? 0),
      highSpeed = Number(body.highSpeed ?? 1),
      replay = body.replay == null ? null : normalizeReplay(body.replay);
    if (
      !name ||
      !Number.isInteger(score) ||
      score < 1 ||
      score > 100000000 ||
      !Number.isFinite(maxSpeed) ||
      maxSpeed < 1 ||
      (mode !== "cosmos" && maxSpeed > 8.1) ||
      !Number.isInteger(bestCombo) ||
      bestCombo < 0 ||
      bestCombo > 1000000 ||
      !Number.isInteger(perfect) ||
      perfect < 0 ||
      perfect > 1000000 ||
      !Number.isInteger(great) ||
      great < 0 ||
      great > 1000000 ||
      !Number.isInteger(good) ||
      good < 0 ||
      good > 1000000 ||
      !Number.isInteger(miss) ||
      miss < 0 ||
      miss > 4 ||
      !Number.isFinite(highSpeed) ||
      highSpeed < 0.5 ||
      highSpeed > 2 ||
      (body.replay != null && !replay)
    ) {
      return json(
        { error: "スコアデータが正しくありません。" },
        400,
        player.headers,
      );
    }
    const table = await scoreTable(env, mode);
    const result = await env.DB.prepare(
      `INSERT INTO ${table} (
         player_name, score, mode, max_speed, best_combo, player_id,
         perfect_count, great_count, good_count, miss_count, high_speed, replay_data
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(player_id) DO UPDATE SET
         player_name = excluded.player_name,
         score = excluded.score,
         mode = excluded.mode,
         max_speed = excluded.max_speed,
         best_combo = excluded.best_combo,
         perfect_count = excluded.perfect_count,
         great_count = excluded.great_count,
         good_count = excluded.good_count,
         miss_count = excluded.miss_count,
         high_speed = excluded.high_speed,
         replay_data = excluded.replay_data,
         created_at = datetime('now')
       WHERE excluded.score > ${table}.score`,
    )
      .bind(
        name,
        score,
        mode,
        maxSpeed,
        bestCombo,
        player.id,
        perfect,
        great,
        good,
        miss,
        highSpeed,
        replay ? JSON.stringify(replay) : null,
      )
      .run();
    await env.DB.prepare(
      `DELETE FROM ${table} WHERE id NOT IN (SELECT id FROM ${table} ORDER BY score DESC, created_at ASC LIMIT 500)`,
    ).run();
    const best = await env.DB.prepare(
      `SELECT MAX(score) AS score FROM ${table}`,
    ).first();
    return json(
      {
        ok: true,
        updated: Boolean(result.meta?.changes),
        worldBest: best?.score ?? score,
      },
      result.meta?.changes ? 201 : 200,
      player.headers,
    );
  } catch (error) {
    return json(
      { error: "スコアを保存できませんでした。" },
      500,
      player.headers,
    );
  }
}


