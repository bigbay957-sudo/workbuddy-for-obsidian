export const MAX_WORKBUDDY_TASKS = 5;

export function canAddWorkBuddyTask(currentCount: number): boolean {
  return Number.isInteger(currentCount) && currentCount >= 0 && currentCount < MAX_WORKBUDDY_TASKS;
}
