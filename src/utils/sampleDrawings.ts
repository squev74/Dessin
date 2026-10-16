export interface ModerationJSON {
  status: "APPROVED" | "REJECTED";
  reason: string | null;
  is_hand_drawn: boolean;
  alt_text: string;
}

export interface SamplePreset {
  id: string;
  title: string;
  subtitle: string;
  subject: string;
  expectedRuleLabel: string;
  generateDataUrl: () => string;
  precomputedResult: ModerationJSON;
}

export interface SubmissionEntry {
  id: string;
  timestamp: string;
  subject: string;
  sourceLabel: string;
  imageDataUrl: string;
  result: ModerationJSON;
  addedToWall: boolean;
}

export const DAILY_SUBJECTS = [
  "Un phare sous une pluie d'étoiles",
  "Une tasse de thé qui rêve d'océan",
  "Le jardin suspendu d'une ville calme",
  "L'arbre qui écoute le vent d'automne",
  "Un chat cosmique sur les toits",
];

export function drawLighthouseSketch(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#F7F3E9";
  ctx.fillRect(0, 0, 640, 480);

  ctx.strokeStyle = "rgba(180, 168, 148, 0.16)";
  ctx.lineWidth = 1;
  for (let y = 8; y < 480; y += 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(640, y + Math.sin(y) * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = "#1E293B";
  ctx.lineWidth = 18;
  ctx.lineCap = "round";
  for (let i = 0; i < 16; i++) {
    ctx.beginPath();
    ctx.moveTo(30 + i * 12, 35 + (i % 3) * 14);
    ctx.quadraticCurveTo(320, 20 + i * 14, 600 - (i % 4) * 15, 45 + i * 13);
    ctx.stroke();
  }

  // Beam
  ctx.fillStyle = "rgba(251, 191, 36, 0.28)";
  ctx.beginPath();
  ctx.moveTo(270, 145);
  ctx.lineTo(615, 55);
  ctx.lineTo(615, 225);
  ctx.closePath();
  ctx.fill();

  // Waves
  ctx.strokeStyle = "#1D4ED8";
  ctx.lineWidth = 3.5;
  for (let row = 0; row < 5; row++) {
    const baseY = 365 + row * 22;
    ctx.beginPath();
    for (let x = 20; x <= 620; x += 40) {
      ctx.quadraticCurveTo(x + 10, baseY - 9, x + 20, baseY);
      ctx.quadraticCurveTo(x + 30, baseY + 9, x + 40, baseY);
    }
    ctx.stroke();
  }

  // Cliff
  ctx.fillStyle = "#44403C";
  ctx.beginPath();
  ctx.moveTo(150, 385);
  ctx.quadraticCurveTo(210, 315, 290, 330);
  ctx.quadraticCurveTo(335, 345, 365, 385);
  ctx.closePath();
  ctx.fill();

  // Lighthouse
  ctx.fillStyle = "#FAF8F5";
  ctx.strokeStyle = "#1C1917";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(235, 335);
  ctx.lineTo(250, 165);
  ctx.lineTo(285, 165);
  ctx.lineTo(300, 335);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Red stripes
  ctx.fillStyle = "#DC2626";
  ctx.beginPath();
  ctx.moveTo(244, 235);
  ctx.lineTo(248, 195);
  ctx.lineTo(287, 195);
  ctx.lineTo(291, 235);
  ctx.closePath();
  ctx.fill();

  // Lantern
  ctx.fillStyle = "#FDE047";
  ctx.fillRect(253, 138, 29, 26);
  ctx.strokeRect(253, 138, 29, 26);

  ctx.fillStyle = "#1C1917";
  ctx.beginPath();
  ctx.arc(267.5, 138, 18, Math.PI, 0);
  ctx.fill();

  return canvas.toDataURL("image/png");
}

export function drawDreamingTeacup(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#FCFBF7";
  ctx.fillRect(0, 0, 640, 480);

  ctx.strokeStyle = "#292524";
  ctx.lineWidth = 3.5;
  ctx.fillStyle = "#BAE6FD";
  ctx.beginPath();
  ctx.moveTo(220, 275);
  ctx.quadraticCurveTo(225, 385, 320, 385);
  ctx.quadraticCurveTo(415, 385, 420, 275);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(420, 320, 32, -Math.PI * 0.45, Math.PI * 0.45);
  ctx.stroke();

  ctx.fillStyle = "#0284C7";
  ctx.beginPath();
  ctx.ellipse(320, 275, 100, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Steam boat
  ctx.fillStyle = "#FDE047";
  ctx.beginPath();
  ctx.moveTo(295, 150);
  ctx.lineTo(345, 150);
  ctx.lineTo(332, 168);
  ctx.lineTo(308, 168);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  return canvas.toDataURL("image/png");
}

export function drawRealisticPhotoSimulation(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const bgGrad = ctx.createLinearGradient(0, 0, 640, 480);
  bgGrad.addColorStop(0, "#0f172a");
  bgGrad.addColorStop(1, "#020617");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 640, 480);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 25, 580, 430);

  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fillRect(42, 38, 556, 44);
  ctx.fillStyle = "#F8FAFC";
  ctx.font = "bold 16px monospace";
  ctx.fillText("RAW PHOTO CAPTURE • SONY ILCE-7RM4 • ISO 100", 58, 66);

  ctx.fillStyle = "#F59E0B";
  ctx.font = "bold 18px monospace";
  ctx.fillText("2026-10-13 14:22:09 [PHOTOGRAPHIE RÉELLE NON DESSINÉE]", 58, 438);

  return canvas.toDataURL("image/png");
}

export function drawSignedSketchWithPII(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#FAF8F5";
  ctx.fillRect(0, 0, 640, 480);

  ctx.strokeStyle = "#1C1917";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(40, 320);
  ctx.quadraticCurveTo(190, 210, 350, 310);
  ctx.quadraticCurveTo(480, 220, 600, 320);
  ctx.stroke();

  ctx.fillStyle = "#FFF1F2";
  ctx.fillRect(60, 355, 520, 95);
  ctx.strokeStyle = "#be123c";
  ctx.lineWidth = 2;
  ctx.strokeRect(60, 355, 520, 95);

  ctx.fillStyle = "#1C1917";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("Oeuvre originale de : Jean-Michel DUPONT", 80, 392);
  ctx.font = "18px monospace";
  ctx.fillText("Contact : jm.dupont@email.fr — Tél : 06 14 28 99 01", 80, 428);

  return canvas.toDataURL("image/png");
}

export function buildSamplePresets(): SamplePreset[] {
  return [
    {
      id: "preset-lighthouse",
      title: "Esquisse au fusain : Phare étoilé",
      subtitle: "Dessin fait main anonyme et bienveillant",
      subject: "Un phare sous une pluie d'étoiles",
      expectedRuleLabel: "Conforme aux 3 règles (APPROVED)",
      generateDataUrl: drawLighthouseSketch,
      precomputedResult: {
        status: "APPROVED",
        reason: null,
        is_hand_drawn: true,
        alt_text:
          "Un dessin au fusain et pastel représentant un phare rayé rouge et blanc éclairant la mer sous un ciel étoilé.",
      },
    },
    {
      id: "preset-teacup",
      title: "Aquarelle : Tasse de thé rêveuse",
      subtitle: "Illustration douce avec bateau de papier dans la vapeur",
      subject: "Une tasse de thé qui rêve d'océan",
      expectedRuleLabel: "Conforme aux 3 règles (APPROVED)",
      generateDataUrl: drawDreamingTeacup,
      precomputedResult: {
        status: "APPROVED",
        reason: null,
        is_hand_drawn: true,
        alt_text:
          "Une aquarelle douce montrant une tasse de thé bleue d'où s'échappe de la vapeur portant un petit bateau en papier.",
      },
    },
    {
      id: "preset-photo",
      title: "Photographie d'objet (Caméra RAW)",
      subtitle: "Test de la Règle 1 : Rejet des photos réelles",
      subject: "Une tasse de thé qui rêve d'océan",
      expectedRuleLabel: "Rejet Règle 1 (Photo réelle)",
      generateDataUrl: drawRealisticPhotoSimulation,
      precomputedResult: {
        status: "REJECTED",
        reason: "Photo réelle détectée",
        is_hand_drawn: false,
        alt_text:
          "Photographie numérique d'un objet avec des métadonnées d'appareil photo.",
      },
    },
    {
      id: "preset-pii",
      title: "Croquis avec Nom, Email et Téléphone",
      subtitle: "Test de la Règle 3 : Protection de l'anonymat",
      subject: "Un phare sous une pluie d'étoiles",
      expectedRuleLabel: "Rejet Règle 3 (Données personnelles)",
      generateDataUrl: drawSignedSketchWithPII,
      precomputedResult: {
        status: "REJECTED",
        reason: "Signature nominative et données personnelles visibles (nom, e-mail, téléphone)",
        is_hand_drawn: true,
        alt_text:
          "Un croquis de collines sous le soleil accompagné du nom complet et des coordonnées de l'auteur.",
      },
    },
  ];
}
