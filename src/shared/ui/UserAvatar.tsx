"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar"
import { getAvatarColor, getInitials } from "@/shared/lib/avatar-utils"
import { cn } from "@/shared/lib/utils"
import { UserCircle } from "lucide-react"

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
  )
}
