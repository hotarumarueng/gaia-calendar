# Research & Design Decisions — schedule-matrix

## Summary
- **Feature**: `schedule-matrix`
- **Discovery Scope**: New Feature（グリーンフィールドだが小規模CRUD+UI。外部API調査は不要、設計判断の整理が中心）
- **Key Findings**:
  - ログインなし設計のため、書き込み検証（trim・空配列=削除）をどこで行うかがアーキテクチャの分岐点になる
  - 保存の単位を「セル単位」ではなく「人単位（名前+コメント+4時間帯まとめて）」にすると、API・UI・要件（2.4 空=削除）が全て単純になる
  - Supabase 無料枠はプロジェクトが約1週間無操作で一時停止する。毎週の定例利用なら実質問題ないが、運用リスクとして記録する

## Research Log

### 品質ポートフォリオ（mino-architecture-quality-strategy の観点）
- **Context**: 何を優先し何を意図的に捨てるかを先に確定する
- **Findings**:
  - Primary: シンプルさ・運用ゼロメンテ（無料枠、cronなし、認証なし）
  - Secondary: 可用性（週1回の定例前に見られれば十分。SLOは緩い）
  - Constraint: 全サービス無料枠
  - Intentionally-not-optimized: セキュリティ（グループ内の信頼を前提。なりすまし対策なし）、スケーラビリティ（〜10人固定）
- **Implications**: 凝った仕組み（認証、リアルタイム同期、キャッシュ層）は全て boundary 外とする

### ドメインモデルの完全性（mino-domain-model-completeness の観点）
- **Context**: 概念・状態・制約の漏れチェック
- **Findings**:
  - 概念は「参加者（member）」「時間帯（slot）」「希望（preference）」「コメント」の4つで閉じる
  - 状態遷移は「未登録 → 登録済み → 削除」のみ。中間状態なし
  - 「空セル」は preference 行の不存在として一義的に表現（要件 2.4 で確定済み）
  - 最終編集日時は導出値（updated_at の最大値）であり保存しない
- **Implications**: ドメインイベントや状態機械は不要。2テーブルで完全

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A: クライアント直接続 | ブラウザから supabase-js + anon key + RLS 全開放 | API層不要で最小 | 検証ロジックが各クライアントに分散。anon key で任意書込可能 | RLSポリシー設計が実質「全許可」になる |
| B: API Routes 集約（採用） | Route Handlers が service role key で Supabase を操作。RLS は外部拒否 | trim・空=削除・upsert の検証を1箇所に集約。鍵は非公開 | API層の実装が必要（小規模なので薄い） | steering tech.md の合意構成（フロント+API Routes）と一致 |

## Design Decisions

### Decision: 書き込みは API Routes に集約、読み取りは Server Component から直接
- **Context**: ログインなしでもデータ整合性ルール（trim、空配列=行削除、upsert）を確実に適用したい
- **Alternatives Considered**:
  1. 全てクライアントから supabase-js（Option A）
  2. 読み書きとも API Routes 経由
- **Selected Approach**: 変更系（POST/DELETE）のみ `/api/entries` に集約。表示はServer Component が `lib/db.ts` を直接呼ぶ。保存後は `router.refresh()` で再取得
- **Rationale**: 検証ロジックの単一箇所化（不整合の構造的排除）。読み取りだけの GET API は冗長なので作らない
- **Trade-offs**: リアルタイム反映はない（リロード/保存時反映）。定例調整の用途では十分
- **Follow-up**: service role key が `NEXT_PUBLIC_` プレフィックスで漏れていないか実装時に確認

### Decision: 保存単位は「人まるごと」1エンドポイント
- **Context**: セル単位保存だと API 呼び出しが細かくなり、空=削除の判定も分散する
- **Selected Approach**: `POST /api/entries` に name + comment + 4時間帯分の希望をまとめて送信。サーバー側で members を upsert し、各時間帯を「空配列なら delete / あれば upsert」する
- **Rationale**: フォームUXも「自分の情報を一括編集」で自然。要件 2.2 / 2.4 / 4.1 が1トランザクション相当で満たせる
- **Trade-offs**: 同一人物の同時編集は last-write-wins（許容。Adjacent expectations の信頼前提と同じ）

### Decision: スマホは横スクロールで対応（PC優先）
- **Context**: 要件 6.3。ユーザー合意「PC想定の熱感、スマホは縮尺の工夫で簡単に」
- **Selected Approach**: マトリクスを `overflow-x: auto` のコンテナに入れ、名前列を sticky にする。専用モバイルUIは作らない

### Decision: アーキテクチャ図は LikeC4 で管理
- **Context**: ユーザー要望。設計と実装の乖離を図でも検証したい
- **Selected Approach**: `docs/architecture/model.c4` に C4 モデル（context / container）を記述し、`npx likec4 start docs/architecture` でプレビュー確認する

### Decision: データ層を Supabase Postgres から DynamoDB へ置換（2026-07-21 design レビュー中）
- **Context**: ユーザーから「AWSサービスに置換できないか（Lambda / S3）」の要望。目的は SRE 転職ポートフォリオとしての AWS 実務経験
- **Alternatives Considered**:
  1. Supabase 継続 — 最短だが AWS 学習にならない
  2. RDS (Postgres) — 12ヶ月無料のみ。以降 月2,000〜3,000円で「全サービス無料枠」制約に違反
  3. S3 を DB 代わり — ファイル丸ごと上書きのため複数人の同時保存で更新消失。日程調整の書き込みパターンと相性が悪く不採用
  4. フル AWS（Amplify + Lambda + DynamoDB）— 学習効果最大だが構成変更が大きく、Amplify Hosting は12ヶ月無料のみ
- **Selected Approach**: Vercel + Next.js は維持し、db.ts と物理データモデルのみ DynamoDB（Always Free: 25GB・プロビジョンド 25RCU/25WCU）に差し替え
- **Rationale**: Boundary Commitments で DB アクセスを lib/db.ts に閉じていたため変更影響が最小。Lambda は挟まない（Vercel API Routes 自体がサーバーレス関数であり冗長）。Supabase の1週間無操作一時停止リスクも消える
- **Trade-offs**: SQL・RDB の学習機会は失う。FK cascade がないため人単位削除は手動実装。updated_at の DB default もないためアプリコードで設定
- **Follow-up**: IAM 最小権限ポリシー（テーブル1つ・5アクション）の作成手順を infra/dynamodb-setup.md に記載。無料枠はプロビジョンドモード限定である点をタスクで明示

## Risks & Mitigations
- DynamoDB をオンデマンドモードで作ってしまうと Always Free 対象外（従量課金）— 作成手順書でプロビジョンド 25RCU/25WCU を明示し、作成後に課金モードを確認する
- AWS アクセスキーの漏洩 — 専用 IAM ユーザー＋テーブル1つの最小権限に限定し、被害範囲を当該テーブルに閉じる。キーは .env.local / Vercel 環境変数のみ
- 名前の表記ゆれで別人化 — trim のみ実装し、残りはグループ内運用で吸収（合意済み）
- localStorage 消去で自分の行が編集できなくなる — 同じ名前を再入力すれば復帰できる（名前が実質の鍵）。使い方に明記

## References
- [Supabase Pricing/Free tier](https://supabase.com/pricing) — 無料枠制約・一時停止ポリシー
- [LikeC4](https://likec4.dev/) — アーキテクチャ図 DSL
- `.kiro/steering/tech.md` — 合意済みデータモデル・挙動決定事項
