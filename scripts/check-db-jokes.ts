import { config } from "dotenv";
import { getJokeCandidateCollection } from "@/lib/ingest/storage";

config();

async function checkDatabaseJokes() {
  console.log("📊 Проверка шуток в базе данных...\n");

  const collection = await getJokeCandidateCollection();

  // Считаем общее количество
  const total = await collection.countDocuments();
  console.log(`Всего шуток в БД: ${total}`);

  // Считаем по источникам RicUIB
  const ricuib1000 = await collection.countDocuments({ source: "ricuib-1000chistes" });
  const ricuibPinta = await collection.countDocuments({ source: "ricuib-pintamania" });

  console.log(`\nИз RicUIB датасета:`);
  console.log(`  - ricuib-1000chistes: ${ricuib1000} шуток`);
  console.log(`  - ricuib-pintamania: ${ricuibPinta} шуток`);
  console.log(`  Всего RicUIB: ${ricuib1000 + ricuibPinta} шуток`);

  // Считаем по всем источникам
  const allSources = await collection.aggregate([
    {
      $group: {
        _id: "$source",
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]).toArray();

  console.log(`\nВсе источники в БД:`);
  for (const source of allSources) {
    console.log(`  - ${source._id}: ${source.count} шуток`);
  }

  // Статус шуток
  const statuses = await collection.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]).toArray();

  console.log(`\nСтатусы:`);
  for (const status of statuses) {
    console.log(`  - ${status._id || 'undefined'}: ${status.count} шуток`);
  }

  // Примеры из RicUIB
  const examples = await collection.find({
    source: { $in: ["ricuib-1000chistes", "ricuib-pintamania"] }
  }).limit(5).toArray();

  console.log(`\n📝 Примеры шуток из RicUIB в БД:`);
  console.log("=".repeat(80));
  for (const joke of examples) {
    console.log(`\nИсточник: ${joke.source}`);
    console.log(`Заголовок: ${joke.title}`);
    console.log(`Текст: ${joke.text.substring(0, 100)}...`);
    console.log(`Статус: ${joke.status}`);
    console.log(`Создано: ${joke.createdAt}`);
  }

  process.exit(0);
}

checkDatabaseJokes().catch(err => {
  console.error("Ошибка:", err);
  process.exit(1);
});
