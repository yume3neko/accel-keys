# PANEL PUSH ARENA

5×5パネルを使った、複数人リアルタイム対戦ゲームです。

## ゲームルール

- 光っているパネルを押すと得点
- 押し間違いは50点減点、コンボリセット
- パネル単位のノーミスクリアで500点ボーナス
- 全プレイヤーが同じ順番の配置に挑戦
- 難易度ごとに2ラウンドごとに光る枚数が1枚増加

| 難易度 | 光る枚数 |
| --- | ---: |
| EASY | 1–3 |
| NORMAL | 3–7 |
| HARD | 5–10 |
| EXPERT | 7–15 |
| MASTER | 9–17 |
| LUNATIC | 12–22 |

待機ルームではチャットを利用できます。ゲーム開始後はチャットの取得・送信とも停止します。

## 開発

```bash
pnpm install
node scripts/build-pages.mjs
node scripts/check-pages.mjs
```

ゲームデータには専用のCloudflare D1 `panel-push-db` を使用します。空のデータベースには `pages-init.sql` を実行してください。接続名はリポジトリ直下の `wrangler.toml` にある `PANEL_DB` です。既存ゲームの `DB` は変更しません。

## ビルド

```bash
node scripts/build-pages.mjs
```

`pages-output/` の index.html、game.js、game.css、favicon.svg をリポジトリの `public/panel-push/` に配置し、pages-function.js を `functions/api/panel-push.js` に配置します。これらの生成物はリポジトリに同梱しています。Pagesのビルドコマンドは空欄、出力先は既存どおり `public` です。

公開先: https://yume3neko.pages.dev/panel-push/

データベース初期化とPagesのデプロイ成功の両方が必要です。ローカルの処理確認はSQLiteによるもので、本番のD1接続確認は別途行います。
