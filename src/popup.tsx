import { CountButton } from "~features/count-button"

import "~style.css"

import { useEffect, useState } from "react"

import { Storage } from "@plasmohq/storage"

function IndexPopup() {
  // 创建个Storage实例，用于存储
  const storage = new Storage({})
  const [count, setCount] = useState(0)
  const setCountLocalStorage = async (count: number) => {
    await storage.set("count", count)
  }

  const getCountLocalStorage = async () => {
    return await storage.get("count")
  }

  useEffect(() => {
    getCountLocalStorage().then((count) => {
      console.log("getCountLocalStorage:", count)
      if (count) {
        setCount(Number(count))
      } else {
        setCount(0)
        setCountLocalStorage(0)
      }
    })
  }, [])

  const handleCountChange = async (newCount: number) => {
    setCount(newCount)
    setCountLocalStorage(newCount)
  }

  const removeCountLocalStorage = async () => {
    await storage.remove("count")
    setCount(0)
    setCountLocalStorage(0)
  }
  return (
    <div className="plasmo-flex plasmo-items-center plasmo-justify-center plasmo-h-16 plasmo-w-40">
      <CountButton
        count={count}
        setCount={handleCountChange}
        removeCount={removeCountLocalStorage}
      />
    </div>
  )
}

export default IndexPopup
