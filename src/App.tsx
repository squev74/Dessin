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
  Users,
  Key,
  FolderPlus,
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
  THEME_PRESETS,
} from "./utils/curatedPrompts";
import { generatePromptsClientSide, analyzeDrawingClientSide } from "./utils/geminiClient";

interface Challenge {
  id: string;
  title: string;
  description: string;
  creator_id: string;
  creator_name: string;
  is_public: boolean;
  invite_code?: string;
  is_open?: boolean;
  max_participants?: number;
  participants?: string[];
  submission_mode?: "canvas" | "upload" | "both";
  created_at?: any;
}

interface DrawingSubmission {
  id: string;
  challenge_id: string;
  prompt_id: string;
  user_id: string;
  storage_path: string;
  image_url: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejection_reason?: string | null;
  ai_feedback?: { encouragement: string; tips: string[] } | null;
  created_at?: any;
}

const PALETTE = [
  { name: "Fusain Noir", hex: "#1C1917" },
  { name: "Outremer", hex: "#1D4ED8" },
  { name: "Vert Forêt", hex: "#15803D" },
  { name: "Ocre Solaire", hex: "#D97706" },
  { name: "Terre Cuite", hex: "#DC2626" },
  { name: "Violet Doux", hex: "#7C3AED" },
];

export function App() {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [userProfile, setUserProfile] = useState<{ joinedChallenges?: string[] } | null>(null);

  // Challenges State
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null);
  const [activeTab, setActiveTab] = useState<"atelier" | "moderation" | "prompts">("atelier");

  // Create Challenge Modal
  const [showCreateChallengeModal, setShowCreateChallengeModal] = useState<boolean>(false);
  const [newChallengeTitle, setNewChallengeTitle] = useState<string>("");
  const [newChallengeDesc, setNewChallengeDesc] = useState<string>("");
  const [newChallengeIsPublic, setNewChallengeIsPublic] = useState<boolean>(true);
  const [newChallengeCode, setNewChallengeCode] = useState<string>("");
  const [newChallengeMaxParticipants, setNewChallengeMaxParticipants] = useState<number>(50);
  const [newChallengeSubmissionMode, setNewChallengeSubmissionMode] = useState<"canvas" | "upload" | "both">("both");

  // Join Private Challenge State
  const [joinCodeInput, setJoinCodeInput] = useState<string>("");
  const [joinError, setJoinError] = useState<string | null>(null);

  // Prompts & Sequential progression for active challenge
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

  // Imported image preview state
  const [importedImageUrl, setImportedImageUrl] = useState<string | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState<boolean>(false);

  // AI Analysis state
  const [showAiModal, setShowAiModal] = useState<boolean>(false);
  const [aiCreationType, setAiCreationType] = useState<"numérique" | "traditionnel">("numérique");
  const [aiMedium, setAiMedium] = useState<string>("Crayon à papier");
  const [aiSupport, setAiSupport] = useState<string>("Papier blanc");
  const [aiIntention, setAiIntention] = useState<string>("");
  const [aiLevel, setAiLevel] = useState<string>("Intermédiaire");
  const [aiAnalyzing, setAiAnalyzing] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleRequestAiAnalysis = async () => {
    const sub = userSubmissionsMap[activePrompt.id];
    if (!sub || sub.status !== "APPROVED") return;

    setAiAnalyzing(true);
    setAiError(null);

    try {
      let apiKey = import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem("artguard_gemini_key");
      if (!apiKey) {
        apiKey = prompt("Veuillez entrer votre clé API Gemini pour l'analyse :") || "";
        if (apiKey) {
          localStorage.setItem("artguard_gemini_key", apiKey);
        } else {
          throw new Error("Clé API Gemini requise.");
        }
      }

      const feedback = await analyzeDrawingClientSide(apiKey, {
        image_url: sub.image_url,
        prompt_title: activePrompt.title,
        creation_type: aiCreationType,
        medium: aiCreationType === "traditionnel" ? aiMedium : "Dessin numérique",
        support: aiCreationType === "traditionnel" ? aiSupport : "Écran / Canvas numérique",
        intention: aiIntention,
        level: aiLevel,
      });

      const subRef = doc(db, "drawings", sub.id);
      await updateDoc(subRef, { ai_feedback: feedback });

      setUserSubmissionsMap((prev) => ({
        ...prev,
        [activePrompt.id]: { ...sub, ai_feedback: feedback },
      }));

      setShowAiModal(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur lors de l'analyse IA.";
      setAiError(msg);
    } finally {
      setAiAnalyzing(false);
    }
  };

  // Gallery for active prompt
  const [galleryDrawings, setGalleryDrawings] = useState<Array<{ id: string; imageUrl: string; userId: string; submissionId: string }>>([]);
  const [galleryLoading, setGalleryLoading] = useState<boolean>(false);

  // Lightbox & Zoom state
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null);
  const [initialPinchDist, setInitialPinchDist] = useState<number | null>(null);
  const [baseZoomScale, setBaseZoomScale] = useState<number>(1);

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxImageUrl(galleryDrawings[index]?.imageUrl || null);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handlePrevLightbox = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (galleryDrawings.length === 0) return;
    const newIdx = (lightboxIndex - 1 + galleryDrawings.length) % galleryDrawings.length;
    setLightboxIndex(newIdx);
    setLightboxImageUrl(galleryDrawings[newIdx].imageUrl);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleNextLightbox = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (galleryDrawings.length === 0) return;
    const newIdx = (lightboxIndex + 1) % galleryDrawings.length;
    setLightboxIndex(newIdx);
    setLightboxImageUrl(galleryDrawings[newIdx].imageUrl);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setInitialPinchDist(dist);
      setBaseZoomScale(zoomScale);
    } else if (e.touches.length === 1) {
      setTouchStartPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      if (zoomScale > 1) {
        setIsDraggingImage(true);
        setDragStart({ x: e.touches[0].clientX - panOffset.x, y: e.touches[0].clientY - panOffset.y });
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDist !== null) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scaleFactor = dist / initialPinchDist;
      const newScale = Math.min(Math.max(baseZoomScale * scaleFactor, 1), 4);
      setZoomScale(newScale);
      if (newScale <= 1) {
        setPanOffset({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1) {
      if (isDraggingImage && zoomScale > 1) {
        setPanOffset({ x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      setInitialPinchDist(null);
    }
    if (e.touches.length === 0) {
      setIsDraggingImage(false);
      if (zoomScale === 1 && touchStartPos && e.changedTouches.length > 0) {
        const touchEnd = e.changedTouches[0];
        const diffX = touchEnd.clientX - touchStartPos.x;
        const diffY = Math.abs(touchEnd.clientY - touchStartPos.y);

        if (Math.abs(diffX) > 50 && diffY < 100) {
          if (diffX > 0) {
            handlePrevLightbox();
          } else {
            handleNextLightbox();
          }
        }
      }
      setTouchStartPos(null);
    }
  };

  // Creator Moderation Pending Submissions
  const [pendingSubmissions, setPendingSubmissions] = useState<DrawingSubmission[]>([]);
  const [rejectingSubId, setRejectingSubId] = useState<string | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>("");

  // Creator Prompt CRUD state
  const [editingPrompt, setEditingPrompt] = useState<(DrawingPrompt & { challenge_id?: string }) | null>(null);
  const [promptTitleInput, setPromptTitleInput] = useState<string>("");
  const [promptCategoryInput, setPromptCategoryInput] = useState<DrawingPrompt["category"]>("imagination");
  const [promptDifficultyInput, setPromptDifficultyInput] = useState<DrawingPrompt["difficulty"]>("facile");

  // Creator Retraction Modal state
  const [retractingDrawing, setRetractingDrawing] = useState<{ id: string; promptId: string; userId: string } | null>(null);
  const [retractionReasonInput, setRetractionReasonInput] = useState<string>("");

  // AI Prompt Generator state
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState<boolean>(false);
  const [selectedTheme, setSelectedTheme] = useState<string>("libre");
  const [customThemeInput, setCustomThemeInput] = useState<string>("");
  const [promptError, setPromptError] = useState<string | null>(null);

  // Notification & Stats States
  const [creatorPendingMap, setCreatorPendingMap] = useState<Record<string, number>>({});
  const [participantApprovedMap, setParticipantApprovedMap] = useState<Record<string, string[]>>({});
  const [challengeStatsMap, setChallengeStatsMap] = useState<Record<string, { totalDrawings: number; userDrawings: number; totalPrompts: number }>>({});

  useEffect(() => {
    if (!currentUser || challenges.length === 0) return;
    const computeNotificationsAndStats = async () => {
      try {
        const pendingMap: Record<string, number> = {};
        const approvedMap: Record<string, string[]> = {};
        const statsMap: Record<string, { totalDrawings: number; userDrawings: number; totalPrompts: number }> = {};

        const viewedPending = (userProfile as any)?.viewedPendingChallenges || {};
        const viewedApproved = (userProfile as any)?.viewedApprovedSubmissions || {};

        const drawingsSnap = await getDocs(collection(db, "drawings"));
        const promptsSnap = await getDocs(collection(db, "prompts"));

        const promptCounts: Record<string, number> = {};
        promptsSnap.forEach((docSnap) => {
          const p = docSnap.data();
          if (p.challenge_id) {
            promptCounts[p.challenge_id] = (promptCounts[p.challenge_id] || 0) + 1;
          }
        });

        const totalDrawingsMap: Record<string, number> = {};
        const userDrawingsMap: Record<string, number> = {};

        drawingsSnap.forEach((docSnap) => {
          const d = docSnap.data() as DrawingSubmission;
          const challId = d.challenge_id;
          if (!challId) return;

          totalDrawingsMap[challId] = (totalDrawingsMap[challId] || 0) + 1;
          if (d.user_id === currentUser.uid) {
            userDrawingsMap[challId] = (userDrawingsMap[challId] || 0) + 1;
          }

          const challenge = challenges.find((c) => c.id === challId);
          if (!challenge) return;

          // Creator notification: pending submissions by others
          if (challenge.creator_id === currentUser.uid && d.status === "PENDING" && d.user_id !== currentUser.uid) {
            pendingMap[challId] = (pendingMap[challId] || 0) + 1;
          }

          // Participant notification: approved submissions by current user
          if (challenge.creator_id !== currentUser.uid && d.user_id === currentUser.uid && d.status === "APPROVED") {
            const viewedPrompts = viewedApproved[challId] || [];
            if (!viewedPrompts.includes(d.prompt_id)) {
              if (!approvedMap[challId]) approvedMap[challId] = [];
              if (!approvedMap[challId].includes(d.prompt_id)) {
                approvedMap[challId].push(d.prompt_id);
              }
            }
          }
        });

        challenges.forEach((c) => {
          statsMap[c.id] = {
            totalDrawings: totalDrawingsMap[c.id] || 0,
            userDrawings: userDrawingsMap[c.id] || 0,
            totalPrompts: promptCounts[c.id] || 6,
          };
        });

        setCreatorPendingMap(pendingMap);
        setParticipantApprovedMap(approvedMap);
        setChallengeStatsMap(statsMap);
      } catch (err) {
        console.error("Error computing notifications and stats:", err);
      }
    };

    computeNotificationsAndStats();
  }, [currentUser, challenges, userProfile]);

  const markPendingViewed = async (challengeId: string) => {
    if (!currentUser) return;
    const viewedPending = { ...((userProfile as any)?.viewedPendingChallenges || {}), [challengeId]: Date.now() };
    const updatedProfile = { ...(userProfile || {}), viewedPendingChallenges: viewedPending };
    setUserProfile(updatedProfile);
    setCreatorPendingMap((prev) => ({ ...prev, [challengeId]: 0 }));
    try {
      await updateDoc(doc(db, "users", currentUser.uid), { viewedPendingChallenges: viewedPending });
    } catch {
      await setDoc(doc(db, "users", currentUser.uid), { viewedPendingChallenges: viewedPending }, { merge: true });
    }
  };

  const markPromptApprovedViewed = async (challengeId: string, promptId: string) => {
    if (!currentUser) return;
    const viewedApproved = { ...((userProfile as any)?.viewedApprovedSubmissions || {}) };
    const promptList = viewedApproved[challengeId] || [];
    if (!promptList.includes(promptId)) {
      viewedApproved[challengeId] = [...promptList, promptId];
      const updatedProfile = { ...(userProfile || {}), viewedApprovedSubmissions: viewedApproved };
      setUserProfile(updatedProfile);
      setParticipantApprovedMap((prev) => {
        const currentList = prev[challengeId] || [];
        const newList = currentList.filter((id) => id !== promptId);
        return { ...prev, [challengeId]: newList };
      });
      try {
        await updateDoc(doc(db, "users", currentUser.uid), { viewedApprovedSubmissions: viewedApproved });
      } catch {
        await setDoc(doc(db, "users", currentUser.uid), { viewedApprovedSubmissions: viewedApproved }, { merge: true });
      }
    }
  };

  useEffect(() => {
    if (!activeChallenge || !currentUser) return;
    if (activeChallenge.creator_id === currentUser.uid) {
      markPendingViewed(activeChallenge.id);
    }
  }, [activeChallenge, currentUser]);



  const renderCanvasToolsAndCanvas = (isFullscreen = false) => (
    <div className={`space-y-3 ${isFullscreen ? "max-w-4xl w-full mx-auto flex-1 flex flex-col justify-center" : ""}`}>
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
              max={16}
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
          {!isFullscreen && (
            <button
              type="button"
              onClick={() => setIsCanvasFullscreen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors cursor-pointer shadow-xs"
              title="Plein écran"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Plein écran
            </button>
          )}
        </div>
      </div>

      <div className={`rounded-lg border border-stone-300 overflow-hidden bg-[#FAF8F5] ${isFullscreen ? "flex-1 flex items-center justify-center shadow-lg" : ""}`}>
        <canvas
          ref={canvasRef}
          width={isFullscreen ? 800 : 640}
          height={isFullscreen ? 600 : 380}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          className={`w-full ${isFullscreen ? "h-[70vh] sm:h-[78vh]" : "aspect-[16/10]"} cursor-crosshair touch-none block object-contain`}
        />
      </div>
    </div>
  );

  const generateUniqueCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "ART-";
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const joinChallenge = async (challenge: Challenge) => {
    if (!currentUser) return;

    if (challenge.is_open === false && challenge.creator_id !== currentUser.uid) {
      alert("Ce challenge est actuellement fermé par son créateur.");
      return;
    }

    const participants = challenge.participants || [];
    if (challenge.is_public && !participants.includes(currentUser.uid)) {
      const maxP = challenge.max_participants || 50;
      if (participants.length >= maxP) {
        alert(`Ce challenge public a atteint sa limite maximale de participants (${maxP}).`);
        return;
      }
    }

    const updatedParticipants = participants.includes(currentUser.uid) ? participants : [...participants, currentUser.uid];
    const challRef = doc(db, "challenges", challenge.id);
    try {
      await updateDoc(challRef, { participants: updatedParticipants });
    } catch {
      await setDoc(challRef, { participants: updatedParticipants }, { merge: true });
    }

    const currentJoined = userProfile?.joinedChallenges || [];
    if (!currentJoined.includes(challenge.id)) {
      const updatedJoined = [...currentJoined, challenge.id];
      const userDocRef = doc(db, "users", currentUser.uid);
      try {
        await updateDoc(userDocRef, { joinedChallenges: updatedJoined });
      } catch {
        await setDoc(userDocRef, { joinedChallenges: updatedJoined }, { merge: true });
      }
      setUserProfile((prev) => ({ ...(prev || {}), joinedChallenges: updatedJoined }));
    }

    const updatedChallenge = { ...challenge, participants: updatedParticipants };
    setChallenges((prev) => prev.map((c) => c.id === challenge.id ? updatedChallenge : c));
    setActiveChallenge(updatedChallenge);
  };

  const toggleChallengeOpen = async (challenge: Challenge, e: React.MouseEvent) => {
    e.stopPropagation();
    const newOpen = challenge.is_open === false ? true : false;
    const challRef = doc(db, "challenges", challenge.id);
    try {
      await updateDoc(challRef, { is_open: newOpen });
      setChallenges((prev) => prev.map((c) => c.id === challenge.id ? { ...c, is_open: newOpen } : c));
      if (activeChallenge?.id === challenge.id) {
        setActiveChallenge((prev) => prev ? { ...prev, is_open: newOpen } : null);
      }
    } catch (err) {
      console.error("Error toggling challenge status:", err);
    }
  };

  const deleteChallenge = async (challenge: Challenge, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer le challenge "${challenge.title}" ? Attention : TOUT sera supprimé de la base de données (le challenge, tous ses sujets et toutes les soumissions d'images associées). Cette action est irréversible.`)) {
      const challengeId = challenge.id;
      try {
        // 1. Delete drawings
        const drawingsQ = query(collection(db, "drawings"), where("challenge_id", "==", challengeId));
        const drawingsSnap = await getDocs(drawingsQ);
        for (const dSnap of drawingsSnap.docs) {
          await deleteDoc(doc(db, "drawings", dSnap.id));
        }

        // 2. Delete prompts
        const promptsQ = query(collection(db, "prompts"), where("challenge_id", "==", challengeId));
        const promptsSnap = await getDocs(promptsQ);
        for (const pSnap of promptsSnap.docs) {
          await deleteDoc(doc(db, "prompts", pSnap.id));
        }

        // 3. Delete challenge doc
        await deleteDoc(doc(db, "challenges", challengeId));

        // 4. Update local state so it is no longer displayed
        setChallenges((prev) => prev.filter((c) => c.id !== challengeId));
        if (activeChallenge?.id === challengeId) {
          setActiveChallenge(null);
        }
      } catch (err) {
        console.error("Error deleting challenge:", err);
        alert("Erreur lors de la suppression du challenge de la base de données.");
      }
    }
  };

  // Initialize Auth & Load Challenges
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Ensure user doc
        const userDocRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userDocRef);
        let profileData: any = {};
        if (!userSnap.exists()) {
          profileData = {
            email: user.email,
            displayName: user.displayName,
            joinedChallenges: [],
            createdAt: serverTimestamp(),
          };
          await setDoc(userDocRef, profileData);
        } else {
          profileData = userSnap.data();
        }
        setUserProfile(profileData);
        await loadChallenges();
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const loadChallenges = async () => {
    try {
      const snap = await getDocs(collection(db, "challenges"));
      let loaded: Challenge[] = [];
      snap.forEach((d) => {
        loaded.push({ id: d.id, ...(d.data() as any) });
      });

      // If no challenges exist, create a default "Challenge Initial"
      if (loaded.length === 0) {
        const defaultChallId = `challenge-initial-${Date.now()}`;
        const defaultChall: Challenge = {
          id: defaultChallId,
          title: "Challenge Initial & Rétrofit",
          description: "Atelier collectif par défaut pour tous les sujets et dessins initiaux.",
          creator_id: currentUser?.uid || "system",
          creator_name: currentUser?.displayName || "Créateur",
          is_public: true,
          created_at: serverTimestamp(),
        };
        await setDoc(doc(db, "challenges", defaultChallId), defaultChall);
        loaded = [defaultChall];

        // Migrate any orphan prompts / drawings
        const promptsSnap = await getDocs(collection(db, "prompts"));
        for (const pd of promptsSnap.docs) {
          const pData = pd.data();
          if (!pData.challenge_id) {
            await updateDoc(doc(db, "prompts", pd.id), { challenge_id: defaultChallId });
          }
        }
        const drawingsSnap = await getDocs(collection(db, "drawings"));
        for (const dd of drawingsSnap.docs) {
          const dData = dd.data();
          if (!dData.challenge_id) {
            await updateDoc(doc(db, "drawings", dd.id), { challenge_id: defaultChallId });
          }
        }
      }

      setChallenges(loaded);
    } catch (err) {
      console.error("Error loading challenges:", err);
    }
  };

  // When activeChallenge changes, load its prompts and user submissions
  useEffect(() => {
    if (!activeChallenge || !currentUser) return;
    loadChallengeData(activeChallenge.id, currentUser.uid);
  }, [activeChallenge, currentUser]);

  const loadChallengeData = async (challengeId: string, uid: string) => {
    try {
      // Load prompts for this challenge
      const pQuery = query(collection(db, "prompts"), where("challenge_id", "==", challengeId));
      const pSnap = await getDocs(pQuery);
      let challengePrompts: DrawingPrompt[] = [];

      pSnap.forEach((d) => {
        challengePrompts.push(d.data() as DrawingPrompt);
      });

      // If none found for this challenge, check if there are orphan prompts to assign or create curated
      if (challengePrompts.length === 0) {
        const allPromptsSnap = await getDocs(collection(db, "prompts"));
        allPromptsSnap.forEach((d) => {
          const data = d.data() as DrawingPrompt & { challenge_id?: string };
          if (!data.challenge_id || data.challenge_id === challengeId) {
            challengePrompts.push(data);
          }
        });

        if (challengePrompts.length === 0) {
          challengePrompts = INITIAL_CURATED_PROMPTS.map((p, idx) => ({
            id: `prompt-${challengeId}-${idx + 1}`,
            challenge_id: challengeId,
            orderIndex: idx + 1,
            title: p.title,
            category: p.category,
            difficulty: p.difficulty,
          }));
        } else {
          challengePrompts = challengePrompts.map((p, idx) => ({
            ...p,
            challenge_id: challengeId,
            orderIndex: p.orderIndex || idx + 1,
          }));
        }

        for (const p of challengePrompts) {
          await setDoc(doc(db, "prompts", p.id), p);
        }
      }

      challengePrompts.sort((a, b) => a.orderIndex - b.orderIndex);
      setPrompts(challengePrompts);
      setActivePromptIndex(0);

      // Load user submissions for this challenge
      const subQuery = query(
        collection(db, "drawings"),
        where("challenge_id", "==", challengeId),
        where("user_id", "==", uid)
      );
      const subSnap = await getDocs(subQuery);
      const subMap: Record<string, DrawingSubmission> = {};
      subSnap.forEach((d) => {
        const data = d.data() as DrawingSubmission;
        subMap[data.prompt_id] = { ...data, id: d.id };
      });
      setUserSubmissionsMap(subMap);

      // If user is creator, load pending submissions
      if (activeChallenge?.creator_id === uid) {
        await loadPendingSubmissions(challengeId);
      }
    } catch (err) {
      console.error("Error loading challenge data:", err);
    }
  };

  const loadPendingSubmissions = async (challengeId: string) => {
    try {
      const q = query(
        collection(db, "drawings"),
        where("challenge_id", "==", challengeId),
        where("status", "==", "PENDING")
      );
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

  useEffect(() => {
    if (!activeChallenge || !activePrompt || !currentUser) return;
    if (activeChallenge.creator_id !== currentUser.uid) {
      markPromptApprovedViewed(activeChallenge.id, activePrompt.id);
    }
  }, [activePrompt, activeChallenge, currentUser]);

  // Load gallery for activePrompt
  useEffect(() => {
    const loadGallery = async () => {
      if (!activePrompt || !activePrompt.id || !activeChallenge) return;
      setGalleryLoading(true);
      try {
        const q = query(
          collection(db, "drawings"),
          where("challenge_id", "==", activeChallenge.id),
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
  }, [activePrompt, activeChallenge]);

  const handleCreateChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newChallengeTitle.trim()) return;

    try {
      const challId = `chall-${Date.now()}`;
      const challData: any = {
        id: challId,
        title: newChallengeTitle.trim(),
        description: newChallengeDesc.trim(),
        creator_id: currentUser.uid,
        creator_name: currentUser.displayName || currentUser.email || "Créateur",
        is_public: newChallengeIsPublic,
        is_open: true,
        submission_mode: newChallengeSubmissionMode,
        participants: [currentUser.uid],
        created_at: serverTimestamp(),
      };

      if (!newChallengeIsPublic) {
        if (!newChallengeCode.trim()) {
          alert("Veuillez fournir un code d'invitation secret pour le challenge privé.");
          return;
        }
        challData.invite_code = newChallengeCode.trim();
      } else {
        challData.max_participants = Math.min(50, Math.max(1, newChallengeMaxParticipants));
      }

      await setDoc(doc(db, "challenges", challId), challData);

      const chall: Challenge = {
        id: challId,
        title: newChallengeTitle.trim(),
        description: newChallengeDesc.trim(),
        creator_id: currentUser.uid,
        creator_name: currentUser.displayName || currentUser.email || "Créateur",
        is_public: newChallengeIsPublic,
        invite_code: challData.invite_code,
        is_open: true,
        max_participants: challData.max_participants,
        submission_mode: newChallengeSubmissionMode,
        participants: [currentUser.uid],
        created_at: new Date(),
      };

      // Create initial curated prompts for this new challenge
      const initialPrompts = INITIAL_CURATED_PROMPTS.map((p, idx) => ({
        id: `prompt-${challId}-${idx + 1}`,
        challenge_id: challId,
        orderIndex: idx + 1,
        title: p.title,
        category: p.category,
        difficulty: p.difficulty,
      }));

      for (const p of initialPrompts) {
        await setDoc(doc(db, "prompts", p.id), p);
      }

      setChallenges((prev) => [chall, ...prev]);
      setActiveChallenge(chall);
      setShowCreateChallengeModal(false);
      setNewChallengeTitle("");
      setNewChallengeDesc("");
      setNewChallengeIsPublic(true);
      setNewChallengeCode("");
      setNewChallengeMaxParticipants(50);
      setNewChallengeSubmissionMode("both");
    } catch (err) {
      console.error("Error creating challenge:", err);
      alert("Erreur lors de la création du challenge.");
    }
  };

  // Join Private Challenge handler
  const handleJoinPrivateChallenge = async () => {
    if (!joinCodeInput.trim()) return;
    const found = challenges.find(
      (c) => !c.is_public && c.invite_code?.toLowerCase() === joinCodeInput.trim().toLowerCase()
    );
    if (found) {
      await joinChallenge(found);
      setJoinCodeInput("");
      setJoinError(null);
    } else {
      setJoinError("Code d'invitation invalide ou challenge introuvable.");
    }
  };

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
    if (!canvas || !activeChallenge) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    fillPaper(ctx, canvas.width, canvas.height);
    saveHistory();
  }, [activePrompt, activeChallenge, fillPaper, saveHistory]);

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

  // Submit drawing
  const processAndSubmitImage = async (dataUrl: string) => {
    if (!currentUser || !activeChallenge) {
      setSubmissionError("Veuillez sélectionner un challenge et vous connecter.");
      return;
    }
    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const subId = `${activeChallenge.id}_${activePrompt.id}_${currentUser.uid}`;
      const subDocRef = doc(db, "drawings", subId);
      const subData: DrawingSubmission = {
        id: subId,
        challenge_id: activeChallenge.id,
        prompt_id: activePrompt.id,
        user_id: currentUser.uid,
        storage_path: `drawings/${subId}.webp`,
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

      if (currentUser.uid === activeChallenge.creator_id) {
        await loadPendingSubmissions(activeChallenge.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur lors de l'envoi.";
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

  // Creator Moderation Actions
  const handleCreatorApprove = async (sub: DrawingSubmission) => {
    if (!activeChallenge) return;
    try {
      const subRef = doc(db, "drawings", sub.id);
      await updateDoc(subRef, { status: "APPROVED", rejection_reason: null });
      await loadPendingSubmissions(activeChallenge.id);
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

  const handleCreatorReject = async (sub: DrawingSubmission) => {
    if (!activeChallenge) return;
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
      await loadPendingSubmissions(activeChallenge.id);

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

  // Creator Retract Approved Drawing
  const handleCreatorRetractDrawing = async () => {
    if (!retractingDrawing || !retractionReasonInput.trim()) {
      alert("Veuillez saisir un motif de retrait.");
      return;
    }
    try {
      const subRef = doc(db, "drawings", retractingDrawing.id);
      await deleteDoc(subRef);

      setUserSubmissionsMap((prev) => {
        const next = { ...prev };
        delete next[retractingDrawing.promptId];
        return next;
      });

      setGalleryDrawings((prev) => prev.filter((item) => item.submissionId !== retractingDrawing.id));
      setRetractingDrawing(null);
      setRetractionReasonInput("");
      alert("Dessin retiré avec succès et participant rétrogradé sur cette étape.");
    } catch (err) {
      console.error("Error retracting drawing:", err);
    }
  };

  // Creator Prompt CRUD
  const handleSavePrompt = async () => {
    if (!promptTitleInput.trim() || !activeChallenge) return;
    try {
      const existing = prompts.find((p) => p.id === editingPrompt?.id);
      const pId = existing ? existing.id : `prompt-${activeChallenge.id}-${Date.now()}`;
      const order = existing ? existing.orderIndex : prompts.length + 1;

      const newPrompt: DrawingPrompt & { challenge_id: string } = {
        id: pId,
        challenge_id: activeChallenge.id,
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

    const reindexed = newPrompts.map((p, idx) => ({ ...p, orderIndex: idx + 1 }));
    setPrompts(reindexed);

    for (const p of reindexed) {
      await setDoc(doc(db, "prompts", p.id), p);
    }
  };

  const handleGeneratePrompts = async () => {
    if (!activeChallenge) return;
    setIsGeneratingPrompts(true);
    setPromptError(null);
    const themeToUse = selectedTheme === "custom" && customThemeInput.trim() ? customThemeInput.trim() : selectedTheme;

    try {
      let apiKey = import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem("artguard_gemini_key");
      if (!apiKey) {
        apiKey = prompt("Veuillez entrer votre clé API Gemini pour générer les sujets :") || "";
        if (apiKey) {
          localStorage.setItem("artguard_gemini_key", apiKey);
        } else {
          throw new Error("Clé API Gemini requise.");
        }
      }

      const generated = await generatePromptsClientSide(apiKey, 6, themeToUse);
      const reindexed = generated.map((p, idx) => ({
        ...p,
        id: `prompt-${activeChallenge.id}-${Date.now()}-${idx}`,
        challenge_id: activeChallenge.id,
        orderIndex: prompts.length + idx + 1,
      }));

      for (const p of reindexed) {
        await setDoc(doc(db, "prompts", p.id), p);
      }
      setPrompts((prev) => [...prev, ...reindexed]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur inattendue.";
      setPromptError(msg);
      alert(msg);
    } finally {
      setIsGeneratingPrompts(false);
    }
  };

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
            Atelier de dessin collectif multi-challenges & modération par créateur
          </div>

          <h1 className="text-4xl sm:text-6xl font-bold font-display tracking-tight text-stone-900 leading-tight" style={{ textWrap: "balance" }}>
            Créez vos propres challenges et dessinez en toute bienveillance.
          </h1>

          <p className="text-base sm:text-lg text-stone-600 max-w-2xl leading-relaxed">
            Chaque créateur gère ses sujets et modère les soumissions de sa communauté. Progressez pas à pas au sein des fresques collectives.
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
          ArtGuard AI · Plateforme multi-challenges collaborative
        </footer>
      </div>
    );
  }

  // If no active challenge selected, show Challenge Dashboard
  if (!activeChallenge) {
    const myChallenges = challenges.filter((c) => c.creator_id === currentUser.uid);
    const joinedChallengesList = challenges.filter(
      (c) => userProfile?.joinedChallenges?.includes(c.id) && c.creator_id !== currentUser.uid && (c.is_open !== false || c.creator_id === currentUser.uid)
    );
    const publicChallenges = challenges.filter(
      (c) => c.is_public && c.creator_id !== currentUser.uid && !userProfile?.joinedChallenges?.includes(c.id) && (c.is_open !== false)
    );

    return (
      <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-stone-900">
        <header className="flex items-center justify-between px-6 lg:px-10 py-4 bg-[#FAF8F5]/95 backdrop-blur-sm border-b border-stone-200">
          <div className="text-xl font-bold tracking-tight text-stone-900 font-display">
            ArtGuard AI <span className="text-xs font-normal text-stone-500">· Tableau de bord des Challenges</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 bg-stone-100 px-3 py-1.5 rounded-lg">
              <User className="w-3.5 h-3.5 text-emerald-800" />
              {currentUser.displayName || currentUser.email}
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

        <main className="flex-1 w-full max-w-[1200px] mx-auto px-6 py-10 space-y-10">
          {/* Header & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-stone-200">
            <div>
              <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Choisissez ou créez un Challenge</h1>
              <p className="text-sm text-stone-600 mt-1">Rejoignez un atelier public, entrez un code secret ou lancez votre propre challenge.</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setNewChallengeCode(generateUniqueCode());
                  setNewChallengeSubmissionMode("both");
                  setShowCreateChallengeModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-xl shadow-sm cursor-pointer transition-colors"
              >
                <FolderPlus className="w-4 h-4" />
                Créer un challenge
              </button>
            </div>
          </div>

          {/* Join Private Challenge Bar */}
          <div className="p-6 bg-white border border-stone-200 rounded-2xl shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-800" />
              Rejoindre un challenge privé par code
            </h3>
            <div className="flex items-center gap-3 max-w-lg">
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value)}
                placeholder="Entrez le code d'invitation secret..."
                className="flex-1 px-3.5 py-2 text-xs border border-stone-300 rounded-xl bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-900"
              />
              <button
                type="button"
                onClick={handleJoinPrivateChallenge}
                className="px-4 py-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-xl cursor-pointer"
              >
                Accéder
              </button>
            </div>
            {joinError && <p className="text-xs text-red-600">{joinError}</p>}
          </div>

          {/* My Created Challenges */}
          {myChallenges.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-800" />
                Vos challenges créés (Vous êtes modérateur)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myChallenges.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => joinChallenge(c)}
                    className="p-6 bg-white border border-amber-300 rounded-2xl shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4 group relative"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-full ${c.is_open !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {c.is_open !== false ? 'Ouvert' : 'Fermé'}
                        </span>
                        {creatorPendingMap[c.id] > 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold bg-amber-100 text-amber-900 rounded-full animate-pulse shadow-xs">
                            <span className="w-2 h-2 rounded-full bg-amber-700"></span>
                            {creatorPendingMap[c.id]} nouvelle(s) soumission(s)
                          </span>
                        ) : (
                          <span className="text-xs text-stone-500 font-mono">
                            {c.is_public ? `Public (${c.participants?.length || 1}/${c.max_participants || 50})` : `Privé (${c.invite_code || ''})`}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-stone-900 group-hover:text-amber-950 transition-colors">
                        {c.title}
                      </h3>
                      <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                        {c.description || "Aucune description."}
                      </p>
                    </div>

                    {/* Stats Summary */}
                    <div className="grid grid-cols-2 gap-2 p-2 bg-stone-50 border border-stone-200 rounded-xl text-center text-[11px] font-mono">
                      <div>
                        <span className="block text-stone-500 text-[9px] uppercase">Total postés</span>
                        <span className="font-bold text-stone-900">{challengeStatsMap[c.id]?.totalDrawings || 0}</span>
                      </div>
                      <div>
                        <span className="block text-emerald-700 text-[9px] uppercase">Dessins / Total</span>
                        <span className="font-bold text-emerald-900">{challengeStatsMap[c.id]?.userDrawings || 0}/{challengeStatsMap[c.id]?.totalPrompts || 6}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => toggleChallengeOpen(c, e)}
                          className={`px-2.5 py-1 font-semibold rounded-lg transition-colors ${c.is_open !== false ? 'bg-amber-100 text-amber-900 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'}`}
                        >
                          {c.is_open !== false ? 'Fermer' : 'Ouvrir'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => deleteChallenge(c, e)}
                          className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg transition-colors"
                          title="Supprimer le challenge"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <span className="font-semibold text-amber-900 flex items-center gap-1">
                        Atelier →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Joined Challenges */}
          {joinedChallengesList.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                <User className="w-5 h-5 text-emerald-800" />
                Challenges rejoints (Enregistrés dans votre profil)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {joinedChallengesList.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => joinChallenge(c)}
                    className="p-6 bg-white border border-emerald-200 rounded-2xl shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4 group"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-1 text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 rounded-full">
                          Rejoint
                        </span>
                        {participantApprovedMap[c.id]?.length > 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold bg-emerald-100 text-emerald-900 rounded-full animate-pulse shadow-xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-700"></span>
                            {participantApprovedMap[c.id].length} dessin(s) validé(s)
                          </span>
                        ) : (
                          <span className="text-xs text-stone-500 font-mono">
                            {c.is_public ? "Public" : "Privé"}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-stone-900 group-hover:text-emerald-900 transition-colors">
                        {c.title}
                      </h3>
                      <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                        {c.description || "Aucune description."}
                      </p>
                    </div>

                    {/* Stats Summary */}
                    <div className="grid grid-cols-2 gap-2 p-2 bg-stone-50 border border-stone-200 rounded-xl text-center text-[11px] font-mono">
                      <div>
                        <span className="block text-stone-500 text-[9px] uppercase">Total postés</span>
                        <span className="font-bold text-stone-900">{challengeStatsMap[c.id]?.totalDrawings || 0}</span>
                      </div>
                      <div>
                        <span className="block text-emerald-700 text-[9px] uppercase">Dessins / Total</span>
                        <span className="font-bold text-emerald-900">{challengeStatsMap[c.id]?.userDrawings || 0}/{challengeStatsMap[c.id]?.totalPrompts || 6}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-xs font-semibold text-emerald-800">
                      <span>Ouvrir l'atelier</span>
                      <span>→</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Public Challenges */}
          {publicChallenges.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                <Compass className="w-5 h-5 text-amber-800" />
                Challenges Publics disponibles
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {publicChallenges.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => joinChallenge(c)}
                    className="p-6 bg-white border border-stone-200 rounded-2xl shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4 group"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-1 text-[10px] font-mono font-bold bg-stone-100 text-stone-700 rounded-full">
                          Par {c.creator_name}
                        </span>
                        <span className="text-xs text-emerald-700 font-semibold">
                          Public ({c.participants?.length || 1}/{c.max_participants || 50})
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-stone-900 group-hover:text-amber-900 transition-colors">
                        {c.title}
                      </h3>
                      <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                        {c.description || "Aucune description."}
                      </p>
                    </div>

                    {/* Stats Summary */}
                    <div className="grid grid-cols-2 gap-2 p-2 bg-stone-50 border border-stone-200 rounded-xl text-center text-[11px] font-mono">
                      <div>
                        <span className="block text-stone-500 text-[9px] uppercase">Total postés</span>
                        <span className="font-bold text-stone-900">{challengeStatsMap[c.id]?.totalDrawings || 0}</span>
                      </div>
                      <div>
                        <span className="block text-emerald-700 text-[9px] uppercase">Dessins / Total</span>
                        <span className="font-bold text-emerald-900">{challengeStatsMap[c.id]?.userDrawings || 0}/{challengeStatsMap[c.id]?.totalPrompts || 6}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-xs font-semibold text-stone-800 group-hover:text-amber-900">
                      <span>Rejoindre l'atelier</span>
                      <span>→</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Create Challenge Modal */}
        {showCreateChallengeModal && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full space-y-5 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-stone-200">
                <h3 className="text-lg font-bold text-stone-900">Créer un nouveau Challenge</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateChallengeModal(false)}
                  className="p-1 text-stone-400 hover:text-stone-700 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateChallenge} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">Titre du challenge *</label>
                  <input
                    type="text"
                    required
                    value={newChallengeTitle}
                    onChange={(e) => setNewChallengeTitle(e.target.value)}
                    placeholder="Ex: Le bestiaire fantastique..."
                    className="w-full px-3.5 py-2 text-xs border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-900 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={newChallengeDesc}
                    onChange={(e) => setNewChallengeDesc(e.target.value)}
                    placeholder="Décrivez l'ambiance et les règles de votre challenge..."
                    className="w-full px-3.5 py-2 text-xs border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-900 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">Visibilité</label>
                  <select
                    value={newChallengeIsPublic ? "public" : "private"}
                    onChange={(e) => setNewChallengeIsPublic(e.target.value === "public")}
                    className="w-full px-3.5 py-2 text-xs border border-stone-300 rounded-xl bg-white focus:outline-none"
                  >
                    <option value="public">Public (Visible par tous, avec limite)</option>
                    <option value="private">Privé (Accessible via code secret)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">Outils de soumission autorisés *</label>
                  <select
                    value={newChallengeSubmissionMode}
                    onChange={(e) => setNewChallengeSubmissionMode(e.target.value as any)}
                    className="w-full px-3.5 py-2 text-xs border border-stone-300 rounded-xl bg-white focus:outline-none"
                  >
                    <option value="both">Les deux (Canvas numérique et Import photo)</option>
                    <option value="canvas">Canvas numérique uniquement</option>
                    <option value="upload">Import d'une photo du dessin uniquement</option>
                  </select>
                  <p className="text-[10px] text-stone-500 mt-1">
                    Définissez les outils auxquels les participants auront accès pour soumettre leurs dessins.
                  </p>
                </div>

                {newChallengeIsPublic ? (
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">Limite de participants (50 max)</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={newChallengeMaxParticipants}
                      onChange={(e) => setNewChallengeMaxParticipants(parseInt(e.target.value) || 50)}
                      className="w-full px-3.5 py-2 text-xs border border-stone-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-900"
                    />
                    <p className="text-[10px] text-stone-500 mt-1">
                      Nombre maximum de participants autorisés (jusqu'à 50).
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-stone-700">Code unique du challenge *</label>
                      <button
                        type="button"
                        onClick={() => setNewChallengeCode(generateUniqueCode())}
                        className="text-[11px] text-amber-900 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <RefreshCw className="w-3 h-3" /> Générer un autre code
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      value={newChallengeCode}
                      onChange={(e) => setNewChallengeCode(e.target.value)}
                      placeholder="Ex: ART-8492"
                      className="w-full px-3.5 py-2 text-xs font-mono font-bold border border-stone-300 rounded-xl bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-900"
                    />
                    <p className="text-[10px] text-stone-500 mt-1">
                      Ce code secret sera exigé pour permettre aux participants de rejoindre votre challenge privé.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-xl cursor-pointer"
                  >
                    Créer et lancer
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateChallengeModal(false)}
                    className="px-4 py-2.5 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl cursor-pointer"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    );
  }

  const isCreator = currentUser.uid === activeChallenge.creator_id;
  const currentSub = userSubmissionsMap[activePrompt.id];
  const isApproved = currentSub?.status === "APPROVED";
  const isPending = currentSub?.status === "PENDING";
  const isRejected = currentSub?.status === "REJECTED";

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-stone-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-6 px-6 lg:px-10 py-4 bg-[#FAF8F5]/95 backdrop-blur-sm border-b border-stone-200">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setActiveChallenge(null)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 bg-white border border-stone-200 hover:bg-stone-50 rounded-lg cursor-pointer"
          >
            ← Challenges
          </button>

          <div className="hidden sm:block">
            <h2 className="text-sm font-bold text-stone-900">{activeChallenge.title}</h2>
            <p className="text-[11px] text-stone-500">Par {activeChallenge.creator_name} {isCreator ? "(Vous êtes créateur)" : ""}</p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-stone-200 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab("atelier")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeTab === "atelier" ? "bg-white text-stone-900 shadow-xs" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Atelier
            </button>
            {isCreator && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("moderation");
                    loadPendingSubmissions(activeChallenge.id);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    activeTab === "moderation" ? "bg-white text-stone-900 shadow-xs" : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-800" />
                  Modération ({pendingSubmissions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("prompts")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    activeTab === "prompts" ? "bg-white text-stone-900 shadow-xs" : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  <ListOrdered className="w-3.5 h-3.5 text-amber-800" />
                  Gestion Sujets ({prompts.length})
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 bg-stone-100 px-3 py-1.5 rounded-lg">
            <User className="w-3.5 h-3.5 text-emerald-800" />
            {currentUser.displayName || currentUser.email}
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
        {activeTab === "moderation" && isCreator ? (
          /* CREATOR MODERATION PANEL */
          <section className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-stone-200">
              <div>
                <h1 className="text-2xl font-semibold text-stone-900">Modération des soumissions · {activeChallenge.title}</h1>
                <p className="text-xs text-stone-500">Validez ou refusez les dessins soumis par les participants de votre challenge.</p>
              </div>
              <button
                type="button"
                onClick={() => loadPendingSubmissions(activeChallenge.id)}
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
                            className="w-full px-3 py-1.5 text-xs border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleCreatorReject(sub)}
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
                            onClick={() => handleCreatorApprove(sub)}
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
        ) : activeTab === "prompts" && isCreator ? (
          /* CREATOR PROMPT MANAGEMENT PANEL */
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
              <div>
                <h1 className="text-2xl font-semibold text-stone-900">Gestion des Sujets · {activeChallenge.title}</h1>
                <p className="text-xs text-stone-500">Créez, éditez, réordonnez ou supprimez les étapes de votre challenge.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPrompt({ id: `prompt-${activeChallenge.id}-${Date.now()}`, challenge_id: activeChallenge.id, orderIndex: prompts.length + 1, title: "", category: "imagination", difficulty: "facile" });
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
                      placeholder="Ex: Dessine un chat astronaute..."
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
                    <span>Challenge : {activeChallenge.title}</span>
                    <span aria-hidden="true">·</span>
                    <span>Modération par {activeChallenge.creator_name}</span>
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-semibold text-stone-900 tracking-tight" style={{ textWrap: "balance" }}>
                    Atelier de dessin collectif
                  </h1>
                  <p className="text-sm sm:text-base text-stone-600 leading-relaxed">
                    {activeChallenge.description || "Soumettez votre dessin pour valider votre étape et débloquer le sujet suivant."}
                  </p>
                </div>
              </div>

              {/* Timeline */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-stone-700">
                  Votre progression dans ce challenge
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {prompts.map((p, index) => {
                    const sub = userSubmissionsMap[p.id];
                    const isApproved = sub?.status === "APPROVED";
                    const isUnlocked = isCreator || index === 0 || Boolean(userSubmissionsMap[prompts[index - 1]?.id]?.status === "APPROVED");
                    const isActive = index === activePromptIndex;

                    if (!isCreator && !isUnlocked && !isActive && index > activePromptIndex) {
                      return null;
                    }

                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!isUnlocked && !isCreator}
                        onClick={() => {
                          setActivePromptIndex(index);
                          if (activeChallenge && !isCreator) {
                            markPromptApprovedViewed(activeChallenge.id, p.id);
                          }
                        }}
                        className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-3 relative overflow-hidden cursor-pointer ${
                          isActive
                            ? "border-amber-900 bg-amber-50/60 ring-2 ring-amber-900/20 shadow-xs"
                            : isUnlocked
                              ? "border-stone-200 bg-white hover:border-stone-300"
                              : "border-stone-200 bg-stone-100/70 opacity-65 cursor-not-allowed"
                        }`}
                      >
                        {!isCreator && activeChallenge && participantApprovedMap[activeChallenge.id]?.includes(p.id) && (
                          <span className="absolute top-2 right-2 flex h-3 w-3 items-center justify-center">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                          </span>
                        )}
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
              {(() => {
                const submissionMode = activeChallenge?.submission_mode || "both";
                const allowCanvas = submissionMode === "canvas" || submissionMode === "both";
                const allowUpload = submissionMode === "upload" || submissionMode === "both";

                return (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                          Sujet Actif · Outil : {submissionMode === "canvas" ? "Canvas numérique" : submissionMode === "upload" ? "Import photo" : "Canvas & Import"}
                        </span>
                        <h2 className="text-xl font-semibold text-stone-900 mt-0.5">
                          « {activePrompt.title} »
                        </h2>
                      </div>

                      {!isPending && (
                        <div className="flex items-center gap-2">
                          {allowUpload && (
                            <>
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
                                {importedImageUrl ? "Changer l'image" : "Importer une image"}
                              </button>
                            </>
                          )}
                          {((allowUpload && importedImageUrl) || allowCanvas) && (
                            <button
                              type="button"
                              disabled={isSubmitting || (submissionMode === "upload" && !importedImageUrl)}
                              onClick={handleManualSubmit}
                              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              {isSubmitting ? "Envoi en cours..." : "Envoi"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Status Banners */}
                    {isPending && (
                      <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-4 text-amber-900">
                        <Clock className="w-6 h-6 text-amber-700 shrink-0" />
                        <div className="space-y-1">
                          <h3 className="text-sm font-semibold">En attente de validation par le créateur</h3>
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

                    {/* Workspace or Approved & AI Analysis View */}
                    {!isPending && (
                      <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4 shadow-xs">
                        {isApproved ? (
                          <div className="space-y-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
                              <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0" />
                                <div>
                                  <h3 className="text-sm font-bold text-emerald-900">Dessin validé avec succès !</h3>
                                  <p className="text-xs text-stone-500">Votre dessin est validé et présent dans la galerie. Vous pouvez demander une analyse et des conseils personnalisés par IA (Gemini Vision).</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowAiModal(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-xl cursor-pointer shadow-sm transition-all"
                              >
                                <Sparkles className="w-4 h-4 text-amber-200" />
                                {currentSub?.ai_feedback ? "Voir l'analyse IA" : "Demander une analyse IA"}
                              </button>
                            </div>

                            <div className="rounded-xl border border-stone-200 overflow-hidden bg-[#FAF8F5] max-w-lg mx-auto aspect-[16/10] flex items-center justify-center p-2">
                              <img src={currentSub.image_url} alt="Votre dessin validé" className="max-h-full max-w-full object-contain rounded" />
                            </div>

                            {currentSub?.ai_feedback && (
                              <div className="p-5 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3">
                                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wide">
                                  <Sparkles className="w-4 h-4 text-amber-700" />
                                  Analyse et conseils personnalisés (IA Gemini)
                                </div>
                                <p className="text-xs text-stone-700 leading-relaxed italic bg-white p-3 rounded-lg border border-amber-100 shadow-xs">
                                  "{currentSub.ai_feedback.encouragement}"
                                </p>
                                <div className="space-y-1.5 pt-1">
                                  <span className="text-[11px] font-bold text-stone-900 block">Pistes d'amélioration concrètes :</span>
                                  <ul className="list-disc list-inside text-xs text-stone-700 space-y-1">
                                    {currentSub.ai_feedback.tips.map((tip, idx) => (
                                      <li key={idx} className="leading-relaxed">{tip}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : submissionMode === "upload" ? (
                          <div className="space-y-3">
                            {importedImageUrl ? (
                              <div className="space-y-3">
                                <div className="flex items-center justify-between text-xs text-stone-500">
                                  <span className="font-semibold text-emerald-800">Image importée prête pour l'envoi</span>
                                  <button
                                    type="button"
                                    onClick={() => setImportedImageUrl(null)}
                                    className="text-xs text-stone-600 underline hover:text-stone-900 cursor-pointer"
                                  >
                                    Changer d'image
                                  </button>
                                </div>
                                <div className="rounded-lg border border-stone-300 overflow-hidden bg-[#FAF8F5] aspect-[16/10] flex items-center justify-center p-2">
                                  <img src={importedImageUrl} alt="Aperçu importé" className="max-h-full max-w-full object-contain rounded" />
                                </div>
                              </div>
                            ) : (
                              <div className="p-12 border-2 border-dashed border-stone-300 rounded-xl text-center space-y-3 bg-stone-50">
                                <Upload className="w-10 h-10 text-stone-400 mx-auto" />
                                <div className="space-y-1">
                                  <h4 className="text-sm font-semibold text-stone-900">Ce challenge requiert l'import d'une photo</h4>
                                  <p className="text-xs text-stone-500">Cliquez sur "Importer une image" ci-dessus pour sélectionner la photo de votre dessin.</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => fileInputRef.current?.click()}
                                  className="px-4 py-2 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-lg cursor-pointer"
                                >
                                  Sélectionner une photo
                                </button>
                              </div>
                            )}
                          </div>
                        ) : submissionMode === "canvas" ? (
                          renderCanvasToolsAndCanvas(false)
                        ) : (
                          /* Both canvas and upload */
                          <>
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
                              renderCanvasToolsAndCanvas(false)
                            )}
                          </>
                        )}

                        {/* Fullscreen Canvas Modal */}
                        {isCanvasFullscreen && (
                          <div className="fixed inset-0 z-50 bg-[#FAF8F5] flex flex-col p-4 sm:p-8 overflow-y-auto">
                            <div className="flex items-center justify-between pb-4 border-b border-stone-200 mb-4">
                              <div>
                                <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Mode Dessin Plein Écran</span>
                                <h2 className="text-lg font-bold text-stone-900">« {activePrompt.title} »</h2>
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  disabled={isSubmitting}
                                  onClick={async () => {
                                    await handleManualSubmit();
                                    setIsCanvasFullscreen(false);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl cursor-pointer shadow-md"
                                >
                                  <ShieldCheck className="w-4 h-4" />
                                  Soumettre le dessin
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsCanvasFullscreen(false)}
                                  className="p-2 text-stone-600 bg-stone-200 hover:bg-stone-300 rounded-xl cursor-pointer"
                                  title="Quitter le plein écran"
                                >
                                  <X className="w-5 h-5" />
                                </button>
                              </div>
                            </div>

                            <div className="flex-1 flex flex-col justify-center">
                              {renderCanvasToolsAndCanvas(true)}
                            </div>
                          </div>
                        )}

                        {submissionError && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                            {submissionError}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </section>

            {/* Cloistered Gallery */}
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

              {!isApproved && !isCreator ? (
                <div className="p-12 bg-white border border-stone-200 rounded-xl text-center space-y-2">
                  <Lock className="w-8 h-8 text-amber-800 mx-auto" />
                  <h3 className="text-sm font-semibold text-stone-900">Galerie verrouillée</h3>
                  <p className="text-xs text-stone-500">
                    Votre dessin doit être validé par le créateur pour déverrouiller et découvrir la galerie de ce sujet.
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
                  {galleryDrawings.map((item, idx) => (
                    <div key={item.id} className="relative group aspect-square bg-white border border-stone-200 rounded-xl overflow-hidden shadow-xs hover:shadow-md transition-shadow">
                      <img
                        src={item.imageUrl}
                        alt="Dessin validé de la fresque"
                        referrerPolicy="no-referrer"
                        onClick={() => openLightbox(idx)}
                        className="w-full h-full object-cover block cursor-zoom-in"
                      />
                      {isCreator && (
                        <button
                          type="button"
                          onClick={() => {
                            setRetractingDrawing({ id: item.submissionId, promptId: activePrompt.id, userId: item.userId });
                            setRetractionReasonInput("");
                          }}
                          className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md"
                          title="Retirer ce dessin (Rétrograder le participant)"
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

      {/* Lightbox / Fullscreen Touch Zoom & Swipe Modal */}
      {lightboxImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center overflow-hidden touch-none select-none"
          onClick={() => setLightboxImageUrl(null)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Top Bar: Counter & Actions */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-50 px-4">
            <span className="text-xs font-mono font-bold text-white/90 bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-sm">
              {lightboxIndex + 1} / {galleryDrawings.length}
            </span>
            <div className="flex items-center gap-2">
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
          </div>

          {/* Navigation Arrows */}
          {galleryDrawings.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrevLightbox}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/25 text-white rounded-full z-50 backdrop-blur-sm cursor-pointer"
                title="Photo précédente"
              >
                ←
              </button>
              <button
                type="button"
                onClick={handleNextLightbox}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/25 text-white rounded-full z-50 backdrop-blur-sm cursor-pointer"
                title="Photo suivante"
              >
                →
              </button>
            </>
          )}

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

      {/* Creator Retraction Modal */}
      {retractingDrawing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-stone-900">Retrait a posteriori du dessin</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Le dessin sera supprimé de la fresque et le participant sera rétrogradé sur cette étape.
            </p>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-stone-700">Motif du retrait (obligatoire)</label>
              <input
                type="text"
                value={retractionReasonInput}
                onChange={(e) => setRetractionReasonInput(e.target.value)}
                placeholder="Ex: Dessin non conforme..."
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleCreatorRetractDrawing}
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

      {/* AI Analysis Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-800" />
                <h3 className="text-base font-bold text-stone-900">Analyse et Conseils par IA (Gemini Vision)</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="p-1 text-stone-500 hover:text-stone-900 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-stone-700 mb-1">Type de création</label>
                <select
                  value={aiCreationType}
                  onChange={(e) => setAiCreationType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-900"
                >
                  <option value="numérique">Dessin numérique (réalisé sur le canvas)</option>
                  <option value="traditionnel">Dessin traditionnel (image importée)</option>
                </select>
              </div>

              {aiCreationType === "traditionnel" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium text-stone-700 mb-1">Médium utilisé</label>
                    <select
                      value={aiMedium}
                      onChange={(e) => setAiMedium(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-300 rounded-xl bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-900"
                    >
                      <option value="Crayon à papier">Crayon à papier</option>
                      <option value="Stylo bille/Ancre">Stylo bille / Encre</option>
                      <option value="Feutre">Feutre</option>
                      <option value="Peinture">Peinture</option>
                      <option value="Fusain">Fusain</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-stone-700 mb-1">Support</label>
                    <select
                      value={aiSupport}
                      onChange={(e) => setAiSupport(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-300 rounded-xl bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-900"
                    >
                      <option value="Papier blanc">Papier blanc</option>
                      <option value="Papier grain/croquis">Papier grain / croquis</option>
                      <option value="Papier quadrillé/ligné">Papier quadrillé / ligné</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-medium text-stone-700 mb-1">Intention / Objectif (optionnel)</label>
                <input
                  type="text"
                  value={aiIntention}
                  onChange={(e) => setAiIntention(e.target.value)}
                  placeholder="Ex: Travailler les volumes, croquis rapide, les détails..."
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-900"
                />
              </div>

              <div>
                <label className="block font-medium text-stone-700 mb-1">Niveau (optionnel)</label>
                <select
                  value={aiLevel}
                  onChange={(e) => setAiLevel(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-900"
                >
                  <option value="Débutant">Débutant</option>
                  <option value="Intermédiaire">Intermédiaire</option>
                  <option value="Avancé">Avancé</option>
                </select>
              </div>

              {aiError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs">
                  {aiError}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={aiAnalyzing}
                  onClick={handleRequestAiAnalysis}
                  className="flex-1 py-2.5 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-xl cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-amber-200" />
                  {aiAnalyzing ? "Analyse Gemini Vision en cours..." : "Lancer l'analyse IA"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAiModal(false)}
                  className="px-4 py-2.5 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl cursor-pointer"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="border-t border-stone-200 bg-white py-6 px-6 lg:px-10 mt-12">
        <div className="max-w-[1380px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stone-800">ArtGuard AI</span>
            <span aria-hidden="true">·</span>
            <span>Atelier multi-challenges avec modération par créateur</span>
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
