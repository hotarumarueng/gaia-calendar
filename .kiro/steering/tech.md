# Tech Steering

## スタック（2026-07-21 更新: データ層を DynamoDB に変更）
- Next.js（App Router、フロント + API Routes）
- Vercel Hosting（無料枠）
- Amazon DynamoDB（Always Free: 25GB・25RCU/WCU。プロビジョンドモードで無料枠内運用）
  - **無料枠 25RCU/25WCU はアカウント単位の共有資源**で、同一 AWS アカウントの全プロジェクトで取り合う。
    本テーブルは実測に合わせて **1RCU/1WCU** で運用する（根拠は `infra/dynamodb-setup.md`）
- ログイン機能なし（名前入力のみ、名前をキーに自分の行を上書き更新）

変更理由: 当初は Supabase Postgres だったが、AWS学習（SRE転職ポートフォリオ）目的で置換。
RDS は12ヶ月無料のみ（以降 月2,000〜3,000円）のため Postgres は不採用、Always Free の DynamoDB を選択。
Lambda は挟まない（Vercel の API Routes 自体がサーバーレス関数のため冗長）。

## データモデル（確定 2026-07-21・DynamoDB シングルテーブル）
概念は「人（member）」と「人×時間帯の希望（preference）」の2種類。
「情報は、その情報の単位と同じ単位の item に置く」原則は Postgres 2テーブル案から変えない。

テーブル `gaia-calendar`（プロビジョンド 1RCU/1WCU = Always Free 内）
- Member item: PK = name, SK = "MEMBER"
  - comment (string) — 一言ステータスコメント
  - updatedAt (string, ISO 8601)
  - weekKey (string, "YYYY-MM-DD") — その入力がどの週のものか（JST 月曜の日付）
  - expiresAt (number, epoch秒) — TTL。書き込みから30日
- Preference item: PK = name, SK = "SLOT#{slot_id}"（例: "SLOT#21-23"）
  - weekdays (string list) — 希望曜日の配列（例: ["火","木"]）
  - updatedAt (string, ISO 8601)
  - weekKey / expiresAt — Member item と同じ。**expiresAt は必ず同じ値にする**
    （MEMBER だけ先に消えると、残った SLOT item のせいで「名前だけの行」が復活するため）

Postgres 案からの対応関係:
- unique(name, slot_id) → PK+SK がそのまま一意キー（再送信で上書き=PutItem）
- FK on delete cascade → DynamoDB に cascade はないため、削除時は db.ts が Query→全item削除を実装する
- updated_at の DB default → なし。アプリコードでタイムスタンプを書き込む

**SK に weekKey は入れない**（`SLOT#{slot_id}` のまま）。翌週の保存が同じキーを上書きするので、
Scan 量が増えない代わりに「先週は誰が何を選んだか」という履歴は残らない。
今回の用途（今週の調整だけ）には不要と判断した。ふりかえり機能が必要になったら
SK を `SLOT#{weekKey}#{slot_id}` にする設計変更が要る。

### 挙動の決定事項
- 名前は保存前に trim（前後空白除去）。表記ゆれの完全対策はせず運用で揃える
- localStorage に自分の名前を記憶し、一致する行にのみ編集・削除ボタンを表示（ログインなしの疑似本人確認）
- 曜日を空にして保存 → その preferences 行を削除（「空セル=未入力」に一義化）
- 「最終編集日時」は updated_at の最大値から計算で表示（専用カラムは持たない）
- **週次リセットは weekKey による論理リセットで実装する。cron・バッチ・スケジュール実行は作らない。**
  書き込み時に「どの週か」を item に刻み、読み出し時に現在週と一致しない item を無視することで
  リセットを表現する。cron を持たないので「実行が落ちた週だけ古いデータが残る」という障害が原理的に起きない
  - リセットで消えるのは希望曜日とコメント。**名前は残る**（曜日を入れ直すだけで済むように）
  - 週境界の定義は `lib/weekRange.ts` の `getCurrentWeekKeyJst` ただ1つ（JST 月曜0時）
  - 判定は必ずサーバー側で行う。クライアントで週判定をすると端末の時計を信用することになる
- 集計の分母は「今週回答した人」だけ。未入力の人を「希望していない人」と数えない（`lib/summary.ts`）

固定時間帯（コード内定数。`lib/timeSlots.ts` が唯一の正）:
- 21:00-23:00（月〜日）
- 10:00-12:00（土日のみ）

## 制約
- 全サービス無料枠で運用（Claudeのみ課金中）
- 時間帯（列）は当面コード内固定。追加・削除UIは今回のスコープ外

## 禁止事項
- ログイン/認証機能の実装（今回は不要と合意済み）
- 週ごとのポーリング形式への変更（常設1枚の表という設計を崩さない）
  - 補足: 週次リセット（weekKey）はこれに抵触しない。URL も表も常設1枚のままで、
    表示内容が今週分に絞られるだけ。「週ごとに新しいポールを立てて共有し直す」形式にはしない
