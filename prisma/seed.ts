import "dotenv/config";
import { db } from "@/lib/db";
import { loadDemo } from "@/lib/demo";

loadDemo(db)
  .then((r) => {
    console.log(`Demo loaded: ${r.rooms} rooms, ${r.students} students, ${r.slots} blocks for tomorrow.`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
