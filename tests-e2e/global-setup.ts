// Crea los videos y la música de prueba al momento (no se guardan en el repositorio).
// Necesita ffmpeg instalado.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(import.meta.dirname, 'fixtures')

const clips: [string, number, string, number][] = [
  ['clip1.mp4', 3, 'red', 440],
  ['clip2.mp4', 4, 'green', 550],
  ['clip3.mp4', 2, 'blue', 660],
]

function ffmpeg(args: string[]) {
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args])
}

export default function globalSetup() {
  for (const [name, secs, color, hz] of clips) {
    const out = join(dir, name)
    if (existsSync(out)) continue
    ffmpeg([
      '-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=24:d=${secs}`,
      '-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=${secs}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', out,
    ])
  }
  const music = join(dir, 'musica.mp3')
  if (!existsSync(music)) ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=6', '-c:a', 'libmp3lame', music])
}
