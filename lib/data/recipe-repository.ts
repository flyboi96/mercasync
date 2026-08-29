'use client';

import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch, type Unsubscribe } from 'firebase/firestore';
import { STARTER_RECIPES, type Recipe } from '@/lib/domain/recipe';
import { firebaseHouseholdId, getFirebaseServices, usesFirebaseBackend } from '@/lib/firebase/client';

function recipeCollection(householdId?: string) {
  const { db } = getFirebaseServices();
  return collection(db, 'households', householdId || firebaseHouseholdId(), 'recipes');
}

export function subscribeToRecipes(
  householdId: string | undefined,
  onChange: (recipes: Recipe[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!usesFirebaseBackend()) {
    onChange(STARTER_RECIPES);
    return () => undefined;
  }
  let bootstrapping = false;
  return onSnapshot(recipeCollection(householdId), async (snapshot) => {
    if (snapshot.empty && !bootstrapping) {
      bootstrapping = true;
      try { await seedStarterRecipes(householdId); }
      catch (error) { onError(error instanceof Error ? error : new Error('Could not create the starter recipe library.')); }
      return;
    }
    onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Recipe).sort((a, b) => a.name.localeCompare(b.name)));
  }, onError);
}

async function seedStarterRecipes(householdId?: string) {
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before creating the recipe library.');
  const resolvedHouseholdId = householdId || firebaseHouseholdId();
  const batch = writeBatch(db);
  STARTER_RECIPES.forEach(({ id, ...recipe }) => {
    batch.set(doc(db, 'households', resolvedHouseholdId, 'recipes', id), {
      ...recipe,
      createdBy: auth.currentUser!.uid,
      createdAt: serverTimestamp(),
      updatedBy: auth.currentUser!.uid,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function updateRecipePreferences(
  id: string,
  changes: Partial<Pick<Recipe, 'favorite' | 'rating' | 'note'>>,
  householdId?: string,
) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before updating a recipe.');
  await updateDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'recipes', id), {
    ...changes,
    updatedBy: auth.currentUser.uid,
    updatedAt: serverTimestamp(),
  });
}

export async function createRecipe(recipe: Recipe, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  if (!recipe.name.trim() || !recipe.ingredients.length || !recipe.instructions.length) throw new Error('Recipe needs a name, ingredients, and steps.');
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before adding a recipe.');
  const { id, ...data } = recipe;
  await setDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'recipes', id), { ...data, createdBy: auth.currentUser.uid, createdAt: serverTimestamp(), updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() });
}

export async function updateRecipe(recipe: Recipe, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before editing a recipe.');
  const { id, ...data } = recipe;
  await updateDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'recipes', id), { ...data, updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() });
}

export async function deleteRecipe(id: string, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { db } = getFirebaseServices();
  await deleteDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'recipes', id));
}
