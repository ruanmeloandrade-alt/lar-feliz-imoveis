import { useEffect, useRef, useState, type PointerEvent } from "react";
import { RotateCcw } from "lucide-react";

export const brainRegions = [
  { id: "text", label: "Informações", color: "#b94658", rgb: [185, 70, 88] },
  { id: "document", label: "Documentos", color: "#a87445", rgb: [168, 116, 69] },
  { id: "url", label: "Links", color: "#85698e", rgb: [133, 105, 142] },
  { id: "promotion", label: "Promoções", color: "#c17a70", rgb: [193, 122, 112] },
  { id: "blocked", label: "Palavras proibidas", color: "#764458", rgb: [118, 68, 88] },
] as const;

export type BrainRegion = (typeof brainRegions)[number]["id"];
type Point = [number, number, number];
type Quad = [number, number, number, number];
type Face = { indices: Quad; normal: Point; region: BrainRegion };
type Pose = { yaw: number; pitch: number };
const initialPose: Pose = { yaw: -0.26, pitch: -0.22 };
const tau = 2 * Math.PI;

function makeBrain() {
  const vertices: Point[] = [];
  const faces: Face[] = [];

  function addPart(center: Point, radius: Point, rows: number, columns: number, part: "cortex" | "cerebellum" | "stem") {
    const first = vertices.length;
    for (let row = 0; row <= rows; row++) {
      const latitude = Math.PI * row / rows;
      const ring = Math.sin(latitude);
      for (let column = 0; column < columns; column++) {
        const longitude = tau * column / columns;
        const x = ring * Math.cos(longitude);
        const y = Math.cos(latitude);
        const z = ring * Math.sin(longitude);
        const ripple = Math.sin(27 * longitude + 3.4 * Math.sin(7 * latitude + 2 * longitude) + 1.4 * Math.cos(6 * longitude - 9 * latitude));
        const cross = Math.cos(23 * latitude + 2.6 * Math.sin(5 * longitude + latitude));
        const fold = part === "cortex" ? 1 + ring * (0.025 * cross + 0.047 * ripple - 0.055 * Math.pow(Math.max(0, -ripple), 6))
          : part === "cerebellum" ? 1 + 0.028 * Math.cos(29 * latitude + 2.3 * Math.sin(longitude))
          : 1;
        const lateral = part === "cortex" && z * center[2] < 0 ? 0.82 : 1;
        vertices.push([
          center[0] + x * radius[0] * fold,
          center[1] + (y - (part === "cortex" ? 0.13 * x + 0.09 * x * x : 0)) * radius[1] * fold,
          center[2] + z * radius[2] * fold * lateral,
        ]);
      }
    }

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const left = first + row * columns + column;
        const right = first + row * columns + (column + 1) % columns;
        const indices: Quad = [left, right, right + columns, left + columns];
        const [a, b, c, d] = indices.map(index => vertices[index]);
        const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const v = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
        const nx = u[1] * v[2] - u[2] * v[1];
        const ny = u[2] * v[0] - u[0] * v[2];
        const nz = u[0] * v[1] - u[1] * v[0];
        const magnitude = Math.hypot(nx, ny, nz);
        if (!magnitude) continue;
        const x = (a[0] + b[0] + c[0] + d[0]) / 4;
        const y = (a[1] + b[1] + c[1] + d[1]) / 4;
        const z = (a[2] + b[2] + c[2] + d[2]) / 4;
        const sign = nx * (x - center[0]) + ny * (y - center[1]) + nz * (z - center[2]) >= 0 ? 1 : -1;
        const edge = 0.06 * Math.sin(10 * y + 3 * z);
        const region = part !== "cortex" || x > 1.03 + edge ? "blocked"
          : x < -0.43 + 0.28 * y + edge ? "text"
          : y < -0.28 + 0.2 * x + edge ? "promotion"
          : x > 0.54 + edge ? "url" : "document";
        faces.push({ indices, normal: [nx * sign / magnitude, ny * sign / magnitude, nz * sign / magnitude], region });
      }
    }
  }

  for (const side of [-1, 1]) {
    addPart([0, 0.09, side * 0.53], [1.52, 0.93, 0.58], 43, 72, "cortex");
    addPart([0.74, -0.59, side * 0.32], [0.58, 0.36, 0.4], 20, 40, "cerebellum");
  }
  addPart([0.39, -0.86, 0], [0.21, 0.48, 0.24], 16, 28, "stem");
  return { vertices, faces };
}

let mesh: ReturnType<typeof makeBrain> | undefined;

export function BrainAtlas({ selected, counts, onSelect }: {
  selected: BrainRegion;
  counts: Record<BrainRegion, number>;
  onSelect: (region: BrainRegion) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pose = useRef<Pose>({ ...initialPose });
  const repaint = useRef<() => void>(() => {});
  const hit = useRef<(x: number, y: number) => BrainRegion | undefined>(() => undefined);
  const drag = useRef<{ id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { vertices, faces } = mesh ??= makeBrain();
    const palette = Object.fromEntries(brainRegions.map(region => [region.id, region.rgb]));
    let frame = 0;

    function draw() {
      if (!canvas || !ctx) return;
      frame = 0;
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const size = Math.min(width / 3.65, height / 2.9);
      const cx = width / 2;
      const cy = height * 0.45;
      const cosY = Math.cos(pose.current.yaw), sinY = Math.sin(pose.current.yaw);
      const cosX = Math.cos(pose.current.pitch), sinX = Math.sin(pose.current.pitch);
      const rotate = ([x, y, z]: Point): Point => {
        const depth = -x * sinY + z * cosY;
        return [x * cosY + z * sinY, y * cosX - depth * sinX, y * sinX + depth * cosX];
      };
      const projected = vertices.map(vertex => {
        const [x, y, z] = rotate(vertex);
        const zoom = 6 / (6 - z);
        return { x: cx + x * size * zoom, y: cy - y * size * zoom, z };
      });
      const visible = [];
      for (const face of faces) {
        const normal = rotate(face.normal);
        if (normal[2] <= -0.05) continue;
        const points = face.indices.map(index => projected[index]);
        const depth = points.reduce((sum, point) => sum + point.z, 0) / 4;
        visible.push({ normal, points, depth, region: face.region });
      }
      visible.sort((a, b) => a.depth - b.depth);

      const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(cx, cy + size * 1.29);
      ctx.scale(1, 0.15);
      const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.6);
      shadow.addColorStop(0, "#46252d4a");
      shadow.addColorStop(1, "#46252d00");
      ctx.fillStyle = shadow;
      ctx.fillRect(-size * 1.6, -size * 1.6, size * 3.2, size * 3.2);
      ctx.restore();

      const targets: { path: Path2D; region: BrainRegion }[] = [];
      ctx.lineWidth = 0.62;
      for (const { normal: [nx, ny, nz], points, region } of visible) {
        const tint = palette[region];
        const strength = counts[region] > 0 ? 1 : region === selected ? 0.55 : 0.38;
        const light = Math.max(0, -0.44 * nx + 0.66 * ny + 0.61 * nz);
        const gloss = Math.pow(Math.max(0, -0.27 * nx + 0.37 * ny + 0.89 * nz), 8) * 27;
        const color = tint.map((value, channel) => Math.round(((channel === 0 ? 185 : 167) * (1 - strength) + value * strength) * (0.54 + 0.57 * light) + gloss + (region === selected ? 13 : 0)));
        const path = new Path2D();
        path.moveTo(points[0].x, points[0].y);
        for (const point of points.slice(1)) path.lineTo(point.x, point.y);
        path.closePath();
        ctx.fillStyle = ctx.strokeStyle = `rgb(${color.join(",")})`;
        ctx.fill(path);
        ctx.stroke(path);
        targets.push({ path, region });
      }

      hit.current = (x, y) => {
        for (let index = targets.length - 1; index >= 0; index--) {
          const target = targets[index];
          if (ctx.isPointInPath(target.path, x * ratio, y * ratio)) return target.region;
        }
      };
    }

    repaint.current = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const observer = new ResizeObserver(repaint.current);
    observer.observe(canvas);
    repaint.current();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [counts, selected]);

  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || drag.current) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 5) return;
    if (!current.moved) setDragging(true);
    current.moved = true;
    pose.current.yaw += (event.clientX - current.x) * 0.012;
    pose.current.pitch = Math.max(-1.35, Math.min(1.35, pose.current.pitch + (event.clientY - current.y) * 0.012));
    current.x = event.clientX;
    current.y = event.clientY;
    repaint.current();
  }

  function endDrag(event: PointerEvent<HTMLCanvasElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (current.moved || event.type !== "pointerup") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const region = hit.current(event.clientX - bounds.left, event.clientY - bounds.top);
    if (region) onSelect(region);
  }

  return (
    <section aria-label="Mapa do Cérebro da IA" className="overflow-hidden rounded-2xl border border-[#e7dde1] bg-white text-[#252126]">
      <div className="flex items-center justify-between gap-3 border-b border-[#e7dde1] px-4 py-3">
        <p className="text-sm text-[#655861]">Arraste para girar. Selecione uma região para ver seu conteúdo.</p>
        <button type="button" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-[#8d1934] hover:bg-[#f7f2f4]" onClick={() => { pose.current = { ...initialPose }; repaint.current(); }}>
          <RotateCcw size={15} aria-hidden="true" /> Repor vista
        </button>
      </div>
      <canvas ref={canvasRef} aria-hidden="true" className={`h-[clamp(15rem,37vw,26rem)] w-full touch-none bg-[radial-gradient(ellipse_at_center,#fff,#f6ecef)] ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} />
      <div className="grid grid-cols-2 gap-2 border-t border-[#e7dde1] p-3 sm:grid-cols-5">
        {brainRegions.map(region => (
          <button key={region.id} type="button" aria-pressed={selected === region.id} aria-controls="brain-region-editor"
            onClick={() => onSelect(region.id)} className="flex min-h-12 min-w-0 items-center gap-2 rounded-lg border border-[#e7dde1] px-2.5 text-left text-xs hover:bg-[#f7f2f4] aria-pressed:border-[#a01b36] aria-pressed:bg-[#fbf1f4]">
            <span className="size-2.5 shrink-0 rounded-full border" style={{ borderColor: region.color, backgroundColor: counts[region.id] ? region.color : "transparent" }} aria-hidden="true" />
            <span className="min-w-0 font-semibold">{region.label}<span className="block font-normal text-[#655861]">{counts[region.id]} {counts[region.id] === 1 ? "registro" : "registros"}</span></span>
          </button>
        ))}
      </div>
    </section>
  );
}
