import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import * as fs from "fs";

/**
 * Клиент для работы с DigitalOcean Spaces (S3-совместимое хранилище)
 */

// Инициализация S3 клиента для DigitalOcean Spaces
const spacesClient = process.env.SPACES_ENDPOINT
  ? new S3Client({
      endpoint: process.env.SPACES_ENDPOINT, // например: https://nyc3.digitaloceanspaces.com
      region: process.env.SPACES_REGION || "us-east-1", // регион не важен для Spaces, но обязателен для SDK
      credentials: {
        accessKeyId: process.env.SPACES_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.SPACES_SECRET_ACCESS_KEY || "",
      },
      forcePathStyle: false, // DigitalOcean Spaces использует виртуальный хостинг
    })
  : null;

export interface UploadVideoOptions {
  filePath: string; // Путь к локальному файлу
  fileName: string; // Имя файла в Spaces (например: videos/final_abc123.mp4)
  contentType?: string; // MIME тип (по умолчанию video/mp4)
  publicRead?: boolean; // Сделать файл публично доступным (по умолчанию true)
}

/**
 * Загружает видео файл в DigitalOcean Spaces
 * @returns Публичный URL загруженного файла
 */
export async function uploadVideoToSpaces(
  options: UploadVideoOptions
): Promise<string> {
  const {
    filePath,
    fileName,
    contentType = "video/mp4",
    publicRead = true,
  } = options;

  // Если Spaces не настроен, возвращаем локальный путь (для development)
  if (!spacesClient || !process.env.SPACES_BUCKET) {
    console.warn(
      "⚠️ DigitalOcean Spaces not configured. File saved locally:",
      filePath
    );
    return `/videos/${fileName.split('/').pop()}`; // Возвращаем локальный URL
  }

  try {
    // Читаем файл
    const fileStream = fs.createReadStream(filePath);

    // Создаем параллельную загрузку (для больших файлов)
    const upload = new Upload({
      client: spacesClient,
      params: {
        Bucket: process.env.SPACES_BUCKET,
        Key: fileName, // Путь в Spaces
        Body: fileStream,
        ContentType: contentType,
        ACL: publicRead ? "public-read" : "private",
      },
    });

    // Отслеживаем прогресс (опционально)
    upload.on("httpUploadProgress", (progress) => {
      if (progress.loaded && progress.total) {
        const percentage = Math.round((progress.loaded / progress.total) * 100);
        console.log(`📤 Upload progress: ${percentage}%`);
      }
    });

    // Загружаем файл
    await upload.done();

    // Формируем публичный URL
    const publicUrl = `https://${process.env.SPACES_BUCKET}.${process.env.SPACES_ENDPOINT?.replace("https://", "")}/${fileName}`;

    console.log("✅ Video uploaded to Spaces:", publicUrl);

    return publicUrl;
  } catch (error) {
    console.error("❌ Failed to upload video to Spaces:", error);
    throw new Error(
      `Failed to upload video to DigitalOcean Spaces: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Загружает файл в DigitalOcean Spaces из Buffer
 */
export async function uploadBufferToSpaces(
  buffer: Buffer,
  fileName: string,
  contentType: string = "application/octet-stream"
): Promise<string> {
  if (!spacesClient || !process.env.SPACES_BUCKET) {
    throw new Error("DigitalOcean Spaces not configured");
  }

  try {
    const command = new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: fileName,
      Body: buffer,
      ContentType: contentType,
      ACL: "public-read",
    });

    await spacesClient.send(command);

    const publicUrl = `https://${process.env.SPACES_BUCKET}.${process.env.SPACES_ENDPOINT?.replace("https://", "")}/${fileName}`;

    console.log("✅ File uploaded to Spaces:", publicUrl);

    return publicUrl;
  } catch (error) {
    console.error("❌ Failed to upload file to Spaces:", error);
    throw error;
  }
}

/**
 * Проверяет настроены ли переменные окружения для Spaces
 */
export function isSpacesConfigured(): boolean {
  return !!(
    process.env.SPACES_ENDPOINT &&
    process.env.SPACES_BUCKET &&
    process.env.SPACES_ACCESS_KEY_ID &&
    process.env.SPACES_SECRET_ACCESS_KEY
  );
}
