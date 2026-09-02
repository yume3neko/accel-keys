# ACCEL KEYS — Cloudflare Pages版

トップページのゲーム一覧は `public/index.html`、加速鍵盤ゲームは `public/accel-keys/index.html`、全プレイヤーランキングAPIは `functions/api/scores.js`、スコア保存先はCloudflare D1です。自己ベストは各ブラウザのlocalStorageにも保存されます。加速鍵盤ゲームは4レーンをノーツが上から降下する方式で、PERFECT・GREAT・GOOD・MISSの判定に対応しています。

## 初回セットアップ

1. CloudflareでD1データベース `accel-keys-scores` を作成します。
2. 表示されたDatabase IDを `wrangler.toml` の `database_id` に貼り付けます。
3. `npx wrangler d1 execute accel-keys-scores --remote --file=./schema.sql` を実行します。
4. Git連携の場合、Pagesのビルド出力ディレクトリを `public` に設定します。ビルドコマンドは空欄で構いません。
5. Pagesプロジェクトの「Settings → Bindings」でD1を追加し、変数名を必ず `DB` にして同じデータベースを選択してから再デプロイします。

Wranglerで直接公開する場合は `npm install` の後、`npm run deploy` を実行します。

## 管理者メニュー

Cloudflare Pagesの「設定 → 変数とシークレット」で、暗号化されたシークレット `ADMIN_TOKEN` を追加し、十分に長い管理者キーを値に設定してください。再デプロイ後、`https://あなたのサイト/admin/`から管理者キーでログインできます。

管理画面では最新500件の登録履歴・詳細確認、記録の個別削除、ランキングの全件削除ができます。`ADMIN_TOKEN`の値はGitHubやソースコードへ記載しないでください。

加速鍵盤ゲームのURLは `/accel-keys/`、管理画面は `/admin/` です。従来のゲームと素材は `public` 直下に統合済みです。

## 補足

ブラウザゲームのスコアは利用者側で改変できるため、この版は数値範囲の検査を行う簡易ランキングです。厳密な競技ランキングにする場合は、プレイイベントをサーバー側で検証する仕組みが別途必要です。
