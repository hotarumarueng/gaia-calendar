// DynamoDB アクセス層（design.md「db.ts」準拠。DynamoDB への読み書きはこのファイル経由のみ）
// 要件 2.2（同名同時間帯は上書き）, 2.3（永続化）, 5.1（人単位の全データ削除）

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
import { latestEditedAt, planSlotWrites } from "./entryRules";
import { TIME_SLOTS, WEEKDAYS } from "./timeSlots";
import type { MemberEntry, SlotId, Weekday } from "./types";

/** Member item の SK 固定値（tech.md / infra/dynamodb-setup.md 準拠） */
const MEMBER_SK = "MEMBER";
const SLOT_SK_PREFIX = "SLOT#";

function slotSk(slotId: SlotId): string {
  return `${SLOT_SK_PREFIX}${slotId}`;
}

const SLOT_ID_SET: ReadonlySet<string> = new Set(
  TIME_SLOTS.map((slot) => slot.id),
);
function isSlotId(value: string): value is SlotId {
  return SLOT_ID_SET.has(value);
}

const WEEKDAY_SET: ReadonlySet<string> = new Set(WEEKDAYS);
function isWeekday(value: unknown): value is Weekday {
  return typeof value === "string" && WEEKDAY_SET.has(value);
}

/** upsertEntry に渡す検証済みデータ（MemberEntry から表示用の lastEditedAt を除いたもの） */
export type ValidatedEntry = {
  name: string;
  comment: string;
  preferences: Record<SlotId, Weekday[]>;
};

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

/** Scan/Query から返る item のうち、このアプリが書き込む形の item だけを扱うためのガード */
interface RawItem {
  name: string;
  sk: string;
  comment?: string;
  weekdays?: string[];
  updatedAt: string;
}

function isRawItem(value: unknown): value is RawItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.name === "string" && typeof record.sk === "string" && typeof record.updatedAt === "string";
}

/** preferences の初期値。全 SlotId を空配列で補完する（未入力時間帯の一義化） */
function buildEmptyPreferences(): Record<SlotId, Weekday[]> {
  const preferences = {} as Record<SlotId, Weekday[]>;
  for (const { id } of TIME_SLOTS) {
    preferences[id] = [];
  }
  return preferences;
}

/** 表データ取得。Scan して人単位に組み立てる（未入力時間帯は空配列で補完） */
export async function getMatrix(): Promise<MemberEntry[]> {
  const client = getDocumentClient();
  const tableName = getTableName();

  const items: RawItem[] = [];
  let exclusiveStartKey: ScanCommandOutput["LastEvaluatedKey"];
  do {
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of result.Items ?? []) {
      if (isRawItem(item)) {
        items.push(item);
      }
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey !== undefined);

  const itemsByName = new Map<string, RawItem[]>();
  for (const item of items) {
    const group = itemsByName.get(item.name) ?? [];
    group.push(item);
    itemsByName.set(item.name, group);
  }

  const entries: MemberEntry[] = [];
  for (const [name, group] of itemsByName) {
    const preferences = buildEmptyPreferences();
    let comment = "";
    const timestamps: string[] = [];

    for (const item of group) {
      timestamps.push(item.updatedAt);
      if (item.sk === MEMBER_SK) {
        comment = item.comment ?? "";
      } else if (item.sk.startsWith(SLOT_SK_PREFIX)) {
        const slotId = item.sk.slice(SLOT_SK_PREFIX.length);
        if (isSlotId(slotId)) {
          preferences[slotId] = (item.weekdays ?? []).filter(isWeekday);
        }
      }
    }

    entries.push({
      name,
      comment,
      preferences,
      lastEditedAt: latestEditedAt(timestamps) ?? "",
    });
  }

  return entries;
}

/**
 * 人単位保存。Member item を PutItem し、時間帯ごとに entryRules.planSlotWrites の
 * 判定に従って PutItem または DeleteItem する。全書き込みで updatedAt を必ず設定する
 * （DynamoDB 側に default がないため）
 */
export async function upsertEntry(entry: ValidatedEntry): Promise<void> {
  const client = getDocumentClient();
  const tableName = getTableName();
  const updatedAt = new Date().toISOString();

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        name: entry.name,
        sk: MEMBER_SK,
        comment: entry.comment,
        updatedAt,
      },
    }),
  );

  const { upserts, deletes } = planSlotWrites(entry.preferences);

  // design.md の保存フロー通り、時間帯ごとの書き込みは逐次実行する
  // （途中失敗しても部分更新として許容し、再保存で収束させる設計のため）
  for (const { slotId, weekdays } of upserts) {
    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          name: entry.name,
          sk: slotSk(slotId),
          weekdays,
          updatedAt,
        },
      }),
    );
  }

  for (const slotId of deletes) {
    await client.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { name: entry.name, sk: slotSk(slotId) },
      }),
    );
  }
}

/** 人単位削除。Query で全 item（Member + 全 Preference）を取得して削除する（cascade は手動実装） */
export async function deleteEntry(name: string): Promise<void> {
  const client = getDocumentClient();
  const tableName = getTableName();

  const items: RawItem[] = [];
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
      if (isRawItem(item)) {
        items.push(item);
      }
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey !== undefined);

  for (const item of items) {
    await client.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { name: item.name, sk: item.sk },
      }),
    );
  }
}
