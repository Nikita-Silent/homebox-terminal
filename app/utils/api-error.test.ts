import { describe, expect, it } from 'vitest'
import { toApiError } from './api-error'

describe('toApiError', () => {
  it('takes code and message from a terminal error response', () => {
    const error = { statusCode: 409, data: { data: { code: 'STALE', message: 'Количество изменилось' } } }
    expect(toApiError(error)).toEqual({ code: 'STALE', message: 'Количество изменилось' })
  })

  it('treats a failure without HTTP status as no connection', () => {
    expect(toApiError(new TypeError('Failed to fetch'))).toMatchObject({ code: 'NETWORK', message: expect.stringContaining('Нет связи') })
    expect(toApiError(undefined).code).toBe('NETWORK')
  })

  it('hides other server errors behind a generic message', () => {
    expect(toApiError({ statusCode: 500, data: '<html>' })).toEqual({ code: 'INTERNAL', message: 'Что-то пошло не так. Повторите попытку.' })
  })
})
