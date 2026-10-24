// Guardar gpt-hilos.json sin pisar los hilos de otro apartado (guion y Biblia comparten el archivo).
import { readGptThreads, saveGptThreads } from '../../database/db'
import { mergeSection, type GptSection, type StoredThread } from './threads'

/** Lee el archivo de nuevo, cambia solo los hilos de `section` y lo guarda (escritura atómica en la app). */
export async function saveSectionThreads(projectId: string, section: GptSection, mine: StoredThread[]) {
  const file = await readGptThreads<{ threads?: StoredThread[] }>(projectId).catch(() => null)
  const onDisk = Array.isArray(file?.threads) ? file.threads : []
  await saveGptThreads(projectId, { threads: mergeSection(onDisk, mine, section) })
}
