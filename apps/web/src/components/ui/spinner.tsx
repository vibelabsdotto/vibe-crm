import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"

function Spinner({ className, ...props }: React.ComponentProps<typeof Loader2Icon>) {
  return (
    <Loader2Icon data-slot="spinner" role="status" aria-label="Wird geladen" className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
