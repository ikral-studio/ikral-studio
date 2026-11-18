// Créditos: proyectos libres que usa IKRAL Studio, con su licencia. Gracias a sus autores.
// Al agregar un modelo o librería nueva, súmalo aquí.

export interface Credit {
  name: string
  author: string
  /** Para qué lo usamos, en palabras simples. */
  use: string
  license: string
  url: string
}

export const CREDITS: { group: string; items: Credit[] }[] = [
  {
    group: 'Inteligencia artificial en tu Mac',
    items: [
      { name: 'ACE-Step 1.5', author: 'ACE Studio y StepFun', use: 'Hace la música: canciones, otras versiones, separar voz, agregar instrumentos.', license: 'MIT', url: 'https://github.com/ace-step/ACE-Step-1.5' },
      { name: 'Qwen3 (0.6B)', author: 'Equipo Qwen, Alibaba', use: 'Ayuda a ACE-Step a entender el estilo y la letra.', license: 'Apache-2.0', url: 'https://huggingface.co/Qwen/Qwen3-Embedding-0.6B' },
      { name: 'ComfyUI', author: 'comfyanonymous y colaboradores', use: 'Motor que corre los modelos de video en la Mac.', license: 'GPL-3.0', url: 'https://github.com/comfyanonymous/ComfyUI' },
      { name: 'LTX-Video 2B', author: 'Lightricks', use: 'Hace el video de cada escena (imagen inicial → final).', license: 'LTX-Video Open Weights License', url: 'https://huggingface.co/Lightricks/LTX-Video' },
      { name: 'T5 v1.1 XXL', author: 'Google', use: 'Le explica el texto de la escena al modelo de video.', license: 'Apache-2.0', url: 'https://huggingface.co/google/t5-v1_1-xxl' },
    ],
  },
  {
    group: 'La app',
    items: [
      { name: 'Tauri', author: 'Tauri Programme', use: 'Convierte la app en programa de Mac.', license: 'MIT o Apache-2.0', url: 'https://tauri.app' },
      { name: 'tauri-plugin-drag', author: 'CrabNebula', use: 'Arrastrar archivos de la app a otros programas.', license: 'Apache-2.0', url: 'https://github.com/crabnebula-dev/drag-rs' },
      { name: 'React', author: 'Meta y colaboradores', use: 'Las pantallas de la app.', license: 'MIT', url: 'https://react.dev' },
      { name: 'Zustand', author: 'Poimandres', use: 'Guarda el estado de la app mientras trabajas.', license: 'MIT', url: 'https://github.com/pmndrs/zustand' },
      { name: 'Dexie', author: 'David Fahlander', use: 'Base de datos en el navegador.', license: 'Apache-2.0', url: 'https://dexie.org' },
      { name: 'dnd kit', author: 'Claudéric Demers', use: 'Arrastrar y ordenar escenas.', license: 'MIT', url: 'https://dndkit.com' },
      { name: 'Lucide', author: 'Lucide Contributors', use: 'Los íconos.', license: 'ISC', url: 'https://lucide.dev' },
      { name: 'jsPDF', author: 'James Hall y colaboradores', use: 'Hacer los PDF.', license: 'MIT', url: 'https://github.com/parallax/jsPDF' },
      { name: 'JSZip', author: 'Stuart Knightley y colaboradores', use: 'Exportar e importar proyectos .zip.', license: 'MIT', url: 'https://stuk.github.io/jszip/' },
      { name: 'Zod', author: 'Colin McDonnell', use: 'Revisar que los guiones importados estén bien.', license: 'MIT', url: 'https://zod.dev' },
    ],
  },
]
