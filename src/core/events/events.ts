/** Everything that can happen in the buddy's world. Extend as features land. */
export interface BuddyEvents {
  'duck.clicked': { x: number; y: number }
  'duck.petted': { count: number }
  'toy.played': { toyId: string }
  'gift.opened': { tier: string }
  'item.equipped': { slot: string; itemId: string | null }
  'focus.completed': { minutes: number }
}

export type BuddyEventName = keyof BuddyEvents
