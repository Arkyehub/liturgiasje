"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Loader2 } from "lucide-react"

const memberSchema = z.object({
  full_name: z.string().min(3, "O nome deve ter pelo menos 3 caracteres"),
  whatsapp: z.string().optional(),
})

type MemberFormValues = z.infer<typeof memberSchema>

interface MemberFormProps {
  initialData?: Partial<MemberFormValues>
  onSave: (data: MemberFormValues) => Promise<void>
  onClose: () => void
}

import { maskPhone } from "@/shared/lib/utils"

export function MemberForm({ initialData, onSave, onClose }: MemberFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema),
    defaultValues: initialData || {
      full_name: "",
      whatsapp: "",
    }
  })

  const onSubmit = async (data: MemberFormValues) => {
    setIsSubmitting(true)
    try {
      await onSave(data)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-stone-400">Nome do Membro</label>
          <Input 
            {...register("full_name")}
            placeholder="Ex: João da Silva" 
            className="rounded-xl border-stone-200 focus-visible:ring-stone-200 h-12"
          />
          {errors.full_name && <p className="text-[10px] text-red-500">{errors.full_name.message}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-stone-400">WhatsApp</label>
          <Input 
            {...register("whatsapp")}
            onChange={(e) => setValue("whatsapp", maskPhone(e.target.value))}
            placeholder="Ex: (11) 99999-9999" 
            className="rounded-xl border-stone-200 focus-visible:ring-stone-200 h-12"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button 
          type="button" 
          variant="ghost" 
          onClick={onClose}
          className="flex-1 rounded-xl text-stone-500 hover:bg-stone-50"
        >
          Cancelar
        </Button>
        <Button 
          type="submit" 
          disabled={isSubmitting}
          className="flex-1 rounded-xl bg-stone-800 hover:bg-black"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {initialData ? "Atualizar" : "Cadastrar Membro"}
        </Button>
      </div>
    </form>
  )
}
