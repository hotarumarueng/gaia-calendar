# gaia-calendar

## WHY
複数人（社会人）が2時間だけ集まれる日を毎回すり合わせるのが大変。
「平日夜21時」「土曜朝8時」など固定枠を決め打ちしていたが、寝落ち・起きられないで欠席が続いている。
みんなの希望日時をバラバラのタイミングで入力してもらい、一覧で可視化することで、実際に集まりやすい時間帯を見つけたい。

## WHAT
縦軸=名前、横軸=時間帯（固定2枠。`lib/timeSlots.ts` が唯一の正）のマトリクス表。
各セルには、その人がその時間帯で希望する曜日が入る。
ログイン不要・名前入力のみ。常設1枚の表を全員で更新し続ける（週ごとのポール形式ではない）。
ただし表示は今週分のみ。毎週月曜0時（JST）に希望曜日とコメントがリセットされ、名前だけが残る
（cron ではなく weekKey による論理リセット。詳細は `.kiro/steering/tech.md`）。

## 現状（2026-08-26時点）
実装済み・Vercel で稼働中。データ層は DynamoDB シングルテーブル（`gaia-calendar`、プロビジョンド 1RCU/1WCU）。
週次リセット導入済み。GitHub 公開済み（本番URLは非公開）。
再開時は `.kiro/steering/` と本ファイルの WHY/WHAT を読んでから続きを進めること。

## ドキュメントの場所
- `.kiro/steering/` — プロジェクト全体のルールと文脈（product / tech / structure）
- `.kiro/specs/schedule-matrix/` — 要件・設計・タスクの記録
- `docs/architecture.md` — アーキテクチャ図（全体構成・データモデル・週次リセット・容量設計）
- `infra/dynamodb-setup.md` — DynamoDB テーブルと IAM ユーザーの作成手順

## 開発上の注意
- 時間帯の定義は `lib/timeSlots.ts` が唯一の正。ここを変えればフォーム・API検証・集計・グリッドが追従する
- 週境界の定義は `lib/weekRange.ts` の `getCurrentWeekKeyJst` ただ1つ。週判定は必ずサーバー側で行う
- `lib/db.test.ts` は実 DynamoDB テーブルに対する統合テスト。実行には `.env.local` の認証情報が要る
