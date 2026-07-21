# Tech Steering

## スタック（2026-07-21 更新: データ層を DynamoDB に変更）
- Next.js（App Router、フロント + API Routes）
- Vercel Hosting（無料枠）
- Amazon DynamoDB（Always Free: 25GB・25RCU/WCU。プロビジョンドモードで無料枠内運用）
- ログイン機能なし（名前入力のみ、名前をキーに自分の行を上書き更新）

変更理由: 当初は Supabase Postgres だったが、AWS学習（SRE転職ポートフォリオ）目的で置換。
RDS は12ヶ月無料のみ（以降 月2,000〜3,000円）のため Postgres は不採用、Always Free の DynamoDB を選択。
Lambda は挟まない（Vercel の API Routes 自体がサーバーレス関数のため冗長）。

## データモデル（確定 2026-07-21・DynamoDB シングルテーブル）
概念は「人（member）」と「人×時間帯の希望（preference）」の2種類。
「情報は、その情報の単位と同じ単位の item に置く」原則は Postgres 2テーブル案から変えない。

テーブル `gaia-calendar`（プロビジョンド 25RCU/25WCU = Always Free 内）
- Member item: PK = name, SK = "MEMBER"
  - comment (string) — 一言ステータスコメント
  - updatedAt (string, ISO 8601)
- Preference item: PK = name, SK = "SLOT#{slot_id}"（例: "SLOT#19-21"）
  - weekdays (string list) — 希望曜日の配列（例: ["火","木"]）
  - updatedAt (string, ISO 8601)

Postgres 案からの対応関係:
- unique(name, slot_id) → PK+SK がそのまま一意キー（再送信で上書き=PutItem）
- FK on delete cascade → DynamoDB に cascade はないため、削除時は db.ts が Query→全item削除を実装する
- updated_at の DB default → なし。アプリコードでタイムスタンプを書き込む

### 挙動の決定事項
- 名前は保存前に trim（前後空白除去）。表記ゆれの完全対策はせず運用で揃える
- localStorage に自分の名前を記憶し、一致する行にのみ編集・削除ボタンを表示（ログインなしの疑似本人確認）
- 曜日を空にして保存 → その preferences 行を削除（「空セル=未入力」に一義化）
- 「最終編集日時」は updated_at の最大値から計算で表示（専用カラムは持たない）
- 週次リセット・cron は作らない。毎週の入力促しは Slack の手動運用で行う

固定時間帯（コード内定数、初期値）:
- 19:00-21:00
- 21:00-23:00
- 8:00-10:00
- 10:00-12:00

## 制約
- 全サービス無料枠で運用（Claudeのみ課金中）
- 時間帯（列）は当面コード内固定。追加・削除UIは今回のスコープ外

## 禁止事項
- ログイン/認証機能の実装（今回は不要と合意済み）
- 週ごとのポーリング形式への変更（常設1枚の表という設計を崩さない）
