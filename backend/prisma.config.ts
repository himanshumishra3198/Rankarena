import { defineConfig } from "prisma/config";

// No dotenv import here — in Docker, DATABASE_URL comes from container
// environment (docker-compose). Locally it comes from backend/.env.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
