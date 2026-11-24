/**
 * Mirrors Kevin MacLeod (incompetech.com) tracks referenced in auto-generation
 * configs to our DigitalOcean Space and rewrites the config URLs.
 *
 * Why: renders ffprobe the audio URL directly; incompetech.com timeouts were
 * failing jobs. The mirrored URL keeps the same last path segment
 * (e.g. "Night%20Vigil.mp3"), so track-name attribution parsing is unchanged.
 *
 * Usage:
 *   tsx scripts/mirror-incompetech-audio.ts            # dry run
 *   tsx scripts/mirror-incompetech-audio.ts --apply    # upload + update configs
 */
import { config } from "dotenv";
config();

import { MongoClient } from "mongodb";
import { uploadBufferToSpaces } from "@/lib/storage/spaces-client";

const APPLY = process.argv.includes("--apply");
const INCOMPETECH_RE = /^https?:\/\/(www\.)?incompetech\.com\/.+\.mp3$/i;

function spacesPublicUrl(key: string): string {
  const host = process.env.SPACES_ENDPOINT!.replace("https://", "");
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `https://${process.env.SPACES_BUCKET}.${host}/${encoded}`;
}

function collectUrls(value: unknown, out: Set<string>) {
  if (typeof value === "string") {
    if (INCOMPETECH_RE.test(value)) out.add(value);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectUrls(v, out));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectUrls(v, out));
  }
}

/** Returns $set entries for every path whose value contains a mapped URL. */
function buildSet(
  value: unknown,
  path: string,
  map: Map<string, string>,
  out: Record<string, unknown>
) {
  if (typeof value === "string") {
    if (map.has(value)) out[path] = map.get(value);
  } else if (Array.isArray(value)) {
    if (value.some((v) => typeof v === "string" && map.has(v))) {
      out[path] = value.map((v) => (typeof v === "string" && map.get(v)) || v);
    } else {
      value.forEach((v, i) => buildSet(v, `${path}.${i}`, map, out));
    }
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "_id") continue;
      buildSet(v, path ? `${path}.${k}` : k, map, out);
    }
  }
}

async function main() {
  const client = await MongoClient.connect(process.env.MONGODB_URI!);
  const db = client.db(process.env.MONGODB_DB ?? "shorts-generator");

  const collections = (await db.listCollections().toArray())
    .map((c) => c.name)
    .filter((n) => n.startsWith("auto_generation_config"));

  const urls = new Set<string>();
  for (const name of collections) {
    for (const doc of await db.collection(name).find({}).toArray()) {
      collectUrls(doc, urls);
    }
  }
  console.log(`Found ${urls.size} unique incompetech URLs in ${collections.length} collections`);

  const map = new Map<string, string>();
  for (const url of urls) {
    const fileName = decodeURIComponent(url.split("/").pop()!);
    const key = `audio/incompetech/${fileName}`;
    const target = spacesPublicUrl(key);

    const exists = (await fetch(target, { method: "HEAD" })).ok;
    if (APPLY && exists) {
      console.log(`  already mirrored ${fileName}`);
    } else if (APPLY) {
      const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      await uploadBufferToSpaces(buffer, key, "audio/mpeg");
      const check = await fetch(target, { method: "HEAD" });
      if (!check.ok) throw new Error(`Mirrored file not reachable ${check.status}: ${target}`);
      console.log(`  mirrored ${fileName} (${(buffer.length / 1e6).toFixed(1)} MB)`);
    }
    map.set(url, target);
  }

  let updated = 0;
  for (const name of collections) {
    for (const doc of await db.collection(name).find({}).toArray()) {
      const $set: Record<string, unknown> = {};
      buildSet(doc, "", map, $set);
      if (Object.keys($set).length === 0) continue;
      console.log(`${name} ${doc._id}: ${Object.keys($set).join(", ")}`);
      if (APPLY) {
        await db.collection(name).updateOne({ _id: doc._id }, { $set });
        updated++;
      }
    }
  }

  console.log(APPLY ? `Updated ${updated} configs` : "Dry run — pass --apply to upload and update");
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
