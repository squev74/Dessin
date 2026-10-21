import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DrawingPrompt {
  title: string;
  category: "imagination" | "observation" | "technique" | "poetique";
  difficulty: "facile" | "moyen";
}

export interface ModerationResult {
  status: "APPROVED" | "REJECTED";
  reason: string | null;
  is_hand_drawn: boolean;
  alt_text: string;
}

const ART_DIRECTOR_SYSTEM_INSTRUCTION = `Tu es le directeur artistique d'une application de dessin collectif ludique, sans pression et ouverte à tous les niveaux.
Ta mission est de générer des consignes de dessin originales, bienveillantes et faciles à comprendre.

Principes des consignes :
- Courtes (1 phrase simple).
- Pas de pression technique.
- Alternance équilibrée entre observation, imagination absurde, défi technique et poésie.

Format de réponse requis : STRICTEMENT un tableau JSON conforme au schéma.
Chaque élément doit posséder :
- "title": la consigne en une seule phrase simple et chaleureuse.
- "category": l'une des 4 catégories exactes ("imagination", "observation", "technique", "poetique").
- "difficulty": "facile" ou "moyen".`;

const MODERATION_SYSTEM_INSTRUCTION = `Tu es l'agent de modération automatique d'une application de dessin collectif. Réponds strictement au format JSON demandé.`;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "La clé GEMINI_API_KEY n'est pas configurée dans l'environnement."
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function generateContentWithFallback(ai: GoogleGenAI, baseParams: any) {
  const modelsToTry = [
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite"
  ];
  let lastError: any = null;
  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        ...baseParams,
        model,
      });
      return response;
    } catch (err: any) {
      console.warn(`Model ${model} failed, trying next...`, err?.message || err);
      lastError = err;
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "15mb" }));

  // Endpoint 1: Art Director Prompt Generator using Gemini Flash with thinkingBudget: 0
  app.post("/api/prompts/generate", async (req, res) => {
    try {
      const {
        count = 6,
        theme = "libre",
        requestedCategory,
        requestedDifficulty,
      } = req.body;

      const ai = getAiClient();

      let userPrompt = `Génère exactement ${count} consignes de dessin bienveillantes et variées.`;
      if (theme && theme !== "libre") {
        userPrompt += ` Thème d'inspiration : "${theme}".`;
      }
      if (requestedCategory && requestedCategory !== "all") {
        userPrompt += ` Catégorie privilégiée : "${requestedCategory}".`;
      }
      if (requestedDifficulty && requestedDifficulty !== "all") {
        userPrompt += ` Difficulté souhaitée : "${requestedDifficulty}".`;
      }

      const response: GenerateContentResponse = await generateContentWithFallback(ai, {
        contents: userPrompt,
        config: {
          systemInstruction: ART_DIRECTOR_SYSTEM_INSTRUCTION,
          temperature: 0.7,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                category: { type: Type.STRING, enum: ["imagination", "observation", "technique", "poetique"] },
                difficulty: { type: Type.STRING, enum: ["facile", "moyen"] },
              },
              required: ["title", "category", "difficulty"],
            },
          },
        },
      });

      const rawText = response.text?.trim() || "[]";
      // Compress & lighten JSON before sending
      const parsedPrompts: DrawingPrompt[] = JSON.parse(rawText);
      const compressed = parsedPrompts.map((p) => ({
        title: typeof p.title === "string" ? p.title.trim() : "Dessine librement.",
        category: p.category || "imagination",
        difficulty: p.difficulty || "facile",
      }));

      res.json(compressed);
    } catch (error: unknown) {
      console.error("Erreur génération consignes:", error);
      const message = error instanceof Error ? error.message : "Erreur de génération.";
      res.status(500).json({ error: message });
    }
  });

  // Endpoint 2: AI Drawing Analysis using Gemini Vision
  app.post("/api/analyze-drawing", async (req, res) => {
    try {
      const {
        image_url,
        prompt_title,
        creation_type = "numérique",
        medium = "N/A",
        support = "N/A",
        intention = "Aucune",
        level = "Tous niveaux",
      } = req.body;

      if (!image_url) {
        return res.status(400).json({ error: "Image manquante." });
      }

      const ai = getAiClient();

      // Extract base64 part if data url or fetch if remote URL
      let base64Data = image_url;
      let mimeType = "image/webp";
      if (image_url.startsWith("data:")) {
        const matches = image_url.match(/^data:(.+?);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      } else if (image_url.startsWith("http://") || image_url.startsWith("https://")) {
        try {
          const fetchRes = await fetch(image_url);
          const arrayBuffer = await fetchRes.arrayBuffer();
          base64Data = Buffer.from(arrayBuffer).toString("base64");
          const contentType = fetchRes.headers.get("content-type");
          if (contentType) {
            mimeType = contentType.split(";")[0].trim();
          }
        } catch (fetchErr) {
          console.error("Error fetching image from URL:", fetchErr);
        }
      }

      const analysisPrompt = `Analyse ce dessin réalisé dans le cadre du challenge artistique.
Consigne du sujet : "${prompt_title || "Libre"}"
Type de création : ${creation_type}
Médium utilisé : ${medium}
Support : ${support}
Intention / Objectif : ${intention}
Niveau de l'auteur : ${level}

Fournis une analyse bienveillante, constructive et experte.`;

      const response: GenerateContentResponse = await generateContentWithFallback(ai, {
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          { text: analysisPrompt },
        ],
        config: {
          systemInstruction: `Tu es un professeur de dessin bienveillant, constructif et expert en analyse artistique. Réponds STRICTEMENT au format JSON avec les clés : "encouragement" (string : un paragraphe chaleureux mettant en valeur les points forts et la sensibilité de l'interprétation) et "tips" (array de strings : 2 à 3 conseils d'amélioration concrets, pratiques et adaptés au médium/support).`,
          temperature: 0.7,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              encouragement: { type: Type.STRING },
              tips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ["encouragement", "tips"],
          },
        },
      });

      const rawText = response.text?.trim() || "{}";
      const result = JSON.parse(rawText);
      res.json(result);
    } catch (error: unknown) {
      console.error("Erreur analyse IA dessin:", error);
      const message = error instanceof Error ? error.message : "Erreur lors de l'analyse IA.";
      res.status(500).json({ error: message });
    }
  });

  // Mount Vite or static dist
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Serveur ArtGuard AI actif sur http://0.0.0.0:${PORT}`);
  });
}

startServer();
