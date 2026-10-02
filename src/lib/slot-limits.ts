// Slot limits shared by server validation and admin forms (client-safe: no server imports).
export const MAX_SLOT_PARTICIPANTS = 1_000;
export const DEFAULT_MAX_PARTICIPANTS = 20; // matches the Slot.maxParticipants column default
// Plants per quest: how many approved plants complete one quest on a slot.
export const MAX_QUEST_GOAL = 500; // = MAX_PLANTS_PER_SUBMISSION, so one submission can always finish a quest
export const DEFAULT_QUEST_GOAL = 1; // matches the Slot.questGoal column default
