"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/shared/hooks/useAuth"
import { 
  makeListProfiles, 
  makeDeleteProfile, 
  makeCreateProfile, 
  makeUpdateProfile 
} from "@/main/factories/usecases/profiles"
import { Profile } from "@/domain/models/Profile"
import { Badge } from "@/shared/ui/badge"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/shared/ui/drawer"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet"
import { MemberForm } from "@/features/members/ui/MemberForm"
import { Input } from "@/shared/ui/input"
import { Button } from "@/shared/ui/button"
import { UserAvatar } from "@/shared/ui/UserAvatar"
import { Loader2, Search, Plus, Edit2, Trash2, UserCircle, UserKey } from "lucide-react"
import { toast } from "sonner"

export default function AdminMembersPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [roleChangeProfile, setRoleChangeProfile] = useState<Profile | null>(null)
  const [isRoleDrawerOpen, setIsRoleDrawerOpen] = useState(false)
  const [isSubmittingRole, setIsSubmittingRole] = useState(false)
  const [profileToDelete, setProfileToDelete] = useState<Profile | null>(null)
  const [isDeleteDrawerOpen, setIsDeleteDrawerOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Verificar se é admin
  useEffect(() => {
    if (!loading) {
      if (!user || profile?.role !== 'admin') {
        router.push("/")
      } else {
        loadProfiles()
      }
    }
  }, [user, profile, loading])

  const loadProfiles = async () => {
    try {
      setIsLoading(true)
      const data = await makeListProfiles().execute()
      setProfiles(data)
    } catch (error) {
      toast.error("Erro ao carregar perfis.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!profileToDelete) return
    
    // Atualização Otimista
    const previousProfiles = [...profiles]
    setProfiles(current => current.filter(p => p.id !== id))
    setIsDeleteDrawerOpen(false)
    
    try {
      setIsDeleting(true)
      await makeDeleteProfile().execute(id)
      toast.success("Perfil excluído.")
    } catch (error) {
      setProfiles(previousProfiles)
      toast.error("Erro ao excluir perfil.")
    } finally {
      setIsDeleting(false)
      setProfileToDelete(null)
    }
  }

  const filteredProfiles = useMemo(() => {
    return profiles.filter(p => 
      p.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.whatsapp?.includes(searchTerm)
    )
  }, [profiles, searchTerm])


  if (loading || (user && !profile)) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <Loader2 className="h-8 w-8 animate-spin text-stone-300" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-stone-50/30">
      
      <main className="flex-1 overflow-auto">
        <div className="container max-w-md mx-auto px-4 py-6 space-y-6 pb-20">
          


          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                <Input 
                  placeholder="Buscar membro..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 rounded-xl border-stone-200"
                />
              </div>
              <Button onClick={() => {
                setEditingProfile(null)
                setIsSheetOpen(true)
              }} className="rounded-xl bg-stone-800 hover:bg-black">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-stone-300" />
                </div>
              ) : filteredProfiles.length === 0 ? (
                <p className="text-center text-xs text-stone-400 py-10">Nenhum perfil encontrado.</p>
              ) : (
                filteredProfiles.map((p) => (
                  <div key={p.id} className="bg-white p-4 rounded-3xl border border-stone-100 shadow-sm flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <UserAvatar 
                         name={p.fullName}
                         src={p.avatarUrl}
                         isClaimed={!!p.authUserId}
                         className="h-10 w-10 shrink-0"
                       />
 
                       <div className="space-y-0.5 truncate">
                         <div className="flex items-center gap-2">
                           <p className="text-sm font-bold text-stone-800 truncate">{p.fullName}</p>
                           {p.role === 'admin' && (
                             <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 font-bold text-[8px] tracking-wider px-1.5 py-0 rounded shrink-0 uppercase">
                               Admin
                             </Badge>
                           )}
                           {p.authUserId && p.role !== 'admin' && (
                             <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 font-bold text-[8px] tracking-wider px-1.5 py-0 rounded shrink-0 uppercase">
                               Leitor
                             </Badge>
                           )}
                           {!p.authUserId && (
                            <Badge className="bg-stone-100 text-stone-500 border-stone-200 hover:bg-stone-100 font-bold text-[8px] tracking-wider px-1.5 py-0 rounded shrink-0 uppercase">
                              Pendente
                            </Badge>
                           )}
                         </div>
                         <p className="text-xs text-stone-500 truncate">{p.whatsapp || "Sem WhatsApp"}</p>
                       </div>
                     </div>
                     
                     <div className="flex items-center gap-1 shrink-0">
                       {p.authUserId && (
                         <Button 
                           variant="ghost" 
                           size="icon" 
                           onClick={() => {
                             setRoleChangeProfile(p)
                             setIsRoleDrawerOpen(true)
                           }} 
                           className={`h-8 w-8 ${p.role === 'admin' ? 'text-amber-600 hover:text-amber-700' : 'text-stone-400 hover:text-stone-800'}`}
                           title={p.role === 'admin' ? "Remover Administrador" : "Tornar Administrador"}
                         >
                           <UserKey className="h-4 w-4" />
                         </Button>
                       )}
                       {!p.authUserId && (
                         <Button variant="ghost" size="icon" onClick={() => {
                           setEditingProfile(p)
                           setIsSheetOpen(true)
                         }} className="h-8 w-8 text-stone-400 hover:text-stone-800">
                           <Edit2 className="h-4 w-4" />
                         </Button>
                       )}
                       <Button 
                         variant="ghost" 
                         size="icon" 
                         onClick={() => {
                           setProfileToDelete(p)
                           setIsDeleteDrawerOpen(true)
                         }} 
                         className="h-8 w-8 text-stone-400 hover:text-red-600"
                       >
                         <Trash2 className="h-4 w-4" />
                       </Button>
                     </div>
                   </div>
                 ))
               )}
            </div>
          </div>
        </div>
      </main>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent side="right" className="w-[90%] sm:max-w-xl p-6">
          <SheetHeader>
            <SheetTitle className="text-stone-800">
              {editingProfile ? "Editar Perfil" : "Novo Perfil"}
            </SheetTitle>
          </SheetHeader>
          <MemberForm 
            initialData={editingProfile ? { full_name: editingProfile.fullName, whatsapp: editingProfile.whatsapp } : undefined}
            onSave={async (data) => {
              try {
                if (editingProfile) {
                  await makeUpdateProfile().execute(editingProfile.id, {
                    fullName: data.full_name,
                    whatsapp: data.whatsapp
                  })
                  toast.success("Perfil atualizado!")
                } else {
                  await makeCreateProfile().execute({
                    fullName: data.full_name,
                    whatsapp: data.whatsapp,
                    role: 'reader'
                  })
                  toast.success("Perfil cadastrado!")
                }
                loadProfiles()
                setIsSheetOpen(false)
              } catch (error: any) {
                if (error.message === "NAME_ALREADY_IN_USE") {
                  toast.error("Este nome já está em uso por outro perfil.")
                } else {
                  toast.error("Erro ao salvar perfil.")
                }
              }
            }}
            onClose={() => setIsSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Drawer de Confirmação de Role */}
      <Drawer open={isRoleDrawerOpen} onOpenChange={setIsRoleDrawerOpen}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-sm">
            <DrawerHeader className="text-center">
              <DrawerTitle className="text-stone-800">
                {roleChangeProfile?.role === 'admin' ? "Remover Administrador?" : "Tornar Administrador?"}
              </DrawerTitle>
              <DrawerDescription>
                {roleChangeProfile?.role === 'admin' 
                  ? `O membro ${roleChangeProfile?.fullName} deixará de ter permissões de administrador no sistema.`
                  : `O membro ${roleChangeProfile?.fullName} terá permissão total para gerenciar escalas e outros membros.`}
              </DrawerDescription>
            </DrawerHeader>
            <DrawerFooter className="flex flex-col gap-2 pb-8">
              <Button 
                variant={roleChangeProfile?.role === 'admin' ? "destructive" : "default"}
                className={`w-full font-bold h-12 rounded-xl ${roleChangeProfile?.role !== 'admin' ? 'bg-stone-800 hover:bg-black text-white' : ''}`}
                disabled={isSubmittingRole}
                onClick={async () => {
                  if (!roleChangeProfile) return
                  try {
                    setIsSubmittingRole(true)
                    const newRole = roleChangeProfile.role === 'admin' ? 'reader' : 'admin'
                    await makeUpdateProfile().execute(roleChangeProfile.id, { role: newRole })
                    toast.success(newRole === 'admin' ? "Novo administrador definido!" : "Permissões de administrador removidas.")
                    loadProfiles()
                    setIsRoleDrawerOpen(false)
                  } catch (error) {
                    toast.error("Erro ao atualizar permissões.")
                  } finally {
                    setIsSubmittingRole(false)
                  }
                }}
              >
                {isSubmittingRole ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar Alteração"}
              </Button>
              <DrawerClose asChild>
                <Button variant="ghost" className="w-full text-stone-500 font-medium h-12" disabled={isSubmittingRole}>
                  Cancelar
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Drawer de Confirmação de Exclusão */}
      <Drawer open={isDeleteDrawerOpen} onOpenChange={setIsDeleteDrawerOpen}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-sm">
            <DrawerHeader className="text-center">
              <DrawerTitle className="text-stone-800">Excluir Perfil?</DrawerTitle>
              <DrawerDescription>
                Esta ação removerá o perfil <strong>{profileToDelete?.fullName}</strong> e todos os registros relacionados (escalas, trocas e indisponibilidades) permanentemente. Se o perfil estiver vinculado a uma conta de login, o acesso será mantido mas sem os dados de leitor.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerFooter className="flex flex-col gap-2 pb-8">
              <Button 
                variant="destructive"
                className="w-full font-bold h-12 rounded-xl"
                disabled={isDeleting}
                onClick={() => profileToDelete && handleDelete(profileToDelete.id)}
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sim, Excluir"}
              </Button>
              <DrawerClose asChild>
                <Button variant="ghost" className="w-full text-stone-500 font-medium h-12" disabled={isDeleting}>
                  Cancelar
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
