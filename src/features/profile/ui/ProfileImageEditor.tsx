"use client"

import { useState, useRef } from "react"
import { useAuth } from "@/shared/hooks/useAuth"
import { makeUploadUserAvatar, makeUpdateUserProfile } from "@/main/factories/usecases/user"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar"
import { Button } from "@/shared/ui/button"
import { ImageCropperModal } from "./ImageCropperModal"
import { Camera, UserCircle, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

export function ProfileImageEditor() {
  const { user, profile, refreshProfile } = useAuth()
  const [isCropperOpen, setIsCropperOpen] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => {
        setSelectedImage(reader.result as string)
        setIsCropperOpen(true)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSaveCroppedImage = async (blob: Blob) => {
    if (!user) return
    setIsUpdating(true)
    try {
      await makeUploadUserAvatar().execute(user.id, blob)
      toast.success("Foto de perfil atualizada!")
      await refreshProfile()
    } catch (error) {
      console.error(error)
      toast.error("Erro ao fazer upload da foto.")
    } finally {
      setIsUpdating(false)
      setSelectedImage(null)
    }
  }

  const handlePullFromGoogle = async () => {
    const googleAvatarUrl = user?.user_metadata?.avatar_url
    if (!googleAvatarUrl || !user) {
      toast.error("Foto do Google não encontrada.")
      return
    }

    setIsUpdating(true)
    try {
      await makeUpdateUserProfile().execute(user.id, { avatarUrl: googleAvatarUrl })
      toast.success("Foto importada do Google!")
      await refreshProfile()
    } catch (error) {
      toast.error("Erro ao importar foto.")
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative group">
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="relative cursor-pointer transition-transform hover:scale-105 active:scale-95"
        >
          <Avatar className="h-32 w-32 border-4 border-white shadow-xl ring-2 ring-stone-100">
            <AvatarImage src={profile?.avatarUrl ?? undefined} className="object-cover" />
            <AvatarFallback className="bg-stone-50">
              <UserCircle className="h-16 w-16 text-stone-300" />
            </AvatarFallback>
          </Avatar>
          
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="h-8 w-8 text-white" />
          </div>

          {isUpdating && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-full">
              <Loader2 className="h-8 w-8 animate-spin text-stone-800" />
            </div>
          )}
        </div>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={handleFileChange} 
        />
      </div>

      <div className="flex flex-col gap-2 w-full max-w-[200px]">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePullFromGoogle}
          disabled={isUpdating}
          className="rounded-2xl h-10 border-stone-200 text-stone-600 font-bold text-xs gap-2 hover:bg-stone-50"
        >
          <Sparkles className="h-3 w-3 text-amber-500" />
          Usar foto do Google
        </Button>
      </div>

      {selectedImage && (
        <ImageCropperModal
          image={selectedImage}
          isOpen={isCropperOpen}
          onClose={() => {
            setIsCropperOpen(false)
            setSelectedImage(null)
          }}
          onSave={handleSaveCroppedImage}
        />
      )}
    </div>
  )
}
