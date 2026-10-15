import { beforeAll, describe, expect, it } from 'vitest'
import { useProject } from '../stores/projectStore'
import { collectGarbage, db, listSnapshots, SNAPSHOT_KEEP } from '../database/db'

describe('respaldos automáticos', () => {
  beforeAll(async () => {
    await useProject.getState().init()
    await useProject.getState().newProject('Respaldos')
  })
  it('respaldar, cambiar y restaurar', async () => {
    const st = useProject.getState
    const a = st().addScene()!
    st().updateScene(a, { title: 'Original' })
    await st().backupNow('auto')
    st().updateScene(a, { title: 'Cambiado' })
    st().addScene()
    await st().flushSave()
    const [snap] = await listSnapshots(st().project!.id)
    await st().restoreSnapshot(snap.id)
    expect(st().scenes[a].title).toBe('Original')
    expect(st().project!.sceneIds).toHaveLength(1)
    // se guardó otro respaldo «antes de restaurar»
    const list = await listSnapshots(st().project!.id)
    expect(list[0].reason).toBe('before-restore')
  })
  it('se conservan solo los últimos 30', async () => {
    for (let i = 0; i < SNAPSHOT_KEEP + 3; i++) await useProject.getState().backupNow('auto')
    expect(await listSnapshots(useProject.getState().project!.id)).toHaveLength(SNAPSHOT_KEEP)
  })
  it('la limpieza no borra archivos que usa un respaldo', async () => {
    const st = useProject.getState
    const pid = st().project!.id
    await db.media.put({ id: 'm-snap', projectId: pid, name: 'a.png', mimeType: 'image/png', size: 1, kind: 'image', createdAt: '', data: new ArrayBuffer(1) })
    const id = st().project!.sceneIds[0]
    st().setImage(id, 'start', 'm-snap')
    await st().backupNow('auto')
    st().setImage(id, 'start', undefined)
    await st().flushSave()
    await collectGarbage(pid, Object.values(st().scenes))
    expect(await db.media.get('m-snap')).toBeTruthy()
  })
})
