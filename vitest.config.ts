import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// db.ts の統合テストが .env.local の AWS 認証情報（AWS_REGION 等）を必要とするため読み込む。
// Next.js は .env.local を自動ロードするが vitest は対象外のため、ここで明示的に読み込む
// （Node v20.6+ 標準の process.loadEnvFile を使い、dotenv 等の追加依存を避ける）。
// .env.local が無い環境（CI 等）でも設定自体は壊さないよう、読み込み失敗は握りつぶす。
try {
  process.loadEnvFile(fileURLToPath(new URL(".env.local", import.meta.url)));
} catch {
  // .env.local が存在しない環境ではそのまま process.env（実行環境の設定）を使う
}

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      // tsconfig.json の paths（"@/*": ["./*"]）と整合させる
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});
