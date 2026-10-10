import { defineConfig } from "prisma/config";
// Load backend/.env for local CLI commands (migrate, studio, generate).
// In Docker there is no .env file, so this is a no-op and DATABASE_URL
// comes from the container environment (docker-compose).
import "dotenv/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
    // Only needed by `prisma migrate dev` and `migrate diff --from-migrations`,
    // which replay the migrations directory into a throwaway database to work
    // out what has changed. Unset in normal use — and it must never point at a
    // database holding real data, because replaying wipes it.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
