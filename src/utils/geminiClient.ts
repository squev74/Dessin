import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { INITIAL_CURATED_PROMPTS, DrawingPrompt } from "./curatedPrompts";

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

export async function generatePromptsClientSide(
  apiKey: string,
  count = 6,
  theme = "libre"
): Promise<DrawingPrompt[]> {
  if (!apiKey) {
    throw new Error("Clé API Gemini requise pour la génération.");
  }

  const ai = new GoogleGenAI({ apiKey });

  let userPrompt = `Génère exactement ${count} consignes de dessin bienveillantes et variées.`;
  if (theme && theme !== "libre") {
    userPrompt += ` Thème d'inspiration : "${theme}".`;
  }

  const modelsToTry = [
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite"
  ];

  let response: GenerateContentResponse | null = null;
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      response = await ai.models.generateContent({
        model,
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
      break;
    } catch (err: any) {
      console.warn(`Client model ${model} failed, trying next...`, err?.message || err);
      lastError = err;
    }
  }

  if (!response) {
    throw lastError || new Error("Tous les modèles Gemini ont échoué.");
  }

  const rawText = response.text?.trim() || "[]";
  const parsedPrompts: DrawingPrompt[] = JSON.parse(rawText);
  
  // Compress & lighten JSON before returning
  const compressed = parsedPrompts.map((p, idx) => ({
    id: `prompt-${Date.now()}-${idx}`,
    orderIndex: idx + 1,
    title: typeof p.title === "string" ? p.title.trim() : "Dessine librement.",
    category: p.category || "imagination",
    difficulty: p.difficulty || "facile",
  }));

  return compressed;
}

export async function analyzeDrawingClientSide(
  apiKey: string,
  params: {
    image_url: string;
    prompt_title: string;
    creation_type: string;
    medium: string;
    support: string;
    intention: string;
    level: string;
  }
): Promise<{ encouragement: string; tips: string[] }> {
  if (!apiKey) {
    throw new Error("Clé API Gemini requise pour l'analyse.");
  }

  const ai = new GoogleGenAI({ apiKey });

  let base64Data = params.image_url;
  let mimeType = "image/webp";
  if (params.image_url.startsWith("data:")) {
    const matches = params.image_url.match(/^data:(.+?);base64,(.+)$/);
    if (matches) {
      mimeType = matches[1];
      base64Data = matches[2];
    }
  } else if (params.image_url.startsWith("http://") || params.image_url.startsWith("https://")) {
    try {
      const fetchRes = await fetch(params.image_url);
      const arrayBuffer = await fetchRes.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      base64Data = btoa(binary);
      const contentType = fetchRes.headers.get("content-type");
      if (contentType) {
        mimeType = contentType.split(";")[0].trim();
      }
    } catch (fetchErr) {
      console.error("Error fetching image from URL in browser:", fetchErr);
    }
  }

  const analysisPrompt = `Analyse ce dessin réalisé dans le cadre du challenge artistique.
Consigne du sujet : "${params.prompt_title || "Libre"}"
Type de création : ${params.creation_type}
Médium utilisé : ${params.medium}
Support : ${params.support}
Intention / Objectif : ${params.intention}
Niveau de l'auteur : ${params.level}

Fournis une analyse bienveillante, constructive et experte.`;

  const modelsToTry = [
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite"
  ];

  let response: GenerateContentResponse | null = null;
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      response = await ai.models.generateContent({
        model,
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
      break;
    } catch (err: any) {
      console.warn(`Client model ${model} failed for analysis, trying next...`, err?.message || err);
      lastError = err;
    }
  }

  if (!response) {
    throw lastError || new Error("Tous les modèles Gemini ont échoué pour l'analyse.");
  }

  const rawText = response.text?.trim() || "{}";
  return JSON.parse(rawText);
}

export async function analyzePathAttemptClientSide(
  apiKey: string,
  params: {
    drawing_url: string;
    reference_image_url?: string | null;
    path_objective: string;
    step_title: string;
    step_description: string;
    creation_type: string;
    medium: string;
    support: string;
    intention: string;
    level: string;
    previous_attempts_count: number;
    previous_feedback?: string;
  }
): Promise<{ encouragement: string; tips: string[]; progress_comparison: string }> {
  if (!apiKey) {
    throw new Error("Clé API Gemini requise pour l'analyse.");
  }

  const ai = new GoogleGenAI({ apiKey });

  let base64Drawing = params.drawing_url;
  let mimeType = "image/webp";
  if (params.drawing_url.startsWith("data:")) {
    const matches = params.drawing_url.match(/^data:(.+?);base64,(.+)$/);
    if (matches) {
      mimeType = matches[1];
      base64Drawing = matches[2];
    }
  }

  const contents: any[] = [];
  contents.push({
    inlineData: {
      data: base64Drawing,
      mimeType: mimeType,
    },
  });

  if (params.reference_image_url) {
    let base64Ref = params.reference_image_url;
    let refMime = "image/webp";
    if (params.reference_image_url.startsWith("data:")) {
      const matches = params.reference_image_url.match(/^data:(.+?);base64,(.+)$/);
      if (matches) {
        refMime = matches[1];
        base64Ref = matches[2];
      }
    }
    contents.push({
      inlineData: {
        data: base64Ref,
        mimeType: refMime,
      },
    });
  }

  const promptText = `Analyse ce dessin dans le cadre d'un parcours d'auto-perfectionnement (challenge solo).
Objectif global du parcours : "${params.path_objective}"
Titre de l'étape actuelle : "${params.step_title}"
Consignes détaillées / Texte explicatif de l'étape : "${params.step_description}"
Type de création : ${params.creation_type}
Médium : ${params.medium}, Support : ${params.support}
Intention de l'auteur : ${params.intention}
Niveau : ${params.level}
Nombre d'essais précédents sur cette étape : ${params.previous_attempts_count}
${params.previous_feedback ? `Retour sur le dernier essai : "${params.previous_feedback}"` : ''}

Fournis une analyse bienveillante, constructive, experte et axée sur l'objectif global et l'étape.`;

  contents.push({ text: promptText });

  const modelsToTry = [
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite"
  ];

  let response: GenerateContentResponse | null = null;
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: `Tu es un professeur de dessin bienveillant, constructif et expert en coaching artistique personnel. Réponds STRICTEMENT au format JSON avec les clés :
- "encouragement" (string : un paragraphe chaleureux évaluant l'atteinte de l'objectif de l'étape)
- "tips" (array de strings : 2 à 3 conseils techniques précis et adaptés au médium/support)
- "progress_comparison" (string : une analyse comparative avec les essais précédents ou les marges de progression identifiées)`,
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
              progress_comparison: { type: Type.STRING },
            },
            required: ["encouragement", "tips", "progress_comparison"],
          },
        },
      });
      break;
    } catch (err: any) {
      console.warn(`Client model ${model} failed for path analysis, trying next...`, err?.message || err);
      lastError = err;
    }
  }

  if (!response) {
    throw lastError || new Error("Tous les modèles Gemini ont échoué pour l'analyse du parcours.");
  }

  const rawText = response.text?.trim() || "{}";
  return JSON.parse(rawText);
}

export async function generatePersonalPathClientSide(
  apiKey: string,
  topicOrGoal: string
): Promise<{ objective: string; steps: Array<{ title: string; description: string }> }> {
  if (!apiKey) {
    throw new Error("Clé API Gemini requise.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Crée un parcours d'apprentissage de dessin personnalisé et progressif basé sur l'objectif : "${topicOrGoal}".
Fournis un objet JSON avec :
- "objective" (string : reformulation inspirante de l'objectif global)
- "steps" (array de 5 à 6 étapes ordonnées, chacune contenant "title" (string) et "description" (string : consignes pédagogiques détaillées et explicatives)).`;

  const modelsToTry = [
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite"
  ];

  let response: GenerateContentResponse | null = null;
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: `Tu es un professeur de dessin expert et pédagogue. Réponds STRICTEMENT au format JSON demandé.`,
          temperature: 0.7,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              objective: { type: Type.STRING },
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                  required: ["title", "description"],
                },
              },
            },
            required: ["objective", "steps"],
          },
        },
      });
      break;
    } catch (err: any) {
      console.warn(`Client model ${model} failed for path generation...`, err?.message || err);
      lastError = err;
    }
  }

  if (!response) {
    throw lastError || new Error("Échec de la génération du parcours.");
  }

  const rawText = response.text?.trim() || "{}";
  return JSON.parse(rawText);
}
