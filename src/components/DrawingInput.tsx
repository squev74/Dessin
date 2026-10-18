import React, { useState, useRef, useEffect, useCallback } from "react";
import { Upload, Eraser, RotateCcw, Trash2, ShieldCheck, RefreshCw } from "lucide-react";

const PALETTE = [
  { name: "Fusain Noir", hex: "#1C1917" },
  { name: "Outremer", hex: "#1D4ED8" },
  { name: "Vert Forêt", hex: "#15803D" },
  { name: "Ocre Solaire", hex: "#D97706" },
  { name: "Terre Cuite", hex: "#DC2626" },
  { name: "Violet Doux", hex: "#7C3AED" },
];

interface DrawingInputProps {
  onSubmit: (imageBlobUrl: string) => Promise<void> | void;
  isSubmitting?: boolean;
}

export function DrawingInput({ onSubmit, isSubmitting = false }: DrawingInputProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState<string>(PALETTE[0].hex);
  const [brushSize, setBrushSize] = useState<number>(4);
  const [tool, setTool] = useState<"pen" | "watercolor" | "eraser">("pen");
  const [importedImageUrl, setImportedImageUrl] = useState<string | null>(null);

  const fillPaper = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.fillStyle = "#FAF8F5";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(180, 168, 148, 0.15)";
    ctx.lineWidth = 1;
    for (let y = 10; y < height; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    fillPaper(ctx, canvas.width, canvas.height);
  }, [fillPaper]);

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

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
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

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
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
  };

  const handleClearCanvas = () => {
    setImportedImageUrl(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    fillPaper(ctx, canvas.width, canvas.height);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL("image/webp", 0.8);
          setImportedImageUrl(compressedDataUrl);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitClick = () => {
    if (importedImageUrl) {
      onSubmit(importedImageUrl);
    } else {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const url = canvas.toDataURL("image/webp", 0.8);
      onSubmit(url);
    }
  };

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-stone-50 border border-stone-200 rounded-lg">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTool("pen")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              tool === "pen" ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-200"
            }`}
          >
            Fusain
          </button>
          <button
            type="button"
            onClick={() => setTool("watercolor")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              tool === "watercolor" ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-200"
            }`}
          >
            Aquarelle
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
                color === p.hex && tool !== "eraser" ? "scale-115 ring-2 ring-stone-900" : "hover:scale-105"
              }`}
              style={{ backgroundColor: p.hex }}
            />
          ))}
        </div>

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
          <button type="button" onClick={handleClearCanvas} className="p-1.5 text-stone-700 hover:bg-stone-200 rounded cursor-pointer" title="Effacer">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {importedImageUrl ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span className="font-semibold text-emerald-800">Image importée et compressée (WebP)</span>
            <button
              type="button"
              onClick={() => setImportedImageUrl(null)}
              className="text-xs text-stone-600 underline hover:text-stone-900 cursor-pointer"
            >
              Repasser au canvas de dessin
            </button>
          </div>
          <div className="rounded-lg border border-stone-300 overflow-hidden bg-[#FAF8F5] aspect-[16/10] flex items-center justify-center p-2">
            <img src={importedImageUrl} alt="Aperçu importé" className="max-h-full max-w-full object-contain rounded" />
          </div>
        </div>
      ) : (
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
      )}

      <div className="flex items-center justify-between pt-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg transition-colors cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5 text-emerald-800" />
          Importer une photo
        </button>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={handleSubmitClick}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
        >
          {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          {isSubmitting ? "Envoi en cours..." : "Envoyer mon dessin"}
        </button>
      </div>
    </div>
  );
}

export default DrawingInput;
