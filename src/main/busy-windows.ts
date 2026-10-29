import koffi from 'koffi'

/**
 * QUERY_USER_NOTIFICATION_STATE values that mean "don't interrupt": a fullscreen app or game
 * (2 busy, 3 Direct3D fullscreen), presentation mode (4), or a fullscreen Store app (7).
 */
const BUSY_STATES = new Set([2, 3, 4, 7])

/**
 * Asks Windows whether this is a bad moment to pop something up, with one shell32 call through
 * koffi: `SHQueryUserNotificationState`, the same check Windows uses for its own toasts. Reads
 * nothing about which app it is. Elsewhere, or if the call is unavailable, it is never busy.
 */
export function windowsBusy(): () => boolean {
  if (process.platform !== 'win32') return () => false
  try {
    const shell32 = koffi.load('shell32.dll')
    const query = shell32.func(
      'int32_t __stdcall SHQueryUserNotificationState(_Out_ int32_t* state)',
    )
    return () => {
      const state = [0]
      if (query(state) !== 0) return false
      return BUSY_STATES.has(state[0] ?? 0)
    }
  } catch (error) {
    console.error('Fullscreen check unavailable, the break buddy may ask during games', error)
    return () => false
  }
}
