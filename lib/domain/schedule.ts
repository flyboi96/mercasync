export type PersonId = 'alex' | 'nathalia';

export type ScheduleExceptionKind =
  | 'home'
  | 'late_shift'
  | 'work_trip'
  | 'day_off'
  | 'holiday'
  | 'away';

export type ScheduleException = {
  id: string;
  personId: PersonId;
  kind: ScheduleExceptionKind;
  date: string;
  endDate?: string | null;
  title: string;
  location?: string | null;
  createdAt?: number;
};

export type Availability = {
  kind: ScheduleExceptionKind;
  label: string;
  isHome: boolean;
  isLate: boolean;
};

export type DinnerEffort = 'None' | 'Quick' | 'Standard' | 'Relaxed';

export type PlanningDay = {
  date: string;
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  alex: Availability;
  nathalia: Availability;
  lunch: {
    recipeId: string | null;
    title: string;
    servings: number;
    effort: '5 min' | '10 min';
    rationale: string;
  };
  meal: {
    recipeId: string | null;
    title: string;
    tone: string;
    servings: number;
    effort: DinnerEffort;
    label: 'DINNER' | 'OUT' | 'NO DINNER';
    rationale: string;
  };
};

const people: PersonId[] = ['alex', 'nathalia'];

const availabilityLabels: Record<ScheduleExceptionKind, string> = {
  home: 'Home',
  late_shift: 'Late shift',
  work_trip: 'Work trip',
  day_off: 'Day off',
  holiday: 'Holiday',
  away: 'Away',
};

const baseDinners = [
  { recipeId: 'miso-salmon-bowls', title: 'Miso salmon bowls', tone: 'sage', effort: 'Standard' as const },
  { recipeId: 'lemony-chicken-orzo', title: 'Lemony chicken orzo', tone: 'sun', effort: 'Standard' as const },
  { recipeId: 'sheet-pan-chicken-vegetables', title: 'Sheet-pan chicken & vegetables', tone: 'clay', effort: 'Standard' as const },
  { recipeId: 'harissa-turkey-pitas', title: 'Harissa turkey pitas', tone: 'blue', effort: 'Quick' as const },
  { recipeId: 'steak-taco-night', title: 'Steak taco night', tone: 'berry', effort: 'Relaxed' as const },
  { recipeId: null, title: 'Dinner out', tone: 'ink', effort: 'None' as const },
  { recipeId: 'ginger-chicken-soup', title: 'Ginger chicken soup', tone: 'sage', effort: 'Standard' as const },
];
const emptyDinners = Array.from({ length: 7 }, () => ({ recipeId: null, title: 'Dinner to plan', tone: 'sage', effort: 'Standard' as const }));

const dinnerPriority = [0, 1, 3, 4, 6, 2];

const leftoversDinner = { recipeId: null, title: 'Leftovers', tone: 'clay', effort: 'Quick' as const };

const baseLunches = [
  { recipeId: 'turkey-hummus-wrap', title: 'Turkey hummus wrap', effort: '5 min' as const },
  { recipeId: 'greek-yogurt-crunch-bowl', title: 'Greek yogurt crunch bowl', effort: '5 min' as const },
  { recipeId: 'rotisserie-chicken-salad', title: 'Rotisserie chicken salad', effort: '10 min' as const },
  { recipeId: 'tuna-cucumber-toast', title: 'Tuna cucumber toast', effort: '5 min' as const },
  { recipeId: 'turkey-hummus-wrap', title: 'Turkey hummus wrap', effort: '5 min' as const },
  { recipeId: 'greek-yogurt-crunch-bowl', title: 'Greek yogurt crunch bowl', effort: '5 min' as const },
  { recipeId: 'rotisserie-chicken-salad', title: 'Rotisserie chicken salad', effort: '10 min' as const },
];
const emptyLunches = Array.from({ length: 7 }, () => ({ recipeId: null, title: 'Lunch to plan', effort: '5 min' as const }));

function dateAtNoonUtc(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

export function addLocalDays(date: string, count: number) {
  const next = dateAtNoonUtc(date);
  next.setUTCDate(next.getUTCDate() + count);
  return next.toISOString().slice(0, 10);
}

export function localDateForTimeZone(
  instant: Date,
  timeZone = 'America/Denver',
) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function planningWeekStart(today: string) {
  const weekday = dateAtNoonUtc(today).getUTCDay();
  const daysUntilMonday = (8 - weekday) % 7;
  return addLocalDays(today, daysUntilMonday);
}

function availabilityFor(
  personId: PersonId,
  date: string,
  exceptions: ScheduleException[],
): Availability {
  const matching = exceptions
    .filter((exception) => exception.personId === personId && scheduleExceptionApplies(exception, date))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const kind = matching.at(-1)?.kind || 'home';
  return {
    kind,
    label: availabilityLabels[kind],
    isHome: kind !== 'away' && kind !== 'work_trip',
    isLate: kind === 'late_shift',
  };
}

export function scheduleExceptionApplies(exception: ScheduleException, date: string) {
  return exception.date <= date && (exception.endDate || exception.date) >= date;
}

export function calendarMonthDays(anchor: string) {
  const monthStart = `${anchor.slice(0, 7)}-01`;
  const leadingDays = dateAtNoonUtc(monthStart).getUTCDay();
  const gridStart = addLocalDays(monthStart, -leadingDays);
  return Array.from({ length: 42 }, (_, index) => addLocalDays(gridStart, index));
}

export function calendarMonthLabel(anchor: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dateAtNoonUtc(anchor));
}

function adaptDinner(
  baseDinner: (typeof baseDinners)[number],
  availability: Record<PersonId, Availability>,
) {
  const diners = people.filter((personId) => availability[personId].isHome);
  const hasLateShift = diners.some((personId) => availability[personId].isLate);

  if (diners.length === 0) {
    return {
      recipeId: null,
      title: 'Dinner off',
      tone: 'ink',
      servings: 0,
      effort: 'None' as const,
      label: 'NO DINNER' as const,
      rationale: 'Nobody is home for dinner.',
    };
  }

  if (baseDinner.title === 'Dinner out') {
    return {
      ...baseDinner,
      servings: diners.length,
      label: 'OUT' as const,
      rationale:
        diners.length === 1
          ? 'Dinner out adjusted to one person.'
          : 'Both people are available for dinner out.',
    };
  }

  if (diners.length === 1) {
    return {
      ...baseDinner,
      servings: 1,
      effort: 'Quick' as const,
      label: 'DINNER' as const,
      rationale: `${diners[0] === 'alex' ? 'Alex' : 'Nathalia'} is the only diner, so the plan uses one quick serving.`,
    };
  }

  if (hasLateShift) {
    return {
      ...baseDinner,
      servings: 2,
      effort: 'Quick' as const,
      label: 'DINNER' as const,
      rationale: 'A late shift keeps two servings but lowers dinner effort.',
    };
  }

  return {
    ...baseDinner,
    servings: 2,
    label: 'DINNER' as const,
    rationale: 'Both people are home on their normal schedule.',
  };
}

export function buildPlanningWeek(
  exceptions: ScheduleException[],
  now = new Date(),
  timeZone = 'America/Denver',
  dinnerTarget = 5,
  seedDemoMeals = true,
): PlanningDay[] {
  const today = localDateForTimeZone(now, timeZone);
  const start = planningWeekStart(today);

  const dinners = seedDemoMeals ? baseDinners : emptyDinners;
  const lunches = seedDemoMeals ? baseLunches : emptyLunches;
  const availability = dinners.map((_, index) => {
    const date = addLocalDays(start, index);
    return { date, alex: availabilityFor('alex', date, exceptions), nathalia: availabilityFor('nathalia', date, exceptions) };
  });
  const selectedDinners = new Set(dinnerPriority
    .filter((index) => availability[index].alex.isHome || availability[index].nathalia.isHome)
    .slice(0, Math.max(0, Math.min(6, dinnerTarget))));

  return dinners.map((candidateDinner, index) => {
    const date = addLocalDays(start, index);
    const { alex, nathalia } = availability[index];
    const baseDinner = seedDemoMeals && index === 5 ? candidateDinner : selectedDinners.has(index) ? candidateDinner : leftoversDinner;
    const lunchDiners = people.filter((personId) => ({ alex, nathalia })[personId].isHome);
    const baseLunch = lunches[index];
    const displayDate = dateAtNoonUtc(date);

    return {
      date,
      dayLabel: new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        timeZone: 'UTC',
      }).format(displayDate),
      dateLabel: String(displayDate.getUTCDate()),
      isToday: date === today,
      alex,
      nathalia,
      lunch: {
        ...baseLunch,
        servings: lunchDiners.length,
        rationale: lunchDiners.length === 0
          ? 'Nobody is home for lunch.'
          : `${lunchDiners.length} extremely quick ${lunchDiners.length === 1 ? 'lunch' : 'lunches'} for whoever is home.`,
      },
      meal: adaptDinner(baseDinner, { alex, nathalia }),
    };
  });
}

export function planningWeekLabel(days: PlanningDay[]) {
  if (days.length === 0) return '';
  const start = dateAtNoonUtc(days[0].date);
  const end = dateAtNoonUtc(days.at(-1)!.date);
  const startMonth = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: 'UTC',
  }).format(start);
  const endMonth = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: 'UTC',
  }).format(end);
  return startMonth === endMonth
    ? `${startMonth} ${start.getUTCDate()}–${end.getUTCDate()}`
    : `${startMonth} ${start.getUTCDate()} – ${endMonth} ${end.getUTCDate()}`;
}

export function formatLongDate(now = new Date(), timeZone = 'America/Denver') {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone,
  })
    .format(now)
    .toUpperCase();
}
