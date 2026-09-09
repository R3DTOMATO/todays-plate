// Private account preferences. Shared by the web entry flow and its tests.
export const TASTE_VERSION = 1;
const choices = {
  homeCountry: ['KR','JP','CN','TW','HK','US','GB','FR','IT','VN','TH','IN','MX','OTHER'],
  preferredTypes: ['한식','중식','일식','양식','세계음식'],
  allergens: ['shrimp','seafood','egg','dairy','wheat','soy','nuts','pork','beef'],
  excludedIngredients: ['seafood','shrimp','pork','beef','chicken','egg','dairy','wheat','spicy','fried','highSodium'],
  dietRestrictions: ['vegetarian','vegan','lowCarb','highProtein','diet'],
};

export function tastePreferences(profile = {}) {
  const result = { version: TASTE_VERSION, completed: true };
  result.homeCountry = choices.homeCountry.includes(profile.homeCountry) ? profile.homeCountry : 'KR';
  for (const key of ['preferredTypes','allergens','excludedIngredients','dietRestrictions']) {
    result[key] = [...new Set(Array.isArray(profile[key]) ? profile[key] : [])]
      .filter(value => choices[key].includes(value));
  }
  return result;
}

export function hasCompletedTaste(profile) {
  return profile?.version === TASTE_VERSION && profile.completed === true;
}

export function tasteStorageKey(uid) {
  return `todaysplate_profile_v1:${uid}`;
}
