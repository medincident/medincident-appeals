import { NextRequest } from "next/server"

const NLP_URL = process.env.NLP_SERVICE_URL ?? "http://ai-medincident-nlp:8000"

export async function POST(request: NextRequest) {
  const { text } = await request.json()

  const res = await fetch(`${NLP_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    return Response.json({ error: `NLP service: ${res.status}` }, { status: res.status })
  }

  const data = await res.json()
  return Response.json(data)
}
