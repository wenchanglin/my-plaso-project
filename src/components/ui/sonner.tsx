import { Toaster as SonnerToaster, toast } from "sonner"

export const Toaster = () => (
  <SonnerToaster
    position="top-center"
    duration={3500}
    toastOptions={{
      style: {
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        borderRadius: "2px"
      }
    }}
  />
)

export { toast }
