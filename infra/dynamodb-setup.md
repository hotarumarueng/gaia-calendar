# DynamoDB テーブル・IAM ユーザー作成手順（タスク 1.2）

gaia-calendar 用のテーブルと、アプリ専用の最小権限 IAM ユーザーを作成する手順。
**必ずプロビジョンドモード（25RCU/25WCU）で作成する**こと（オンデマンドは Always Free 対象外）。

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
  --provisioned-throughput ReadCapacityUnits=25,WriteCapacityUnits=25 \
  --region ap-northeast-1
```

- `name` = パーティションキー（参加者名）、`sk` = ソートキー（`MEMBER` または `SLOT#19-21` 形式）
- `weekdays` や `comment` は**定義しない**。DynamoDB はキー以外の属性をスキーマレスに保存する（ここが RDB との大きな違い）

### 確認（完了条件の1つ）

```bash
aws dynamodb describe-table --table-name gaia-calendar --region ap-northeast-1 \
  --query 'Table.[TableStatus, ProvisionedThroughput.ReadCapacityUnits, ProvisionedThroughput.WriteCapacityUnits]'
```

期待値: `["ACTIVE", 25, 25]`（ACTIVE になるまで数十秒かかることがある）

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

## 完了条件チェックリスト
- [ ] describe-table が `ACTIVE` かつ RCU/WCU = 25/25 を返す
- [ ] `aws iam list-user-policies --user-name gaia-calendar-app` が `gaia-calendar-table-only` を返す
- [ ] `.env.local` に4つの環境変数が揃っている

## 削除方法（プロジェクトをやめるとき）

```bash
aws dynamodb delete-table --table-name gaia-calendar --region ap-northeast-1
aws iam delete-access-key --user-name gaia-calendar-app --access-key-id <KEY_ID>
aws iam delete-user-policy --user-name gaia-calendar-app --policy-name gaia-calendar-table-only
aws iam delete-user --user-name gaia-calendar-app
```
