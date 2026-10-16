import React, { useRef, useState, useEffect, useCallback } from "react";
import { Eraser, RotateCcw, Trash2, Download, ShieldCheck, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { DrawingPrompt } from "../utils/curatedPrompts";

interface DrawingPadProps {
  currentPrompt: DrawingPrompt | null;
}

interface ModerationResult {
  status: "APPROVED" | "REJECTED";
  reason: string | null;
  is_hand_drawn: boolean;
  alt_text: string;
}

const PALETTE = [
  { name: "Fusain Noir", hex: "#1C1917" },
  { name: "Outremer", hex: "#1D4ED8" },
  { name: "Vert Forêt", hex: "#15803D" },
  { name: "Ocre Solaire", hex: "#D97706" },
  { name: "Terre Cuite", hex: "#DC2626" },
  { name: "Violet Doux", hex: "#7C3AED" },
];

export const DrawingPad: React.FC<DrawingPadProps> = ({ currentPrompt }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState<string>(PALETTE[0].hex);
  const [brushSize, setBrushSize] = useState<number>(4);
  const [tool, setTool] = useState<"pen" | "watercolor" | "eraser">("pen");
  const [history, setHistory] = useState<string[]>([]);

  const [isModerating, setIsModerating] = useState<boolean>(false);
  const [moderationResult, setModerationResult] = useState<ModerationResult | null>(null);
  const [moderationError, setModerationError] = useState<string | null>(null);

  const fillPaper = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.fillStyle = "#FAF8F5";
    ctx.fillRect(0, 0, width, height);

    // Subtle paper texture grain lines
    ctx.strokeStyle = "rgba(180, 168, 148, 0.15)";
    ctx.lineWidth = 1;
    for (let y = 10; y < height; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }, []);

  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const snap = canvas.toDataURL("image/png");
    setHistory((prev) => [...prev.slice(-12), snap]);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    fillPaper(ctx, canvas.width, canvas.height);
    saveHistory();
  }, [fillPaper, saveHistory]);

  const getCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ("touches" in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    setIsDrawing(true);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tool === "eraser") {
      ctx.strokeStyle = "#FAF8F5";
      ctx.lineWidth = brushSize * 4;
      ctx.globalAlpha = 1;
    } else if (tool === "watercolor") {
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize * 3;
      ctx.globalAlpha = 0.22;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.globalAlpha = 0.95;
    }
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.closePath();
        ctx.globalAlpha = 1;
      }
    }
    setIsDrawing(false);
    saveHistory();
  };

  const handleUndo = () => {
    if (history.length <= 1) return;
    const nextHistory = history.slice(0, -1);
    const prevSnap = nextHistory[nextHistory.length - 1];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setHistory(nextHistory);
    };
    img.src = prevSnap;
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    fillPaper(ctx, canvas.width, canvas.height);
    saveHistory();
    setModerationResult(null);
  };

  const handleDownloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `dessin-consigne-${Date.now()}.png`;
    a.click();
  };

  const handleModerateCanvas = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsModerating(true);
    setModerationError(null);

    try {
      const dataUrl = canvas.toDataURL("image/png");
      const res = await fetch("/api/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: dataUrl,
          subject: currentPrompt?.title || "Dessin libre bienveillant",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de modération.");
      setModerationResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur inattendue.";
      setModerationError(msg);
    } finally {
      setIsModerating(false);
    }
  };

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200">
        <div>
          <h3 className="text-base font-semibold text-stone-900">
            Planche à dessin sans pression
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            {currentPrompt
              ? `Consigne active : « ${currentPrompt.title} »`
              : "Prends 2 minutes pour gribouiller sans jugement."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadImage}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Enregistrer
          </button>
          <button
            type="button"
            disabled={isModerating}
            onClick={handleModerateCanvas}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            {isModerating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" />
            )}
            Valider le dessin
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-stone-50 border border-stone-200 rounded-lg">
        {/* Tool selector */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTool("pen")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              tool === "pen" ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-200"
            }`}
          >
            Fusain / Trait
          </button>
          <button
            type="button"
            onClick={() => setTool("watercolor")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              tool === "watercolor" ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-200"
            }`}
          >
            Aquarelle douce
          </button>
          <button
            type="button"
            onClick={() => setTool("eraser")}
            className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              tool === "eraser" ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-200"
            }`}
          >
            <Eraser className="w-3 h-3" />
            Gomme
          </button>
        </div>

        {/* Color Palette */}
        <div className="flex items-center gap-2">
          {PALETTE.map((p) => (
            <button
              key={p.hex}
              type="button"
              title={p.name}
              onClick={() => {
                setColor(p.hex);
                if (tool === "eraser") setTool("pen");
              }}
              className={`w-5 h-5 rounded-full transition-transform ${
                color === p.hex && tool !== "eraser"
                  ? "scale-115 ring-2 ring-offset-2 ring-stone-900"
                  : "hover:scale-105"
              }`}
              style={{ backgroundColor: p.hex }}
              aria-label={p.name}
            />
          ))}
        </div>

        {/* Thickness & Actions */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-stone-600">
            <span>Taille</span>
            <input
              type="range"
              min={2}
              max={14}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-14 accent-stone-900"
            />
          </label>
          <button
            type="button"
            onClick={handleUndo}
            disabled={history.length <= 1}
            className="p-1.5 text-stone-700 hover:bg-stone-200 rounded disabled:opacity-30 cursor-pointer"
            title="Annuler le dernier geste"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="p-1.5 text-stone-700 hover:bg-stone-200 rounded cursor-pointer"
            title="Effacer la feuille"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="rounded-lg border border-stone-300 overflow-hidden bg-[#FAF8F5]">
        <canvas
          ref={canvasRef}
          width={640}
          height={380}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          className="w-full aspect-[16/10] cursor-crosshair touch-none block"
        />
      </div>

      {/* Moderation Feedback */}
      {moderationError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
          {moderationError}
        </div>
      )}

      {moderationResult && (
        <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-lg space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-stone-700">Contrôle ArtGuard AI</span>
            {moderationResult.status === "APPROVED" ? (
              <span className="inline-flex items-center gap-1 text-emerald-800 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                APPROVED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-700 font-mono">
                <XCircle className="w-3.5 h-3.5 text-red-700" />
                REJECTED
              </span>
            )}
          </div>
          <p className="text-xs text-stone-600 italic">
            Alt-text accessible : « {moderationResult.alt_text} »
          </p>
          {moderationResult.reason && (
            <p className="text-xs text-red-700 font-medium">
              Motif : {moderationResult.reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
