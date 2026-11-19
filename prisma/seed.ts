import "dotenv/config";
import { db } from "@/database";
import { loadDemo } from "@/lib/demo-data";

loadDemo(db)
  .then((r) => {
    console.log(`Demo loaded: ${r.rooms} rooms, ${r.students} students, ${r.slots} blocks on the open day.`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
