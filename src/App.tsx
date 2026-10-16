import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ShieldCheck,
  Compass,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  User,
  LogOut,
  Sparkles,
  Upload,
  Eraser,
  RotateCcw,
  Trash2,
  Copy,
  Check,
  Clock,
  AlertCircle,
  CheckSquare,
  RefreshCw,
  Plus,
  Edit3,
  ListOrdered,
  Maximize2,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import {
  auth,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  db,
} from "./firebase";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import {
  DrawingPrompt,
  INITIAL_CURATED_PROMPTS,
} from "./utils/curatedPrompts";

type AppRole = "user" | "admin";

const PALETTE = [
  { name: "Fusain Noir", hex: "#1C1917" },
  { name: "Outremer", hex: "#1D4ED8" },
  { name: "Vert Forêt", hex: "#15803D" },
  { name: "Ocre Solaire", hex: "#D97706" },
  { name: "Terre Cuite", hex: "#DC2626" },
  { name: "Violet Doux", hex: "#7C3AED" },
];

interface DrawingSubmission {
  id: string;
  prompt_id: string;
  user_id: string;
  storage_path: string;
  image_url: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejection_reason?: string | null;
  created_at?: any;
}

export function App() {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [userRole, setUserRole] = useState<AppRole>("user");
  const [activeAdminTab, setActiveAdminTab] = useState<"atelier" | "moderation" | "prompts">("atelier");

  // Prompts & Sequential progression
  const [prompts, setPrompts] = useState<DrawingPrompt[]>([]);
  const [activePromptIndex, setActivePromptIndex] = useState<number>(0);
  const [userSubmissionsMap, setUserSubmissionsMap] = useState<Record<string, DrawingSubmission>>({});

  // Canvas drawing state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState<string>(PALETTE[0].hex);
  const [brushSize, setBrushSize] = useState<number>(4);
  const [tool, setTool] = useState<"pen" | "watercolor" | "eraser">("pen");
  const [history, setHistory] = useState<string[]>([]);

  // Imported image preview state (Replaces canvas when file is imported)
  const [importedImageUrl, setImportedImageUrl] = useState<string | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Gallery (cloistered per prompt)
  const [galleryDrawings, setGalleryDrawings] = useState<Array<{ id: string; imageUrl: string; userId: string; submissionId: string }>>([]);
  const [galleryLoading, setGalleryLoading] = useState<boolean>(false);

  // Lightbox & Touch Zoom state
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Admin Pending Submissions list
  const [pendingSubmissions, setPendingSubmissions] = useState<DrawingSubmission[]>([]);
  const [rejectingSubId, setRejectingSubId] = useState<string | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>("");

  // Admin Prompt CRUD state
  const [editingPrompt, setEditingPrompt] = useState<DrawingPrompt | null>(null);
  const [promptTitleInput, setPromptTitleInput] = useState<string>("");
  const [promptCategoryInput, setPromptCategoryInput] = useState<DrawingPrompt["category"]>("imagination");
  const [promptDifficultyInput, setPromptDifficultyInput] = useState<DrawingPrompt["difficulty"]>("facile");

  // Admin Retraction Modal state
  const [retractingDrawing, setRetractingDrawing] = useState<{ id: string; promptId: string; userId: string } | null>(null);
  const [retractionReasonInput, setRetractionReasonInput] = useState<string>("");

  // Art Director generator state
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState<boolean>(false);
  const [selectedTheme, setSelectedTheme] = useState<string>("libre");
  const [customThemeInput, setCustomThemeInput] = useState<string>("");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);

  // Initialize Auth listener & Firestore data
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userDocRef);
        let role: AppRole = "user";
        if (user.email === "squeva11@gmail.com") {
          role = "admin";
        } else if (userSnap.exists() && userSnap.data()?.role === "admin") {
          role = "admin";
        }

        if (!userSnap.exists()) {
          await setDoc(userDocRef, {
            email: user.email,
            displayName: user.displayName,
            role,
            createdAt: serverTimestamp(),
          });
        }
        setUserRole(role);
        await loadAppData(user.uid, role);
      } else {
        setUserRole("user");
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const loadAppData = async (uid: string, role: AppRole) => {
    try {
      const promptsSnap = await getDocs(collection(db, "prompts"));
      let loadedPrompts: DrawingPrompt[] = [];
      if (promptsSnap.empty) {
        loadedPrompts = INITIAL_CURATED_PROMPTS.map((p, idx) => ({
          id: `prompt-${idx + 1}`,
          orderIndex: idx + 1,
          title: p.title,
          category: p.category,
          difficulty: p.difficulty,
        }));
        for (const p of loadedPrompts) {
          await setDoc(doc(db, "prompts", p.id), p);
        }
      } else {
        promptsSnap.forEach((d) => {
          loadedPrompts.push(d.data() as DrawingPrompt);
        });
        loadedPrompts.sort((a, b) => a.orderIndex - b.orderIndex);
      }
      setPrompts(loadedPrompts);

      const subSnap = await getDocs(
        query(collection(db, "drawings"), where("user_id", "==", uid))
      );
      const subMap: Record<string, DrawingSubmission> = {};
      subSnap.forEach((d) => {
        const data = d.data() as DrawingSubmission;
        subMap[data.prompt_id] = { id: d.id, ...data };
      });
      setUserSubmissionsMap(subMap);

      if (role === "admin") {
        await loadPendingSubmissions();
      }
    } catch (err) {
      console.error("Error loading app data:", err);
      const fallback = INITIAL_CURATED_PROMPTS.map((p, idx) => ({
        id: `prompt-${idx + 1}`,
        orderIndex: idx + 1,
        title: p.title,
        category: p.category,
        difficulty: p.difficulty,
      }));
      setPrompts(fallback);
    }
  };

  const loadPendingSubmissions = async () => {
    try {
      const q = query(collection(db, "drawings"), where("status", "==", "PENDING"));
      const snap = await getDocs(q);
      const pending: DrawingSubmission[] = [];
      snap.forEach((d) => {
        pending.push({ id: d.id, ...(d.data() as any) });
      });
      setPendingSubmissions(pending);
    } catch (err) {
      console.error("Error loading pending submissions:", err);
    }
  };

  const activePrompt = useMemo(() => {
    if (prompts.length === 0) return INITIAL_CURATED_PROMPTS[0];
    return prompts[activePromptIndex] || prompts[0];
  }, [prompts, activePromptIndex]);

  useEffect(() => {
    setImportedImageUrl(null);
  }, [activePrompt]);

  // Load cloistered gallery for activePrompt
  useEffect(() => {
    const loadGallery = async () => {
      if (!activePrompt || !activePrompt.id) return;
      setGalleryLoading(true);
      try {
        const q = query(
          collection(db, "drawings"),
          where("prompt_id", "==", activePrompt.id),
          where("status", "==", "APPROVED")
        );
        const snap = await getDocs(q);
        const list: Array<{ id: string; imageUrl: string; userId: string; submissionId: string }> = [];
        
        for (const d of snap.docs) {
          const data = d.data();
          const url = data.image_url || data.imageUrl || "";
          if (url) {
            list.push({
              id: d.id,
              submissionId: d.id,
              userId: data.user_id,
              imageUrl: url,
            });
          }
        }
        setGalleryDrawings(list);
      } catch (err) {
        console.error("Error loading gallery:", err);
        setGalleryDrawings([]);
      } finally {
        setGalleryLoading(false);
      }
    };
    loadGallery();
  }, [activePrompt]);

  // Canvas setup
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

  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const snap = canvas.toDataURL("image/webp", 0.85);
    setHistory((prev) => [...prev.slice(-12), snap]);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    fillPaper(ctx, canvas.width, canvas.height);
    saveHistory();
  }, [activePrompt, fillPaper, saveHistory]);

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
    saveHistory();
  };

  const handleClearCanvas = () => {
    setImportedImageUrl(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    fillPaper(ctx, canvas.width, canvas.height);
    saveHistory();
  };

  // Submit drawing directly to Firestore
  const processAndSubmitImage = async (dataUrl: string) => {
    if (!currentUser) {
      setSubmissionError("Veuillez vous connecter pour soumettre votre dessin.");
      return;
    }
    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const subId = `${activePrompt.id}_${currentUser.uid}`;
      const subDocRef = doc(db, "drawings", subId);
      const subData: DrawingSubmission = {
        id: subId,
        prompt_id: activePrompt.id,
        user_id: currentUser.uid,
        storage_path: `firestore_direct/${subId}.webp`,
        image_url: dataUrl,
        status: "PENDING",
        rejection_reason: null,
      };

      await setDoc(subDocRef, {
        ...subData,
        created_at: serverTimestamp(),
      });

      setUserSubmissionsMap((prev) => ({
        ...prev,
        [activePrompt.id]: subData,
      }));

      if (userRole === "admin") {
        await loadPendingSubmissions();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur inattendue lors de l'envoi.";
      setSubmissionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 700;
        const MAX_HEIGHT = 500;
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
          const compressedDataUrl = canvas.toDataURL("image/webp", 0.75);
          setImportedImageUrl(compressedDataUrl);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleManualSubmit = () => {
    if (importedImageUrl) {
      processAndSubmitImage(importedImageUrl);
    } else {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const url = canvas.toDataURL("image/webp", 0.75);
      processAndSubmitImage(url);
    }
  };

  // Admin Actions for Manual Moderation
  const handleAdminApprove = async (sub: DrawingSubmission) => {
    try {
      const subRef = doc(db, "drawings", sub.id);
      await updateDoc(subRef, { status: "APPROVED", rejection_reason: null });
      await loadPendingSubmissions();
      if (sub.user_id === currentUser?.uid) {
        setUserSubmissionsMap((prev) => ({
          ...prev,
          [sub.prompt_id]: { ...sub, status: "APPROVED" },
        }));
      }
    } catch (err) {
      console.error("Error approving submission:", err);
    }
  };

  const handleAdminReject = async (sub: DrawingSubmission) => {
    if (!rejectionReasonInput.trim()) {
      alert("Veuillez saisir un motif de refus.");
      return;
    }
    try {
      const subRef = doc(db, "drawings", sub.id);
      await updateDoc(subRef, {
        status: "REJECTED",
        rejection_reason: rejectionReasonInput.trim(),
      });

      setRejectingSubId(null);
      setRejectionReasonInput("");
      await loadPendingSubmissions();

      if (sub.user_id === currentUser?.uid) {
        setUserSubmissionsMap((prev) => ({
          ...prev,
          [sub.prompt_id]: { ...sub, status: "REJECTED", rejection_reason: rejectionReasonInput.trim() },
        }));
      }
    } catch (err) {
      console.error("Error rejecting submission:", err);
    }
  };

  // Admin Retraction of Approved Drawing & Demotion
  const handleAdminRetractDrawing = async () => {
    if (!retractingDrawing || !retractionReasonInput.trim()) {
      alert("Veuillez saisir un motif de retrait.");
      return;
    }
    try {
      const subRef = doc(db, "drawings", retractingDrawing.id);
      await deleteDoc(subRef);

      // Remove from user submissions map locally if it affects current view
      setUserSubmissionsMap((prev) => {
        const next = { ...prev };
        delete next[retractingDrawing.promptId];
        return next;
      });

      setGalleryDrawings((prev) => prev.filter((item) => item.submissionId !== retractingDrawing.id));
      setRetractingDrawing(null);
      setRetractionReasonInput("");
      alert("Dessin retiré avec succès et utilisateur rétrogradé sur cette étape.");
    } catch (err) {
      console.error("Error retracting drawing:", err);
    }
  };

  // Admin Prompt CRUD
  const handleSavePrompt = async () => {
    if (!promptTitleInput.trim()) return;
    try {
      // Check if this is an existing prompt in state
      const existing = prompts.find((p) => p.id === editingPrompt?.id);
      const pId = existing ? existing.id : `prompt-${Date.now()}`;
      const order = existing ? existing.orderIndex : prompts.length + 1;

      const newPrompt: DrawingPrompt = {
        id: pId,
        orderIndex: order,
        title: promptTitleInput.trim(),
        category: promptCategoryInput,
        difficulty: promptDifficultyInput,
      };

      await setDoc(doc(db, "prompts", pId), newPrompt);
      setPrompts((prev) => {
        if (existing) {
          return prev.map((p) => (p.id === pId ? newPrompt : p));
        }
        return [...prev, newPrompt];
      });

      setEditingPrompt(null);
      setPromptTitleInput("");
    } catch (err) {
      console.error("Error saving prompt:", err);
    }
  };

  const handleDeletePrompt = async (pId: string) => {
    if (!confirm("Voulez-vous vraiment supprimer ce sujet ?")) return;
    try {
      await deleteDoc(doc(db, "prompts", pId));
      setPrompts((prev) => prev.filter((p) => p.id !== pId));
    } catch (err) {
      console.error("Error deleting prompt:", err);
    }
  };

  const handleMovePromptOrder = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= prompts.length) return;

    const newPrompts = [...prompts];
    const temp = newPrompts[index];
    newPrompts[index] = newPrompts[targetIndex];
    newPrompts[targetIndex] = temp;

    // Re-index orderIndex
    const reindexed = newPrompts.map((p, idx) => ({ ...p, orderIndex: idx + 1 }));
    setPrompts(reindexed);

    for (const p of reindexed) {
      await setDoc(doc(db, "prompts", p.id), p);
    }
  };

  const handleGeneratePrompts = async () => {
    setIsGeneratingPrompts(true);
    setPromptError(null);
    const themeToUse = selectedTheme === "custom" && customThemeInput.trim() ? customThemeInput.trim() : selectedTheme;

    try {
      const res = await fetch("/api/prompts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 6, theme: themeToUse }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de génération.");

      if (Array.isArray(data) && data.length > 0) {
        const newPrompts: DrawingPrompt[] = data.map((d: any, idx: number) => ({
          id: `prompt-${Date.now()}-${idx}`,
          orderIndex: prompts.length + idx + 1,
          title: d.title,
          category: d.category,
          difficulty: d.difficulty,
        }));
        for (const p of newPrompts) {
          await setDoc(doc(db, "prompts", p.id), p);
        }
        setPrompts((prev) => [...prev, ...newPrompts]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur inattendue.";
      setPromptError(msg);
    } finally {
      setIsGeneratingPrompts(false);
    }
  };

  const strictJsonString = useMemo(() => JSON.stringify(prompts, null, 2), [prompts]);

  // Landing Page if not logged in
  if (!currentUser) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-stone-900">
        <header className="flex items-center justify-between px-6 lg:px-12 py-5 border-b border-stone-200 bg-[#FAF8F5]/90 backdrop-blur-sm">
          <div className="text-xl font-bold tracking-tight text-stone-900 font-display">
            ArtGuard AI
          </div>
          <button
            type="button"
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-xl transition-colors cursor-pointer shadow-sm"
          >
            <User className="w-4 h-4" />
            Connexion / Inscription Google
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center max-w-4xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100/80 text-amber-900 text-xs font-medium border border-amber-200">
            <Sparkles className="w-3.5 h-3.5 text-amber-700" />
            Atelier de dessin collectif modéré par l'administrateur
          </div>

          <h1 className="text-4xl sm:text-6xl font-bold font-display tracking-tight text-stone-900 leading-tight" style={{ textWrap: "balance" }}>
            Exprimez votre créativité dans un espace protégé et bienveillant.
          </h1>

          <p className="text-base sm:text-lg text-stone-600 max-w-2xl leading-relaxed">
            Chaque dessin soumis est vérifié manuellement par l'administrateur avant de valider votre progression et d'ouvrir l'accès aux galeries exclusives.
          </p>

          <div className="pt-4">
            <button
              type="button"
              onClick={() => signInWithPopup(auth, googleProvider)}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 text-sm font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-xl transition-colors cursor-pointer shadow-md"
            >
              <User className="w-4 h-4" />
              Rejoindre l'atelier avec Google
            </button>
          </div>
        </main>

        <footer className="py-6 text-center text-xs text-stone-500 border-t border-stone-200 bg-white">
          ArtGuard AI · Plateforme de dessin collectif modérée
        </footer>
      </div>
    );
  }

  const currentSub = userSubmissionsMap[activePrompt.id];
  const isApproved = currentSub?.status === "APPROVED";
  const isPending = currentSub?.status === "PENDING";
  const isRejected = currentSub?.status === "REJECTED";

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-stone-900">
      {/* Top Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 lg:px-10 py-4 bg-[#FAF8F5]/95 backdrop-blur-sm border-b border-stone-200">
        <div className="flex items-center gap-4">
          <a href="/" className="text-xl font-bold tracking-tight text-stone-900 font-display whitespace-nowrap shrink-0">
            ArtGuard AI <span className="text-xs font-normal text-stone-500">· Atelier Collectif</span>
          </a>

          {userRole === "admin" && (
            <div className="flex items-center gap-1 p-1 bg-stone-200 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveAdminTab("atelier")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeAdminTab === "atelier" ? "bg-white text-stone-900 shadow-xs" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                Atelier (Utilisateur)
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveAdminTab("moderation");
                  loadPendingSubmissions();
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeAdminTab === "moderation" ? "bg-white text-stone-900 shadow-xs" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-800" />
                Modération ({pendingSubmissions.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveAdminTab("prompts")}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeAdminTab === "prompts" ? "bg-white text-stone-900 shadow-xs" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <ListOrdered className="w-3.5 h-3.5 text-amber-800" />
                Gestion Sujets ({prompts.length})
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 bg-stone-100 px-3 py-1.5 rounded-lg">
            <User className="w-3.5 h-3.5 text-emerald-800" />
            {currentUser.displayName || currentUser.email} ({userRole === "admin" ? "Admin" : "Participant"})
          </span>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 hover:bg-stone-50 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Déconnexion
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-[1380px] mx-auto px-6 lg:px-10 py-8 space-y-12">
        {userRole === "admin" && activeAdminTab === "moderation" ? (
          /* ADMIN MODERATION PANEL */
          <section className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-stone-200">
              <div>
                <h1 className="text-2xl font-semibold text-stone-900">File d'attente de modération manuelle</h1>
                <p className="text-xs text-stone-500">Validez ou refusez les dessins soumis par les participants.</p>
              </div>
              <button
                type="button"
                onClick={loadPendingSubmissions}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Actualiser
              </button>
            </div>

            {pendingSubmissions.length === 0 ? (
              <div className="p-12 bg-white border border-stone-200 rounded-xl text-center space-y-2">
                <CheckSquare className="w-8 h-8 text-emerald-700 mx-auto" />
                <h3 className="text-sm font-semibold text-stone-900">Aucun dessin en attente de modération</h3>
                <p className="text-xs text-stone-500">Tous les dessins soumis ont été traités.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pendingSubmissions.map((sub) => {
                  const matchingPrompt = prompts.find((p) => p.id === sub.prompt_id);
                  return (
                    <div key={sub.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden p-4 space-y-4 shadow-xs flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-stone-500 font-mono">
                          <span>Sujet : {matchingPrompt?.title || sub.prompt_id}</span>
                          <span className="text-amber-700 font-bold">PENDING</span>
                        </div>
                        <div className="aspect-[4/3] bg-stone-100 rounded-lg overflow-hidden border border-stone-200">
                          <img src={sub.image_url} alt="Dessin à modérer" className="w-full h-full object-cover" />
                        </div>
                      </div>

                      {rejectingSubId === sub.id ? (
                        <div className="space-y-2 pt-2 border-t border-stone-100">
                          <input
                            type="text"
                            value={rejectionReasonInput}
                            onChange={(e) => setRejectionReasonInput(e.target.value)}
                            placeholder="Motif du refus obligatoire..."
                            className="w-full px-3 py-1.5 text-xs border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleAdminReject(sub)}
                              className="flex-1 px-3 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg cursor-pointer"
                            >
                              Confirmer le refus
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingSubId(null);
                                setRejectionReasonInput("");
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg cursor-pointer"
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
                          <button
                            type="button"
                            onClick={() => handleAdminApprove(sub)}
                            className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Valider
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingSubId(sub.id);
                              setRejectionReasonInput("");
                            }}
                            className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg cursor-pointer"
                          >
                            <XCircle className="w-4 h-4" />
                            Refuser
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : userRole === "admin" && activeAdminTab === "prompts" ? (
          /* ADMIN PROMPT MANAGEMENT PANEL */
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
              <div>
                <h1 className="text-2xl font-semibold text-stone-900">Gestion Avancée des Sujets (CRUD)</h1>
                <p className="text-xs text-stone-500">Créez, éditez, réordonnez ou supprimez les étapes de l'atelier.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPrompt({ id: `prompt-${Date.now()}`, orderIndex: prompts.length + 1, title: "", category: "imagination", difficulty: "facile" });
                    setPromptTitleInput("");
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-lg cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Nouveau sujet
                </button>
                <button
                  type="button"
                  disabled={isGeneratingPrompts}
                  onClick={handleGeneratePrompts}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 text-amber-800" />
                  {isGeneratingPrompts ? "Génération Flash..." : "Générer via Flash IA"}
                </button>
              </div>
            </div>

            {editingPrompt && (
              <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl space-y-4">
                <h3 className="text-sm font-bold text-amber-900">
                  {prompts.some((p) => p.id === editingPrompt.id) ? "Éditer le sujet" : "Créer un nouveau sujet"}
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">Consigne du sujet</label>
                    <input
                      type="text"
                      value={promptTitleInput}
                      onChange={(e) => setPromptTitleInput(e.target.value)}
                      placeholder="Ex: Dessine une tasse de thé magique..."
                      className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-900"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-stone-700 mb-1">Catégorie</label>
                      <select
                        value={promptCategoryInput}
                        onChange={(e) => setPromptCategoryInput(e.target.value as any)}
                        className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg bg-white focus:outline-none"
                      >
                        <option value="imagination">Imagination absurde</option>
                        <option value="observation">Dessin d'observation</option>
                        <option value="technique">Défi technique</option>
                        <option value="poetique">Interprétation poétique</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-700 mb-1">Difficulté</label>
                      <select
                        value={promptDifficultyInput}
                        onChange={(e) => setPromptDifficultyInput(e.target.value as any)}
                        className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg bg-white focus:outline-none"
                      >
                        <option value="facile">Facile</option>
                        <option value="moyen">Moyen</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleSavePrompt}
                      className="px-4 py-2 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-lg cursor-pointer"
                    >
                      Enregistrer
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingPrompt(null)}
                      className="px-4 py-2 text-xs font-medium text-stone-600 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg cursor-pointer"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {prompts.map((p, idx) => (
                <div key={p.id} className="p-4 bg-white border border-stone-200 rounded-xl flex items-center justify-between gap-4 shadow-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-stone-400">#{idx + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-stone-900">{p.title}</p>
                      <span className="text-[10px] font-mono text-stone-500 uppercase">{p.category} · {p.difficulty}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMovePromptOrder(idx, "up")}
                      className="p-1.5 text-stone-600 hover:bg-stone-100 rounded disabled:opacity-30 cursor-pointer"
                      title="Monter"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={idx === prompts.length - 1}
                      onClick={() => handleMovePromptOrder(idx, "down")}
                      className="p-1.5 text-stone-600 hover:bg-stone-100 rounded disabled:opacity-30 cursor-pointer"
                      title="Descendre"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPrompt(p);
                        setPromptTitleInput(p.title);
                        setPromptCategoryInput(p.category);
                        setPromptDifficultyInput(p.difficulty);
                      }}
                      className="p-1.5 text-stone-700 hover:bg-stone-100 rounded cursor-pointer"
                      title="Éditer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePrompt(p.id)}
                      className="p-1.5 text-red-700 hover:bg-red-50 rounded cursor-pointer"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          /* USER ATELIER VIEW */
          <>
            {/* Sequential Progression Timeline */}
            <section className="space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-stone-200">
                <div className="space-y-2 max-w-2xl">
                  <div className="flex items-center gap-2 text-xs font-medium text-stone-500">
                    <span>Sujet Actif Unique</span>
                    <span aria-hidden="true">·</span>
                    <span>Modération Manuelle Administrateur</span>
                    <span aria-hidden="true">·</span>
                    <span>Anonymat Garanti</span>
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-semibold text-stone-900 tracking-tight" style={{ textWrap: "balance" }}>
                    Atelier de dessin collectif et bienveillant
                  </h1>
                  <p className="text-sm sm:text-base text-stone-600 leading-relaxed">
                    Soumettez votre dessin. L'administrateur l'examinera pour valider votre étape et débloquer le sujet suivant.
                  </p>
                </div>
              </div>

              {/* Timeline */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-stone-700">
                  Votre progression dans l'atelier
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {prompts.map((p, index) => {
                    const sub = userSubmissionsMap[p.id];
                    const isApproved = sub?.status === "APPROVED";
                    const isUnlocked = userRole === "admin" || index === 0 || Boolean(userSubmissionsMap[prompts[index - 1]?.id]?.status === "APPROVED");
                    const isActive = index === activePromptIndex;

                    if (userRole !== "admin" && !isUnlocked && !isActive && index > activePromptIndex) {
                      return null;
                    }

                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!isUnlocked && userRole !== "admin"}
                        onClick={() => setActivePromptIndex(index)}
                        className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-3 relative overflow-hidden cursor-pointer ${
                          isActive
                            ? "border-amber-900 bg-amber-50/60 ring-2 ring-amber-900/20 shadow-xs"
                            : isUnlocked
                              ? "border-stone-200 bg-white hover:border-stone-300"
                              : "border-stone-200 bg-stone-100/70 opacity-65 cursor-not-allowed"
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-stone-500">
                            <span className="font-mono font-bold">Étape 0{index + 1}</span>
                            {isApproved ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                            ) : sub?.status === "PENDING" ? (
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                            ) : isUnlocked ? (
                              <Unlock className="w-3.5 h-3.5 text-stone-600" />
                            ) : (
                              <Lock className="w-3.5 h-3.5 text-stone-400" />
                            )}
                          </div>
                          <p className="text-xs font-semibold text-stone-900 line-clamp-2">
                            {p.title}
                          </p>
                        </div>

                        <div className="text-[10px] font-mono text-stone-500 pt-1 border-t border-stone-200/60 flex items-center justify-between">
                          <span>{p.category}</span>
                          <span>{isApproved ? "Validé" : sub?.status === "PENDING" ? "En attente" : isActive ? "En cours" : "Déverrouillé"}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Active Drawing Pad & Upload / Pending State / Rejection State */}
            <section className="space-y-6 pt-6 border-t border-stone-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                    Sujet Actif en cours
                  </span>
                  <h2 className="text-xl font-semibold text-stone-900 mt-0.5">
                    « {activePrompt.title} »
                  </h2>
                </div>

                {!isPending && (
                  <div className="flex items-center gap-2">
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
                      Importer une image
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleManualSubmit}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {isSubmitting ? "Envoi en cours..." : "Envoi"}
                    </button>
                  </div>
                )}
              </div>

              {/* Status Banners */}
              {isPending && (
                <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-4 text-amber-900">
                  <Clock className="w-6 h-6 text-amber-700 shrink-0" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold">En attente de validation par l'administrateur</h3>
                    <p className="text-xs text-amber-800">Votre dessin a bien été soumis. La galerie et le sujet suivant sont temporairement verrouillés.</p>
                  </div>
                </div>
              )}

              {isRejected && (
                <div className="p-6 bg-red-50 border border-red-200 rounded-xl flex items-center gap-4 text-red-900">
                  <AlertCircle className="w-6 h-6 text-red-700 shrink-0" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold">Votre dessin n'a pas été validé.</h3>
                    <p className="text-xs text-red-800">
                      Motif : <strong className="font-semibold">{currentSub?.rejection_reason || "Non spécifié"}</strong>. Veuillez soumettre un nouveau dessin ci-dessous.
                    </p>
                  </div>
                </div>
              )}

              {/* Canvas or Imported Image Preview (Hidden if pending) */}
              {!isPending && (
                <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4 shadow-xs">
                  {importedImageUrl ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-stone-500">
                        <span className="font-semibold text-emerald-800">Image importée prête pour l'envoi</span>
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
                    <>
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
                          <button type="button" onClick={() => {}} className="p-1.5 text-stone-700 hover:bg-stone-200 rounded cursor-pointer" title="Annuler">
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={handleClearCanvas} className="p-1.5 text-stone-700 hover:bg-stone-200 rounded cursor-pointer" title="Effacer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

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
                    </>
                  )}

                  {submissionError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                      {submissionError}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Cloistered Gallery (Locked if not approved) */}
            <section className="space-y-6 pt-6 border-t border-stone-200">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
                    Galerie du Sujet {activePromptIndex + 1}
                  </span>
                  <h2 className="text-2xl font-semibold text-stone-900">
                    Fresque intemporelle : « {activePrompt.title} »
                  </h2>
                </div>
              </div>

              {!isApproved && userRole !== "admin" ? (
                <div className="p-12 bg-white border border-stone-200 rounded-xl text-center space-y-2">
                  <Lock className="w-8 h-8 text-amber-800 mx-auto" />
                  <h3 className="text-sm font-semibold text-stone-900">Galerie verrouillée</h3>
                  <p className="text-xs text-stone-500">
                    Votre dessin doit être validé par l'administrateur pour déverrouiller et découvrir la galerie de ce sujet.
                  </p>
                </div>
              ) : galleryLoading ? (
                <div className="p-12 text-center text-xs text-stone-400">Chargement de la galerie...</div>
              ) : galleryDrawings.length === 0 ? (
                <div className="p-12 bg-white border border-stone-200 rounded-xl text-center space-y-2">
                  <p className="text-sm font-medium text-stone-700">Aucun dessin validé pour ce sujet pour l'instant.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {galleryDrawings.map((item) => (
                    <div key={item.id} className="relative group aspect-square bg-white border border-stone-200 rounded-xl overflow-hidden shadow-xs hover:shadow-md transition-shadow">
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
                      {userRole === "admin" && (
                        <button
                          type="button"
                          onClick={() => {
                            setRetractingDrawing({ id: item.submissionId, promptId: activePrompt.id, userId: item.userId });
                            setRetractionReasonInput("");
                          }}
                          className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md"
                          title="Retirer ce dessin (Rétrograder l'utilisateur)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

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

      {/* Admin Retraction Modal */}
      {retractingDrawing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-stone-900">Retrait a posteriori du dessin</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Le dessin sera supprimé de la fresque et l'utilisateur sera rétrogradé sur cette étape (la galerie sera verrouillée et il devra soumettre un nouveau dessin).
            </p>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-stone-700">Motif du retrait (obligatoire)</label>
              <input
                type="text"
                value={retractionReasonInput}
                onChange={(e) => setRetractionReasonInput(e.target.value)}
                placeholder="Ex: Dessin hors-sujet ou signalement..."
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleAdminRetractDrawing}
                className="flex-1 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg cursor-pointer"
              >
                Confirmer le retrait
              </button>
              <button
                type="button"
                onClick={() => setRetractingDrawing(null)}
                className="px-4 py-2 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg cursor-pointer"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="border-t border-stone-200 bg-white py-6 px-6 lg:px-10 mt-12">
        <div className="max-w-[1380px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stone-800">ArtGuard AI</span>
            <span aria-hidden="true">·</span>
            <span>Atelier de dessin collectif avec gestion des sujets et modération a posteriori</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Lightbox Zoom Tactile</span>
            <span aria-hidden="true">·</span>
            <span>Anonymat Intemporel</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
