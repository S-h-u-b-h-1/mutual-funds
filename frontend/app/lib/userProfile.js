"use client";

export const PROFILE_VERSION = 1;
export const PROFILE_STORAGE_PREFIX = "mfp-user-profile-v1";

export const PROFILE_OPTIONS = {
  roles: [
    ["individual", "Individual investor"],
    ["advisor", "Advisor / distributor"],
    ["analyst", "Analyst / researcher"],
    ["family-office", "Family office"],
  ],
  goals: [
    ["research", "Research mutual funds"],
    ["compare", "Compare schemes"],
    ["portfolio", "Review my portfolio"],
    ["news", "Track market impact"],
  ],
  experience: [
    ["beginner", "New to funds"],
    ["intermediate", "Regular investor"],
    ["advanced", "Advanced researcher"],
    ["professional", "Professional user"],
  ],
  risk: [
    ["conservative", "Conservative"],
    ["moderate", "Moderate"],
    ["aggressive", "Aggressive"],
  ],
  horizons: [
    ["0-1", "0–1 year"],
    ["1-3", "1–3 years"],
    ["3-5", "3–5 years"],
    ["5+", "5+ years"],
  ],
  aumBands: [
    ["not-specified", "Prefer not to say"],
    ["under-5l", "Under ₹5L"],
    ["5l-25l", "₹5L–₹25L"],
    ["25l-1cr", "₹25L–₹1Cr"],
    ["1cr+", "₹1Cr+"],
  ],
};

export const DEFAULT_PROFILE = {
  role: "",
  primaryGoal: "",
  experience: "",
  riskComfort: "",
  horizon: "",
  aumBand: "not-specified",
  preferredCategories: "",
};

export function profileKeyForUser(user) {
  const identity = user?.id || user?.email || user?.name || "anonymous";
  return `${PROFILE_STORAGE_PREFIX}:${String(identity).toLowerCase()}`;
}

function profileKeysForUser(user) {
  const keys = [profileKeyForUser(user)];
  if (user?.id && user?.email) keys.push(`${PROFILE_STORAGE_PREFIX}:${String(user.email).toLowerCase()}`);
  return [...new Set(keys)];
}

export function isProfileComplete(profile) {
  return Boolean(
    profile?.role &&
      profile?.primaryGoal &&
      profile?.experience &&
      profile?.riskComfort &&
      profile?.horizon
  );
}

export function getStoredProfile(user) {
  if (typeof window === "undefined") return null;
  try {
    const raw = profileKeysForUser(user).map((key) => window.localStorage.getItem(key)).find(Boolean);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.version === PROFILE_VERSION ? parsed : { ...parsed, version: PROFILE_VERSION };
  } catch {
    return null;
  }
}

export function saveStoredProfile(user, profile) {
  if (typeof window === "undefined") return null;
  const payload = {
    ...DEFAULT_PROFILE,
    ...profile,
    version: PROFILE_VERSION,
    completed: isProfileComplete(profile),
    updatedAt: new Date().toISOString(),
  };
  profileKeysForUser(user).forEach((key) => window.localStorage.setItem(key, JSON.stringify(payload)));
  window.dispatchEvent(new CustomEvent("mfp-profile-updated", { detail: payload }));
  return payload;
}

export function optionLabel(group, value) {
  return PROFILE_OPTIONS[group]?.find(([key]) => key === value)?.[1] || value || "Not set";
}
