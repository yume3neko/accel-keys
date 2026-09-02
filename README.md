# ACCEL KEYS — Cloudflare Pages版

静的ゲーム画面は `public/index.html`、全プレイヤーランキングAPIは `functions/api/scores.js`、スコア保存先はCloudflare D1です。自己ベストは各ブラウザのlocalStorageにも保存されます。

## 初回セットアップ

1. CloudflareでD1データベース `accel-keys-scores` を作成します。
2. 表示されたDatabase IDを `wrangler.toml` の `database_id` に貼り付けます。
3. `npx wrangler d1 execute accel-keys-scores --remote --file=./schema.sql` を実行します。
4. Git連携の場合、Pagesのビルド出力ディレクトリを `public` に設定します。ビルドコマンドは空欄で構いません。
5. Pagesプロジェクトの「Settings → Bindings」でD1を追加し、変数名を必ず `DB` にして同じデータベースを選択してから再デプロイします。

Wranglerで直接公開する場合は `npm install` の後、`npm run deploy` を実行します。

## 補足

ブラウザゲームのスコアは利用者側で改変できるため、この版は数値範囲の検査を行う簡易ランキングです。厳密な競技ランキングにする場合は、プレイイベントをサーバー側で検証する仕組みが別途必要です。
