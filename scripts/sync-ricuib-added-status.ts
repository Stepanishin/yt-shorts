import { config } from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import { getJokeCandidateCollection } from "@/lib/ingest/storage";

// Load environment variables
config();

interface RicuibJoke {
  index: number;
  titulo: string;
  texto: string;
  categorias: string[];
  palabras_clave: string[];
  origen: "1000 chistes" | "Pintamania";
  votos: number | null;
  added: boolean;
}

async function syncAddedStatus() {
  console.log("🔄 Синхронизация статуса added с базой данных...\n");

  // 1. Читаем JSON файл
  const filePath = "/Users/evgeniistepanishin/Desktop/evg/shorts-generator/chistes_ricuib.json";
  console.log(`📖 Читаем файл: ${filePath}`);

  const fileContent = readFileSync(filePath, "utf-8");
  const allJokes: RicuibJoke[] = JSON.parse(fileContent);
  console.log(`   Всего шуток в файле: ${allJokes.length}\n`);

  // 2. Подключаемся к MongoDB
  console.log(`💾 Подключение к MongoDB...`);
  const collection = await getJokeCandidateCollection();

  // 3. Получаем все шутки из RicUIB в базе данных
  const dbJokes = await collection
    .find({
      source: { $in: ["ricuib-1000chistes", "ricuib-pintamania"] },
    })
    .toArray();

  console.log(`   Найдено шуток в БД из RicUIB: ${dbJokes.length}\n`);

  // 4. Создаем Set из комбинаций origen+title для поиска в JSON файле
  // Старый формат externalId: "1000_chistes:Titulo_con_espacios"
  // Новый формат externalId: "ricuib:1000 chistes:123"

  const dbJokesMap = new Map<string, { title: string; origen: string }>();

  for (const joke of dbJokes) {
    // Извлекаем origen из meta
    const origen = joke.meta?.origen as string | undefined;
    const title = joke.title;

    if (origen && title) {
      const key = `${origen}:${title}`;
      dbJokesMap.set(key, { title, origen });
    }
  }

  console.log(`📊 Создан маппинг для ${dbJokesMap.size} шуток из БД\n`);

  // 5. Обновляем JSON файл - помечаем шутки, которые есть в БД
  console.log(`📝 Обновление поля added в JSON файле...`);

  let markedCount = 0;
  for (const joke of allJokes) {
    const key = `${joke.origen}:${joke.titulo}`;
    if (dbJokesMap.has(key)) {
      if (!joke.added) {
        joke.added = true;
        markedCount++;
      }
    }
  }

  // 6. Сохраняем обновленный файл
  writeFileSync(filePath, JSON.stringify(allJokes, null, 2), "utf-8");
  console.log(`✅ Обновлено ${markedCount} шуток (было added=false, стало added=true)\n`);

  // 7. Статистика
  const totalAdded = allJokes.filter(j => j.added).length;
  const totalNotAdded = allJokes.filter(j => !j.added).length;

  console.log("📊 ИТОГОВАЯ СТАТИСТИКА:");
  console.log("=".repeat(80));
  console.log(`   Всего шуток в файле: ${allJokes.length}`);
  console.log(`   В базе данных (RicUIB): ${dbJokes.length}`);
  console.log(`   В файле added=true: ${totalAdded}`);
  console.log(`   В файле added=false: ${totalNotAdded}`);
  console.log(`   Обновлено в этом запуске: ${markedCount}`);

  const consistency = totalAdded === dbJokesMap.size;
  console.log(`\n   Проверка консистентности:`);
  console.log(`   - В БД уникальных шуток: ${dbJokesMap.size}`);
  console.log(`   - В файле added=true: ${totalAdded}`);
  console.log(`   - Статус: ${consistency ? '✅ Полное совпадение' : '⚠️ Расхождение'}`);

  if (!consistency) {
    const diff = totalAdded - dbJokesMap.size;
    if (diff > 0) {
      console.log(`   - В файле на ${diff} шуток больше (возможно, дубликаты заголовков)`);
    } else {
      console.log(`   - В БД на ${-diff} шуток больше (возможно, добавлены напрямую)`);
    }
  }

  console.log("\n✅ Синхронизация завершена!");
}

// Запускаем синхронизацию
syncAddedStatus()
  .then(() => {
    console.log("\n👋 Готово!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Ошибка при синхронизации:", error);
    process.exit(1);
  });
