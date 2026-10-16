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
import "@/styles/whiteboard-images.css";

export type Board = {
  snapshot: () => string | undefined;
  clear: () => void;
  isLoading?: () => boolean;
};
type DrawTool = "pen" | "eraser" | "text" | "rectangle" | "ellipse" | "line" | "arrow";
type Tool = DrawTool | "select";
type Point = { x: number; y: number };
type DrawMark = { tool: DrawTool; color: string; size: number; points: Point[]; text: string };
type ImageMark = ImageBox & { tool: "image"; id: string; source: HTMLCanvasElement; name: string };
type Mark = DrawMark | ImageMark;
type Gesture =
  | { pointerId: number; kind: "draw"; mark: DrawMark }
  | {
      pointerId: number;
      kind: "move" | "resize";
      original: ImageMark;
      start: Point;
      preview: ImageMark;
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

function drawMark(g: CanvasRenderingContext2D, mark: Mark, background: string) {
  if (mark.tool === "image") {
    g.drawImage(mark.source, mark.x, mark.y, mark.width, mark.height);
    return;
  }
  const a = mark.points[0],
    b = mark.points.at(-1);
  if (!a || !b) return;
  g.strokeStyle = mark.tool === "eraser" ? background : mark.color;
  g.fillStyle = g.strokeStyle;
  g.lineWidth = mark.tool === "eraser" ? 26 : 4;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  if (mark.tool === "text") {
    g.font = `${mark.size}px sans-serif`;
    g.textBaseline = "top";
    mark.text
      .split("\n")
      .forEach((line, index) => g.fillText(line, a.x, a.y + index * mark.size * 1.25));
    return;
  }
  if (mark.tool === "rectangle") g.rect(a.x, a.y, b.x - a.x, b.y - a.y);
  else if (mark.tool === "ellipse")
    g.ellipse(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      Math.abs(b.x - a.x) / 2,
      Math.abs(b.y - a.y) / 2,
      0,
      0,
      Math.PI * 2,
    );
  else if (mark.tool === "line" || mark.tool === "arrow") {
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    if (mark.tool === "arrow") {
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      for (const offset of [-Math.PI / 6, Math.PI / 6]) {
        g.moveTo(b.x, b.y);
        g.lineTo(b.x - 18 * Math.cos(angle + offset), b.y - 18 * Math.sin(angle + offset));
      }
    }
  } else {
    g.moveTo(a.x, a.y);
    mark.points.slice(1).forEach((p) => g.lineTo(p.x, p.y));
    if (mark.points.length === 1) {
      g.arc(a.x, a.y, g.lineWidth / 2, 0, Math.PI * 2);
      g.fill();
      return;
    }
  }
  g.stroke();
}
export const Whiteboard = forwardRef<Board, { disabled?: boolean; variant?: "chalk" | "paper" }>(
  function Whiteboard({ disabled = false, variant = "chalk" }, ref) {
    const paper = variant === "paper",
      background = paper ? paperBackground : chalkBackground,
      colors = paper ? paperColors : chalkColors;
    const canvas = useRef<HTMLCanvasElement>(null),
      fileInput = useRef<HTMLInputElement>(null);
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
      [size, setSize] = useState(28);
    const [selected, setSelected] = useState<string | null>(null),
      [loading, setLoading] = useState(false),
      [imageError, setImageError] = useState("");
    const [history, setHistory] = useState({ undo: 0, redo: 0 });
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
      refresh();
      changed();
    };
    useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
        upload.current++;
      };
    }, []);
    useEffect(() => {
      if (disabled) {
        gesture.current = null;
        upload.current++;
        loadingRef.current = false;
        setLoading(false);
      }
      refresh();
    }, [disabled, tool, selected, variant]);
    useEffect(() => {
      const resize = () => refresh();
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    });
    useImperativeHandle(ref, () => ({
      snapshot: () => {
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
    const commit = (mark: Mark) => replace([...marks.current, mark]);
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
      if (tool === "text" && !text.trim()) return;
      const mark: DrawMark = { tool, color, size, points: [point], text: text.trim() };
      if (tool === "text") {
        commit(mark);
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      gesture.current = { pointerId: e.pointerId, kind: "draw", mark };
      refresh();
    };
    const extend = (e: RPointerEvent<HTMLCanvasElement>) => {
      const current = gesture.current;
      if (!current || current.pointerId !== e.pointerId) return;
      const point = pos(e);
      if (current.kind === "draw") {
        if (current.mark.tool === "pen" || current.mark.tool === "eraser") {
          const previous = current.mark.points.at(-1)!;
          if (previous.x !== point.x || previous.y !== point.y) current.mark.points.push(point);
        } else current.mark.points = [current.mark.points[0]!, point];
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
        onClick={() => setColor(c.value)}
      />
    ));
    const hint =
      tool === "select"
        ? "Toque na imagem para selecionar. Arraste para mover e puxe o canto para ajustar."
        : tool === "text"
          ? "Digite acima e clique para inserir."
          : tool === "pen" || tool === "eraser"
            ? "Desenhe com o mouse ou com o dedo."
            : "Arraste para desenhar a forma.";
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
                placeholder="Digite e clique na lousa para posicionar"
              />
            </label>
            <label>
              Tamanho
              <select
                value={size}
                disabled={locked}
                onChange={(e) => setSize(Number(e.target.value))}
              >
                {[20, 28, 36, 48].map((n) => (
                  <option key={n} value={n}>
                    {n} px
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
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
        <div className={paper ? "wb-status" : "wb-tools"}>
          {!paper && palette}
          <small className="wb-hint">{hint}</small>
          {paper && <span className="wb-paper-caption">Um espaço para organizar suas ideias.</span>}
        </div>
      </div>
    );
  },
);
