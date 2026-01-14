/**
 * User onboarding state tracking
 * Tracks completion of various onboarding steps
 */

const ONBOARDING_STORAGE_KEY = 'product-architect-onboarding';

export interface OnboardingState {
  emailConfirmed: boolean;
  orgCreated: boolean;
  storeConfigured: boolean;
  aiConfigured: boolean;
  firstProductCreated: boolean;
  guideDismissed: boolean;
  completedAt?: string;
}

const defaultState: OnboardingState = {
  emailConfirmed: false,
  orgCreated: false,
  storeConfigured: false,
  aiConfigured: false,
  firstProductCreated: false,
  guideDismissed: false,
};

export function getOnboardingState(): OnboardingState {
  if (typeof window === 'undefined') return defaultState;

  try {
    const stored = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (stored) {
      return { ...defaultState, ...JSON.parse(stored) };
    }
  } catch (err) {
    console.error('Failed to load onboarding state:', err);
  }

  return defaultState;
}

export function updateOnboardingState(updates: Partial<OnboardingState>): void {
  if (typeof window === 'undefined') return;

  try {
    const current = getOnboardingState();
    const updated = { ...current, ...updates };
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save onboarding state:', err);
  }
}

export function markOnboardingComplete(): void {
  updateOnboardingState({
    emailConfirmed: true,
    orgCreated: true,
    completedAt: new Date().toISOString(),
  });
}

export function isFirstTimeUser(): boolean {
  const state = getOnboardingState();
  return !state.guideDismissed && !state.firstProductCreated;
}

export function shouldShowGuide(): boolean {
  const state = getOnboardingState();
  return !state.guideDismissed && (state.orgCreated || state.emailConfirmed);
}
