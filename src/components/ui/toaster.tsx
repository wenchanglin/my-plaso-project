import { useToast } from "../../hooks/use-toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <div className="popup-toasts" aria-live="polite" aria-atomic="true">
      {toasts.map((item) => (
        <div
          key={item.id}
          className={`popup-toast popup-toast-${item.tone ?? "default"}`}>
          <strong>{item.title}</strong>
          {item.description && <span>{item.description}</span>}
        </div>
      ))}
    </div>
  )
}
