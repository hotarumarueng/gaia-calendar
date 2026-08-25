# DynamoDB テーブル・IAM ユーザー作成手順（タスク 1.2）

gaia-calendar 用のテーブルと、アプリ専用の最小権限 IAM ユーザーを作成する手順。
**必ずプロビジョンドモード（1RCU/1WCU）で作成する**こと（オンデマンドは Always Free 対象外）。

> **25/25 で作らないこと。** DynamoDB の無料枠 25RCU/25WCU は**テーブル単位ではなくアカウント単位**の
> 共有資源で、同じ AWS アカウント上の全プロジェクトで取り合う。1つのテーブルが 25/25 を確保すると
> それだけで枠を使い切り、**GSI を1本足すか2つ目のプロビジョンドテーブルを作った瞬間に、
> 警告なしでフルレート課金が始まる**（GSI は本体とは別に自前の RCU/WCU を持つため）。
>
> 1/1 で足りる根拠（2026-08-26 実測・直近14日）: 最も混んだ1時間でも書き込み 78 ユニット・読み取り 31.5 ユニット。
> 1 WCU は1時間あたり 3,600 ユニットを供給するので使用率は約2%。単一リクエストの最大消費は 1.0 単位
> （＝全アイテムが 1KB 未満）で、スロットリングの発生実績はゼロ。
> 瞬間的なアクセス集中は、DynamoDB が最大300秒ぶん貯めるバーストキャパシティが吸収する。

## 前提
- AWS CLI がセットアップ済み（`aws sts get-caller-identity` が自分のアカウントを返す）
- リージョンは東京（ap-northeast-1）を使う

## Step 1: テーブル作成

```bash
aws dynamodb create-table \
  --table-name gaia-calendar \
  --attribute-definitions \
    AttributeName=name,AttributeType=S \
    AttributeName=sk,AttributeType=S \
  --key-schema \
    AttributeName=name,KeyType=HASH \
    AttributeName=sk,KeyType=RANGE \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
  --region ap-northeast-1
```

- `name` = パーティションキー（参加者名）、`sk` = ソートキー（`MEMBER` または `SLOT#19-21` 形式）
- `weekdays` や `comment` は**定義しない**。DynamoDB はキー以外の属性をスキーマレスに保存する（ここが RDB との大きな違い）

### 確認（完了条件の1つ）

```bash
aws dynamodb describe-table --table-name gaia-calendar --region ap-northeast-1 \
  --query 'Table.[TableStatus, ProvisionedThroughput.ReadCapacityUnits, ProvisionedThroughput.WriteCapacityUnits]'
```

期待値: `["ACTIVE", 1, 1]`（ACTIVE になるまで数十秒かかることがある）

## Step 2: アプリ専用 IAM ユーザー作成（最小権限）

```bash
# ユーザー作成（コンソールアクセスなし・プログラムアクセスのみ）
aws iam create-user --user-name gaia-calendar-app

# 最小権限ポリシーを直接アタッチ（ACCOUNT_ID は自分のものに置換）
aws iam put-user-policy --user-name gaia-calendar-app \
  --policy-name gaia-calendar-table-only \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": "arn:aws:dynamodb:ap-northeast-1:ACCOUNT_ID:table/gaia-calendar"
    }]
  }'
```

ACCOUNT_ID の確認: `aws sts get-caller-identity --query Account --output text`

**なぜ最小権限か**: このキーが漏洩しても、被害は「このテーブル1つの読み書き」に限定される。
CreateTable / DeleteTable / 他リソースへのアクセスは一切できない（SREのブラスト半径の考え方）。

## Step 3: アクセスキー発行 → .env.local に記入

```bash
aws iam create-access-key --user-name gaia-calendar-app
```

出力された `AccessKeyId` と `SecretAccessKey` を、プロジェクト直下の `.env.local` に**直接**記入する（チャット・コミット禁止。`.env.local` は .gitignore 済み）:

```
AWS_ACCESS_KEY_ID=（AccessKeyId の値）
AWS_SECRET_ACCESS_KEY=（SecretAccessKey の値）
AWS_REGION=ap-northeast-1
DYNAMO_TABLE_NAME=gaia-calendar
```

## Step 4: TTL（自動削除）を有効化する

しばらく入力していない人の item を自動で消すための設定。**管理者権限で1回だけ実行する**。

```bash
aws dynamodb update-time-to-live --table-name gaia-calendar \
  --time-to-live-specification "Enabled=true,AttributeName=expiresAt" \
  --region ap-northeast-1
```

### 確認

```bash
aws dynamodb describe-time-to-live --table-name gaia-calendar --region ap-northeast-1
```

期待値: `{"TimeToLiveStatus": "ENABLED", "AttributeName": "expiresAt"}`

### 注意点

- **これは週次リセットの仕組みではない。** 毎週のリセットは `weekKey` の論理判定（`lib/entryRules.ts`）が
  100%担っている。TTL が実際に消すのは「もう来なくなった人の item」＝名簿の掃除役でしかない
- `expiresAt` は **Number 型・epoch 秒の整数**。文字列やミリ秒だと DynamoDB は
  **エラーを出さずに TTL を無視する**（`lib/entryRules.ts` の `expiresAtFrom` が `Math.floor` を通している）
- 生存期間は書き込みから30日（`ENTRY_TTL_SECONDS`）。誰かが保存するたびに期限が延びるので、
  参加し続けている人は消えない
- MEMBER item と SLOT item の `expiresAt` は必ず同じ値にする。MEMBER だけ先に消えると、
  残った SLOT item のせいで「名前だけ・コメントなし」の行が復活する
- 削除はベストエフォート（通常48時間以内、保証なし）。**期限切れ後・削除前の item は Scan に返る**が、
  表示の正しさは `weekKey` 判定が担っているので無害
- TTL による削除は無料（WCU を消費しない）
- **アプリ用 IAM ユーザーのポリシー変更は不要**。`expiresAt` は普通の PutItem で書けるし、
  削除は DynamoDB 自身が行うため `UpdateTimeToLive` 権限は要らない
- `weekKey` / `expiresAt` は非キー属性なので、Step 1 の `attribute-definitions` に足す必要はない
  （`weekdays` や `comment` を定義しないのと同じ理由）

## 完了条件チェックリスト
- [ ] describe-table が `ACTIVE` かつ RCU/WCU = 1/1 を返す
- [ ] `aws iam list-user-policies --user-name gaia-calendar-app` が `gaia-calendar-table-only` を返す
- [ ] `.env.local` に4つの環境変数が揃っている
- [ ] `describe-time-to-live` が `ENABLED` / `expiresAt` を返す

## 既存テーブルの容量を変更する

過去に 25/25 で作ってしまった場合や、実測に対して容量が過剰／不足だと分かった場合。

```bash
aws dynamodb update-table --table-name gaia-calendar \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
  --region ap-northeast-1
```

- **引き下げは1日（UTC）あたり4回まで。** 引き上げに回数制限はない
- 反映中は `TableStatus` が `UPDATING` になる。`ACTIVE` に戻るまで数十秒
- 判断材料は実測値で取る。過剰かどうかは勘ではなく CloudWatch で決める:

```bash
aws cloudwatch get-metric-statistics --namespace AWS/DynamoDB \
  --metric-name ConsumedWriteCapacityUnits \
  --dimensions Name=TableName,Value=gaia-calendar \
  --start-time $(date -u -v-14d +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 3600 --statistics Sum Maximum --region ap-northeast-1 \
  --query 'sort_by(Datapoints,&Sum)[-5:]'
```

`Sum` はその1時間に消費した合計ユニット数、`Maximum` は**単一リクエストが消費した最大ユニット数**。
1 WCU の供給量は 1時間 = 3,600 ユニット なので、`Sum` をこれと比べる。

## 削除方法（プロジェクトをやめるとき）

```bash
aws dynamodb delete-table --table-name gaia-calendar --region ap-northeast-1
aws iam delete-access-key --user-name gaia-calendar-app --access-key-id <KEY_ID>
aws iam delete-user-policy --user-name gaia-calendar-app --policy-name gaia-calendar-table-only
aws iam delete-user --user-name gaia-calendar-app
```
