import type { PlasmoMessaging } from "@plasmohq/messaging"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const requestId =
    typeof req.body?.requestId === "string"
      ? req.body.requestId
      : `request-${Date.now().toString(36)}`

  const decision = {}

  res.send({
    success: true,
    data: true,
    error: undefined
  })
}

export default handler
