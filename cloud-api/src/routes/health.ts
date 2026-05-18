import type { ServerResponse } from 'node:http'
import { sendJson } from '../lib/security.js'

export function handleHealth(response: ServerResponse): void {
  sendJson(response, 200, { ok: true })
}
