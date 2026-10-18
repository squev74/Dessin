import React, { useState } from "react";
import {
  ShieldCheck,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Sparkles,
  RefreshCw,
  ListOrdered,
} from "lucide-react";
import { DrawingPrompt } from "../utils/curatedPrompts";

interface DrawingSubmission {
  id: string;
  prompt_id: string;
  user_id: string;
  image_url: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejection_reason?: string | null;
}

interface AdminPanelProps {
  challenge: {
    id: string;
    title: string;
    type: "public" | "private";
    invite_code?: string;
  };
  prompts: DrawingPrompt[];
  pendingSubmissions: DrawingSubmission[];
  onSavePrompt: (prompt: DrawingPrompt, isEditing: boolean) => Promise<void>;
  onDeletePrompt: (promptId: string) => Promise<void>;
  onReorderPrompts: (newPrompts: DrawingPrompt[]) => Promise<void>;
  onApproveSubmission: (submission: DrawingSubmission) => Promise<void>;
  onRejectSubmission: (submission: DrawingSubmission, reason: string) => Promise<void>;
  onRefreshPending: () => Promise<void>;
  onGenerateAIPrompts: () => Promise<void>;
  isGeneratingAI?: boolean;
}

export function AdminPanel({
  challenge,
  prompts,
  pendingSubmissions,
  onSavePrompt,
  onDeletePrompt,
  onReorderPrompts,
  onApproveSubmission,
  onRejectSubmission,
  onRefreshPending,
  onGenerateAIPrompts,
  isGeneratingAI = false,
}: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<"moderation" | "prompts" | "settings">("moderation");

  // Prompt CRUD state
  const [editingPrompt, setEditingPrompt] = useState<DrawingPrompt | null>(null);
  const [promptTitle, setPromptTitle] = useState("");
  const [promptCategory, setPromptCategory] = useState<DrawingPrompt["category"]>("imagination");
  const [promptDifficulty, setPromptDifficulty] = useState<DrawingPrompt["difficulty"]>("facile");

  // Rejection modal state
  const [rejectingSub, setRejectingSub] = useState<DrawingSubmission | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Copy invite link state
  const [copied, setCopied] = useState(false);
  const inviteLink = `${window.location.origin}?join=${challenge.invite_code || challenge.id}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSavePromptClick = async () => {
    if (!promptTitle.trim()) return;
    const isEditing = Boolean(prompts.some((p) => p.id === editingPrompt?.id));
    const promptId = editingPrompt?.id || `prompt-${Date.now()}`;
    const order = editingPrompt ? editingPrompt.orderIndex : prompts.length + 1;

    const promptData: DrawingPrompt = {
      id: promptId,
      orderIndex: order,
      title: promptTitle.trim(),
      category: promptCategory,
      difficulty: promptDifficulty,
    };

    await onSavePrompt(promptData, isEditing);
    setEditingPrompt(null);
    setPromptTitle("");
  };

  const handleMoveOrder = async (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= prompts.length) return;

    const copy = [...prompts];
    const temp = copy[index];
    copy[index] = copy[target];
    copy[target] = temp;

    const reindexed = copy.map((p, idx) => ({ ...p, orderIndex: idx + 1 }));
    await onReorderPrompts(reindexed);
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center justify-between pb-4 border-b border-stone-200">
        <div className="flex items-center gap-1 p-1 bg-stone-200 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab("moderation")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeTab === "moderation" ? "bg-white text-stone-900 shadow-xs" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Modération ({pendingSubmissions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("prompts")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeTab === "prompts" ? "bg-white text-stone-900 shadow-xs" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Sujets & Étapes ({prompts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeTab === "settings" ? "bg-white text-stone-900 shadow-xs" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Paramètres & Invitation
          </button>
        </div>
      </div>

      {/* Tab 1: Moderation */}
      {activeTab === "moderation" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-stone-900">File d'attente de modération</h2>
            <button
              type="button"
              onClick={onRefreshPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Actualiser
            </button>
          </div>

          {pendingSubmissions.length === 0 ? (
            <div className="p-12 bg-white border border-stone-200 rounded-xl text-center space-y-2">
              <ShieldCheck className="w-8 h-8 text-emerald-700 mx-auto" />
              <h3 className="text-sm font-semibold text-stone-900">Aucun dessin en attente</h3>
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

                    <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
                      <button
                        type="button"
                        onClick={() => onApproveSubmission(sub)}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Valider
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingSub(sub);
                          setRejectionReason("");
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg cursor-pointer"
                      >
                        <XCircle className="w-4 h-4" />
                        Refuser
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Prompts CRUD */}
      {activeTab === "prompts" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-stone-900">Gestion des Sujets et Étapes</h2>
              <p className="text-xs text-stone-500">Créez, modifiez, réordonnez ou générez les consignes de ce challenge.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingPrompt({ id: `prompt-${Date.now()}`, orderIndex: prompts.length + 1, title: "", category: "imagination", difficulty: "facile" });
                  setPromptTitle("");
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-lg cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Nouveau sujet
              </button>
              <button
                type="button"
                disabled={isGeneratingAI}
                onClick={onGenerateAIPrompts}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-amber-800" />
                {isGeneratingAI ? "Génération Flash..." : "Générer via Flash IA"}
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
                    value={promptTitle}
                    onChange={(e) => setPromptTitle(e.target.value)}
                    placeholder="Ex: Dessine un animal fantastique..."
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-900"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">Catégorie</label>
                    <select
                      value={promptCategory}
                      onChange={(e) => setPromptCategory(e.target.value as any)}
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
                      value={promptDifficulty}
                      onChange={(e) => setPromptDifficulty(e.target.value as any)}
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
                    onClick={handleSavePromptClick}
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
                    onClick={() => handleMoveOrder(idx, "up")}
                    className="p-1.5 text-stone-600 hover:bg-stone-100 rounded disabled:opacity-30 cursor-pointer"
                    title="Monter"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={idx === prompts.length - 1}
                    onClick={() => handleMoveOrder(idx, "down")}
                    className="p-1.5 text-stone-600 hover:bg-stone-100 rounded disabled:opacity-30 cursor-pointer"
                    title="Descendre"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPrompt(p);
                      setPromptTitle(p.title);
                      setPromptCategory(p.category);
                      setPromptDifficulty(p.difficulty);
                    }}
                    className="p-1.5 text-stone-700 hover:bg-stone-100 rounded cursor-pointer"
                    title="Éditer"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeletePrompt(p.id)}
                    className="p-1.5 text-red-700 hover:bg-red-50 rounded cursor-pointer"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Settings & Invite Link */}
      {activeTab === "settings" && (
        <div className="p-6 bg-white border border-stone-200 rounded-xl space-y-4 max-w-xl">
          <h2 className="text-lg font-semibold text-stone-900">Paramètres du Challenge</h2>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-stone-700">Lien d'invitation privé</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteLink}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg bg-stone-50 font-mono text-stone-600 select-all"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1 px-4 py-2 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-lg cursor-pointer shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copié !" : "Copier"}
              </button>
            </div>
            <p className="text-[11px] text-stone-500 pt-1">
              Partagez ce lien ou le code <strong className="font-mono">{challenge.invite_code || challenge.id}</strong> pour inviter des participants.
            </p>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectingSub && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-stone-900">Motif du refus</h3>
            <p className="text-xs text-stone-600">
              Veuillez indiquer la raison du refus pour ce dessin. L'utilisateur sera invité à soumettre une nouvelle esquisse.
            </p>
            <input
              type="text"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Ex: Image floue ou hors-sujet..."
              className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={!rejectionReason.trim()}
                onClick={() => {
                  onRejectSubmission(rejectingSub, rejectionReason.trim());
                  setRejectingSub(null);
                }}
                className="flex-1 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg cursor-pointer disabled:opacity-50"
              >
                Confirmer le refus
              </button>
              <button
                type="button"
                onClick={() => setRejectingSub(null)}
                className="px-4 py-2 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg cursor-pointer"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
