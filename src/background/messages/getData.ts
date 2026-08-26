import type { PlasmoMessaging } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

const storage = new Storage()
const handel: PlasmoMessaging.MessageHandler = async (req, res) => {
  const { id } = req.body
  //做一个授权，返回数据
  const requestId = `request-${Date.now()}_${id}`
  await storage.set("lastRequestId", requestId)
  chrome.action.openPopup()
  const data = {
    address: "0xFBA2e23C0c8849B9196a4F9A3704AdD58BAa2EED"
  }
  storage.watch({
    lastRequestId: (change) => {
      console.log("lastRequestId changed:", change)
      res.send({
        success: true,
        data
      })
      storage.unwatchAll()
      return
    }
  })
}

export default handel
