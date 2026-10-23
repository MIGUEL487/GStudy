import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
} from "react";
import {
  ArrowUpRight,
  BookOpen,
  Circle,
  Eraser,
  ImagePlus,
  Minus,
  Move,
  Pencil,
  Plus,
  Redo2,
  Scan,
  Square,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import {
  fitBoardImage,
  moveBoardImage,
  readBoardImage,
  sizeBoardImage,
  type ImageBox,
} from "@/lib/whiteboard-images";
import {
  doesEraserTouchMark,
  drawMark,
  formatMathPreview,
  isPointInTextMark,
  type DrawMark,
  type DrawTool,
  type Gesture,
  type ImageMark,
  type Mark,
  type Point,
  type Tool,
} from "@/lib/whiteboard-model";
import "@/styles/whiteboard-images.css";
import { useTheme } from "@/lib/theme-provider";
import "@/styles/whiteboard-math.css";

export type Board = {
  snapshot: () => string | undefined;
  clear: () => void;
  isLoading?: () => boolean;
};

export type { DrawMark, DrawTool, Gesture, ImageMark, Mark, Point, Tool };

type TextSession = {
  blockId: string;
  lineIndex: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  text: string;
  color: string;
  size: number;
};

const chalkBackground = "#2f4a3a",
  paperBackground = "#fcf7ec";

const chalkColors = [
  { value: "#f3efe2", name: "Branco" },
  { value: "#f5d76e", name: "Amarelo" },
  { value: "#7fd1ae", name: "Verde" },
  { value: "#f28b82", name: "Rosa" },
];

const paperColors = [
  { value: "#493729", name: "Marrom" },
  { value: "#ac5a3e", name: "Terracota" },
  { value: "#4f7561", name: "Verde" },
  { value: "#486d89", name: "Azul" },
];

const tools = [
  { id: "select", label: "Mover imagem", Icon: Move },
  { id: "pen", label: "Giz", Icon: Pencil },
  { id: "eraser", label: "Apagador", Icon: Eraser },
  { id: "text", label: "Texto", Icon: Type },
  { id: "image", label: "Inserir imagem", Icon: ImagePlus },
  { id: "rectangle", label: "Retângulo", Icon: Square },
  { id: "ellipse", label: "Elipse", Icon: Circle },
  { id: "line", label: "Linha", Icon: Minus },
  { id: "arrow", label: "Seta", Icon: ArrowUpRight },
] as const;

const SIZES = [
  { id: "P", px: 20 },
  { id: "M", px: 28 },
  { id: "G", px: 40 },
] as const;

export const Whiteboard = forwardRef<Board, { disabled?: boolean; variant?: "chalk" | "paper" }>(
  function Whiteboard({ disabled = false, variant = "chalk" }, ref) {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const paper = variant === "paper",
      background = paper ? paperBackground : chalkBackground,
      colors = paper ? paperColors : chalkColors;

    const canvas = useRef<HTMLCanvasElement>(null),
      fileInput = useRef<HTMLInputElement>(null),
      containerRef = useRef<HTMLDivElement>(null),
      overlayInputRef = useRef<HTMLInputElement>(null);

    const marks = useRef<Mark[]>([]),
      past = useRef<Mark[][]>([]),
      future = useRef<Mark[][]>([]),
      gesture = useRef<Gesture | null>(null);

    const upload = useRef(0),
      loadingRef = useRef(false),
      alive = useRef(true),
      disabledRef = useRef(disabled);
    disabledRef.current = disabled;

    const [tool, setTool] = useState<Tool>("pen"),
      [color, setColor] = useState(colors[0]!.value),
      [text, setText] = useState(""),
      [size, setSize] = useState(28),
      [formulasEnabled, setFormulasEnabled] = useState(true);

    const [selected, setSelected] = useState<string | null>(null),
      [loading, setLoading] = useState(false),
      [imageError, setImageError] = useState("");

    const [history, setHistory] = useState({ undo: 0, redo: 0 });
    const [textSession, setTextSession] = useState<TextSession | null>(null);

    const selectedImage = marks.current.find(
      (mark): mark is ImageMark => mark.tool === "image" && mark.id === selected,
    );

    const refresh = (editing = true) => {
      const c = canvas.current,
        g = c?.getContext("2d");
      if (!c || !g) return;
      g.fillStyle = background;
      g.fillRect(0, 0, c.width, c.height);

      if (paper) {
        g.fillStyle = "#dfd4c1";
        for (let x = 24; x < c.width; x += 24)
          for (let y = 24; y < c.height; y += 24) g.fillRect(x, y, 1, 1);
      }

      const active = editing ? gesture.current : null;
      marks.current.forEach((mark) =>
        drawMark(
          g,
          active &&
            active.kind !== "draw" &&
            mark.tool === "image" &&
            mark.id === active.original.id
            ? active.preview
            : mark,
          background,
        ),
      );

      if (active?.kind === "draw") drawMark(g, active.mark, background);

      const selection =
        active && active.kind !== "draw"
          ? active.preview
          : marks.current.find(
              (mark): mark is ImageMark => mark.tool === "image" && mark.id === selected,
            );

      if (editing && selection && tool === "select" && !disabled) {
        const scale = c.width / (c.getBoundingClientRect().width || c.width);
        g.save();
        g.strokeStyle = paper ? "#486d89" : "#b8e2dc";
        g.fillStyle = paper ? "#fffaf0" : "#2f4a3a";
        g.lineWidth = 2 * scale;
        g.setLineDash([5 * scale, 4 * scale]);
        g.strokeRect(selection.x, selection.y, selection.width, selection.height);
        g.setLineDash([]);
        g.beginPath();
        g.arc(
          selection.x + selection.width,
          selection.y + selection.height,
          8 * scale,
          0,
          Math.PI * 2,
        );
        g.fill();
        g.stroke();
        g.restore();
      }
    };

    const changed = () => setHistory({ undo: past.current.length, redo: future.current.length });

    const replace = (scene: Mark[]) => {
      past.current = [...past.current.slice(-39), marks.current];
      future.current = [];
      marks.current = scene;
      refresh();
      changed();
    };

    const commit = (mark: Mark) => replace([...marks.current, mark]);

    const finishTextSession = () => {
      if (textSession) {
        const trimmed = textSession.text.trim();
        if (trimmed) {
          const newMark: DrawMark = {
            tool: "text",
            color: textSession.color,
            size: textSession.size,
            points: [{ x: textSession.currentX, y: textSession.currentY }],
            text: trimmed,
            blockId: textSession.blockId,
            lineIndex: textSession.lineIndex,
            formatted: formulasEnabled,
          };
          commit(newMark);
        }
        setTextSession(null);
      }
    };

    const clear = () => {
      upload.current++;
      loadingRef.current = false;
      setLoading(false);
      gesture.current = null;
      marks.current = [];
      past.current = [];
      future.current = [];
      setSelected(null);
      setImageError("");
      setTextSession(null);
      refresh();
      changed();
    };

    useEffect(() => {
      alive.current = true;
      const uploadRef = upload;
      return () => {
        alive.current = false;
        uploadRef.current++;
      };
    }, []);

    useEffect(() => {
      if (disabled) {
        gesture.current = null;
        upload.current++;
        loadingRef.current = false;
        setLoading(false);
        if (textSession) {
          const trimmed = textSession.text.trim();
          if (trimmed) {
            const newMark: DrawMark = {
              tool: "text",
              color: textSession.color,
              size: textSession.size,
              points: [{ x: textSession.currentX, y: textSession.currentY }],
              text: trimmed,
              blockId: textSession.blockId,
              lineIndex: textSession.lineIndex,
              formatted: formulasEnabled,
            };
            past.current = [...past.current.slice(-39), marks.current];
            future.current = [];
            marks.current = [...marks.current, newMark];
          }
          setTextSession(null);
        }
      }
      refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [disabled, tool, selected, variant, formulasEnabled]);

    useEffect(() => {
      const resize = () => refresh();
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    });

    useEffect(() => {
      const el = containerRef.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(() => {
        refresh();
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    useEffect(() => {
      if (textSession && overlayInputRef.current) {
        overlayInputRef.current.focus();
      }
    }, [textSession]);

    useImperativeHandle(ref, () => ({
      snapshot: () => {
        finishTextSession();
        if (!marks.current.some((mark) => mark.tool !== "eraser")) return undefined;
        refresh(false);
        try {
          return canvas.current?.toDataURL("image/jpeg", 0.8);
        } finally {
          refresh();
        }
      },
      clear,
      isLoading: () => loadingRef.current,
    }));

    const pos = (e: RPointerEvent<HTMLCanvasElement>): Point => {
      const r = e.currentTarget.getBoundingClientRect();
      return {
        x: Math.max(
          0,
          Math.min(e.currentTarget.width, ((e.clientX - r.left) * e.currentTarget.width) / r.width),
        ),
        y: Math.max(
          0,
          Math.min(
            e.currentTarget.height,
            ((e.clientY - r.top) * e.currentTarget.height) / r.height,
          ),
        ),
      };
    };

    const down = (e: RPointerEvent<HTMLCanvasElement>) => {
      if (disabled || loadingRef.current || gesture.current || e.button !== 0) return;
      const point = pos(e);

      if (tool === "select") {
        const c = e.currentTarget,
          range = (22 * c.width) / (c.getBoundingClientRect().width || c.width);
        const resizing =
          selectedImage &&
          Math.hypot(
            point.x - selectedImage.x - selectedImage.width,
            point.y - selectedImage.y - selectedImage.height,
          ) <= range;
        const image = resizing
          ? selectedImage
          : [...marks.current]
              .reverse()
              .find(
                (mark): mark is ImageMark =>
                  mark.tool === "image" &&
                  point.x >= mark.x &&
                  point.x <= mark.x + mark.width &&
                  point.y >= mark.y &&
                  point.y <= mark.y + mark.height,
              );
        setSelected(image?.id ?? null);
        if (!image) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        gesture.current = {
          pointerId: e.pointerId,
          kind: resizing ? "resize" : "move",
          original: image,
          start: point,
          preview: image,
        };
        refresh();
        return;
      }

      if (tool === "text") {
        // If legacy text from toolbar textarea was provided, insert it directly
        if (text.trim()) {
          const mark: DrawMark = {
            tool: "text",
            color,
            size,
            points: [point],
            text: text.trim(),
            formatted: false,
          };
          commit(mark);
          return;
        }

        // Check if user clicked on an existing text mark to edit it
        const hitMark = [...marks.current]
          .reverse()
          .find(
            (mark): mark is DrawMark =>
              mark.tool === "text" &&
              isPointInTextMark(point, mark, canvas.current?.getContext("2d") ?? undefined),
          );

        if (hitMark) {
          finishTextSession();
          // Remove from marks so it doesn't double-render during edit
          marks.current = marks.current.filter((m) => m !== hitMark);
          refresh();
          setTextSession({
            blockId: hitMark.blockId ?? crypto.randomUUID(),
            lineIndex: hitMark.lineIndex ?? 0,
            startX: hitMark.points[0]!.x,
            startY: hitMark.points[0]!.y,
            currentX: hitMark.points[0]!.x,
            currentY: hitMark.points[0]!.y,
            text: hitMark.text,
            color: hitMark.color,
            size: hitMark.size,
          });
          return;
        }

        // Clicked elsewhere on canvas: commit previous session if any and open new sequence
        finishTextSession();
        const newBlockId = crypto.randomUUID();
        setTextSession({
          blockId: newBlockId,
          lineIndex: 0,
          startX: point.x,
          startY: point.y,
          currentX: point.x,
          currentY: point.y,
          text: "",
          color,
          size,
        });
        return;
      }

      // If text session was open and user switched or clicked with another tool, finish it
      if (textSession) {
        finishTextSession();
      }

      const mark: DrawMark = { tool, color, size, points: [point], text: "" };
      e.currentTarget.setPointerCapture(e.pointerId);
      gesture.current = { pointerId: e.pointerId, kind: "draw", mark };

      if (tool === "eraser") {
        eraseAtPoint(point);
      }

      refresh();
    };

    const eraseAtPoint = (point: Point) => {
      const g = canvas.current?.getContext("2d") ?? undefined;
      const touched = marks.current.filter(
        (m) => m.tool === "text" && doesEraserTouchMark(point, m, 24, g),
      );
      if (touched.length > 0) {
        replace(marks.current.filter((m) => !touched.includes(m)));
      }
    };

    const extend = (e: RPointerEvent<HTMLCanvasElement>) => {
      const current = gesture.current;
      if (!current || current.pointerId !== e.pointerId) return;
      const point = pos(e);

      if (current.kind === "draw") {
        if (current.mark.tool === "pen" || current.mark.tool === "eraser") {
          const previous = current.mark.points.at(-1)!;
          if (previous.x !== point.x || previous.y !== point.y) current.mark.points.push(point);
          if (current.mark.tool === "eraser") {
            eraseAtPoint(point);
          }
        } else {
          current.mark.points = [current.mark.points[0]!, point];
        }
      } else {
        const dx = point.x - current.start.x,
          dy = point.y - current.start.y,
          original = current.original,
          ratio = original.width / original.height;
        current.preview = {
          ...original,
          ...(current.kind === "move"
            ? moveBoardImage(original, dx, dy, e.currentTarget)
            : sizeBoardImage(
                original,
                original.width + (dx + dy / ratio) / (1 + 1 / (ratio * ratio)),
                e.currentTarget,
              )),
        };
      }
      refresh();
    };

    const up = (e: RPointerEvent<HTMLCanvasElement>) => {
      const current = gesture.current;
      if (!current || current.pointerId !== e.pointerId) return;
      extend(e);
      gesture.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);

      if (current.kind !== "draw") {
        const a = current.original,
          b = current.preview;
        if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height)
          replace(
            marks.current.map((mark) => (mark.tool === "image" && mark.id === a.id ? b : mark)),
          );
        else refresh();
        return;
      }

      const a = current.mark.points[0]!,
        b = current.mark.points.at(-1)!;

      if (
        current.mark.tool !== "pen" &&
        current.mark.tool !== "eraser" &&
        Math.hypot(b.x - a.x, b.y - a.y) < 2
      ) {
        refresh();
        return;
      }
      commit(current.mark);
    };

    const cancel = () => {
      gesture.current = null;
      refresh();
    };

    const undo = () => {
      finishTextSession();
      const scene = past.current.pop();
      if (scene) {
        future.current.push(marks.current);
        marks.current = scene;
      }
      setSelected(null);
      cancel();
      changed();
    };

    const redo = () => {
      finishTextSession();
      const scene = future.current.pop();
      if (scene) {
        past.current.push(marks.current);
        marks.current = scene;
      }
      setSelected(null);
      cancel();
      changed();
    };

    const insertImage = async (file?: File) => {
      if (!file || disabledRef.current || loadingRef.current) return;
      if (marks.current.filter((mark) => mark.tool === "image").length >= 6) {
        setImageError(
          "A lousa aceita até 6 imagens por vez. Remova uma imagem para adicionar outra.",
        );
        return;
      }
      const request = ++upload.current;
      loadingRef.current = true;
      setLoading(true);
      setImageError("");
      try {
        const image = await readBoardImage(file);
        if (!alive.current || request !== upload.current || disabledRef.current) return;
        const c = canvas.current;
        if (!c) return;
        const mark: ImageMark = {
          tool: "image",
          id: crypto.randomUUID(),
          source: image.source,
          name: image.name,
          ...fitBoardImage(image, c),
        };
        commit(mark);
        setSelected(mark.id);
        setTool("select");
      } catch (error) {
        if (alive.current && request === upload.current)
          setImageError(
            error instanceof Error ? error.message : "Não foi possível inserir a imagem.",
          );
      } finally {
        if (alive.current && request === upload.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    };

    const adjustImage = (action: "smaller" | "larger" | "center" | "remove") => {
      const c = canvas.current;
      if (!selectedImage || !c || disabled || loading) return;
      if (action === "remove") {
        replace(marks.current.filter((mark) => mark !== selectedImage));
        setSelected(null);
        return;
      }
      const box =
        action === "center"
          ? {
              ...selectedImage,
              x: (c.width - selectedImage.width) / 2,
              y: (c.height - selectedImage.height) / 2,
            }
          : sizeBoardImage(
              selectedImage,
              selectedImage.width * (action === "larger" ? 1.12 : 1 / 1.12),
              c,
            );
      replace(
        marks.current.map((mark) => (mark === selectedImage ? { ...selectedImage, ...box } : mark)),
      );
    };

    const locked = disabled || loading;

    const palette = colors.map((c) => (
      <button
        key={c.value}
        type="button"
        disabled={locked}
        title={c.name}
        aria-label={`Giz ${c.name}`}
        aria-pressed={color === c.value}
        className={`chalk ${color === c.value ? "on" : ""}`}
        style={{ background: c.value }}
        onClick={() => {
          setColor(c.value);
          if (textSession) {
            setTextSession({ ...textSession, color: c.value });
          }
        }}
      />
    ));

    const hint =
      tool === "select"
        ? "Toque na imagem para selecionar. Arraste para mover e puxe o canto para ajustar."
        : tool === "text"
          ? "Clique na lousa para abrir o cursor. Digite texto ou fórmulas matemáticas."
          : tool === "pen" || tool === "eraser"
            ? "Desenhe com o mouse ou com o dedo."
            : "Arraste para desenhar a forma.";

    // Overlay cursor coordinates relative to canvas display size
    const getOverlayStyle = () => {
      if (!textSession || !canvas.current) return { display: "none" };
      const c = canvas.current;
      const rect = c.getBoundingClientRect();
      const scaleX = rect.width / c.width;
      const scaleY = rect.height / c.height;

      const left = Math.min(Math.max(0, textSession.currentX * scaleX), rect.width - 120);
      const top = Math.min(Math.max(0, textSession.currentY * scaleY), rect.height - 40);
      const fontSize = Math.max(12, Math.round(textSession.size * scaleY));

      return {
        left: `${left}px`,
        top: `${top}px`,
        fontSize: `${fontSize}px`,
      };
    };

    return (
      <div className={`whiteboard ${paper ? "whiteboard--paper" : ""}`}>
        <div className="wb-toolbar-shell">
          {paper && (
            <div className="wb-title">
              <BookOpen size={20} />
              <span>Sua lousa</span>
            </div>
          )}
          <div className="wb-tools" role="toolbar" aria-label="Ferramentas da lousa">
            {tools.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                disabled={locked}
                title={label}
                aria-label={label}
                aria-pressed={id === "image" ? undefined : tool === id}
                className={`icon-btn ${tool === id ? "on" : ""}`}
                onClick={() => {
                  if (id === "image") fileInput.current?.click();
                  else {
                    if (tool === "text" && id !== "text") {
                      finishTextSession();
                    }
                    gesture.current = null;
                    setTool(id);
                  }
                }}
              >
                <Icon size={18} />
              </button>
            ))}

            <span className="wb-divider" />

            <button
              type="button"
              disabled={locked}
              title={
                formulasEnabled
                  ? "Fórmulas matemáticas ativadas (clique para desativar)"
                  : "Fórmulas matemáticas desativadas (clique para ativar)"
              }
              aria-label="Fórmulas matemáticas"
              aria-pressed={formulasEnabled}
              className={`icon-btn wb-formula-toggle ${formulasEnabled ? "on" : ""}`}
              onClick={() => setFormulasEnabled((prev) => !prev)}
            >
              <span className="wb-formula-icon" aria-hidden="true">
                √x
              </span>
            </button>

            <div className="wb-size-group" role="group" aria-label="Tamanho do traço e texto">
              {SIZES.map(({ id, px }) => (
                <button
                  key={id}
                  type="button"
                  disabled={locked}
                  title={`Tamanho ${id} (${px}px)`}
                  aria-label={`Tamanho ${id}`}
                  aria-pressed={size === px}
                  className={`wb-size-btn ${size === px ? "on" : ""}`}
                  onClick={() => {
                    setSize(px);
                    if (textSession) {
                      setTextSession({ ...textSession, size: px });
                    }
                  }}
                >
                  {id}
                </button>
              ))}
            </div>

            <span className="wb-divider" />

            <button
              type="button"
              disabled={locked || !history.undo}
              title="Desfazer"
              aria-label="Desfazer"
              className="icon-btn"
              onClick={undo}
            >
              <Undo2 size={18} />
            </button>
            <button
              type="button"
              disabled={locked || !history.redo}
              title="Refazer"
              aria-label="Refazer"
              className="icon-btn"
              onClick={redo}
            >
              <Redo2 size={18} />
            </button>
            <button
              type="button"
              disabled={locked || !marks.current.length}
              title="Limpar lousa"
              aria-label="Limpar lousa"
              className="icon-btn"
              onClick={() => {
                replace([]);
                setSelected(null);
                setImageError("");
                finishTextSession();
              }}
            >
              <Trash2 size={18} />
            </button>
          </div>
          {paper && (
            <div className="wb-palette" role="group" aria-label="Cores da lousa">
              {palette}
            </div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Arquivo de imagem para a lousa"
            disabled={locked}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void insertImage(file);
            }}
          />
        </div>

        {loading && (
          <p className="wb-image-notice" role="status">
            Preparando a imagem…{" "}
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </p>
        )}

        {imageError && (
          <p className="wb-image-notice is-error" role="alert">
            {imageError}
          </p>
        )}

        {tool === "select" && (
          <div className="wb-image-controls" role="group" aria-label="Ajustar imagem selecionada">
            <span title={selectedImage?.name}>{selectedImage?.name ?? "Selecione uma imagem"}</span>
            <button
              type="button"
              disabled={locked || !selectedImage}
              onClick={() => adjustImage("smaller")}
              aria-label="Diminuir imagem"
              title="Diminuir imagem"
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              disabled={locked || !selectedImage}
              onClick={() => adjustImage("larger")}
              aria-label="Aumentar imagem"
              title="Aumentar imagem"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              disabled={locked || !selectedImage}
              onClick={() => adjustImage("center")}
              aria-label="Centralizar imagem"
              title="Centralizar imagem"
            >
              <Scan size={16} />
            </button>
            <button
              type="button"
              disabled={locked || !selectedImage}
              onClick={() => adjustImage("remove")}
              aria-label="Remover imagem"
              title="Remover imagem"
            >
              <Trash2 size={16} />
            </button>
            <small>Arraste para mover · Puxe o canto para redimensionar</small>
          </div>
        )}

        {tool === "text" && (
          <div className="wb-text-controls">
            <label>
              Texto na lousa
              <textarea
                rows={2}
                maxLength={500}
                value={text}
                disabled={locked}
                onChange={(e) => setText(e.target.value)}
                placeholder="Digite texto ou clique diretamente na lousa para posicionar"
              />
            </label>
            <label>
              Tamanho
              <select
                value={size}
                disabled={locked}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSize(val);
                  if (textSession) {
                    setTextSession({ ...textSession, size: val });
                  }
                }}
              >
                {[20, 28, 36, 40, 48].map((n) => (
                  <option key={n} value={n}>
                    {n} px
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="wb-canvas-container" ref={containerRef}>
          <canvas
            ref={canvas}
            width={paper ? 1200 : 720}
            height={paper ? 720 : 420}
            aria-label="Lousa para desenhar, inserir texto e formas"
            aria-description="Também aceita imagens: use Inserir imagem e Mover imagem."
            aria-disabled={locked}
            className={tool === "select" ? "is-selecting-image" : undefined}
            onPointerDown={down}
            onPointerMove={extend}
            onPointerUp={up}
            onPointerCancel={cancel}
            onLostPointerCapture={cancel}
          />

          {textSession && (
            <div
              className="wb-text-overlay"
              style={getOverlayStyle()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="wb-text-overlay-row">
                <input
                  ref={overlayInputRef}
                  type="text"
                  className="wb-text-overlay-input"
                  value={textSession.text}
                  placeholder="Texto ou fórmula..."
                  aria-label="Cursor de texto da lousa"
                  style={{ color: textSession.color }}
                  onChange={(e) => {
                    setTextSession({ ...textSession, text: e.target.value });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (e.shiftKey || e.ctrlKey) {
                        e.preventDefault();
                        return;
                      }
                      e.preventDefault();
                      const val = textSession.text.trim();
                      if (val) {
                        const newMark: DrawMark = {
                          tool: "text",
                          color: textSession.color,
                          size: textSession.size,
                          points: [{ x: textSession.currentX, y: textSession.currentY }],
                          text: val,
                          blockId: textSession.blockId,
                          lineIndex: textSession.lineIndex,
                          formatted: formulasEnabled,
                        };
                        past.current = [...past.current.slice(-39), marks.current];
                        future.current = [];
                        marks.current = [...marks.current, newMark];
                        refresh();
                        changed();
                      }
                      // Advance to next line at 1.4x font size below
                      const nextY = textSession.currentY + Math.round(textSession.size * 1.4);
                      setTextSession({
                        ...textSession,
                        lineIndex: textSession.lineIndex + 1,
                        currentX: textSession.startX,
                        currentY: nextY,
                        text: "",
                      });
                      return;
                    }

                    if (e.key === "Backspace") {
                      if (textSession.text === "" && textSession.lineIndex > 0) {
                        e.preventDefault();
                        const prevIndex = textSession.lineIndex - 1;
                        const prevMark = marks.current.find(
                          (m): m is DrawMark =>
                            m.tool === "text" &&
                            m.blockId === textSession.blockId &&
                            m.lineIndex === prevIndex,
                        );
                        if (prevMark) {
                          marks.current = marks.current.filter((m) => m !== prevMark);
                          refresh();
                          changed();
                          setTextSession({
                            ...textSession,
                            lineIndex: prevIndex,
                            currentX: prevMark.points[0]!.x,
                            currentY: prevMark.points[0]!.y,
                            text: prevMark.text,
                          });
                        }
                        return;
                      }
                    }

                    if (e.key === "Escape") {
                      e.preventDefault();
                      finishTextSession();
                    }
                  }}
                />
                <button
                  type="button"
                  className="wb-text-overlay-done"
                  onClick={finishTextSession}
                  title="Concluir edição de texto"
                >
                  Concluir
                </button>
              </div>

              {formulasEnabled && textSession.text.trim() && (
                <div className="wb-text-overlay-preview" aria-live="polite">
                  <span className="wb-preview-badge">Prévia:</span>
                  <span>{formatMathPreview(textSession.text, true)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={paper ? "wb-status" : "wb-tools"}>
          {!paper && palette}
          <small className="wb-hint">{hint}</small>
          {paper && <span className="wb-paper-caption">Um espaço para organizar suas ideias.</span>}
        </div>
      </div>
    );
  },
);
