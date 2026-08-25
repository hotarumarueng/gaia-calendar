# アーキテクチャ詳細

## 全体構成

```mermaid
flowchart LR
    member(["グループメンバー<br/>(数人〜10人・ログイン不要)"])
    slack[["Slack<br/>(毎週URLを共有・手動運用)"]]

    subgraph gaia["gaia-calendar"]
        web["Next.js アプリ<br/>App Router / Vercel 無料枠"]
        api["API Routes /api/entries<br/>upsertとdeleteの唯一の変更窓口"]
        db[("Amazon DynamoDB<br/>シングルテーブル・プロビジョンド1RCU/1WCU")]

        web -->|"POST / DELETE"| api
        web -->|"表データの読み取り"| db
        api -->|"PutItem / DeleteItem<br/>(専用IAMユーザーの最小権限)"| db
    end

    slack --> member
    member -->|"閲覧・希望入力・コメント"| web
```

## データモデル

DynamoDB はシングルテーブル設計。「人（member）」と「人×時間帯の希望（preference）」の2種類の item を、
`name` をパーティションキーに共存させている。

```mermaid
erDiagram
    MEMBER {
        string name PK
        string sk "MEMBER"
        string comment "一言ステータスコメント"
        string updatedAt "ISO 8601"
        string weekKey "YYYY-MM-DD (JST月曜)"
        number expiresAt "epoch秒・書込みから30日"
    }
    PREFERENCE {
        string name PK
        string sk "SLOT#21-23 など"
        string_list weekdays "希望曜日の配列"
        string updatedAt "ISO 8601"
        string weekKey "YYYY-MM-DD (JST月曜)"
        number expiresAt "epoch秒・MEMBERと必ず同値"
    }
    MEMBER ||--o{ PREFERENCE : "同じ name (PK) に紐づく"
```

- `weekdays` や `comment` は attribute-definitions に定義しない。DynamoDB はキー以外スキーマレスに保存できる
- MEMBER と PREFERENCE の `expiresAt` は必ず同じ値にする。MEMBER だけ先に消えると「名前だけの行」が復活するため

## 週次リセットの仕組み（cronを使わない）

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant S as サーバー(API Routes)
    participant D as DynamoDB

    U->>S: 希望曜日を保存
    S->>S: 現在のJST月曜日付を weekKey として算出
    S->>D: item に weekKey を刻んで PutItem

    Note over U,D: 翌週以降のアクセス

    U->>S: 表を表示
    S->>D: Scan で全 item を取得
    S->>S: item.weekKey ≠ 今週のweekKey なら「未入力」として扱う
    S->>U: 今週分だけを表示（名前は残る）
```

バッチ実行を持たないため「実行が落ちた週だけ古いデータが残る」という障害が原理的に起きない。
判定は必ずサーバー側で行い、クライアント端末の時計は信用しない。

## 容量設計（無料枠の範囲で運用する）

AWSの DynamoDB Always Free（25RCU/25WCU）は**テーブル単位ではなくAWSアカウント単位**の共有資源。
1つのテーブルが25/25を確保すると、同じアカウントの他プロジェクトが無料枠を使えなくなる。

- 実測トラフィック（直近14日で最も混んだ1時間: 書き込み78ユニット・読み取り31.5ユニット）に対し、
  1RCU/1WCU（1時間あたり3,600ユニットの供給）で十分と判断
- アプリ専用のIAMユーザーには、対象テーブル1つへの `GetItem` / `PutItem` / `DeleteItem` / `Query` / `Scan` の
  5アクションのみを許可。キーが漏れても被害は「このテーブル1つの読み書き」に限定される
- TTL（`expiresAt`）は「もう来なくなった人」を自動で消す名簿の掃除役。週次リセットの実装ではない

再現手順（テーブル作成・IAMポリシー・TTL設定のコマンド一式）は [infra/dynamodb-setup.md](../infra/dynamodb-setup.md) を参照。
