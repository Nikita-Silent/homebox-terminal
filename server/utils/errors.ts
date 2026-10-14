import type { H3Event } from 'h3'
import type { ZodType } from 'zod'
import type { TerminalErrorCode } from '../../shared/types/terminal'
import { HomeboxError } from '../homebox/client'
import { TransferError } from '../services/transfers/types'

const STATUS_BY_CODE: Record<TerminalErrorCode, number> = {
  HOMEBOX_UNAVAILABLE: 503,
  HOMEBOX_UNAUTHORIZED: 502,
  NOT_FOUND: 404,
  VALIDATION: 422,
  STALE: 409,
  BUSY: 409,
  OP_CONFLICT: 409,
  INTERNAL: 500,
}

function terminalError(code: TerminalErrorCode, message: string) {
  return createError({ statusCode: STATUS_BY_CODE[code], statusMessage: code, message, data: { code, message } })
}

/** Converts service and Homebox errors into HTTP errors with a stable `data.code` for the UI. */
export function toHttpError(error: unknown) {
  if (error instanceof TransferError) return terminalError(error.code, error.message)
  if (error instanceof HomeboxError) {
    if (error.status === 401 || error.status === 403) {
      return terminalError('HOMEBOX_UNAUTHORIZED', 'Homebox отклонил ключ доступа. Проверьте NUXT_HOMEBOX_TOKEN.')
    }
    if (error.isNotFound) return terminalError('NOT_FOUND', 'Не найдено в Homebox')
    if (error.status === 0 || error.status >= 500) {
      return terminalError('HOMEBOX_UNAVAILABLE', 'Homebox недоступен. Проверьте сеть и повторите.')
    }
    return terminalError('INTERNAL', `Ошибка Homebox: ${error.message}`)
  }
  if (error && typeof error === 'object' && 'statusCode' in error) return error
  console.error(error)
  return terminalError('INTERNAL', 'Внутренняя ошибка сервера')
}

/** Wraps a handler so every failure is reported in the terminal error format. */
export function defineTerminalHandler<T>(handler: (event: H3Event) => Promise<T>) {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event)
    }
    catch (error) {
      throw toHttpError(error)
    }
  })
}

export function parseWith<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new TransferError('VALIDATION', `Некорректный запрос: ${issue?.path.join('.') || 'тело'} — ${issue?.message}`)
  }
  return result.data
}
