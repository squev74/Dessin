import React, { useState } from "react";
import { ZoomIn, ZoomOut, X, Trash2 } from "lucide-react";

interface GalleryItem {
  id: string;
  imageUrl: string;
  userId?: string;
  submissionId?: string;
}

interface GalleryProps {
  drawings: GalleryItem[];
  isLoading?: boolean;
  isAdmin?: boolean;
  onRetractDrawing?: (submissionId: string, userId: string) => void;
}

export function Gallery({ drawings, isLoading = false, isAdmin = false, onRetractDrawing }: GalleryProps) {
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  if (isLoading) {
    return <div className="p-12 text-center text-xs text-stone-400">Chargement de la galerie...</div>;
  }

  if (drawings.length === 0) {
    return (
      <div className="p-12 bg-white border border-stone-200 rounded-xl text-center space-y-2">
        <p className="text-sm font-medium text-stone-700">Aucun dessin validé pour ce sujet pour l'instant.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {drawings.map((item) => (
          <div
            key={item.id}
            className="relative group aspect-square bg-white border border-stone-200 rounded-xl overflow-hidden shadow-xs hover:shadow-md transition-shadow"
          >
            <img
              src={item.imageUrl}
              alt="Dessin validé de la fresque collective"
              referrerPolicy="no-referrer"
              onClick={() => {
                setLightboxImageUrl(item.imageUrl);
                setZoomScale(1);
                setPanOffset({ x: 0, y: 0 });
              }}
              className="w-full h-full object-cover block cursor-zoom-in"
            />
            {isAdmin && onRetractDrawing && (
              <button
                type="button"
                onClick={() => onRetractDrawing(item.submissionId || item.id, item.userId || "")}
                className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md"
                title="Retirer ce dessin (Rétrograder l'utilisateur)"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox / Fullscreen Touch Zoom Modal */}
      {lightboxImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center overflow-hidden touch-none"
          onClick={() => setLightboxImageUrl(null)}
        >
          <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setZoomScale((prev) => Math.min(prev + 0.5, 4));
              }}
              className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full cursor-pointer backdrop-blur-sm"
              title="Zoom +"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setZoomScale((prev) => Math.max(prev - 0.5, 1));
                if (zoomScale <= 1.5) setPanOffset({ x: 0, y: 0 });
              }}
              className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full cursor-pointer backdrop-blur-sm"
              title="Zoom -"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setLightboxImageUrl(null)}
              className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full cursor-pointer backdrop-blur-sm"
              title="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div
            className="w-full h-full flex items-center justify-center p-4 overflow-hidden select-none"
            onMouseDown={(e) => {
              if (zoomScale > 1) {
                setIsDraggingImage(true);
                setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
              }
            }}
            onMouseMove={(e) => {
              if (isDraggingImage && zoomScale > 1) {
                setPanOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
              }
            }}
            onMouseUp={() => setIsDraggingImage(false)}
            onMouseLeave={() => setIsDraggingImage(false)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (zoomScale > 1) {
                setZoomScale(1);
                setPanOffset({ x: 0, y: 0 });
              } else {
                setZoomScale(2.5);
              }
            }}
          >
            <img
              src={lightboxImageUrl}
              alt="Agrandissement plein écran"
              referrerPolicy="no-referrer"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                transition: isDraggingImage ? "none" : "transform 0.15s ease-out",
              }}
              className="max-h-[90vh] max-w-[90vw] object-contain cursor-grab active:cursor-grabbing rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  );
}

export default Gallery;
