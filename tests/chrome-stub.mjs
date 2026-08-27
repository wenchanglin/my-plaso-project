/**
 * Minimal `chrome.storage` double for Node tests: promise-based `local` and
 * `session` areas plus `onChanged`, which is all the wallet code touches.
 */
const createOnChanged = () => {
  const listeners = new Set()
  return {
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
    emit: (changes, areaName) => {
      for (const listener of listeners) listener(changes, areaName)
    }
  }
}

const createArea = (areaName, onChanged) => {
  const data = new Map()

  return {
    data,
    area: {
      get: async (key) => {
        if (key === undefined || key === null) return Object.fromEntries(data)
        const keys = Array.isArray(key) ? key : [key]
        return Object.fromEntries(
          keys.filter((name) => data.has(name)).map((name) => [name, data.get(name)])
        )
      },
      set: async (values) => {
        const changes = {}
        for (const [name, value] of Object.entries(values)) {
          changes[name] = { oldValue: data.get(name), newValue: value }
          data.set(name, value)
        }
        onChanged.emit(changes, areaName)
      },
      remove: async (key) => {
        const keys = Array.isArray(key) ? key : [key]
        const changes = {}
        for (const name of keys) {
          changes[name] = { oldValue: data.get(name) }
          data.delete(name)
        }
        onChanged.emit(changes, areaName)
      }
    }
  }
}

export const installChromeStub = () => {
  const onChanged = createOnChanged()
  const local = createArea("local", onChanged)
  const session = createArea("session", onChanged)
  const openedPopups = []

  globalThis.chrome = {
    storage: { local: local.area, session: session.area, onChanged },
    action: {
      openPopup: async () => {
        openedPopups.push(Date.now())
      }
    },
    runtime: {}
  }

  return {
    local: local.data,
    session: session.data,
    openedPopups,
    reset: () => {
      local.data.clear()
      session.data.clear()
      openedPopups.length = 0
    }
  }
}
