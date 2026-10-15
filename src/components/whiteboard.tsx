import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { ArrowUpRight, BookOpen, Circle, Eraser, Minus, Pencil, Redo2, Square, Trash2, Type, Undo2 } from 'lucide-react';

export type Board = { snapshot: () => string | undefined; clear: () => void };
type Tool = 'pen' | 'eraser' | 'text' | 'rectangle' | 'ellipse' | 'line' | 'arrow';
type Point = { x: number; y: number };
type Mark = { tool: Tool; color: string; size: number; points: Point[]; text: string };
const chalkBackground = '#2f4a3a';
const paperBackground = '#fcf7ec';
const chalkColors = [{ value: '#f3efe2', name: 'Branco' }, { value: '#f5d76e', name: 'Amarelo' }, { value: '#7fd1ae', name: 'Verde' }, { value: '#f28b82', name: 'Rosa' }];
const paperColors = [{ value: '#493729', name: 'Marrom' }, { value: '#ac5a3e', name: 'Terracota' }, { value: '#4f7561', name: 'Verde' }, { value: '#486d89', name: 'Azul' }];
const tools = [{ id: 'pen', label: 'Giz', Icon: Pencil }, { id: 'eraser', label: 'Apagador', Icon: Eraser }, { id: 'text', label: 'Texto', Icon: Type }, { id: 'rectangle', label: 'Retângulo', Icon: Square }, { id: 'ellipse', label: 'Elipse', Icon: Circle }, { id: 'line', label: 'Linha', Icon: Minus }, { id: 'arrow', label: 'Seta', Icon: ArrowUpRight }] as const;

function drawMark(g: CanvasRenderingContext2D, mark: Mark, background: string) {
  const a = mark.points[0]; const b = mark.points.at(-1);
  if (!a || !b) return;
  g.strokeStyle = mark.tool === 'eraser' ? background : mark.color;
  g.fillStyle = g.strokeStyle;
  g.lineWidth = mark.tool === 'eraser' ? 26 : 4;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  if (mark.tool === 'text') {
    g.font = `${mark.size}px sans-serif`; g.textBaseline = 'top';
    mark.text.split('\n').forEach((line, index) => g.fillText(line, a.x, a.y + index * mark.size * 1.25));
    return;
  }
  if (mark.tool === 'rectangle') g.rect(a.x, a.y, b.x - a.x, b.y - a.y);
  else if (mark.tool === 'ellipse') g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
  else if (mark.tool === 'line' || mark.tool === 'arrow') {
    g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
    if (mark.tool === 'arrow') {
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      for (const offset of [-Math.PI / 6, Math.PI / 6]) {
        g.moveTo(b.x, b.y); g.lineTo(b.x - 18 * Math.cos(angle + offset), b.y - 18 * Math.sin(angle + offset));
      }
    }
  } else {
    g.moveTo(a.x, a.y);
    mark.points.slice(1).forEach(p => g.lineTo(p.x, p.y));
    // A single click also leaves a visible chalk dot.
    if (mark.points.length === 1) { g.arc(a.x, a.y, g.lineWidth / 2, 0, Math.PI * 2); g.fill(); return; }
  }
  g.stroke();
}

export const Whiteboard = forwardRef<Board, { disabled?: boolean; variant?: 'chalk' | 'paper' }>(function Whiteboard({ disabled = false, variant = 'chalk' }, ref) {
  const paper = variant === 'paper';
  const background = paper ? paperBackground : chalkBackground;
  const colors = paper ? paperColors : chalkColors;
  const canvas = useRef<HTMLCanvasElement>(null);
  const marks = useRef<Mark[]>([]); const undone = useRef<Mark[]>([]);
  const gesture = useRef<{ pointerId: number; mark: Mark } | null>(null);
  const [tool, setTool] = useState<Tool>('pen'); const [color, setColor] = useState(colors[0]!.value);
  const [text, setText] = useState(''); const [size, setSize] = useState(28);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const refresh = () => {
    const c = canvas.current; const g = c?.getContext('2d'); if (!c || !g) return;
    g.fillStyle = background; g.fillRect(0, 0, c.width, c.height);
    if (paper) {
      g.fillStyle = '#dfd4c1';
      for (let x = 24; x < c.width; x += 24) for (let y = 24; y < c.height; y += 24) g.fillRect(x, y, 1, 1);
    }
    marks.current.forEach(mark => drawMark(g, mark, background));
    if (gesture.current) drawMark(g, gesture.current.mark, background);
  };
  const historyChanged = () => setHistory({ undo: marks.current.length, redo: undone.current.length });
  const clear = () => { gesture.current = null; marks.current = []; undone.current = []; refresh(); historyChanged(); };
  useEffect(() => { refresh(); }, []);
  useImperativeHandle(ref, () => ({
    snapshot: () => {
      // Do not export an unfinished pointer gesture.
      if (!marks.current.some(mark => mark.tool !== 'eraser')) return undefined;
      const active = gesture.current; gesture.current = null; refresh();
      const shot = canvas.current?.toDataURL('image/jpeg', 0.8);
      gesture.current = active; refresh(); return shot;
    }, clear,
  }));
  const commit = (mark: Mark) => { marks.current.push(mark); undone.current = []; refresh(); historyChanged(); };
  const pos = (e: RPointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(e.currentTarget.width, (e.clientX - r.left) * e.currentTarget.width / r.width)), y: Math.max(0, Math.min(e.currentTarget.height, (e.clientY - r.top) * e.currentTarget.height / r.height)) };
  };
  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (disabled || gesture.current || e.button !== 0) return;
    if (tool === 'text' && !text.trim()) return;
    const point = pos(e);
    const mark: Mark = { tool, color, size, points: [point], text: text.trim() };
    if (tool === 'text') { commit(mark); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { pointerId: e.pointerId, mark }; refresh();
  };
  const extend = (e: RPointerEvent<HTMLCanvasElement>) => {
    const current = gesture.current; if (!current || current.pointerId !== e.pointerId) return;
    const point = pos(e);
    if (current.mark.tool === 'pen' || current.mark.tool === 'eraser') {
      const previous = current.mark.points.at(-1)!;
      if (previous.x !== point.x || previous.y !== point.y) current.mark.points.push(point);
    }
    else current.mark.points = [current.mark.points[0]!, point];
    refresh();
  };
  const up = (e: RPointerEvent<HTMLCanvasElement>) => {
    const current = gesture.current; if (!current || current.pointerId !== e.pointerId) return;
    extend(e); gesture.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const a = current.mark.points[0]!; const b = current.mark.points.at(-1)!;
    if (current.mark.tool !== 'pen' && current.mark.tool !== 'eraser' && Math.hypot(b.x - a.x, b.y - a.y) < 2) { refresh(); return; }
    commit(current.mark);
  };
  const cancel = () => { gesture.current = null; refresh(); };
  const undo = () => { const mark = marks.current.pop(); if (mark) undone.current.push(mark); cancel(); historyChanged(); };
  const redo = () => { const mark = undone.current.pop(); if (mark) marks.current.push(mark); cancel(); historyChanged(); };

  const palette = colors.map(c => <button key={c.value} type="button" disabled={disabled} title={c.name} aria-label={`Giz ${c.name}`} aria-pressed={color === c.value} className={`chalk ${color === c.value ? 'on' : ''}`} style={{ background: c.value }} onClick={() => setColor(c.value)} />);
  const hint = tool === 'text' ? 'Digite acima e clique para inserir.' : tool === 'pen' || tool === 'eraser' ? 'Desenhe com o mouse ou com o dedo.' : 'Arraste para desenhar a forma.';
  return <div className={`whiteboard ${paper ? 'whiteboard--paper' : ''}`}>
    <div className="wb-toolbar-shell">
    {paper && <div className="wb-title"><BookOpen size={20} /><span>Sua lousa</span></div>}
    <div className="wb-tools" role="toolbar" aria-label="Ferramentas da lousa">
      {tools.map(({ id, label, Icon }) => <button key={id} type="button" disabled={disabled} title={label} aria-label={label} aria-pressed={tool === id} className={`icon-btn ${tool === id ? 'on' : ''}`} onClick={() => setTool(id)}><Icon size={18} /></button>)}
      <span className="wb-divider" />
      <button type="button" disabled={disabled || !history.undo} title="Desfazer" aria-label="Desfazer" className="icon-btn" onClick={undo}><Undo2 size={18} /></button>
      <button type="button" disabled={disabled || !history.redo} title="Refazer" aria-label="Refazer" className="icon-btn" onClick={redo}><Redo2 size={18} /></button>
      <button type="button" disabled={disabled || !history.undo} title="Limpar lousa" aria-label="Limpar lousa" className="icon-btn" onClick={clear}><Trash2 size={18} /></button>
    </div>
    {paper && <div className="wb-palette" role="group" aria-label="Cores da lousa">{palette}</div>}
    </div>
    {tool === 'text' && <div className="wb-text-controls">
      <label>Texto na lousa<textarea rows={2} maxLength={500} value={text} disabled={disabled} onChange={e => setText(e.target.value)} placeholder="Digite e clique na lousa para posicionar" /></label>
      <label>Tamanho<select value={size} disabled={disabled} onChange={e => setSize(Number(e.target.value))}>{[20, 28, 36, 48].map(n => <option key={n} value={n}>{n} px</option>)}</select></label>
    </div>}
    <canvas ref={canvas} width={paper ? 1200 : 720} height={paper ? 720 : 420} aria-label="Lousa para desenhar, inserir texto e formas" aria-disabled={disabled} onPointerDown={down} onPointerMove={extend} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel} />
    <div className={paper ? 'wb-status' : 'wb-tools'}>
      {!paper && palette}
      <small className="wb-hint">{hint}</small>
      {paper && <span className="wb-paper-caption">Um espaço para organizar suas ideias.</span>}
    </div>
  </div>;
});
