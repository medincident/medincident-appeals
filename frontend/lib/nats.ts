import {
  connect,
  JSONCodec,
  RetentionPolicy,
  StorageType,
  type JetStreamClient,
  type NatsConnection,
} from "nats"

export const APPEALS_STREAM = "APPEALS"
export const APPEALS_SUBMIT_SUBJECT = "appeals.submit"
export const APPEALS_RESULT_SUBJECT_PREFIX = "appeals.result."

const NATS_URL = process.env.NATS_URL ?? "nats://nats:4222"

export const jsonCodec = JSONCodec()

type NatsState = {
  nc: NatsConnection
  js: JetStreamClient
}

const GLOBAL_KEY = Symbol.for("ai-medincident.frontend.nats")
type GlobalWithNats = typeof globalThis & {
  [GLOBAL_KEY]?: Promise<NatsState>
}

const DUPLICATE_WINDOW_NS = 60 * 60 * 1_000_000_000 // 1h
const MAX_MSG_SIZE = 16 * 1024

async function ensureAppealsStream(nc: NatsConnection): Promise<void> {
  const jsm = await nc.jetstreamManager()
  const baseConfig = {
    name: APPEALS_STREAM,
    subjects: [APPEALS_SUBMIT_SUBJECT, `${APPEALS_RESULT_SUBJECT_PREFIX}*`],
    storage: StorageType.File,
    retention: RetentionPolicy.Limits,
    max_age: 7 * 24 * 60 * 60 * 1_000_000_000, // 7d
    max_msg_size: MAX_MSG_SIZE,
    duplicate_window: DUPLICATE_WINDOW_NS,
    num_replicas: 1,
  }
  try {
    const info = await jsm.streams.info(APPEALS_STREAM)
    const needsUpdate =
      info.config.duplicate_window !== DUPLICATE_WINDOW_NS ||
      info.config.max_msg_size !== MAX_MSG_SIZE
    if (needsUpdate) {
      await jsm.streams.update(APPEALS_STREAM, baseConfig)
    }
    return
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes("stream not found") && !msg.includes("not found")) {
      throw err
    }
  }
  await jsm.streams.add(baseConfig)
}

async function buildNatsState(): Promise<NatsState> {
  const nc = await connect({
    servers: NATS_URL,
    name: "frontend",
    reconnect: true,
    maxReconnectAttempts: -1,
    reconnectTimeWait: 2_000,
    timeout: 5_000,
  })
  ;(async () => {
    for await (const s of nc.status()) {
      if (s.type === "disconnect" || s.type === "error") {
        console.warn("[nats] status:", s.type)
      }
    }
  })().catch(() => {})
  await ensureAppealsStream(nc)
  return { nc, js: nc.jetstream() }
}

export function getNats(): Promise<NatsState> {
  const g = globalThis as GlobalWithNats
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = buildNatsState().catch((err) => {
      delete g[GLOBAL_KEY]
      throw err
    })
  }
  return g[GLOBAL_KEY]
}
