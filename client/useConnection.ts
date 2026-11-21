import { computed } from 'vue'
import type { Connection } from '@shared/connection'
export type { Connection, Connections } from '@shared/connection'
export function useConnection() {
  return { connection: computed<Connection>(() => 'instance') }
}
