/**
 * Единое подключение к NATS JetStream для server-actions.
 *
 * Фронтенд публикует обращения в subject `appeals.submit` через JetStream
 * (persistence на диск — ack от стрима подтверждает запись), и слушает ответы
 * на `appeals.result.<id>` через обычный core subscriber (первое сообщение
 * выигрывает).
 *
 * Соединение живёт на всё время Node-процесса, в dev-HMR защищено через
 * globalThis-кэш — чтобы не открывать новый клиент на каждом ре-импорте.
 */

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

async function ensureAppealsStream(nc: NatsConnection): Promise<void> {
  // jetstreamManager — админский API JetStream (создание стримов и т.п.).
  // Идемпотентно: если стрим есть — ничего не делаем. Так же делает бэкенд;
  // дублируем на фронте, чтобы первый старт тоже работал в любом порядке.
  const jsm = await nc.jetstreamManager()
  try {
    await jsm.streams.info(APPEALS_STREAM)
    return
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes("stream not found") && !msg.includes("not found")) {
      throw err
    }
  }
  await jsm.streams.add({
    name: APPEALS_STREAM,
    subjects: [APPEALS_SUBMIT_SUBJECT, `${APPEALS_RESULT_SUBJECT_PREFIX}*`],
    storage: StorageType.File,
    retention: RetentionPolicy.Limits,
    max_age: 7 * 24 * 60 * 60 * 1_000_000_000, // 7d в наносекундах
    num_replicas: 1,
  })
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
        // Логируем только тип события: data может содержать причины отказа от
        // сервера (включая токены/строки подключения) — наружу не пускаем.
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
      // Снимаем промис с кэша, чтобы следующий вызов попытался заново.
      delete g[GLOBAL_KEY]
      throw err
    })
  }
  return g[GLOBAL_KEY]
}
