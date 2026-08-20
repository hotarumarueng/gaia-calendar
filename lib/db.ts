// DynamoDB アクセス層（design.md「db.ts」準拠。DynamoDB への読み書きはこのファイル経由のみ）
// 要件 2.2（同名同時間帯は上書き）, 2.3（永続化）, 5.1（人単位の全データ削除）
//
// このファイルは「Scan して渡す・Put/Delete する」だけの薄い層に保つ。
// 何を今週分とみなすか・何を書くかの判断はすべて entryRules.ts の純関数側にある。

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
  type QueryCommandOutput,
  type ScanCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import { buildMemberEntries, buildWriteItems, type StoredItem } from "./entryRules";
import type { MemberEntry } from "./types";
import { getCurrentWeekKeyJst } from "./weekRange";

export type { ValidatedEntry } from "./entryRules";
import type { ValidatedEntry } from "./entryRules";

type EnvVarName =
  | "AWS_REGION"
  | "AWS_ACCESS_KEY_ID"
  | "AWS_SECRET_ACCESS_KEY"
  | "DYNAMO_TABLE_NAME";

/** 必須環境変数を取得する。未設定なら分かりやすいメッセージで例外を投げる */
function requireEnv(name: EnvVarName): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`環境変数 ${name} が設定されていません`);
  }
  return value;
}

// DocumentClient は初回呼び出し時に環境変数から構成し、以降は使い回す（毎回の再生成を避けるため）
let cachedDocumentClient: DynamoDBDocumentClient | undefined;

function getDocumentClient(): DynamoDBDocumentClient {
  if (cachedDocumentClient === undefined) {
    const client = new DynamoDBClient({
      region: requireEnv("AWS_REGION"),
      credentials: {
        accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
      },
    });
    cachedDocumentClient = DynamoDBDocumentClient.from(client);
  }
  return cachedDocumentClient;
}

function getTableName(): string {
  return requireEnv("DYNAMO_TABLE_NAME");
}

/**
 * Scan/Query から返る item のうち、このアプリが書き込む形の item だけを扱うためのガード。
 *
 * weekKey は必須にしない。週次リセット導入前に書かれた item を弾いてしまうと、
 * 残すべき名前まで名簿から消えるため（週判定は buildMemberEntries 側が行う）。
 */
function isStoredItem(value: unknown): value is StoredItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.name === "string" &&
    typeof record.sk === "string" &&
    typeof record.updatedAt === "string"
  );
}

/** 表データ取得。Scan して entryRules に組み立てさせる（今週分の判定もそちら側） */
export async function getMatrix(now: Date = new Date()): Promise<MemberEntry[]> {
  const client = getDocumentClient();
  const tableName = getTableName();

  // ページングの途中で月曜0時をまたいでも判定がぶれないよう、基準は最初に1回だけ決める
  const currentWeekKey = getCurrentWeekKeyJst(now);

  const items: StoredItem[] = [];
  let exclusiveStartKey: ScanCommandOutput["LastEvaluatedKey"];
  do {
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of result.Items ?? []) {
      if (isStoredItem(item)) {
        items.push(item);
      }
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey !== undefined);

  return buildMemberEntries(items, currentWeekKey);
}

/**
 * 人単位保存。書く内容は entryRules.buildWriteItems が決める
 * （weekKey・expiresAt・updatedAt はすべて同じ now から導出される）
 */
export async function upsertEntry(
  entry: ValidatedEntry,
  now: Date = new Date(),
): Promise<void> {
  const client = getDocumentClient();
  const tableName = getTableName();
  const { memberItem, slotItems, slotDeleteKeys } = buildWriteItems(entry, now);

  await client.send(new PutCommand({ TableName: tableName, Item: memberItem }));

  // design.md の保存フロー通り、時間帯ごとの書き込みは逐次実行する
  // （途中失敗しても部分更新として許容し、再保存で収束させる設計のため）
  for (const item of slotItems) {
    await client.send(new PutCommand({ TableName: tableName, Item: item }));
  }

  for (const key of slotDeleteKeys) {
    await client.send(new DeleteCommand({ TableName: tableName, Key: key }));
  }
}

/** 人単位削除。Query で全 item（Member + 全 Preference）を取得して削除する（cascade は手動実装） */
export async function deleteEntry(name: string): Promise<void> {
  const client = getDocumentClient();
  const tableName = getTableName();

  const items: StoredItem[] = [];
  let exclusiveStartKey: QueryCommandOutput["LastEvaluatedKey"];
  do {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "#name = :name",
        ExpressionAttributeNames: { "#name": "name" },
        ExpressionAttributeValues: { ":name": name },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of result.Items ?? []) {
      if (isStoredItem(item)) {
        items.push(item);
      }
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey !== undefined);

  // 週に関係なくその人の item を全部消す（古い weekKey のものも含む）
  for (const item of items) {
    await client.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { name: item.name, sk: item.sk },
      }),
    );
  }
}
