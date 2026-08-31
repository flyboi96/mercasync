export type MealType = 'lunch' | 'dinner' | 'snack';
export type RecipeColor = 'sage' | 'sun' | 'clay' | 'blue' | 'berry';

export type RecipeIngredient = {
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  store: 'king_soopers' | 'costco';
};

export type Recipe = {
  id: string;
  name: string;
  mealType: MealType;
  description: string;
  cuisine: string;
  protein: string;
  method: string;
  effortMinutes: number;
  servings: number;
  lateNightSuitable: boolean;
  tags: string[];
  ingredients: RecipeIngredient[];
  instructions: string[];
  favorite: boolean;
  rating: number;
  note: string;
  color: RecipeColor;
};

const ingredient = (itemId: string, name: string, quantity: number, unit: string, store: RecipeIngredient['store'] = 'king_soopers'): RecipeIngredient => ({ itemId, name, quantity, unit, store });

export const STARTER_RECIPES: Recipe[] = [
  {
    id: 'miso-salmon-bowls', name: 'Miso salmon bowls', mealType: 'dinner',
    description: 'Savory glazed salmon with rice, cucumber, and sesame greens.', cuisine: 'Japanese-inspired', protein: 'Salmon', method: 'Stovetop', effortMinutes: 25, servings: 2, lateNightSuitable: false,
    tags: ['fish', 'whole foods', 'fresh', 'high protein'], color: 'sage', favorite: true, rating: 5, note: 'Extra cucumber next time.',
    ingredients: [ingredient('salmon', 'Salmon fillets', 1, 'lb'), ingredient('jasmine-rice', 'Jasmine rice', 1, 'cup'), ingredient('cucumber', 'Persian cucumbers', 3, 'each'), ingredient('spinach', 'Baby spinach', 5, 'oz'), ingredient('white-miso', 'White miso', 2, 'tbsp')],
    instructions: ['Cook the rice according to its package.', 'Whisk miso with one tablespoon each of water and soy sauce; brush over salmon.', 'Sear salmon until just cooked, then wilt spinach in the same pan.', 'Build bowls with rice, cucumber, spinach, and salmon.'],
  },
  {
    id: 'lemony-chicken-orzo', name: 'Lemony chicken orzo', mealType: 'dinner',
    description: 'A bright one-pan chicken dinner with spinach and creamy orzo.', cuisine: 'Mediterranean', protein: 'Chicken', method: 'One pan', effortMinutes: 30, servings: 2, lateNightSuitable: true,
    tags: ['one pan', 'comfort', 'vegetables', 'high protein'], color: 'sun', favorite: false, rating: 4, note: 'Reliable late-shift dinner.',
    ingredients: [ingredient('chicken-breast', 'Chicken breast', 1, 'lb', 'costco'), ingredient('orzo', 'Orzo', 1, 'cup'), ingredient('spinach', 'Baby spinach', 5, 'oz'), ingredient('lemon', 'Lemon', 1, 'each'), ingredient('parmesan', 'Parmesan', 0.25, 'cup')],
    instructions: ['Brown seasoned chicken in a deep skillet; set aside.', 'Toast orzo briefly, add two cups water, and simmer.', 'Return chicken to the pan and cook until the orzo is tender.', 'Fold in spinach, lemon juice, and parmesan.'],
  },
  {
    id: 'harissa-turkey-pitas', name: 'Harissa turkey pitas', mealType: 'dinner',
    description: 'Spiced turkey, crisp vegetables, and cool yogurt in warm pita.', cuisine: 'Mediterranean', protein: 'Turkey', method: 'Stovetop', effortMinutes: 20, servings: 2, lateNightSuitable: true,
    tags: ['fast', 'fresh', 'high protein', 'late night'], color: 'blue', favorite: true, rating: 5, note: 'Nathalia favorite.',
    ingredients: [ingredient('ground-turkey', 'Ground turkey', 1, 'lb'), ingredient('pita', 'Whole wheat pita', 4, 'each'), ingredient('harissa', 'Harissa paste', 2, 'tbsp'), ingredient('greek-yogurt', 'Greek yogurt', 0.5, 'cup', 'costco'), ingredient('cucumber', 'Persian cucumbers', 2, 'each')],
    instructions: ['Brown turkey in a skillet and stir in harissa.', 'Mix yogurt with a pinch of salt and a splash of water.', 'Warm pitas and slice cucumber.', 'Fill pitas with turkey, cucumber, and yogurt sauce.'],
  },
  {
    id: 'sheet-pan-chicken-vegetables', name: 'Sheet-pan chicken & vegetables', mealType: 'dinner',
    description: 'Roasted chicken, broccoli, peppers, and potatoes with smoky spices.', cuisine: 'American', protein: 'Chicken', method: 'Oven', effortMinutes: 40, servings: 2, lateNightSuitable: false,
    tags: ['oven', 'whole foods', 'meal prep', 'vegetables'], color: 'clay', favorite: false, rating: 4, note: '',
    ingredients: [ingredient('chicken-thighs', 'Boneless chicken thighs', 1, 'lb', 'costco'), ingredient('broccoli', 'Broccoli florets', 12, 'oz'), ingredient('bell-pepper', 'Bell pepper', 2, 'each'), ingredient('baby-potatoes', 'Baby potatoes', 1, 'lb')],
    instructions: ['Heat oven to 425°F.', 'Cut vegetables into bite-size pieces and toss with oil and smoked paprika.', 'Add seasoned chicken and spread everything on one sheet pan.', 'Roast 25–30 minutes, turning vegetables once.'],
  },
  {
    id: 'ginger-chicken-soup', name: 'Ginger chicken soup', mealType: 'dinner',
    description: 'A light, deeply flavored broth with chicken, mushrooms, and greens.', cuisine: 'Asian-inspired', protein: 'Chicken', method: 'One pot', effortMinutes: 30, servings: 2, lateNightSuitable: true,
    tags: ['lighter', 'one pot', 'vegetables', 'late night'], color: 'sage', favorite: false, rating: 4, note: '',
    ingredients: [ingredient('chicken-breast', 'Chicken breast', 0.75, 'lb', 'costco'), ingredient('broth', 'Chicken broth', 4, 'cup'), ingredient('mushrooms', 'Mushrooms', 8, 'oz'), ingredient('bok-choy', 'Baby bok choy', 2, 'each'), ingredient('ginger', 'Fresh ginger', 2, 'inch')],
    instructions: ['Simmer sliced ginger in broth for ten minutes.', 'Add thinly sliced chicken and mushrooms.', 'Simmer until chicken is cooked through.', 'Add bok choy for the final three minutes and season with soy sauce.'],
  },
  {
    id: 'steak-taco-night', name: 'Steak taco night', mealType: 'dinner',
    description: 'Charred steak tacos with cabbage, avocado, and punchy salsa.', cuisine: 'Mexican-inspired', protein: 'Beef', method: 'Grill pan', effortMinutes: 35, servings: 2, lateNightSuitable: false,
    tags: ['fun', 'comfort', 'fresh', 'high protein'], color: 'berry', favorite: true, rating: 5, note: 'Keep the charred salsa.',
    ingredients: [ingredient('flank-steak', 'Flank steak', 1, 'lb'), ingredient('corn-tortillas', 'Corn tortillas', 8, 'each'), ingredient('cabbage', 'Shredded cabbage', 2, 'cup'), ingredient('avocado', 'Avocado', 1, 'each'), ingredient('salsa', 'Salsa', 1, 'cup')],
    instructions: ['Season steak and sear in a very hot pan.', 'Rest steak while warming tortillas.', 'Slice steak thinly across the grain.', 'Assemble tacos with cabbage, avocado, and salsa.'],
  },
  {
    id: 'turkey-hummus-wrap', name: 'Turkey hummus wrap', mealType: 'lunch',
    description: 'A five-minute high-protein wrap with crunch and no cooking.', cuisine: 'Mediterranean', protein: 'Turkey', method: 'No cook', effortMinutes: 5, servings: 2, lateNightSuitable: true,
    tags: ['fast lunch', 'no cook', 'high protein'], color: 'blue', favorite: false, rating: 4, note: '',
    ingredients: [ingredient('whole-wheat-wraps', 'Whole wheat wraps', 2, 'each'), ingredient('deli-turkey', 'Deli turkey', 8, 'oz'), ingredient('hummus', 'Hummus', 0.5, 'cup'), ingredient('spinach', 'Baby spinach', 2, 'oz'), ingredient('cucumber', 'Persian cucumber', 1, 'each')],
    instructions: ['Spread hummus over each wrap.', 'Layer turkey, spinach, and sliced cucumber.', 'Roll tightly and cut in half.'],
  },
  {
    id: 'greek-yogurt-crunch-bowl', name: 'Greek yogurt crunch bowl', mealType: 'lunch',
    description: 'Greek yogurt, berries, almonds, and oats for an instant lunch.', cuisine: 'Everyday', protein: 'Greek yogurt', method: 'No cook', effortMinutes: 5, servings: 2, lateNightSuitable: true,
    tags: ['fast lunch', 'no cook', 'vegetarian'], color: 'sun', favorite: false, rating: 4, note: '',
    ingredients: [ingredient('greek-yogurt', 'Greek yogurt', 2, 'cup', 'costco'), ingredient('frozen-berries', 'Berries', 1, 'cup', 'costco'), ingredient('almonds', 'Almonds', 0.25, 'cup', 'costco'), ingredient('rolled-oats', 'Rolled oats', 0.5, 'cup', 'costco')],
    instructions: ['Divide yogurt between two bowls.', 'Top with berries, almonds, and oats.'],
  },
  {
    id: 'rotisserie-chicken-salad', name: 'Rotisserie chicken salad', mealType: 'lunch',
    description: 'A quick chopped salad built from ready-to-eat chicken.', cuisine: 'American', protein: 'Chicken', method: 'No cook', effortMinutes: 10, servings: 2, lateNightSuitable: true,
    tags: ['fast lunch', 'vegetables', 'high protein'], color: 'sage', favorite: false, rating: 4, note: '',
    ingredients: [ingredient('rotisserie-chicken', 'Rotisserie chicken', 0.5, 'each', 'costco'), ingredient('romaine', 'Romaine hearts', 1, 'each'), ingredient('cherry-tomatoes', 'Cherry tomatoes', 1, 'cup'), ingredient('cucumber', 'Persian cucumber', 1, 'each'), ingredient('vinaigrette', 'Vinaigrette', 0.25, 'cup')],
    instructions: ['Chop romaine, tomatoes, and cucumber.', 'Pull chicken into bite-size pieces.', 'Toss everything with vinaigrette.'],
  },
  {
    id: 'tuna-cucumber-toast', name: 'Tuna cucumber toast', mealType: 'lunch',
    description: 'Tangy tuna and crisp cucumber on sturdy whole-grain toast.', cuisine: 'Everyday', protein: 'Tuna', method: 'No cook', effortMinutes: 5, servings: 2, lateNightSuitable: true,
    tags: ['fast lunch', 'pantry', 'high protein'], color: 'clay', favorite: false, rating: 4, note: '',
    ingredients: [ingredient('canned-tuna', 'Canned tuna', 2, 'can'), ingredient('whole-grain-bread', 'Whole-grain bread', 4, 'slice'), ingredient('cucumber', 'Persian cucumber', 1, 'each'), ingredient('greek-yogurt', 'Greek yogurt', 0.25, 'cup', 'costco'), ingredient('lemon', 'Lemon', 0.5, 'each')],
    instructions: ['Mix drained tuna with yogurt and lemon.', 'Toast the bread and thinly slice cucumber.', 'Pile tuna and cucumber onto toast.'],
  },
];
