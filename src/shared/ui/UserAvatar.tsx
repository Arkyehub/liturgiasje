"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar"
import { getAvatarColor, getInitials } from "@/shared/lib/avatar-utils"
import { cn } from "@/shared/lib/utils"
import { UserCircle } from "lucide-react"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/shared/ui/dialog"

interface UserAvatarProps {
  name: string
  src?: string | null
  isClaimed?: boolean
  className?: string
  size?: "default" | "sm" | "lg"
}

export function UserAvatar({ name, src, isClaimed, className, size = "default" }: UserAvatarProps) {
  const { bg, text, border } = getAvatarColor(name)
  const initials = getInitials(name)

  return (
    <Dialog>
      <DialogTrigger
        onClick={(e) => e.stopPropagation()} 
        className="focus:outline-none text-left cursor-pointer rounded-full"
      >
        <Avatar size={size} className={cn("border shadow-sm", isClaimed ? border : "border-stone-100", className)}>
          {src && (
            <AvatarImage 
              src={src} 
              alt={name}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          )}
          <AvatarFallback className={cn("font-bold tracking-tighter", isClaimed ? `${bg} ${text}` : "bg-stone-50 text-stone-300")}>
            {isClaimed ? initials : <UserCircle className="h-2/3 w-2/3" />}
          </AvatarFallback>
        </Avatar>
      </DialogTrigger>
      
      <DialogContent className="flex flex-col items-center justify-center p-6 max-w-[320px] sm:max-w-sm border-stone-200">
        <DialogTitle className="sr-only">Foto de {name}</DialogTitle>
        <div className="relative flex flex-col items-center gap-4 py-2">
          <Avatar className={cn("h-48 w-48 border-2 shadow-md", isClaimed ? border : "border-stone-100")}>
            {src && (
              <AvatarImage 
                src={src} 
                alt={name}
                referrerPolicy="no-referrer"
              />
            )}
            <AvatarFallback className={cn("text-3xl font-bold tracking-tighter", isClaimed ? `${bg} ${text}` : "bg-stone-50 text-stone-300")}>
              {isClaimed ? initials : <UserCircle className="h-2/3 w-2/3" />}
            </AvatarFallback>
          </Avatar>
          
          <span className="px-3 py-1 bg-black text-white text-xs font-bold rounded-full shadow-sm tracking-wide">
            {name}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

