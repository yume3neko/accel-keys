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
pnpm run db:generate
pnpm run dev
```

ゲームデータにはCloudflare D1を使用します。`drizzle/`のマイグレーションをD1へ適用し、Workerの`DB`バインディングに接続してください。

## ビルド

```bash
pnpm run build
```

Cloudflareでは、静的なPagesのみではなくAPIとD1を実行できるWorkers構成が必要です。Cloudflareダッシュボードの「Workers & Pages」からGitHubリポジトリを連携し、ビルド後のWorkerをデプロイしてください。
