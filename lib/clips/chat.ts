/**
 * Сборщик активности чата Twitch (фаза 2, см. PLAN_CLIPS.md).
 *
 * Подключается к чату анонимно (официальный IRC, ник justinfanNNNN, без токена),
 * считает сообщения в 5-секундных корзинах и пишет их в MongoDB `stream_chat_buckets`.
 * Тексты сообщений и ники не храним: только счётчики.
 */
import * as tls from "tls";
import { getMongoDatabase } from "@/lib/db/mongodb";

export const BUCKET_SEC = 5;
const COLLECTION = "stream_chat_buckets";
/** Сколько дней храним корзины. */
const TTL_DAYS = 14;

export interface ChatBucket {
  channel: string;
  /** Начало корзины (UTC, кратно BUCKET_SEC). */
  t: Date;
  /** Всего сообщений. */
  n: number;
  /** Уникальных отправителей (устойчивее к спаму одного человека). */
  users: number;
  /** Сообщений со смехом: KEKW, LUL, ахах, ору... */
  laugh: number;
  /** Сообщений с удивлением/шоком: WTF, ЧТО, omg... */
  shock: number;
}

const LAUGH = /(kekw|kek|lul|lol|omegalul|icant|pepelaugh|xd|кек|ору|ахах|хаха|хах|пхх|ха-ха|ржу|лол|ахх|ahah|haha|\){3,}|😂|🤣)/i;
const SHOCK = /(wtf|omg|pog|monkas|wow|wutface|o_o|0_0|что\?|чё|шок|жесть|нифига|ничего себе|ебать|охуе|бля|😱|😳|💀)/i;

export function classify(text: string): { laugh: boolean; shock: boolean } {
  return { laugh: LAUGH.test(text), shock: SHOCK.test(text) };
}

interface OpenBucket {
  start: number;
  n: number;
  users: Set<string>;
  laugh: number;
  shock: number;
}

export async function chatBucketsCollection() {
  const db = await getMongoDatabase();
  const col = db.collection<ChatBucket>(COLLECTION);
  await col.createIndex({ channel: 1, t: 1 }, { unique: true });
  await col.createIndex({ t: 1 }, { expireAfterSeconds: TTL_DAYS * 24 * 3600 });
  return col;
}

export class ChatCollector {
  private socket: tls.TLSSocket | null = null;
  private buffer = "";
  private open = new Map<string, OpenBucket>();
  private ready: ChatBucket[] = [];
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private reconnectDelay = 1000;
  /** Сообщений за минуту по каналам, для логов. */
  private minuteStats = new Map<string, number>();

  constructor(private channels: string[], private log = console.log) {}

  async start() {
    await chatBucketsCollection();
    this.connect();
    this.timer = setInterval(() => void this.flush(), BUCKET_SEC * 1000);
    setInterval(() => this.logMinute(), 60_000).unref();
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.socket?.destroy();
    await this.flush(true);
  }

  private connect() {
    const nick = `justinfan${Math.floor(10000 + Math.random() * 80000)}`;
    const socket = tls.connect(6697, "irc.chat.twitch.tv", { servername: "irc.chat.twitch.tv" });
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.on("secureConnect", () => {
      this.reconnectDelay = 1000;
      socket.write("CAP REQ :twitch.tv/tags\r\n");
      socket.write("PASS SCHMOOPIIE\r\n");
      socket.write(`NICK ${nick}\r\n`);
      // JOIN пачками, Twitch ограничивает частоту JOIN.
      for (let i = 0; i < this.channels.length; i += 10) {
        const batch = this.channels.slice(i, i + 10).map((c) => `#${c.toLowerCase()}`);
        setTimeout(() => socket.write(`JOIN ${batch.join(",")}\r\n`), (i / 10) * 11_000);
      }
      this.log(`💬 Chat connected as ${nick}: ${this.channels.join(", ")}`);
    });
    socket.on("data", (chunk: string) => this.onData(chunk));
    socket.on("error", (error) => this.log(`⚠️ Chat socket error: ${error.message}`));
    socket.on("close", () => {
      if (this.stopped) return;
      this.log(`⚠️ Chat disconnected, reconnecting in ${this.reconnectDelay / 1000}s`);
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60_000);
    });
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    const lines = this.buffer.split("\r\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) this.onLine(line);
  }

  private onLine(line: string) {
    if (line.startsWith("PING")) {
      this.socket?.write(`PONG ${line.slice(5)}\r\n`);
      return;
    }
    if (line.includes(" RECONNECT")) {
      this.socket?.destroy();
      return;
    }
    // @tags :user!user@user.tmi.twitch.tv PRIVMSG #channel :text
    const match = /^(?:@(\S+) )?:(\S+?)!\S+ PRIVMSG #(\S+) :(.*)$/.exec(line);
    if (!match) return;
    const [, rawTags = "", user, channel, text] = match;
    const tags = Object.fromEntries(rawTags.split(";").map((kv) => kv.split("=") as [string, string]));
    const ts = Number(tags["tmi-sent-ts"]) || Date.now();
    this.add(channel, tags["user-id"] || user, text, ts);
  }

  private add(channel: string, userId: string, text: string, ts: number) {
    const start = Math.floor(ts / 1000 / BUCKET_SEC) * BUCKET_SEC;
    const key = `${channel}:${start}`;
    let bucket = this.open.get(key);
    if (!bucket) {
      bucket = { start, n: 0, users: new Set(), laugh: 0, shock: 0 };
      this.open.set(key, bucket);
    }
    const kind = classify(text);
    bucket.n++;
    bucket.users.add(userId);
    if (kind.laugh) bucket.laugh++;
    if (kind.shock) bucket.shock++;
    this.minuteStats.set(channel, (this.minuteStats.get(channel) ?? 0) + 1);
  }

  /** Закрывает корзины старше 2 интервалов (запас на поздние сообщения) и пишет в БД. */
  private async flush(all = false) {
    const cutoff = Date.now() / 1000 - BUCKET_SEC * 2;
    for (const [key, bucket] of this.open) {
      if (!all && bucket.start > cutoff) continue;
      this.open.delete(key);
      this.ready.push({
        channel: key.split(":")[0],
        t: new Date(bucket.start * 1000),
        n: bucket.n,
        users: bucket.users.size,
        laugh: bucket.laugh,
        shock: bucket.shock,
      });
    }
    if (this.ready.length === 0) return;
    const batch = this.ready.splice(0);
    try {
      const col = await chatBucketsCollection();
      // $inc: если после переподключения корзина уже есть, складываем счётчики.
      await col.bulkWrite(
        batch.map((b) => ({
          updateOne: {
            filter: { channel: b.channel, t: b.t },
            update: { $inc: { n: b.n, users: b.users, laugh: b.laugh, shock: b.shock } },
            upsert: true,
          },
        })),
        { ordered: false }
      );
    } catch (error) {
      this.log(`⚠️ Failed to save chat buckets: ${error instanceof Error ? error.message : error}`);
      this.ready.unshift(...batch.slice(-5000));
    }
  }

  private logMinute() {
    if (this.minuteStats.size === 0) return;
    const parts = [...this.minuteStats].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`);
    this.log(`💬 msgs/min ${parts.join(" ")}`);
    this.minuteStats.clear();
  }
}
