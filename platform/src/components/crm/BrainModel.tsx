import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import meshUrl from "@/assets/vanessa-cerebro.bin?url";

export const brainRegions = [
  { id: "text", label: "Informações", color: "#fb5679", rgb: [0.98, 0.34, 0.47] },
  { id: "document", label: "Documentos", color: "#ffc174", rgb: [1, 0.76, 0.45] },
  { id: "url", label: "Links", color: "#c193fb", rgb: [0.76, 0.58, 0.98] },
  { id: "promotion", label: "Promoções", color: "#ff916f", rgb: [1, 0.57, 0.44] },
  { id: "blocked", label: "Palavras proibidas", color: "#f86ac2", rgb: [0.97, 0.42, 0.76] },
] as const;
export type BrainRegion = (typeof brainRegions)[number]["id"];

// Na malha da FG Tech, CTAs e manual ocupam dois lobos próprios.
// Aqui eles fazem parte de Promoções e Informações.
const regionMap = [0, 1, 2, 3, 4, 3, 0] as const;
const colors = new Float32Array(brainRegions.flatMap(region => region.rgb));
const initialYaw = -0.18;
const initialPitch = 0.14;
export const brainPinsPerView = 12;

export type BrainPin = { id: string; title: string };
type Point = [number, number, number];
type View = { yaw: number; pitch: number };
type Anchor = { point: Point; normal: Point };

function transform([x, y, z]: Point, { yaw, pitch }: View): Point {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  const depth = -sy * x + cy * z;
  return [cy * x + sy * z, cx * y - sx * depth, sx * y + cx * depth];
}

function findPinAnchors(mesh: Float32Array): Anchor[] {
  const start = { yaw: initialYaw, pitch: initialPitch };
  const targets = [0.56, 0.27, -0.03].flatMap(y => [-0.55, -0.26, 0.04, 0.33].map(x => [x, y]));
  const anchors = targets.map(() => ({ score: Infinity, anchor: null as Anchor | null }));

  for (let i = 0; i < mesh.length; i += 21) {
    const point: Point = [mesh[i], mesh[i + 1], mesh[i + 2]];
    const normal: Point = [mesh[i + 3], mesh[i + 4], mesh[i + 5]];
    const [x, y, depth] = transform(point, start);
    if (depth < 0.1 || transform(normal, start)[2] < 0.5) continue;
    targets.forEach(([tx, ty], index) => {
      const score = (x - tx) ** 2 + (y - ty) ** 2;
      if (score < anchors[index].score) anchors[index] = { score, anchor: { point, normal } };
    });
  }
  return anchors.flatMap(entry => entry.anchor ? [entry.anchor] : []);
}

const vertexSource = [
  "attribute vec3 point; attribute vec3 normal; attribute float region;",
  "uniform vec2 rotation; uniform float aspect; varying vec3 n; varying float label;",
  "vec3 turn(vec3 v){float cy=cos(rotation.x),sy=sin(rotation.x),cx=cos(rotation.y),sx=sin(rotation.y);",
  "vec3 a=vec3(cy*v.x+sy*v.z,v.y,-sy*v.x+cy*v.z);return vec3(a.x,cx*a.y-sx*a.z,sx*a.y+cx*a.z);}",
  "void main(){vec3 p=turn(point);n=turn(normal);label=region;float size=min(1.0,aspect)/aspect;",
  "gl_Position=vec4(p.x*size,p.y*min(1.0,aspect),-p.z*.25,1.0);}",
].join("\n");

const fragmentSource = [
  "precision mediump float; varying vec3 n; varying float label;",
  "uniform vec3 palette[5]; uniform float selected; uniform bool picking;",
  "void main(){if(picking){gl_FragColor=vec4((label+1.0)/255.0,0.,0.,1.);return;}",
  "vec3 tint=palette[0]; for(int i=1;i<5;i++){if(abs(label-float(i))<.1)tint=palette[i];}",
  "vec3 nn=normalize(n);float light=max(0.0,dot(nn,normalize(vec3(-.45,.65,.65))));",
  "float rim=pow(max(0.0,1.0-abs(nn.z)),3.0);",
  "float spec=pow(max(0.0,dot(nn,normalize(vec3(-.24,.34,1.)))),17.0);",
  "bool isSelected=abs(label-selected)<.1;",
  "vec3 base=isSelected ? tint : mix(vec3(.37,.23,.31),tint,.48);",
  "float lightLevel=isSelected ? .68+.48*light : .42+.50*light;",
  "vec3 highlights=tint*(rim*(isSelected ? .30 : .10))+vec3(1.,.80,.86)*spec*(isSelected ? .21 : .09);",
  "gl_FragColor=vec4(base*lightLevel+highlights,1.0);}",
].join("\n");

function readMesh(buffer: ArrayBuffer) {
  const header = new DataView(buffer);
  const vertices = header.getUint32(0, true);
  const faces = header.getUint32(4, true);
  if (
    !vertices ||
    vertices > 65535 ||
    !faces ||
    faces > 100000 ||
    buffer.byteLength !== 8 + vertices * 9 + faces * 7
  )
    throw new Error("Malha inválida");
  const position = new Int16Array(buffer, 8, vertices * 3);
  const normal = new Int8Array(buffer, 8 + vertices * 6, vertices * 3);
  const facesOffset = 8 + vertices * 9;
  const regionOffset = facesOffset + faces * 6;
  const data = new Float32Array(faces * 3 * 7);
  for (let face = 0; face < faces; face++) {
    const region = regionMap[header.getUint8(regionOffset + face)];
    if (region === undefined) throw new Error("Região inválida");
    for (let vertex = 0; vertex < 3; vertex++) {
      const index = header.getUint16(facesOffset + (face * 3 + vertex) * 2, true);
      if (index >= vertices) throw new Error("Vértice inválido");
      const base = (face * 3 + vertex) * 7;
      for (let axis = 0; axis < 3; axis++) {
        data[base + axis] = position[index * 3 + axis] / 32767;
        data[base + 3 + axis] = normal[index * 3 + axis] / 127;
      }
      data[base + 6] = region;
    }
  }
  return data;
}

function makeProgram(gl: WebGLRenderingContext) {
  const program = gl.createProgram();
  if (!program) throw new Error("3D indisponível");
  for (const [kind, source] of [
    [gl.VERTEX_SHADER, vertexSource],
    [gl.FRAGMENT_SHADER, fragmentSource],
  ] as const) {
    const shader = gl.createShader(kind);
    if (!shader) throw new Error("3D indisponível");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    throw new Error("3D indisponível");
  }
  return program;
}

export function BrainModel({
  selected,
  onSelect,
  pins,
  onOpenPin,
}: {
  selected: BrainRegion;
  onSelect: (region: BrainRegion) => void;
  pins: BrainPin[];
  onOpenPin: (pin: BrainPin) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useRef<{
    draw: (pick?: boolean) => void;
    pick: (x: number, y: number) => void;
  } | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const view = useRef({ yaw: initialYaw, pitch: initialPitch });
  const selectedRef = useRef(brainRegions.findIndex(region => region.id === selected));
  const selectRef = useRef(onSelect);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pinPositions, setPinPositions] = useState<Array<{ left: number; top: number; visible: boolean }>>([]);

  useEffect(() => {
    selectedRef.current = brainRegions.findIndex(region => region.id === selected);
    selectRef.current = onSelect;
    scene.current?.draw();
  }, [selected, onSelect]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    const gl = canvas.getContext("webgl", { antialias: false, alpha: true });
    if (!gl) {
      setStatus("error");
      return;
    }
    let clean = () => {};
    const onLoss = () => setStatus("error");
    canvas.addEventListener("webglcontextlost", onLoss);

    void fetch(meshUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Modelo indisponível");
        const mesh = readMesh(await response.arrayBuffer());
        if (controller.signal.aborted) return;
        const anchors = findPinAnchors(mesh);
        const program = makeProgram(gl);
        const geometry = gl.createBuffer();
        if (!geometry) throw new Error("Modelo indisponível");
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, geometry);
        gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);
        for (const [name, size, offset] of [
          ["point", 3, 0],
          ["normal", 3, 12],
          ["region", 1, 24],
        ] as const) {
          const location = gl.getAttribLocation(program, name);
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, size, gl.FLOAT, false, 28, offset);
        }
        const rotation = gl.getUniformLocation(program, "rotation");
        const aspect = gl.getUniformLocation(program, "aspect");
        const palette = gl.getUniformLocation(program, "palette[0]");
        const selection = gl.getUniformLocation(program, "selected");
        const picking = gl.getUniformLocation(program, "picking");
        gl.uniform3fv(palette, colors);
        gl.enable(gl.DEPTH_TEST);
        const draw = (pick = false) => {
          if (gl.isContextLost()) return;
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          gl.uniform2f(rotation, view.current.yaw, view.current.pitch);
          gl.uniform1f(aspect, canvas.width / canvas.height);
          gl.uniform1f(selection, selectedRef.current);
          gl.uniform1i(picking, Number(pick));
          if (pick) gl.disable(gl.DITHER);
          gl.drawArrays(gl.TRIANGLES, 0, mesh.length / 7);
          if (pick) gl.enable(gl.DITHER);
          if (!pick) {
            const aspectRatio = canvas.width / canvas.height;
            const heightScale = Math.min(1, aspectRatio);
            setPinPositions(anchors.map(({ point, normal }) => {
              const [x, y, depth] = transform(point, view.current);
              return {
                left: 50 + 50 * x * heightScale / aspectRatio,
                top: 50 - 50 * y * heightScale,
                visible: depth > 0 && transform(normal, view.current)[2] > 0.2,
              };
            }));
          }
        };
        const pick = (x: number, y: number) => {
          const rect = canvas.getBoundingClientRect();
          const px = Math.floor(((x - rect.left) / rect.width) * canvas.width);
          const py = canvas.height - 1 - Math.floor(((y - rect.top) / rect.height) * canvas.height);
          if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return;
          draw(true);
          const pixel = new Uint8Array(4);
          gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          draw();
          const region = brainRegions[pixel[0] - 1];
          if (region) selectRef.current(region.id);
        };
        const observer = new ResizeObserver(() => {
          const scale = Math.min(window.devicePixelRatio, 2);
          canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
          canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
          draw();
        });
        observer.observe(canvas);
        scene.current = { draw, pick };
        clean = () => {
          observer.disconnect();
          gl.deleteBuffer(geometry);
          gl.deleteProgram(program);
        };
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => {
      controller.abort();
      canvas.removeEventListener("webglcontextlost", onLoss);
      scene.current = null;
      clean();
    };
  }, []);

  function rotate(x: number, y: number) {
    view.current.yaw += x;
    view.current.pitch = Math.max(-1.35, Math.min(1.35, view.current.pitch + y));
    scene.current?.draw();
  }

  return (
    <div className="relative isolate overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_50%_42%,#643747,#26131e_74%)] text-white">
      <div className="relative">
      <canvas
        ref={canvasRef}
        aria-label="Modelo giratório do cérebro"
        aria-describedby="vanessa-brain-controls"
        tabIndex={status === "ready" ? 0 : -1}
        className="block h-[clamp(300px,54vw,520px)] w-full touch-none cursor-grab outline-offset-[-6px] focus-visible:outline-2 focus-visible:outline-[#ffc0ce] active:cursor-grabbing"
        onKeyDown={(event) => {
          const arrows: Record<string, [number, number]> = {
            ArrowLeft: [-0.14, 0],
            ArrowRight: [0.14, 0],
            ArrowUp: [0, -0.14],
            ArrowDown: [0, 0.14],
          };
          const direction = arrows[event.key];
          if (direction) {
            event.preventDefault();
            rotate(...direction);
          }
        }}
        onPointerDown={(event) => {
          if (!scene.current || !event.isPrimary || event.button !== 0) return;
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const pointer = drag.current;
          if (!pointer || pointer.id !== event.pointerId) return;
          const x = event.clientX - pointer.x,
            y = event.clientY - pointer.y;
          if (!pointer.moved && Math.hypot(x, y) < 4) return;
          drag.current = { ...pointer, x: event.clientX, y: event.clientY, moved: true };
          rotate(x * 0.012, y * 0.012);
        }}
        onPointerUp={(event) => {
          const pointer = drag.current;
          if (!pointer || pointer.id !== event.pointerId) return;
          drag.current = null;
          if (!pointer.moved) scene.current?.pick(event.clientX, event.clientY);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      />
      {status === "ready" && pins.map((pin, index) => {
        const position = pinPositions[index];
        if (!position?.visible) return null;
        return (
          <button
            key={pin.id}
            type="button"
            aria-label={`Abrir registro: ${pin.title}`}
            className="group absolute z-10 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[#ffc1d2] bg-[#811a44]/90 shadow-[0_0_14px_#f76caa] outline-offset-4 hover:z-20 hover:bg-[#b82960] focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-white"
            style={{ left: `${position.left}%`, top: `${position.top}%` }}
            onClick={() => onOpenPin(pin)}
          >
            <span aria-hidden="true" className="size-2 rounded-full bg-[#fff4f7] shadow-[0_0_6px_white]" />
            <span aria-hidden="true" className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden w-max max-w-[9rem] -translate-x-1/2 rounded-md bg-[#27131e] px-2 py-1 text-center text-xs text-white shadow-lg group-hover:block group-focus-visible:block">
              {pin.title}
            </span>
          </button>
        );
      })}
      {status !== "ready" && (
        <p
          role="status"
          className="pointer-events-none absolute inset-0 grid place-items-center px-5 text-center text-sm"
        >
          {status === "loading"
            ? "Carregando o cérebro 3D…"
            : "Visualização 3D indisponível. Escolha uma região na lista."}
        </p>
      )}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 pb-4 text-xs text-[#fff0f4]">
        <p id="vanessa-brain-controls">
          Arraste ou use as setas para girar. Abra um registro pelo pino.
        </p>
        <button
          type="button"
          disabled={status !== "ready"}
          className="rounded-full border border-white/30 p-2.5 hover:bg-white/15 disabled:opacity-40"
          aria-label="Restaurar vista inicial"
          title="Restaurar vista inicial"
          onClick={() => {
            view.current = { yaw: initialYaw, pitch: initialPitch };
            scene.current?.draw();
          }}
        >
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
