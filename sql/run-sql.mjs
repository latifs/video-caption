import "dotenv/config";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Client } = pg;

async function runSQL(sqlFile, connectionString) {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    const sql = fs.readFileSync(path.join(__dirname, sqlFile), "utf8");
    await client.query(sql);
    console.log(`✅ ${sqlFile} executed successfully`);
  } catch (err) {
    console.error(`❌ Error executing ${sqlFile}:`, err.message);
    throw err;
  } finally {
    await client.end();
  }
}

async function main() {
  const command = process.argv[2] || "migrate";

  // Postgres superuser URL (for admin operations: triggers, RLS)
  const POSTGRES_URL =
    process.env.POSTGRES_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

  switch (command) {
    case "migrate":
      // Run after-prisma.sql (triggers, functions, RLS policies)
      console.log("🔄 Running post-migration SQL...");
      await runSQL("after-prisma.sql", POSTGRES_URL);
      break;

    case "all":
      // Run after-prisma.sql (triggers, functions, RLS policies)
      console.log("🚀 Running full setup...");
      await runSQL("after-prisma.sql", POSTGRES_URL);
      break;

    case "deploy":
      // Full CI/CD deploy: prisma generate → prisma migrate → after-prisma
      console.log("🚀 Starting deployment...\n");

      console.log("1/3 📦 Generating Prisma client...");
      execSync("pnpm exec prisma generate", { stdio: "inherit" });

      console.log("\n2/3 🗃️  Running Prisma migrations...");
      execSync("pnpm exec prisma migrate deploy", { stdio: "inherit" });

      console.log("\n3/3 🔄 Applying triggers & RLS policies...");
      await runSQL("after-prisma.sql", POSTGRES_URL);

      console.log("\n✅ Deployment complete!");
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log("Usage: node sql/run-sql.mjs [migrate|all|deploy]");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
