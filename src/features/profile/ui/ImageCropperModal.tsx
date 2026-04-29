"use client"

import { useState, useCallback } from "react"
import Cropper from "react-easy-crop"
import { Button } from "@/shared/ui/button"
import { Slider } from "@/shared/ui/slider"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/ui/dialog"
import { getCroppedImg } from "@/shared/lib/imageUtils"
import { Loader2, ZoomIn, ZoomOut } from "lucide-react"

interface ImageCropperModalProps {
  image: string
  isOpen: boolean
  onClose: () => void
  onSave: (blob: Blob) => void
}

export function ImageCropperModal({ image, isOpen, onClose, onSave }: ImageCropperModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleSave = async () => {
    if (!croppedAreaPixels) return
    setIsProcessing(true)
    try {
      const blob = await getCroppedImg(image, croppedAreaPixels)
      if (blob) {
        onSave(blob)
        onClose()
      }
    } catch (error) {
      console.error("Erro ao recortar imagem:", error)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-stone-50 border-none shadow-2xl rounded-3xl">
        <DialogHeader className="p-6 bg-white border-b border-stone-100">
          <DialogTitle className="text-stone-800 text-center font-bold">Ajustar Foto</DialogTitle>
        </DialogHeader>

        <div className="relative h-[350px] w-full bg-stone-200">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
          />
        </div>

        <div className="p-8 bg-white space-y-6">
          <div className="flex items-center gap-4">
            <ZoomOut className="h-4 w-4 text-stone-400" />
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.1}
              onValueChange={([val]) => setZoom(val)}
              className="flex-1"
            />
            <ZoomIn className="h-4 w-4 text-stone-400" />
          </div>

          <DialogFooter className="flex gap-2 sm:justify-center">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="flex-1 rounded-2xl h-12 font-bold border-stone-200 text-stone-600 hover:bg-stone-50"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={isProcessing}
              className="flex-1 rounded-2xl h-12 font-bold bg-stone-800 hover:bg-black text-white shadow-lg"
            >
              {isProcessing ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Salvar Foto"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
