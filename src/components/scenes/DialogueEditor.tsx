import { useEffect, useRef, useState } from "react";
import { Plus, Smile, Trash2, Type } from "lucide-react";
import { useProject } from "../../stores/projectStore";
import {
  EMOTIONS,
  MOMENTS,
  emojiFor,
  joinEmotions,
  lineSeconds,
  parseDialogue,
  serializeDialogue,
  splitEmotions,
  type DialogueLine,
} from "../../features/dialogue/lines";
import type { Character } from "../../types";

const NO_CHARACTERS: Character[] = [];

/** Color fijo por nombre, para reconocer a cada personaje de un vistazo. */
function hueOf(name: string) {
  let h = 0;
  for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function EmotionPicker({
  value,
  moment,
  onPick,
  onClose,
}: {
  value: string;
  moment: string;
  onPick: (v: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const out = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", out);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Emoción al ${moment}`}
      className="absolute left-0 top-full z-30 mt-1 w-[312px] rounded-xl border border-line-2 bg-[#0f1828] p-2 shadow-2xl"
    >
      <div className="mb-1.5 flex items-center justify-between px-0.5 text-[11px] text-ink-3">
        <span>Emoción al {moment}</span>
        {value && (
          <button
            className="text-ink-2 hover:text-white"
            onClick={() => onPick("")}
          >
            Quitar
          </button>
        )}
      </div>
      <div className="grid grid-cols-6 gap-1">
        {EMOTIONS.map((e) => (
          <button
            key={e.label}
            className={`flex h-[46px] flex-col items-center justify-center rounded-lg text-[19px] leading-none hover:bg-white/10 ${e.label === value ? "bg-sel/25 ring-1 ring-sel" : ""}`}
            onClick={() => onPick(e.label)}
            title={e.label}
            aria-label={e.label}
          >
            {e.emoji}
            <span className="mt-1 w-full truncate px-0.5 text-[8.5px] text-ink-3">
              {e.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Face({
  value,
  moment,
  onPick,
}: {
  value: string;
  moment: string;
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const emoji = value ? emojiFor(value) : undefined;
  return (
    <div className="relative">
      <button
        className={`flex h-7 w-7 items-center justify-center rounded-full border text-[15px] leading-none transition-colors ${value ? "border-line-2 bg-white/5" : "border-dashed border-line-2 text-ink-3 hover:text-ink-2"}`}
        onClick={() => setOpen((o) => !o)}
        title={`${moment}: ${value || "sin emoción"}`}
        aria-label={`Emoción al ${moment}: ${value || "sin emoción"}`}
      >
        {emoji ??
          (value ? (
            <span className="text-[9px]">{value.slice(0, 3)}</span>
          ) : (
            <Smile size={13} />
          ))}
      </button>
      {open && (
        <EmotionPicker
          value={value}
          moment={moment}
          onClose={() => setOpen(false)}
          onPick={(v) => {
            onPick(v);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

export function DialogueEditor({
  sceneId,
  value,
  hint,
}: {
  sceneId: string;
  value: string;
  hint: string;
}) {
  const updateScript = useProject((s) => s.updateScript);
  const characters = useProject((s) => s.project?.characters ?? NO_CHARACTERS);
  const [raw, setRaw] = useState(false);
  const lines = parseDialogue(value);
  const save = (next: DialogueLine[]) =>
    updateScript(sceneId, "dialogue", serializeDialogue(next));
  const patch = (i: number, p: Partial<DialogueLine>) =>
    save(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const listId = `personajes-${sceneId}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="label">Diálogos</span>
        <button
          className="btn btn-sm btn-ghost !h-6 !px-2 !text-[11px]"
          onClick={() => setRaw((r) => !r)}
          aria-pressed={raw}
          title="Ver los diálogos como texto"
        >
          {raw ? <Smile size={12} /> : <Type size={12} />}{" "}
          {raw ? "Con caritas" : "Como texto"}
        </button>
      </div>
      {raw ? (
        <textarea
          className="field"
          rows={3}
          placeholder={hint}
          value={value}
          aria-label="Diálogos"
          onChange={(e) => updateScript(sceneId, "dialogue", e.target.value)}
        />
      ) : (
        <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-[#0f1828] p-2">
          <datalist id={listId}>
            {characters.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          {lines.length === 0 && (
            <p className="px-1 text-[11.5px] text-ink-3">
              Sin diálogos. Agrega una línea: quién habla, cómo se siente y qué
              dice.
            </p>
          )}
          {lines.map((l, i) => {
            const emotions = splitEmotions(l.emotion);
            const secs = lineSeconds(l.text);
            return (
              <div
                key={i}
                className="flex flex-wrap items-center gap-1.5 md:flex-nowrap"
                aria-label={`Línea ${i + 1}`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background: l.speaker
                      ? `hsl(${hueOf(l.speaker)} 70% 60%)`
                      : "transparent",
                  }}
                />
                <input
                  className="field !w-[130px] shrink-0 !py-1.5 font-medium"
                  list={listId}
                  placeholder="Quién habla"
                  aria-label={`Personaje de la línea ${i + 1}`}
                  value={l.speaker}
                  onChange={(e) => patch(i, { speaker: e.target.value })}
                />
                <div
                  className="flex shrink-0 items-center gap-0.5"
                  title="Emoción al inicio → a la mitad → al final"
                >
                  {MOMENTS.map((m, k) => (
                    <div key={m} className="flex items-center gap-0.5">
                      {k > 0 && (
                        <span className="text-[10px] text-ink-3">→</span>
                      )}
                      <Face
                        value={emotions[k]}
                        moment={m}
                        onPick={(v) =>
                          patch(i, {
                            emotion: joinEmotions(
                              emotions.map((e, j) => (j === k ? v : e)),
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
                <input
                  className="field min-w-[160px] flex-1 !py-1.5"
                  placeholder="Qué dice. Ej.: —¡Mire!"
                  aria-label={`Texto de la línea ${i + 1}`}
                  value={l.text}
                  onChange={(e) => patch(i, { text: e.target.value })}
                />
                <span
                  className="w-9 shrink-0 text-right text-[11px] tabular-nums text-ink-3"
                  title="Tiempo aproximado al decirlo"
                >
                  {secs ? `≈${secs}s` : ""}
                </span>
                <button
                  className="icon-btn sm shrink-0"
                  onClick={() => save(lines.filter((_, j) => j !== i))}
                  aria-label={`Quitar línea ${i + 1}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
          <button
            className="btn btn-sm btn-ghost self-start"
            onClick={() =>
              save([
                ...lines,
                {
                  speaker:
                    lines.at(-1)?.speaker && lines.length > 1
                      ? lines.at(-2)!.speaker
                      : "",
                  emotion: "",
                  text: "—",
                },
              ])
            }
          >
            <Plus size={13} /> Agregar línea
          </button>
        </div>
      )}
    </div>
  );
}
