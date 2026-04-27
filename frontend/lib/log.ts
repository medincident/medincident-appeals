/**
 * Безопасное представление ошибки для логов.
 *
 * Поведение `console.error("...", err)` по умолчанию логирует весь объект,
 * включая `cause`, `response`, JWT-фрагменты и прочее, что может содержать
 * персональные данные или токены. Этот хелпер достаёт только name + message.
 */
export function safeError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`
  }
  if (typeof err === "string") return err
  return "Unknown error"
}
