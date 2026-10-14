import type { TerminalErrorCode } from '#shared/types/terminal'

export interface ApiError {
  code: TerminalErrorCode | 'NETWORK'
  message: string
}

/** Normalises a `$fetch` failure into the terminal's error shape. */
export function toApiError(error: unknown): ApiError {
  const data = (error as { data?: { data?: { code?: TerminalErrorCode, message?: string } } })?.data?.data
  if (data?.code && data.message) return { code: data.code, message: data.message }
  const status = (error as { statusCode?: number })?.statusCode
  if (!status) {
    return { code: 'NETWORK', message: 'Нет связи с сервером терминала. Проверьте сеть и повторите.' }
  }
  return { code: 'INTERNAL', message: 'Что-то пошло не так. Повторите попытку.' }
}
