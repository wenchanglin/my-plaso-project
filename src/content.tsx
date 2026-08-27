import cssText from "data-text:~style.css"
import type { PlasmoCSConfig } from "plasmo"

import { sendToBackground } from "@plasmohq/messaging"

import { CountButton } from "~features/count-button"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

/**
 * Generates a style element with adjusted CSS to work correctly within a Shadow DOM.
 *
 * Tailwind CSS relies on `rem` units, which are based on the root font size (typically defined on the <html>
 * or <body> element). However, in a Shadow DOM (as used by Plasmo), there is no native root element, so the
 * rem values would reference the actual page's root font size—often leading to sizing inconsistencies.
 *
 * To address this, we:
 * 1. Replace the `:root` selector with `:host(plasmo-csui)` to properly scope the styles within the Shadow DOM.
 * 2. Convert all `rem` units to pixel values using a fixed base font size, ensuring consistent styling
 *    regardless of the host page's font size.
 */
export const getStyle = (): HTMLStyleElement => {
  const baseFontSize = 16

  let updatedCssText = cssText.replaceAll(":root", ":host(plasmo-csui)")
  const remRegex = /([\d.]+)rem/g
  updatedCssText = updatedCssText.replace(remRegex, (match, remValue) => {
    const pixelsValue = parseFloat(remValue) * baseFontSize

    return `${pixelsValue}px`
  })

  const styleElement = document.createElement("style")

  styleElement.textContent = updatedCssText

  return styleElement
}

/**
 * PlasmoOverlay 组件
 * 这是一个 Plasmo 扩展的覆盖层组件，用于在网页上显示一个可交互的界面
 */
const PlasmoOverlay = () => {
  /**
   * 发送消息到后台脚本
   * 异步函数，用于向扩展的后台脚本发送名为 "getData" 的消息
   * 并在控制台打印后台脚本的响应
   */
  const sendMessageToBackground = async () => {
    // 使用 sendToBackground 函数发送消息
    // 消息包含名称 "getData" 和包含 id 为 1 的请求体
    const response = await sendToBackground({
      name: "getData",
      body: {
        id: 1
      }
    })
    // 在控制台打印后台脚本返回的响应
    console.log("Response from background:", response)
  }
  // 返回一个使用 Plasmo 样式类的 div 元素
  // 样式包括：z-index 为 50、弹性布局、固定定位、顶部距离 32px、右侧距离 8px
  return (
    <div className="plasmo-z-50 plasmo-flex plasmo-fixed plasmo-top-32 plasmo-right-8"></div>
  )
}

export default PlasmoOverlay
