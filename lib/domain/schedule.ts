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
  meal: {
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
  { title: 'Miso salmon bowls', tone: 'sage', effort: 'Standard' as const },
  { title: 'Lemony chicken orzo', tone: 'sun', effort: 'Standard' as const },
  { title: 'Leftovers', tone: 'clay', effort: 'Quick' as const },
  { title: 'Harissa turkey pitas', tone: 'blue', effort: 'Quick' as const },
  { title: 'Steak taco night', tone: 'berry', effort: 'Relaxed' as const },
  { title: 'Dinner out', tone: 'ink', effort: 'None' as const },
  { title: 'Ginger chicken soup', tone: 'sage', effort: 'Standard' as const },
];

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
    .filter((exception) => exception.personId === personId && exception.date === date)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const kind = matching.at(-1)?.kind || 'home';
  return {
    kind,
    label: availabilityLabels[kind],
    isHome: kind !== 'away' && kind !== 'work_trip',
    isLate: kind === 'late_shift',
  };
}

function adaptDinner(
  baseDinner: (typeof baseDinners)[number],
  availability: Record<PersonId, Availability>,
) {
  const diners = people.filter((personId) => availability[personId].isHome);
  const hasLateShift = diners.some((personId) => availability[personId].isLate);

  if (diners.length === 0) {
    return {
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
): PlanningDay[] {
  const today = localDateForTimeZone(now, timeZone);
  const start = planningWeekStart(today);

  return baseDinners.map((baseDinner, index) => {
    const date = addLocalDays(start, index);
    const alex = availabilityFor('alex', date, exceptions);
    const nathalia = availabilityFor('nathalia', date, exceptions);
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
