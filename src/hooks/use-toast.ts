import { useEffect, useState } from "react"

export interface ToastItem {
  id: string
  title: string
  description?: string
  tone?: "default" | "error"
}

const listeners = new Set<(items: ToastItem[]) => void>()
let items: ToastItem[] = []
let nextId = 0

const emit = () => {
  for (const listener of listeners) listener(items)
}

export const toast = ({
  title,
  description,
  tone = "default"
}: Omit<ToastItem, "id">) => {
  const id = `toast-${++nextId}`
  items = [...items, { id, title, description, tone }].slice(-3)
  emit()

  const timeout = setTimeout(() => {
    items = items.filter((item) => item.id !== id)
    emit()
  }, 4500)

  return {
    id,
    dismiss: () => {
      clearTimeout(timeout)
      items = items.filter((item) => item.id !== id)
      emit()
    }
  }
}

export const useToast = () => {
  const [currentItems, setCurrentItems] = useState(items)

  useEffect(() => {
    listeners.add(setCurrentItems)
    return () => {
      listeners.delete(setCurrentItems)
    }
  }, [])

  return { toasts: currentItems, toast }
}
