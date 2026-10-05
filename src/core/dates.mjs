export function todayInZone(time, timezone) {
  const parts = new Intl.DateTimeFormat(undefined, { timeZone: timezone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time));
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function earliestUnlearned(dates, learned, today) {
  return dates.find(date => date <= today && !learned.includes(date)) ?? null;
}
