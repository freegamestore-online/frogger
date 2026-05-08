import { useRef, useEffect, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const COLS = 13;
const ROWS = 15;
// Row layout (bottom to top):
// 0: start (safe)
// 1-5: road lanes
// 6: median (safe)
// 7-11: river lanes
// 12: river edge (safe strip before homes)
// 13: home row (5 slots)
// 14: top border

const ROAD_ROWS = [1, 2, 3, 4, 5];
const RIVER_ROWS = [7, 8, 9, 10, 11];
const SAFE_ROWS = [0, 6, 12];
const HOME_ROW = 13;

const LIVES_DEFAULT = 3;
const LEVEL_TIME = 30;
const HOP_SCORE = 10;
const HOME_SCORE = 50;

const HOME_SLOTS = [1, 4, 7, 10, 12];

const COLOR_GRASS = "#228B22";
const COLOR_ROAD = "#3a3a3a";
const COLOR_WATER = "#1a6dd4";
const COLOR_HOME_BG = "#0d4a1a";
const COLOR_HOME_FILLED = "#fbbf24";
const COLOR_FROG = "#22c55e";
const COLOR_FROG_EYE = "#ffffff";
const COLOR_FROG_PUPIL = "#1a1a1a";
const COLOR_LOG = "#8B4513";
const COLOR_TURTLE = "#2d6b3f";
const COLOR_TURTLE_SHELL = "#1a4a28";

const CAR_COLORS = ["#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#f97316", "#3b82f6"];

interface LaneDef {
  row: number;
  dir: 1 | -1;
  speed: number;
  type: "car" | "truck" | "log" | "turtle";
  objWidth: number;
  gap: number;
}

const LANE_DEFS: LaneDef[] = [
  { row: 1, dir: -1, speed: 1.5, type: "car", objWidth: 1, gap: 4 },
  { row: 2, dir: 1, speed: 2.0, type: "truck", objWidth: 2, gap: 5 },
  { row: 3, dir: -1, speed: 2.5, type: "car", objWidth: 1, gap: 3 },
  { row: 4, dir: 1, speed: 1.8, type: "truck", objWidth: 2, gap: 4 },
  { row: 5, dir: -1, speed: 3.0, type: "car", objWidth: 1, gap: 3 },
  { row: 7, dir: 1, speed: 1.2, type: "log", objWidth: 3, gap: 4 },
  { row: 8, dir: -1, speed: 1.8, type: "turtle", objWidth: 2, gap: 4 },
  { row: 9, dir: 1, speed: 1.0, type: "log", objWidth: 4, gap: 5 },
  { row: 10, dir: -1, speed: 2.2, type: "turtle", objWidth: 2, gap: 3 },
  { row: 11, dir: 1, speed: 1.5, type: "log", objWidth: 3, gap: 4 },
];

interface LaneObject {
  x: number;
  width: number;
  color: string;
}

interface Lane {
  def: LaneDef;
  objects: LaneObject[];
}

interface GameState {
  frogCol: number;
  frogRow: number;
  frogRideOffset: number;
  lives: number;
  score: number;
  level: number;
  timer: number;
  homesFilled: boolean[];
  lanes: Lane[];
  alive: boolean;
  furthestRow: number;
  deathAnimTimer: number;
  levelComplete: boolean;
}

interface GameProps {
  onScore: (score: number) => void;
  onGameOver: () => void;
  paused?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function createLanes(level: number): Lane[] {
  const speedMult = 1 + (level - 1) * 0.15;
  return LANE_DEFS.map((def) => {
    const objects: LaneObject[] = [];
    const speed = def.speed * speedMult;
    const totalSpan = def.objWidth + def.gap;
    const count = Math.ceil((COLS + def.objWidth + def.gap) / totalSpan) + 1;
    for (let i = 0; i < count; i++) {
      const x = i * totalSpan - def.objWidth;
      let color: string;
      if (def.type === "car" || def.type === "truck") {
        color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]!;
      } else if (def.type === "log") {
        color = COLOR_LOG;
      } else {
        color = COLOR_TURTLE;
      }
      objects.push({ x, width: def.objWidth, color });
    }
    return { def: { ...def, speed }, objects };
  });
}

function createState(level: number, score: number, lives: number): GameState {
  return {
    frogCol: Math.floor(COLS / 2),
    frogRow: 0,
    frogRideOffset: 0,
    lives,
    score,
    level,
    timer: LEVEL_TIME,
    homesFilled: [false, false, false, false, false],
    lanes: createLanes(level),
    alive: true,
    furthestRow: 0,
    deathAnimTimer: 0,
    levelComplete: false,
  };
}

/* ------------------------------------------------------------------ */
/*  Drawing functions (pure, no component state)                       */
/* ------------------------------------------------------------------ */

function drawFrog(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, cw: number, ch: number,
  color: string, alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const pad = cw * 0.12;
  const bx = x + pad;
  const by = y + pad;
  const bw = cw - pad * 2;
  const bh = ch - pad * 2;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, bw * 0.3);
  ctx.fill();

  const eyeR = bw * 0.14;
  const eyeOffX = bw * 0.25;
  const eyeOffY = bh * 0.22;

  ctx.fillStyle = COLOR_FROG_EYE;
  ctx.beginPath();
  ctx.arc(bx + eyeOffX, by + eyeOffY, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLOR_FROG_PUPIL;
  ctx.beginPath();
  ctx.arc(bx + eyeOffX, by + eyeOffY, eyeR * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLOR_FROG_EYE;
  ctx.beginPath();
  ctx.arc(bx + bw - eyeOffX, by + eyeOffY, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLOR_FROG_PUPIL;
  ctx.beginPath();
  ctx.arc(bx + bw - eyeOffX, by + eyeOffY, eyeR * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, color: string,
) {
  const pad = h * 0.1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x + 2, y + pad, w - 4, h - pad * 2, 4);
  ctx.fill();

  ctx.fillStyle = "#60a5fa";
  ctx.fillRect(x + w * 0.15, y + pad + 2, w * 0.7, h * 0.2);

  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(x + 1, y + pad - 2, w * 0.15, pad + 2);
  ctx.fillRect(x + w - w * 0.15 - 1, y + pad - 2, w * 0.15, pad + 2);
  ctx.fillRect(x + 1, y + h - pad, w * 0.15, pad + 2);
  ctx.fillRect(x + w - w * 0.15 - 1, y + h - pad, w * 0.15, pad + 2);
}

function drawTruck(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, color: string,
) {
  const pad = h * 0.08;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x + 2, y + pad, w - 4, h - pad * 2, 3);
  ctx.fill();

  ctx.fillStyle = "#ffffff22";
  ctx.fillRect(x + 4, y + pad + 2, w * 0.25, h - pad * 2 - 4);

  ctx.fillStyle = "#1a1a1a";
  const wheelW = w * 0.08;
  ctx.fillRect(x + 2, y + pad - 3, wheelW, pad + 3);
  ctx.fillRect(x + w * 0.4, y + pad - 3, wheelW, pad + 3);
  ctx.fillRect(x + w - wheelW - 2, y + pad - 3, wheelW, pad + 3);
  ctx.fillRect(x + 2, y + h - pad, wheelW, pad + 3);
  ctx.fillRect(x + w * 0.4, y + h - pad, wheelW, pad + 3);
  ctx.fillRect(x + w - wheelW - 2, y + h - pad, wheelW, pad + 3);
}

function drawLog(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
) {
  const pad = h * 0.15;
  ctx.fillStyle = COLOR_LOG;
  ctx.beginPath();
  ctx.roundRect(x + 1, y + pad, w - 2, h - pad * 2, (h - pad * 2) / 2);
  ctx.fill();

  ctx.strokeStyle = "#6B3410";
  ctx.lineWidth = 1;
  const mid = y + h / 2;
  ctx.beginPath();
  ctx.moveTo(x + 6, mid - 2);
  ctx.lineTo(x + w - 6, mid - 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 10, mid + 3);
  ctx.lineTo(x + w - 10, mid + 3);
  ctx.stroke();

  ctx.fillStyle = "#a0522d";
  ctx.beginPath();
  ctx.arc(x + 4, y + h / 2, (h - pad * 2) / 2 - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w - 4, y + h / 2, (h - pad * 2) / 2 - 1, 0, Math.PI * 2);
  ctx.fill();
}

function drawTurtle(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  widthCells: number,
) {
  const turtleW = w / widthCells;
  for (let i = 0; i < widthCells; i++) {
    const tx = x + i * turtleW;
    const pad = h * 0.15;
    const tw = turtleW - 4;
    const th = h - pad * 2;

    ctx.fillStyle = COLOR_TURTLE;
    ctx.beginPath();
    ctx.ellipse(tx + turtleW / 2, y + h / 2, tw / 2, th / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLOR_TURTLE_SHELL;
    ctx.beginPath();
    ctx.ellipse(tx + turtleW / 2, y + h / 2, tw / 3, th / 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#3d8b55";
    ctx.beginPath();
    ctx.arc(tx + turtleW / 2, y + pad - 1, th * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHUD(ctx: CanvasRenderingContext2D, canvasW: number, cellH: number, s: GameState) {
  const hudH = cellH * 0.8;
  const hudY = 4;

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.roundRect(4, hudY, canvasW - 8, hudH, 6);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${hudH * 0.5}px Manrope, sans-serif`;
  ctx.textBaseline = "middle";
  const textY = hudY + hudH / 2;

  ctx.textAlign = "left";
  let livesText = "Lives: ";
  for (let i = 0; i < s.lives; i++) livesText += "\u2665 ";
  ctx.fillText(livesText, 12, textY);

  ctx.textAlign = "center";
  ctx.fillText(`Lv ${s.level}`, canvasW / 2, textY);

  ctx.textAlign = "right";
  ctx.fillStyle = s.timer < 10 ? "#ef4444" : "#ffffff";
  ctx.fillText(`${Math.ceil(s.timer)}s`, canvasW - 12, textY);
}

function drawScene(canvas: HTMLCanvasElement, s: GameState) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = parseFloat(canvas.dataset.logicalWidth ?? "0");
  const h = parseFloat(canvas.dataset.logicalHeight ?? "0");
  if (w === 0 || h === 0) return;

  const cellW = w / COLS;
  const cellH = h / ROWS;

  const screenX = (col: number) => col * cellW;
  const screenY = (row: number) => (ROWS - 1 - row) * cellH;

  ctx.clearRect(0, 0, w, h);

  // Row backgrounds
  for (let row = 0; row < ROWS; row++) {
    let color: string;
    if (SAFE_ROWS.includes(row)) {
      color = COLOR_GRASS;
    } else if (ROAD_ROWS.includes(row)) {
      color = COLOR_ROAD;
    } else if (RIVER_ROWS.includes(row)) {
      color = COLOR_WATER;
    } else if (row === HOME_ROW || row === 14) {
      color = COLOR_HOME_BG;
    } else {
      color = COLOR_GRASS;
    }
    ctx.fillStyle = color;
    ctx.fillRect(0, screenY(row), w, cellH);
  }

  // Road lane markings
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 2;
  ctx.setLineDash([cellW * 0.4, cellW * 0.4]);
  for (const row of ROAD_ROWS) {
    if (row < 5) {
      const y = screenY(row);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // Home slots
  for (let i = 0; i < HOME_SLOTS.length; i++) {
    const col = HOME_SLOTS[i]!;
    const x = screenX(col);
    const y = screenY(HOME_ROW);
    if (s.homesFilled[i]) {
      ctx.fillStyle = COLOR_HOME_FILLED;
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, cellW - 4, cellH - 4, 4);
      ctx.fill();
      drawFrog(ctx, x, y, cellW, cellH, COLOR_FROG, 1);
    } else {
      ctx.fillStyle = "#0a3312";
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, cellW - 4, cellH - 4, 4);
      ctx.fill();
      ctx.strokeStyle = "#22c55e44";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Lane objects
  for (const lane of s.lanes) {
    const row = lane.def.row;
    const y = screenY(row);
    for (const obj of lane.objects) {
      const x = obj.x * cellW;
      const objW = obj.width * cellW;
      if (lane.def.type === "car") {
        drawCar(ctx, x, y, objW, cellH, obj.color);
      } else if (lane.def.type === "truck") {
        drawTruck(ctx, x, y, objW, cellH, obj.color);
      } else if (lane.def.type === "log") {
        drawLog(ctx, x, y, objW, cellH);
      } else {
        drawTurtle(ctx, x, y, objW, cellH, obj.width);
      }
    }
  }

  // Frog
  if (s.alive) {
    const frogX = screenX(s.frogCol) + s.frogRideOffset * cellW;
    const frogY = screenY(s.frogRow);
    drawFrog(ctx, frogX, frogY, cellW, cellH, COLOR_FROG, 1);
  } else if (s.deathAnimTimer > 0) {
    const frogX = screenX(s.frogCol) + s.frogRideOffset * cellW;
    const frogY = screenY(s.frogRow);
    const alpha = s.deathAnimTimer / 0.6;
    drawFrog(ctx, frogX, frogY, cellW, cellH, "#ef4444", alpha);
  }

  // HUD
  drawHUD(ctx, w, cellH, s);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Game({ onScore, onGameOver, paused }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(createState(1, 0, LIVES_DEFAULT));
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const onScoreRef = useRef(onScore);
  const onGameOverRef = useRef(onGameOver);
  const pausedRef = useRef(paused);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  onScoreRef.current = onScore;
  onGameOverRef.current = onGameOver;
  pausedRef.current = paused;

  function killFrog(s: GameState) {
    s.alive = false;
    s.deathAnimTimer = 0.6;
  }

  function respawnFrog(s: GameState) {
    s.lives--;
    if (s.lives <= 0) {
      onGameOverRef.current();
      return;
    }
    s.frogCol = Math.floor(COLS / 2);
    s.frogRow = 0;
    s.frogRideOffset = 0;
    s.alive = true;
    s.furthestRow = 0;
    s.timer = LEVEL_TIME;
  }

  const moveFrog = useCallback((dx: number, dy: number) => {
    const s = stateRef.current;
    if (!s.alive || s.levelComplete) return;

    const newCol = s.frogCol + dx;
    const newRow = s.frogRow + dy;

    if (newCol < 0 || newCol >= COLS || newRow < 0 || newRow > HOME_ROW) return;

    s.frogCol = newCol;
    s.frogRow = newRow;
    s.frogRideOffset = 0;

    if (newRow > s.furthestRow) {
      s.score += HOP_SCORE * (newRow - s.furthestRow);
      s.furthestRow = newRow;
      onScoreRef.current(s.score);
    }

    if (newRow === HOME_ROW) {
      const slotIndex = HOME_SLOTS.indexOf(newCol);
      if (slotIndex !== -1 && !s.homesFilled[slotIndex]) {
        s.homesFilled[slotIndex] = true;
        const timeBonus = Math.floor(s.timer) * 2;
        s.score += HOME_SCORE + timeBonus;
        onScoreRef.current(s.score);

        if (s.homesFilled.every(Boolean)) {
          s.levelComplete = true;
          return;
        }

        s.frogCol = Math.floor(COLS / 2);
        s.frogRow = 0;
        s.frogRideOffset = 0;
        s.furthestRow = 0;
        s.timer = LEVEL_TIME;
      } else {
        killFrog(s);
      }
    }
  }, []);

  // Input handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp": case "w": case "W":
          moveFrog(0, 1); break;
        case "ArrowDown": case "s": case "S":
          moveFrog(0, -1); break;
        case "ArrowLeft": case "a": case "A":
          moveFrog(-1, 0); break;
        case "ArrowRight": case "d": case "D":
          moveFrog(1, 0); break;
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      if (!touch || !touchStartRef.current) return;
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      const elapsed = Date.now() - touchStartRef.current.time;
      touchStartRef.current = null;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (elapsed < 500 && (absDx > 30 || absDy > 30)) {
        if (absDx > absDy) {
          moveFrog(dx > 0 ? 1 : -1, 0);
        } else {
          moveFrog(0, dy < 0 ? 1 : -1);
        }
        return;
      }

      if (elapsed < 200 && absDx < 20 && absDy < 20) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const s = stateRef.current;
        const cellW = rect.width / COLS;
        const cellH = rect.height / ROWS;
        const frogScreenX = rect.left + (s.frogCol + 0.5) * cellW;
        const frogScreenY = rect.top + (ROWS - 1 - s.frogRow + 0.5) * cellH;
        const tdx = touch.clientX - frogScreenX;
        const tdy = touch.clientY - frogScreenY;
        if (Math.abs(tdx) > Math.abs(tdy)) {
          moveFrog(tdx > 0 ? 1 : -1, 0);
        } else {
          moveFrog(0, tdy < 0 ? 1 : -1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [moveFrog]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
      canvas.dataset.logicalWidth = String(rect.width);
      canvas.dataset.logicalHeight = String(rect.height);
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Game loop
  useEffect(() => {
    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      if (pausedRef.current) {
        lastTimeRef.current = now;
        animRef.current = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = now;
      const s = stateRef.current;

      if (s.levelComplete) {
        stateRef.current = createState(s.level + 1, s.score, s.lives);
        onScoreRef.current(stateRef.current.score);
        const canvas = canvasRef.current;
        if (canvas) drawScene(canvas, stateRef.current);
        animRef.current = requestAnimationFrame(tick);
        return;
      }

      if (!s.alive) {
        s.deathAnimTimer -= dt;
        if (s.deathAnimTimer <= 0) {
          respawnFrog(s);
        }
        const canvas = canvasRef.current;
        if (canvas) drawScene(canvas, s);
        animRef.current = requestAnimationFrame(tick);
        return;
      }

      // Timer
      s.timer -= dt;
      if (s.timer <= 0) {
        s.timer = 0;
        killFrog(s);
        const canvas = canvasRef.current;
        if (canvas) drawScene(canvas, s);
        animRef.current = requestAnimationFrame(tick);
        return;
      }

      // Move lane objects and check collisions
      let frogOnPlatform = false;
      let platformDx = 0;

      for (const lane of s.lanes) {
        const spd = lane.def.speed * lane.def.dir * dt;
        for (const obj of lane.objects) {
          obj.x += spd;
        }

        for (const obj of lane.objects) {
          if (lane.def.dir === 1 && obj.x > COLS + 2) {
            obj.x -= COLS + obj.width + lane.def.gap + 2;
          } else if (lane.def.dir === -1 && obj.x + obj.width < -2) {
            obj.x += COLS + obj.width + lane.def.gap + 2;
          }
        }

        if (lane.def.row === s.frogRow) {
          const frogX = s.frogCol + s.frogRideOffset;
          const isRiver = RIVER_ROWS.includes(lane.def.row);
          const isRoad = ROAD_ROWS.includes(lane.def.row);

          for (const obj of lane.objects) {
            const objLeft = obj.x;
            const objRight = obj.x + obj.width;
            const frogLeft = frogX + 0.1;
            const frogRight = frogX + 0.9;
            const overlap = frogLeft < objRight && frogRight > objLeft;

            if (isRoad && overlap) {
              killFrog(s);
              break;
            }
            if (isRiver && overlap) {
              frogOnPlatform = true;
              platformDx = lane.def.speed * lane.def.dir * dt;
            }
          }
        }
      }

      if (s.alive && RIVER_ROWS.includes(s.frogRow) && !frogOnPlatform) {
        killFrog(s);
      }

      if (frogOnPlatform && s.alive) {
        s.frogRideOffset += platformDx;
        while (s.frogRideOffset >= 0.5) {
          s.frogRideOffset -= 1;
          s.frogCol++;
        }
        while (s.frogRideOffset <= -0.5) {
          s.frogRideOffset += 1;
          s.frogCol--;
        }
        if (s.frogCol < 0 || s.frogCol >= COLS) {
          killFrog(s);
        }
      }

      const canvas = canvasRef.current;
      if (canvas) drawScene(canvas, s);
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full h-full" style={{ background: "#0a0a0a" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", touchAction: "none" }}
      />
    </div>
  );
}
