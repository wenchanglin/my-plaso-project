import { CountButton } from "~features/count-button"

import "~style.css"

import { sendToBackground } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"
import { useStorage } from "@plasmohq/storage/hook"

function IndexPopup() {
  const [count, setCount] = useStorage<number>("count", 0)
  const storage = new Storage()
  return (
    <div className="plasmo-flex plasmo-flex-col plasmo-items-center plasmo-justify-center plasmo-h-16 plasmo-w-40">
      <div>是否同意授权</div>
      <div className="plasmo-flex plasmo-flex-row plasmo-gap-2">
        <button
          className="plasmo-bg-green-500 plasmo-text-white plasmo-rounded-md plasmo-p-2"
          onClick={() => {
            storage.set(
              "lastRequestId",
              Math.random().toString().substring(2, 15)
            )
          }}>
          同意
        </button>
        <button
          className="plasmo-bg-red-500 plasmo-text-white plasmo-rounded-md plasmo-p-2"
          onClick={() => {
            storage.set(
              "lastRequestId",
              Math.random().toString().substring(2, 15)
            )
          }}>
          拒绝
        </button>
      </div>
    </div>
  )
}

export default IndexPopup
