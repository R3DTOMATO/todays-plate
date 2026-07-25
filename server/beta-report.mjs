import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(process.env.DATA_DIR || resolve(HERE, 'data'));

async function readJsonLines(filename) {
  try {
    const text = await readFile(resolve(DATA_DIR, filename), 'utf8');
    return text.split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function countBy(items, getKey) {
  const map = new Map();
  for (const item of items) {
    const key = String(getKey(item) || 'unknown');
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]));
}

function percent(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : 0;
}

const events = await readJsonLines('events.jsonl');
const feedback = await readJsonLines('feedback.jsonl');
const byName = countBy(events, (event) => event.name);
const uniqueUsers = new Set(events.map((event) => event.anonymousUserId).filter(Boolean));
const uniqueSessions = new Set(events.map((event) => event.sessionId).filter(Boolean));

const starts = byName.recommendation_started || 0;
const completions = byName.recommendation_completed || 0;
const resultViews = byName.recommendation_result_viewed || 0;
const selections = byName.menu_selected || 0;
const mealRecords = byName.meal_record_created || 0;
const returns = byName.user_returned || 0;
const errors = events.filter((event) => /error|failed|failure/i.test(event.name));
const rejectionEvents = events.filter((event) => event.name === 'menu_rejected');

const report = {
  generatedAt: new Date().toISOString(),
  dataDirectory: DATA_DIR,
  overview: {
    events: events.length,
    uniqueUsers: uniqueUsers.size,
    uniqueSessions: uniqueSessions.size,
    feedback: feedback.length,
    errors: errors.length,
  },
  funnel: {
    recommendationStarts: starts,
    recommendationCompletions: completions,
    resultViews,
    menuSelections: selections,
    mealRecords,
    recommendationCompletionRate: percent(completions, starts),
    resultToSelectionRate: percent(selections, resultViews),
    startToSelectionRate: percent(selections, starts),
    selectionToRecordRate: percent(mealRecords, selections),
  },
  engagement: {
    returns,
    restaurantSearches: byName.restaurant_search_started || 0,
    restaurantSelections: byName.restaurant_selected || 0,
    recipeViews: byName.recipe_viewed || 0,
    favorites: byName.menu_favorited || 0,
    alternativeSelections: byName.alternative_menu_selected || 0,
  },
  rejectionReasons: countBy(rejectionEvents, (event) => event.properties?.reason),
  eventsByName: byName,
  feedbackByType: countBy(feedback, (item) => item.type),
  errorsByName: countBy(errors, (event) => event.name),
};

console.log(JSON.stringify(report, null, 2));
