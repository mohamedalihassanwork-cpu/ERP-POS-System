import { defineConfig } from "drizzle-kit";
import path from "path";

const rawPath = process.env.DATABASE_URL || path.join(process.cwd(), "sqlite.db");
const dbUrl = rawPath.startsWith("file:") ? rawPath : `file:${rawPath}`;

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbUrl,
  },
});
