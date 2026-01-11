import { config } from "dotenv";
import { getJokeCandidateCollection } from "@/lib/ingest/storage";

config();

async function deleteOldRicuibJokes() {
  console.log("🗑️  Удаление старых шуток RicUIB из базы данных...\n");

  const collection = await getJokeCandidateCollection();

  // Находим все шутки из RicUIB
  const ricuibJokes = await collection
    .find({
      source: { $in: ["ricuib-1000chistes", "ricuib-pintamania"] },
    })
    .toArray();

  console.log(`📊 Найдено ${ricuibJokes.length} шуток из RicUIB в БД`);

  // Проверяем, какие из них имеют СТАРЫЙ формат externalId (без "ricuib:" в начале)
  const oldFormatJokes = ricuibJokes.filter(
    (joke) => joke.externalId && !joke.externalId.startsWith("ricuib:")
  );

  const newFormatJokes = ricuibJokes.filter(
    (joke) => joke.externalId && joke.externalId.startsWith("ricuib:")
  );

  console.log(`   - Старый формат (будут удалены): ${oldFormatJokes.length}`);
  console.log(`   - Новый формат (останутся): ${newFormatJokes.length}\n`);

  if (oldFormatJokes.length === 0) {
    console.log("✅ Нет шуток со старым форматом для удаления");
    process.exit(0);
  }

  // Примеры шуток, которые будут удалены
  console.log("📝 Примеры шуток, которые будут удалены (первые 5):");
  for (const joke of oldFormatJokes.slice(0, 5)) {
    console.log(`   - ${joke.title} (externalId: ${joke.externalId})`);
  }

  console.log(`\n⚠️  Будет удалено ${oldFormatJokes.length} шуток!`);
  console.log("   Удаление начнется через 3 секунды...\n");

  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Удаляем шутки со старым форматом
  const oldFormatIds = oldFormatJokes.map((j) => j._id);

  const result = await collection.deleteMany({
    _id: { $in: oldFormatIds },
  });

  console.log(`✅ Удалено ${result.deletedCount} шуток из базы данных`);

  // Финальная статистика
  const remaining = await collection.countDocuments({
    source: { $in: ["ricuib-1000chistes", "ricuib-pintamania"] },
  });

  console.log(`\n📊 ИТОГОВАЯ СТАТИСТИКА:`);
  console.log(`   - Осталось шуток RicUIB в БД: ${remaining}`);
  console.log(`   - Удалено: ${result.deletedCount}`);

  console.log("\n✅ Готово! Теперь можно запустить импорт с новым форматом");
}

deleteOldRicuibJokes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Ошибка:", error);
    process.exit(1);
  });
