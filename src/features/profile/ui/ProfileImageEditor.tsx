"use client"

import { useState, useRef, useEffect } from "react"
import { useAuth } from "@/shared/hooks/useAuth"
import { makeUploadAvatar, makeUpdateProfile } from "@/main/factories/usecases/profiles"
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
  const autoImportTried = useRef(false)

  const googleAvatarUrl: string | undefined = user?.user_metadata?.avatar_url || user?.user_metadata?.picture

  // Primeira visita com e-mail vinculado: importa a foto do Google sozinho.
  // Só roda quando o perfil ainda não tem foto, para nunca sobrescrever uma foto escolhida.
  useEffect(() => {
    if (autoImportTried.current) return
    if (!user || !profile || profile.avatarUrl || !googleAvatarUrl) return
    if (profile.authUserId && profile.authUserId !== user.id) return
    autoImportTried.current = true
    ;(async () => {
      try {
        await makeUpdateProfile().execute(profile.id, { avatarUrl: googleAvatarUrl })
        await refreshProfile()
        toast.success("Foto importada do Google!")
      } catch (error) {
        console.error(error)
      }
    })()
  }, [user, profile, googleAvatarUrl, refreshProfile])

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
    if (!profile) return
    setIsUpdating(true)
    try {
      await makeUploadAvatar().execute(profile.id, blob)
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
    if (!googleAvatarUrl || !profile) {
      toast.error("Foto do Google não encontrada.")
      return
    }

    setIsUpdating(true)
    try {
      await makeUpdateProfile().execute(profile.id, { avatarUrl: googleAvatarUrl })
      toast.success("Foto importada do Google!")
      await refreshProfile()
    } catch (error) {
      toast.error("Erro ao importar foto.")
    } finally {
      setIsUpdating(false)
    }
  }

  const canRestoreGoogle = !!googleAvatarUrl && profile?.avatarUrl !== googleAvatarUrl

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Trocar foto de perfil"
          className="relative block rounded-full transition-transform active:scale-95"
        >
          <Avatar className="h-28 w-28 border-4 border-white shadow-lg ring-2 ring-[#E8B21E]">
            <AvatarImage src={profile?.avatarUrl ?? undefined} className="object-cover" />
            <AvatarFallback className="bg-[#F4EEDD]">
              <UserCircle className="h-14 w-14 text-[#B8A98E]" />
            </AvatarFallback>
          </Avatar>

          {isUpdating && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/60">
              <Loader2 className="h-7 w-7 animate-spin text-[#322113]" />
            </span>
          )}
        </button>

        <span className="pointer-events-none absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#322113] text-[#E8C76A] shadow-md">
          <Camera className="h-4 w-4" />
        </span>

        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
        />
      </div>

      {canRestoreGoogle && (
        <button
          type="button"
          onClick={handlePullFromGoogle}
          disabled={isUpdating}
          className="flex items-center gap-1.5 text-xs font-bold text-[#6B5D50] underline-offset-4 hover:underline disabled:opacity-50"
        >
          <Sparkles className="h-3 w-3 text-[#E8B21E]" />
          Usar foto do Google
        </button>
      )}

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
