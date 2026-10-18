import {
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase/config";

export async function getChallengeDetails(challengeId: string) {
  try {
    const docRef = doc(db, "challenges", challengeId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      throw new Error("Challenge introuvable.");
    }
    return { id: docSnap.id, ...docSnap.data() };
  } catch (err) {
    console.error("Error fetching challenge details:", err);
    throw err;
  }
}

export async function getUserCurrentPrompt(challengeId: string, userId: string) {
  try {
    const participantRef = doc(db, "participants", `${challengeId}_${userId}`);
    const participantSnap = await getDoc(participantRef);

    let unlockedOrder = 1;
    if (participantSnap.exists()) {
      unlockedOrder = participantSnap.data().highest_unlocked_order || 1;
    } else {
      // Initialize participant progress if not exists
      await setDoc(participantRef, {
        id: `${challengeId}_${userId}`,
        challenge_id: challengeId,
        user_id: userId,
        highest_unlocked_order: 1,
        joined_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    }

    const promptsQuery = query(
      collection(db, "prompts"),
      where("challenge_id", "==", challengeId),
      where("order", "<=", unlockedOrder),
      orderBy("order", "asc")
    );

    const promptsSnap = await getDocs(promptsQuery);
    const accessiblePrompts = promptsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    const activePrompt = accessiblePrompts[accessiblePrompts.length - 1] || null;

    return {
      accessiblePrompts,
      activePrompt,
    };
  } catch (err) {
    console.error("Error fetching user current prompt:", err);
    throw err;
  }
}

export async function submitDrawing(
  challengeId: string,
  promptId: string,
  userId: string,
  imageBlobUrl: string
) {
  try {
    const storagePath = `drawings/${challengeId}/${promptId}/${userId}.webp`;
    const storageRef = ref(storage, storagePath);
    await uploadString(storageRef, imageBlobUrl, "data_url");
    const downloadUrl = await getDownloadURL(storageRef);

    const subId = `${promptId}_${userId}`;
    const subDocRef = doc(db, "drawings", subId);

    const subData = {
      id: subId,
      challenge_id: challengeId,
      prompt_id: promptId,
      user_id: userId,
      storage_path: storagePath,
      image_url: downloadUrl,
      status: "PENDING",
      rejection_reason: null,
      created_at: serverTimestamp(),
    };

    await setDoc(subDocRef, subData);
    return subData;
  } catch (err) {
    console.error("Error submitting drawing:", err);
    throw err;
  }
}

export async function getGalleryDrawings(challengeId: string, promptId: string) {
  try {
    const q = query(
      collection(db, "drawings"),
      where("challenge_id", "==", challengeId),
      where("prompt_id", "==", promptId),
      where("status", "==", "APPROVED")
    );

    const querySnapshot = await getDocs(q);
    const drawings = querySnapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        imageUrl: data.image_url || data.imageUrl,
      };
    });

    return drawings;
  } catch (err) {
    console.error("Error fetching gallery drawings:", err);
    throw err;
  }
}
