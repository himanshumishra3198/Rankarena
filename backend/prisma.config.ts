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
  },
});
