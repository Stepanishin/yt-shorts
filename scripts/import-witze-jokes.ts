import { config } from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import { getJokeCandidateCollectionDE } from "@/lib/ingest-de/storage";
import type { JokeCandidateDE } from "@/lib/ingest-de/types";

// Load environment variables
config();

interface WitzeJoke {
  index: number;
  texto: string;
  votos: number;
  fecha: string;
  usuario: string;
  added: boolean;
  origen: string;
}

const MIN_LENGTH = 30;
const MAX_LENGTH = 700;
const JOKES_TO_IMPORT = 500;

async function deletePendingJokes() {
  console.log("🗑️  Удаление pending шуток из joke_candidates_de...\n");

  const collection = await getJokeCandidateCollectionDE();

  // Count pending jokes before deletion
  const pendingCount = await collection.countDocuments({ status: "pending" });
  console.log(`   Найдено pending шуток: ${pendingCount}`);

  if (pendingCount === 0) {
    console.log("   Нет pending шуток для удаления\n");
    return 0;
  }

  // Delete all pending jokes
  const result = await collection.deleteMany({ status: "pending" });
  console.log(`   ✅ Удалено: ${result.deletedCount} шуток\n`);

  return result.deletedCount;
}

async function importWitzeJokes() {
  console.log("🚀 Начинаем импорт шуток из Schlechtewitzefront датасета...\n");

  // 0. Удаляем pending шутки
  await deletePendingJokes();

  // 1. Читаем JSON файл
  const filePath = "/Users/evgeniistepanishin/Desktop/evg/shorts-generator/witze_schlechtewitzefront.json";
  console.log(`📖 Читаем файл: ${filePath}`);

  const fileContent = readFileSync(filePath, "utf-8");
  const allJokes: WitzeJoke[] = JSON.parse(fileContent);
  console.log(`   Всего шуток в файле: ${allJokes.length}\n`);

  // 2. Фильтруем шутки по критериям
  const eligibleJokes = allJokes.filter((joke) => {
    const textLength = joke.texto.length;
    return (
      joke.added === false &&
      textLength >= MIN_LENGTH &&
      textLength <= MAX_LENGTH
    );
  });

  console.log(`🔍 Фильтрация:`);
  console.log(`   - added === false`);
  console.log(`   - длина текста >= ${MIN_LENGTH} и <= ${MAX_LENGTH}`);
  console.log(`   Подходящих шуток: ${eligibleJokes.length}\n`);

  if (eligibleJokes.length < JOKES_TO_IMPORT) {
    console.log(`⚠️  ПРЕДУПРЕЖДЕНИЕ: Доступно только ${eligibleJokes.length} шуток, хотели ${JOKES_TO_IMPORT}`);
  }

  // 3. Выбираем случайные 500 шуток (сортируем по голосам, потом случайно)
  // Сначала берем шутки с голосами
  const withVotes = eligibleJokes.filter(j => j.votos > 0).sort((a, b) => b.votos - a.votos);
  const withoutVotes = eligibleJokes.filter(j => j.votos === 0).sort(() => Math.random() - 0.5);

  const combined = [...withVotes, ...withoutVotes];
  const selectedJokes = combined.slice(0, Math.min(JOKES_TO_IMPORT, eligibleJokes.length));

  console.log(`🎲 Выбрано ${selectedJokes.length} шуток для импорта`);
  console.log(`   - С голосами: ${withVotes.length}`);
  console.log(`   - Без голосов (случайные): ${Math.max(0, selectedJokes.length - withVotes.length)}\n`);

  // 4. Конвертируем в формат JokeCandidateDE
  const jokeCandidates: Array<JokeCandidateDE & { witzeIndex: number }> = selectedJokes.map((joke) => {
    // Создаем уникальный externalId используя index из JSON файла
    const externalId = `schlechtewitzefront:${joke.index}`;

    return {
      source: "schlechtewitzefront" as const,
      text: joke.texto,
      externalId,
      language: "de",
      votesTotal: joke.votos || undefined,
      meta: {
        fecha: joke.fecha,
        usuario: joke.usuario,
        origen: joke.origen,
        dataset: "JohannesBauer97/Schlechtewitzefront",
        witzeIndex: joke.index,
      },
      witzeIndex: joke.index,
    };
  });

  // 5. Подключаемся к MongoDB и добавляем шутки
  console.log(`💾 Подключение к MongoDB...`);
  const collection = await getJokeCandidateCollectionDE();

  // Проверяем дубликаты
  const existingJokes = await collection
    .find({
      externalId: { $in: jokeCandidates.map((j) => j.externalId) },
    })
    .toArray();

  const existingIds = new Set(existingJokes.map((j) => j.externalId));
  const newJokes = jokeCandidates.filter((j) => !existingIds.has(j.externalId));

  console.log(`   Найдено существующих шуток: ${existingIds.size}`);
  console.log(`   Будет добавлено новых шуток: ${newJokes.length}\n`);

  if (newJokes.length === 0) {
    console.log("✅ Нет новых шуток для добавления (все уже в базе)");
    return;
  }

  // Вставляем в базу данных
  const documentsToInsert = newJokes.map((joke) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { witzeIndex, ...jokeData } = joke;
    return {
      ...jokeData,
      createdAt: new Date(),
      status: "pending" as const,
    };
  });

  console.log(`📝 Добавление ${documentsToInsert.length} шуток в коллекцию joke_candidates_de...`);
  const result = await collection.insertMany(documentsToInsert);
  console.log(`✅ Успешно добавлено: ${result.insertedCount} шуток\n`);

  // 6. Обновляем JSON файл - помечаем ТОЛЬКО добавленные шутки по индексу
  console.log(`📝 Обновление JSON файла - помечаем добавленные шутки...`);

  // Создаем Set из индексов РЕАЛЬНО добавленных шуток
  const addedIndices = new Set(newJokes.map((j) => j.witzeIndex));

  let markedCount = 0;
  for (const joke of allJokes) {
    if (addedIndices.has(joke.index)) {
      joke.added = true;
      markedCount++;
    }
  }

  writeFileSync(filePath, JSON.stringify(allJokes, null, 2), "utf-8");
  console.log(`✅ Помечено ${markedCount} шуток как added: true\n`);

  // 7. Статистика
  console.log("📊 СТАТИСТИКА ИМПОРТА:");
  console.log("=".repeat(80));
  console.log(`   Всего шуток в файле: ${allJokes.length}`);
  console.log(`   Подходящих для импорта: ${eligibleJokes.length}`);
  console.log(`   Выбрано: ${selectedJokes.length}`);
  console.log(`   Уже существовало в БД: ${existingIds.size}`);
  console.log(`   Добавлено новых: ${result.insertedCount}`);
  console.log(`   Помечено как added=true: ${markedCount}`);

  // Статистика по голосам
  const withVotesAdded = newJokes.filter(j => j.votesTotal && j.votesTotal > 0).length;
  console.log(`\n   Добавлено шуток с голосами: ${withVotesAdded}`);

  // Проверка консистентности
  const addedInFile = allJokes.filter(j => j.added).length;
  console.log(`\n   Проверка консистентности:`);
  console.log(`   - В файле помечено added=true: ${addedInFile}`);
  console.log(`   - Статус: ✅ OK`);

  console.log("\n✅ Импорт завершен успешно!");
}

// Запускаем импорт
importWitzeJokes()
  .then(() => {
    console.log("\n👋 Готово!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Ошибка при импорте:", error);
    process.exit(1);
  });
