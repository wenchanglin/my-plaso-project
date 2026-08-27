import { Eye, EyeOff, Import, Key, Wallet } from "lucide-react"
import React, { useState } from "react"

import { useWalletStore } from "../../stores/walletStore.ts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../ui/card.tsx"
import { toast } from "../ui/sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs.tsx"
import {
  ErrorText,
  Field,
  inputClass,
  primaryButtonClass
} from "./controls.tsx"

/**
 * First-run screen. Three tabs: create a wallet, restore one from a recovery
 * phrase, or import a bare private key. Creation hands the generated phrase to
 * the store, and `PageIndex` shows it on the backup screen before the account
 * panel.
 */
export function WalletSetup() {
  const createWallet = useWalletStore((state) => state.createWallet)
  const importMnemonic = useWalletStore((state) => state.importMnemonic)
  const createWalletFromPrivateKey = useWalletStore(
    (state) => state.createWalletFromPrivateKey
  )

  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [phrase, setPhrase] = useState("")
  const [privateKey, setPrivateKey] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const clear = () => {
    setPassword("")
    setConfirmation("")
    setPhrase("")
    setPrivateKey("")
    setError(null)
  }

  const submit =
    (
      validate: () => string | null,
      action: () => Promise<unknown>,
      success: string
    ) =>
    async (event: React.FormEvent) => {
      event.preventDefault()
      setError(null)

      const invalid = validate()
      if (invalid) {
        setError(invalid)
        return
      }

      setIsBusy(true)
      try {
        await action()
        toast.success(success)
        clear()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "操作失败")
      } finally {
        setIsBusy(false)
      }
    }

  const weakPassword = () => (password.length < 8 ? "密码至少 8 位" : null)

  const onCreate = submit(
    () =>
      weakPassword() ??
      (password === confirmation ? null : "两次输入的密码不一致"),
    () => createWallet(password),
    "钱包创建成功"
  )

  const onImportPhrase = submit(
    () => (phrase.trim() ? weakPassword() : "请输入助记词"),
    () => importMnemonic(phrase.trim(), password),
    "钱包导入成功"
  )

  const onImportKey = submit(
    () => (privateKey.trim() ? weakPassword() : "请输入私钥"),
    () => createWalletFromPrivateKey(privateKey.trim(), password),
    "私钥导入成功"
  )

  const passwordField = (label: string) => (
    <Field label={label}>
      <div className="plasmo-relative">
        <input
          className={`${inputClass} plasmo-pr-9`}
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          placeholder="至少 8 位"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button
          type="button"
          aria-label={showPassword ? "隐藏密码" : "显示密码"}
          className="plasmo-absolute plasmo-inset-y-0 plasmo-right-0 plasmo-flex plasmo-items-center plasmo-px-2 plasmo-text-neutral-500"
          onClick={() => setShowPassword(!showPassword)}>
          {showPassword ? (
            <EyeOff className="plasmo-h-4 plasmo-w-4" />
          ) : (
            <Eye className="plasmo-h-4 plasmo-w-4" />
          )}
        </button>
      </div>
    </Field>
  )

  return (
    <div className="plasmo-space-y-4">
      <header className="plasmo-text-center">
        <div className="plasmo-mx-auto plasmo-mb-2 plasmo-flex plasmo-h-12 plasmo-w-12 plasmo-items-center plasmo-justify-center plasmo-rounded-full plasmo-bg-neutral-900">
          <Wallet className="plasmo-h-6 plasmo-w-6 plasmo-text-white" />
        </div>
        <h1 className="plasmo-text-lg plasmo-font-bold">MyWallet</h1>
      </header>

      <Tabs defaultValue="create" onValueChange={clear}>
        <TabsList>
          <TabsTrigger value="create">创建钱包</TabsTrigger>
          <TabsTrigger value="import">导入助记词</TabsTrigger>
          <TabsTrigger value="privatekey">导入私钥</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>
                <Wallet className="plasmo-h-4 plasmo-w-4" />
                创建新钱包
              </CardTitle>
              <CardDescription>
                创建一个新的以太坊钱包并生成助记词
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="plasmo-space-y-3" onSubmit={onCreate}>
                {passwordField("设置密码")}

                <Field label="确认密码">
                  <input
                    className={inputClass}
                    type="password"
                    autoComplete="new-password"
                    placeholder="再次输入密码"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </Field>

                <ErrorText>{error}</ErrorText>

                <button
                  type="submit"
                  className={primaryButtonClass}
                  disabled={isBusy || !password || !confirmation}>
                  {isBusy ? "创建中..." : "创建钱包"}
                </button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="import">
          <Card>
            <CardHeader>
              <CardTitle>
                <Import className="plasmo-h-4 plasmo-w-4" />
                导入钱包
              </CardTitle>
              <CardDescription>使用现有的助记词导入钱包</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="plasmo-space-y-3" onSubmit={onImportPhrase}>
                <Field label="助记词">
                  <textarea
                    className={inputClass}
                    rows={3}
                    placeholder="输入 12 或 24 个助记词，用空格分隔"
                    value={phrase}
                    onChange={(event) => setPhrase(event.target.value)}
                  />
                </Field>

                {passwordField("设置密码")}

                <ErrorText>{error}</ErrorText>

                <button
                  type="submit"
                  className={primaryButtonClass}
                  disabled={isBusy || !phrase || !password}>
                  {isBusy ? "导入中..." : "导入钱包"}
                </button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privatekey">
          <Card>
            <CardHeader>
              <CardTitle>
                <Key className="plasmo-h-4 plasmo-w-4" />
                导入私钥
              </CardTitle>
              <CardDescription>
                使用私钥导入账户，该钱包没有助记词，无法派生更多账户
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="plasmo-space-y-3" onSubmit={onImportKey}>
                <Field label="私钥">
                  <input
                    className={inputClass}
                    type="password"
                    autoComplete="off"
                    placeholder="0x 开头的 64 位十六进制字符"
                    value={privateKey}
                    onChange={(event) => setPrivateKey(event.target.value)}
                  />
                </Field>

                {passwordField("设置密码")}

                <ErrorText>{error}</ErrorText>

                <button
                  type="submit"
                  className={primaryButtonClass}
                  disabled={isBusy || !privateKey || !password}>
                  {isBusy ? "导入中..." : "导入私钥"}
                </button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
