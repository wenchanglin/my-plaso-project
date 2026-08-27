/**
 * Holds the derived vault key while the wallet is unlocked.
 *
 * `chrome.storage.session` is memory-only and cleared when the browser closes,
 * so the key never reaches disk. Its default access level excludes content
 * scripts, which keeps the key out of any page context; only the popup and the
 * service worker can read it.
 */
const SESSION_KEY_NAME = "wallet-session-key"

export const readSessionKey = async (): Promise<string | null> => {
  const stored = await chrome.storage.session.get(SESSION_KEY_NAME)
  const key = stored[SESSION_KEY_NAME]
  return typeof key === "string" && key.length > 0 ? key : null
}

export const writeSessionKey = (key: string): Promise<void> =>
  chrome.storage.session.set({ [SESSION_KEY_NAME]: key })

export const clearSessionKey = (): Promise<void> =>
  chrome.storage.session.remove(SESSION_KEY_NAME)
