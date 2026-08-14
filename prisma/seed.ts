import { config } from "dotenv";
config({ path: ".env.production" });
config({ path: ".env" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD 환경변수가 설정되지 않았습니다. seed를 실행하기 전에 .env 파일을 확인하세요.");
  const hash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, password: hash, name: "Admin" },
  });

  console.log(`Seeded admin user: ${user.email}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
