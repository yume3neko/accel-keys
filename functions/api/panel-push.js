export async function onRequestPost(context) {
    const env = { DB: context.env.PANEL_DB };
    const difficultyRanges = { easy: [1, 3], normal: [3, 7], hard: [5, 10], expert: [7, 15], master: [9, 17], lunatic: [12, 22], ura_easy: [1, 3], ura_normal: [3, 7], ura_hard: [5, 10], ura_expert: [7, 15], ura_master: [9, 17], ura_lunatic: [12, 22] };
    function difficultyLabel(d) { return d.startsWith('ura_') ? '裏' + d.slice(4).toUpperCase() : d.toUpperCase(); }
    function targetCount(difficulty, round) { const [min, max] = difficultyRanges[difficulty] ?? difficultyRanges.normal; return Math.min(max, min + Math.floor(round / 2)); }
    function pattern(seed, round, count) { let x = (seed ^ Math.imul(round + 1, 0x9e3779b1)) >>> 0; const a = Array.from({ length: 25 }, (_, i) => i); for (let i = 24; i > 0; i--) {
        x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
        const j = x % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    } return a.slice(0, count); }
    function boardPattern(seed, round, difficulty) {
        const cells = pattern(seed, round, targetCount(difficulty, round));
        if (!difficulty.startsWith('ura_'))
            return { safe: cells, damage: [], rate: 0 };
        let x = (seed ^ Math.imul(round + 1, 0x85ebca6b) ^ 0xc2b2ae35) >>> 0;
        const random = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
        const rates = { ura_easy: 10, ura_normal: 20, ura_hard: 30, ura_expert: 35, ura_master: 40 };
        const rate = difficulty === 'ura_lunatic' ? 10 + Math.floor(random() * 41) : rates[difficulty] ?? 0;
        const damage = cells.filter(() => random() * 100 < rate);
        // A board must always have a normal target, including one-tile EASY boards.
        if (damage.length === cells.length)
            damage.splice(Math.floor(random() * damage.length), 1);
        return { safe: cells.filter(i => !damage.includes(i)), damage, rate };
    }
    const ranges = difficultyRanges;
    const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
    const makeCode = () => { const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join(""); };
    const clean = (s, n) => String(s ?? "").trim().slice(0, n);
    function db() { if (!env.DB)
        throw new Error("ゲームデータベースに接続できません"); return env.DB; }
    const botSpecs = [[0, 0], [2, .75], [2.5, .77], [3, .77], [3.5, .80], [4, .85]];
    async function advanceBots(room, now) {
        const bots = await db().prepare("SELECT * FROM players WHERE room_code=? AND bot_level>0").bind(room.code).all();
        for (const bot of bots.results) {
            const [speed, accuracy] = botSpecs[bot.bot_level];
            const target = Math.floor(Math.max(0, Math.min(now, room.ends_at) - room.started_at) * speed / 1000);
            if (target <= bot.bot_tick)
                continue;
            let score = bot.score, combo = bot.combo, best = bot.best_combo, round = bot.current_round, mistakes = bot.mistakes, perfects = bot.perfects;
            let pressed = JSON.parse(bot.pressed);
            let salt = 0;
            for (const char of bot.id)
                salt = (Math.imul(salt, 31) + char.charCodeAt(0)) >>> 0;
            for (let tick = bot.bot_tick + 1; tick <= target; tick++) {
                let x = (room.seed ^ salt ^ Math.imul(tick, 0x9e3779b1)) >>> 0;
                x ^= x >>> 16;
                x = Math.imul(x, 0x7feb352d);
                x ^= x >>> 15;
                x = Math.imul(x, 0x846ca68b);
                x ^= x >>> 16;
                if ((x >>> 0) / 4294967296 < accuracy) {
                    const targets = boardPattern(room.seed, round, room.difficulty).safe;
                    pressed.push(targets.find(i => !pressed.includes(i)));
                    combo++;
                    best = Math.max(best, combo);
                    score += 100 + Math.min(combo, 20) * 5;
                    if (pressed.length === targets.length) {
                        score += 250 + (mistakes === 0 ? 500 : 0);
                        if (mistakes === 0)
                            perfects++;
                        round++;
                        mistakes = 0;
                        pressed = [];
                    }
                }
                else {
                    const board = boardPattern(room.seed, round, room.difficulty);
                    const damage = board.damage.length > 0 && ((x >>> 8) % Math.max(1, 25 - board.safe.length)) < board.damage.length;
                    score = Math.max(Math.min(0, bot.handicap), score - (damage ? 2000 : 50));
                    combo = 0;
                    mistakes++;
                    if (damage) {
                        round++;
                        pressed = [];
                        mistakes = 0;
                    }
                }
            }
            await db().prepare("UPDATE players SET score=?,combo=?,best_combo=?,current_round=?,pressed=?,mistakes=?,perfects=?,bot_tick=?,last_seen=? WHERE id=? AND bot_tick=? AND EXISTS(SELECT 1 FROM rooms WHERE code=? AND started_at=?)").bind(score, combo, best, round, JSON.stringify(pressed), mistakes, perfects, target, now, bot.id, bot.bot_tick, room.code, room.started_at).run();
        }
    }
    async function snapshot(roomCode, token) {
        const now = Date.now();
        let room = await db().prepare("SELECT * FROM rooms WHERE code=?").bind(roomCode).first();
        if (!room)
            throw new Error("ルームが見つかりません");
        if (room.status === "playing")
            await advanceBots(room, now);
        if (room.status === "playing" && room.ends_at && now >= room.ends_at) {
            await db().prepare("UPDATE rooms SET status='finished' WHERE code=?").bind(roomCode).run();
            room = { ...room, status: "finished" };
        }
        const rows = await db().prepare("SELECT COALESCE((SELECT ready FROM panel_readiness WHERE player_id=players.id AND room_code=players.room_code),0) AS ready,id,name,score,combo,best_combo,current_round,pressed,mistakes,perfects,last_seen,handicap,bot_level FROM players WHERE room_code=? ORDER BY joined_at").bind(roomCode).all();
        const chats = room.status === "waiting" ? await db().prepare("SELECT id,player_id,name,body,created_at FROM messages WHERE room_code=? ORDER BY id DESC LIMIT 50").bind(roomCode).all() : { results: [] };
        return { room: { code: room.code, status: room.status, hostId: room.host_id, duration: room.duration, difficulty: room.difficulty || "normal", seed: room.seed, startedAt: room.started_at, endsAt: room.ends_at }, players: rows.results.map((p) => ({ id: p.id, name: p.name, score: p.score, combo: p.combo, bestCombo: p.best_combo, round: p.current_round, pressed: JSON.parse(p.pressed || "[]"), mistakes: p.mistakes, perfects: p.perfects, handicap: p.handicap, botLevel: p.bot_level, ready: p.bot_level > 0 || !!p.ready, online: p.bot_level > 0 || now - p.last_seen < 9000 })), messages: [...chats.results].reverse().map((m) => ({ id: m.id, playerId: m.player_id, name: m.name, body: m.body, createdAt: m.created_at })), now, meId: token };
    }
    async function POST(request) {
        try {
            await db().prepare("CREATE TABLE IF NOT EXISTS panel_readiness (player_id TEXT PRIMARY KEY, room_code TEXT NOT NULL, ready INTEGER NOT NULL DEFAULT 0)").bind().run();
            const b = await request.json();
            const secret = clean(b.token, 64);
            if (!secret)
                return json({ error: "端末IDがありません" }, 400);
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
            const token = Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, '0')).join('');
            if (b.action === "create" || b.action === "join")
                await db().prepare("DELETE FROM panel_readiness WHERE player_id=?").bind(token).run();
            if (b.action === "create") {
                const name = clean(b.name, 12);
                if (!name)
                    return json({ error: "名前を入力してください" }, 400);
                let roomCode = makeCode();
                for (let i = 0; i < 4; i++) {
                    const hit = await db().prepare("SELECT code FROM rooms WHERE code=?").bind(roomCode).first();
                    if (!hit)
                        break;
                    roomCode = makeCode();
                }
                const duration = [30, 60, 90].includes(Number(b.duration)) ? Number(b.duration) : 60;
                const difficulty = (Object.keys(ranges).includes(String(b.difficulty)) ? b.difficulty : "normal");
                const now = Date.now();
                await db().batch([db().prepare("INSERT INTO rooms(code,host_id,status,duration,targets,difficulty,seed,created_at) VALUES(?,?,'waiting',?,4,?,?,?)").bind(roomCode, token, duration, difficulty, Math.floor(Math.random() * 2147483647), now), db().prepare("INSERT INTO players(id,room_code,name,joined_at,last_seen) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET room_code=excluded.room_code,name=excluded.name,joined_at=excluded.joined_at,last_seen=excluded.last_seen").bind(token, roomCode, name, now, now)]);
                return json(await snapshot(roomCode, token), 201);
            }
            const roomCode = clean(b.code, 6).toUpperCase();
            if (!roomCode)
                return json({ error: "ルームコードが必要です" }, 400);
            if (b.action === "join") {
                const room = await db().prepare("SELECT status FROM rooms WHERE code=?").bind(roomCode).first();
                if (!room)
                    return json({ error: "ルームが見つかりません" }, 404);
                if (room.status !== "waiting")
                    return json({ error: "このルームはすでに試合中です" }, 409);
                const name = clean(b.name, 12);
                if (!name)
                    return json({ error: "名前を入力してください" }, 400);
                const count = await db().prepare("SELECT COUNT(*) c FROM players WHERE room_code=?").bind(roomCode).first();
                if (count.c >= 8)
                    return json({ error: "ルームは満員です" }, 409);
                const now = Date.now();
                await db().prepare("INSERT INTO players(id,room_code,name,joined_at,last_seen) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET room_code=excluded.room_code,name=excluded.name,last_seen=excluded.last_seen").bind(token, roomCode, name, now, now).run();
                return json(await snapshot(roomCode, token));
            }
            const player = await db().prepare("SELECT * FROM players WHERE id=? AND room_code=?").bind(token, roomCode).first();
            if (!player)
                return json({ error: "このルームに参加していません" }, 403);
            await db().prepare("UPDATE players SET last_seen=? WHERE id=?").bind(Date.now(), token).run();
            if (b.action === "state")
                return json(await snapshot(roomCode, token));
            const room = await db().prepare("SELECT * FROM rooms WHERE code=?").bind(roomCode).first();
            if (!room)
                return json({ error: "ルームが見つかりません" }, 404);
            if (b.action === "ready") {
                if (room.status !== "waiting" || typeof b.ready !== "boolean")
                    return json({ error: "準備は待機中のみ変更できます" }, 409);
                await db().prepare("INSERT INTO panel_readiness(player_id,room_code,ready) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM rooms WHERE code=? AND status='waiting') ON CONFLICT(player_id) DO UPDATE SET room_code=excluded.room_code,ready=excluded.ready").bind(token, roomCode, b.ready ? 1 : 0, roomCode).run();
                return json(await snapshot(roomCode, token));
            }
            if (b.action === "lobby") {
                if (room.host_id !== token)
                    return json({ error: "ホストだけが変更できます" }, 403);
                if (room.status !== "finished")
                    return json({ error: "試合終了後のみ戻れます" }, 409);
                await db().batch([db().prepare("UPDATE rooms SET status='waiting',started_at=NULL,ends_at=NULL WHERE code=? AND status='finished'").bind(roomCode), db().prepare("DELETE FROM panel_readiness WHERE room_code=?").bind(roomCode)]);
                return json(await snapshot(roomCode, token));
            }
            if (b.action === "settings") {
                if (room.host_id !== token)
                    return json({ error: "ホストだけが変更できます" }, 403);
                if (room.status !== "waiting")
                    return json({ error: "設定変更は開始前のみです" }, 409);
                if (![30, 60, 90].includes(Number(b.duration)) || !Object.keys(ranges).includes(String(b.difficulty)))
                    return json({ error: "無効な設定です" }, 400);
                await db().prepare("UPDATE rooms SET duration=?,difficulty=? WHERE code=? AND status='waiting'").bind(b.duration, b.difficulty, roomCode).run();
                await db().prepare("DELETE FROM panel_readiness WHERE room_code=?").bind(roomCode).run();
                return json(await snapshot(roomCode, token));
            }
            if (b.action === "chat_send") {
                if (room.status !== "waiting")
                    return json({ error: "チャットは待機画面でのみ使えます" }, 409);
                const message = clean(b.message, 120);
                if (!message)
                    return json({ error: "メッセージを入力してください" }, 400);
                let announcement = message;
                if (message.startsWith("/")) {
                    if (room.host_id !== token)
                        return json({ error: "コマンドはホスト限定です" }, 403);
                    if (message === "/kick") {
                        const result = await db().batch([
                            db().prepare("UPDATE rooms SET status='closed' WHERE code=? AND status='waiting'").bind(roomCode),
                            ...["messages", "panel_readiness", "players"].map(table => db().prepare(`DELETE FROM ${table} WHERE room_code=? AND EXISTS(SELECT 1 FROM rooms WHERE code=? AND status='closed')`).bind(roomCode, roomCode)),
                            db().prepare("DELETE FROM rooms WHERE code=? AND status='closed'").bind(roomCode)
                        ]);
                        if (!result[0].meta.changes)
                            return json({ error: "待機中のみ解体できます" }, 409);
                        return json({ disbanded: true });
                    }
                    const bot = message.match(/^\/bot\s+(\d+)\s+([1-5])$/);
                    const handicap = message.match(/^\/handicap\s+(.+?)\s+([+-]?\d+)$/);
                    const kick = message.match(/^\/kick\s+(.+)$/);
                    if (bot) {
                        const count = Number(bot[1]), level = Number(bot[2]);
                        const existing = await db().prepare("SELECT COUNT(*) c FROM players WHERE room_code=?").bind(roomCode).first();
                        if (count < 1 || count > 8 - existing.c)
                            return json({ error: "BOTは1人以上、合計8人まで追加できます" }, 400);
                        const rows = await db().prepare("SELECT name FROM players WHERE room_code=?").bind(roomCode).all();
                        const names = new Set(rows.results.map((p) => p.name));
                        const inserts = [];
                        let n = 1;
                        for (let i = 0; i < count; i++) {
                            while (names.has("BOT" + n))
                                n++;
                            const name = "BOT" + n++;
                            names.add(name);
                            inserts.push(db().prepare("INSERT INTO players(id,room_code,name,joined_at,last_seen,bot_level) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM rooms WHERE code=? AND status='waiting')").bind("bot-" + crypto.randomUUID(), roomCode, name, Date.now() + i, Date.now(), level, roomCode));
                        }
                        await db().batch(inserts);
                        announcement = "BOTを" + count + "人追加しました（Lv." + level + "）";
                    }
                    else if (handicap) {
                        let name = handicap[1].trim();
                        if (name.startsWith('"') && name.endsWith('"'))
                            name = name.slice(1, -1);
                        const points = Number(handicap[2]);
                        if (!Number.isSafeInteger(points) || Math.abs(points) > 1000000)
                            return json({ error: "ハンデは−1000000〜1000000の整数です" }, 400);
                        const candidates = await db().prepare("SELECT id FROM players WHERE room_code=? AND name=?").bind(roomCode, name).all();
                        if (candidates.results.length !== 1)
                            return json({ error: candidates.results.length ? "同じ名前が複数あります。別の名前で参加してください" : "プレイヤーが見つかりません" }, 400);
                        await db().prepare("UPDATE players SET handicap=? WHERE id=? AND room_code=? AND EXISTS(SELECT 1 FROM rooms WHERE code=? AND status='waiting')").bind(points, candidates.results[0].id, roomCode, roomCode).run();
                        announcement = name + " のハンデを " + (points >= 0 ? "+" : "") + points + " 点に設定しました";
                    }
                    else if (kick) {
                        let name = kick[1].trim();
                        if (name.startsWith('"') && name.endsWith('"'))
                            name = name.slice(1, -1);
                        const matches = await db().prepare("SELECT id FROM players WHERE room_code=? AND name=?").bind(roomCode, name).all();
                        if (matches.results.length !== 1)
                            return json({ error: matches.results.length ? "同じ名前が複数あるため対象を特定できません" : "プレイヤーが見つかりません" }, 400);
                        const target = matches.results[0].id;
                        if (target === room.host_id)
                            return json({ error: "ホスト自身はキックできません" }, 400);
                        const removed = await db().prepare("DELETE FROM players WHERE id=? AND room_code=? AND EXISTS(SELECT 1 FROM rooms WHERE code=? AND status='waiting')").bind(target, roomCode, roomCode).run();
                        if (!removed.meta.changes)
                            return json({ error: "開始済み、または対象が退出済みです" }, 409);
                        await db().prepare("DELETE FROM panel_readiness WHERE player_id=? AND room_code=?").bind(target, roomCode).run();
                        announcement = name + " をルームから退出させました";
                    }
                    else
                        return json({ error: "書式: /bot 人数 レベル(1-5)、/handicap プレイヤー名 点数、/kick 対象ユーザー名" }, 400);
                }
                if (message.startsWith("/"))
                    await db().prepare("DELETE FROM panel_readiness WHERE room_code=?").bind(roomCode).run();
                await db().prepare("INSERT INTO messages(room_code,player_id,name,body,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM rooms WHERE code=? AND status='waiting')").bind(roomCode, token, player.name, announcement, Date.now(), roomCode).run();
                return json(await snapshot(roomCode, token));
            }
            if (b.action === "start") {
                if (room.host_id !== token)
                    return json({ error: "ホストだけが開始できます" }, 403);
                if (room.status !== "waiting")
                    return json({ error: "待機中のみ開始できます" }, 409);
                const now = Date.now(), startsAt = now + 3000;
                const result = await db().batch([
                    db().prepare("UPDATE rooms SET status='playing',seed=?,started_at=?,ends_at=? WHERE code=? AND status='waiting' AND NOT EXISTS(SELECT 1 FROM players p LEFT JOIN panel_readiness r ON r.player_id=p.id AND r.room_code=p.room_code WHERE p.room_code=? AND p.bot_level=0 AND (COALESCE(r.ready,0)=0 OR p.last_seen<?))").bind(Math.floor(Math.random() * 2147483647), startsAt, startsAt + room.duration * 1000, roomCode, roomCode, now - 9000),
                    db().prepare("UPDATE players SET score=handicap,bot_tick=0,combo=0,best_combo=0,current_round=0,pressed='[]',mistakes=0,perfects=0 WHERE room_code=? AND EXISTS(SELECT 1 FROM rooms WHERE code=? AND started_at=?)").bind(roomCode, roomCode, startsAt)
                ]);
                if (!result[0].meta.changes)
                    return json({ error: "全員がオンラインで準備完了になるまでお待ちください" }, 409);
                return json(await snapshot(roomCode, token));
            }
            if (b.action === "push") {
                if (room.status !== "playing" || Date.now() < room.started_at || Date.now() >= room.ends_at)
                    return json(await snapshot(roomCode, token));
                if (Number(b.round) !== player.current_round)
                    return json(await snapshot(roomCode, token));
                const index = Number(b.index);
                if (!Number.isInteger(index) || index < 0 || index > 24)
                    return json({ error: "無効なパネルです" }, 400);
                const board = boardPattern(room.seed, player.current_round, room.difficulty || "normal");
                const targets = board.safe;
                const pressed = JSON.parse(player.pressed || "[]");
                const correct = targets.includes(index) && !pressed.includes(index);
                let score = player.score, combo = player.combo, best = player.best_combo, mistakes = player.mistakes, round = player.current_round, perfects = player.perfects;
                if (correct) {
                    pressed.push(index);
                    combo++;
                    best = Math.max(best, combo);
                    score += 100 + Math.min(combo, 20) * 5;
                    if (pressed.length === targets.length) {
                        const perfect = mistakes === 0;
                        score += 250 + (perfect ? 500 : 0);
                        if (perfect)
                            perfects++;
                        round++;
                        mistakes = 0;
                        pressed.length = 0;
                    }
                }
                else {
                    score = Math.max(Math.min(0, player.handicap), score - (board.damage.includes(index) ? 2000 : 50));
                    combo = 0;
                    mistakes++;
                    if (board.damage.includes(index)) {
                        round++;
                        pressed.length = 0;
                        mistakes = 0;
                    }
                }
                await db().prepare("UPDATE players SET score=?,combo=?,best_combo=?,current_round=?,pressed=?,mistakes=?,perfects=?,last_seen=? WHERE id=? AND room_code=?").bind(score, combo, best, round, JSON.stringify(pressed), mistakes, perfects, Date.now(), token, roomCode).run();
                return json(await snapshot(roomCode, token));
            }
            return json({ error: "不明な操作です" }, 400);
        }
        catch (e) {
            console.error(e);
            return json({ error: e instanceof Error ? e.message : "サーバーエラー" }, 500);
        }
    }
    return POST(context.request);
}
