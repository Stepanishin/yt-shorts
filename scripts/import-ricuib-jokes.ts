import { config } from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import { getJokeCandidateCollection } from "@/lib/ingest/storage";
import type { JokeCandidate } from "@/lib/ingest/types";

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

const MIN_LENGTH = 30;
const MAX_LENGTH = 700;
const JOKES_TO_IMPORT = 500;

async function importRicuibJokes() {
  console.log("🚀 Начинаем импорт шуток из RicUIB датасета...\n");

  // 1. Читаем JSON файл
  const filePath = "/Users/evgeniistepanishin/Desktop/evg/shorts-generator/chistes_ricuib.json";
  console.log(`📖 Читаем файл: ${filePath}`);

  const fileContent = readFileSync(filePath, "utf-8");
  const allJokes: RicuibJoke[] = JSON.parse(fileContent);
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

  // 3. Выбираем случайные 500 шуток
  const shuffled = eligibleJokes.sort(() => Math.random() - 0.5);
  const selectedJokes = shuffled.slice(0, Math.min(JOKES_TO_IMPORT, eligibleJokes.length));

  console.log(`🎲 Выбрано ${selectedJokes.length} случайных шуток для импорта\n`);

  // 4. Конвертируем в формат JokeCandidate
  const jokeCandidates: Array<JokeCandidate & { ricuibIndex: number }> = selectedJokes.map((joke) => {
    // Определяем source на основе origen
    const source = joke.origen === "1000 chistes"
      ? "ricuib-1000chistes"
      : "ricuib-pintamania";

    // Создаем уникальный externalId используя index из JSON файла
    // Формат: "ricuib:{origen}:{index}"
    const externalId = `ricuib:${joke.origen}:${joke.index}`;

    return {
      source,
      title: joke.titulo,
      text: joke.texto,
      externalId,
      language: "es",
      votesTotal: joke.votos || undefined,
      meta: {
        categorias: joke.categorias,
        palabras_clave: joke.palabras_clave,
        origen: joke.origen,
        dataset: "RicUIB/Mineria-texto-chistes",
        ricuibIndex: joke.index, // Сохраняем индекс для точного обратного маппинга
      },
      ricuibIndex: joke.index, // Добавляем временное поле для маппинга
    };
  });

  // 5. Подключаемся к MongoDB и добавляем шутки
  console.log(`💾 Подключение к MongoDB...`);
  const collection = await getJokeCandidateCollection();

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
    const { ricuibIndex, ...jokeData } = joke;
    return {
      ...jokeData,
      createdAt: new Date(),
      status: "pending" as const,
    };
  });

  console.log(`📝 Добавление ${documentsToInsert.length} шуток в коллекцию joke_candidates...`);
  const result = await collection.insertMany(documentsToInsert);
  console.log(`✅ Успешно добавлено: ${result.insertedCount} шуток\n`);

  // 6. Обновляем JSON файл - помечаем ТОЛЬКО добавленные шутки по индексу
  console.log(`📝 Обновление JSON файла - помечаем добавленные шутки...`);

  // Создаем Set из индексов РЕАЛЬНО добавленных шуток
  const addedIndices = new Set(newJokes.map((j) => j.ricuibIndex));

  let markedCount = 0;
  for (const joke of allJokes) {
    // Проверяем точное совпадение по индексу
    if (addedIndices.has(joke.index)) {
      joke.added = true;
      markedCount++;
    }
  }

  writeFileSync(filePath, JSON.stringify(allJokes, null, 2), "utf-8");
  console.log(`✅ Помечено ${markedCount} шуток как added: true (должно быть ${newJokes.length})\n`);

  if (markedCount !== newJokes.length) {
    console.log(`⚠️  ПРЕДУПРЕЖДЕНИЕ: Несоответствие количества помеченных шуток!`);
  }

  // 7. Статистика
  console.log("📊 СТАТИСТИКА ИМПОРТА:");
  console.log("=".repeat(80));
  console.log(`   Всего шуток в файле: ${allJokes.length}`);
  console.log(`   Подходящих для импорта: ${eligibleJokes.length}`);
  console.log(`   Выбрано случайно: ${selectedJokes.length}`);
  console.log(`   Уже существовало в БД: ${existingIds.size}`);
  console.log(`   Добавлено новых: ${result.insertedCount}`);
  console.log(`   Помечено как added=true: ${markedCount}`);

  // Статистика по источникам
  const by1000chistes = newJokes.filter(j => j.source === "ricuib-1000chistes").length;
  const byPintamania = newJokes.filter(j => j.source === "ricuib-pintamania").length;

  console.log("\n   По источникам:");
  console.log(`   - 1000 chistes: ${by1000chistes} шуток`);
  console.log(`   - Pintamania: ${byPintamania} шуток`);

  // Проверка консистентности
  const addedInFile = allJokes.filter(j => j.added).length;
  console.log(`\n   Проверка консистентности:`);
  console.log(`   - В файле помечено added=true: ${addedInFile}`);
  console.log(`   - Должно быть: ${markedCount}`);
  console.log(`   - Статус: ${addedInFile === markedCount ? '✅ OK' : '❌ ОШИБКА'}`);

  console.log("\n✅ Импорт завершен успешно!");
}

// Запускаем импорт
importRicuibJokes()
  .then(() => {
    console.log("\n👋 Готово!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Ошибка при импорте:", error);
    process.exit(1);
  });
