"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/shared/hooks/useAuth"
import { 
  makeListMembers, 
  makeDeleteMember, 
  makeCreateMember, 
  makeUpdateMember 
} from "@/main/factories/usecases/members"
import { makeUpdateUserRole } from "@/main/factories/usecases/user"
import { Member } from "@/domain/models/Member"
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
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar"
import { Loader2, Search, Plus, Edit2, Trash2, UserCircle, UserKey } from "lucide-react"
import { toast } from "sonner"

export default function AdminMembersPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [members, setMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [roleChangeMember, setRoleChangeMember] = useState<Member | null>(null)
  const [isRoleDrawerOpen, setIsRoleDrawerOpen] = useState(false)
  const [isSubmittingRole, setIsSubmittingRole] = useState(false)
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null)
  const [isDeleteDrawerOpen, setIsDeleteDrawerOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Verificar se é admin
  useEffect(() => {
    if (!loading) {
      if (!user || profile?.role !== 'admin') {
        router.push("/")
      } else {
        loadMembers()
      }
    }
  }, [user, profile, loading])

  const loadMembers = async () => {
    try {
      setIsLoading(true)
      const data = await makeListMembers().execute()
      setMembers(data)
    } catch (error) {
      toast.error("Erro ao carregar membros.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!memberToDelete) return
    
    // 1. Atualização Otimista: Removemos o membro do estado local antes da chamada ao servidor
    const previousMembers = [...members]
    setMembers(current => current.filter(m => m.id !== id))
    setIsDeleteDrawerOpen(false)
    
    try {
      setIsDeleting(true)
      await makeDeleteMember().execute(id)
      toast.success("Membro excluído.")
      // Não precisamos recarregar tudo de novo se a UI otimista funcionou,
      // mas podemos um loadMembers secundário se quisermos garantir sincronia total.
      // loadMembers()
    } catch (error) {
      // 2. Reversão em caso de erro
      setMembers(previousMembers)
      toast.error("Erro ao excluir membro.")
    } finally {
      setIsDeleting(false)
      setMemberToDelete(null)
    }
  }

  const filteredMembers = useMemo(() => {
    return members.filter(m => 
      m.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.whatsapp?.includes(searchTerm)
    )
  }, [members, searchTerm])


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
                setEditingMember(null)
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
              ) : filteredMembers.length === 0 ? (
                <p className="text-center text-xs text-stone-400 py-10">Nenhum membro encontrado.</p>
              ) : (
                filteredMembers.map((member) => (
                  <div key={member.id} className="bg-white p-4 rounded-3xl border border-stone-100 shadow-sm flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <Avatar className="h-10 w-10 shrink-0 border border-stone-100">
                        <AvatarImage src={member.claimedUser?.avatarUrl || undefined} />
                        <AvatarFallback className="bg-stone-50 text-stone-300">
                          <UserCircle className="h-6 w-6" />
                        </AvatarFallback>
                      </Avatar>

                      <div className="space-y-0.5 truncate">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-stone-800 truncate">{member.fullName}</p>
                          {member.claimedUser?.role === 'admin' && (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 font-bold text-[8px] tracking-wider px-1.5 py-0 rounded shrink-0 uppercase">
                              Admin
                            </Badge>
                          )}
                          {member.isClaimed && member.claimedUser?.role !== 'admin' && (
                            <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 font-bold text-[8px] tracking-wider px-1.5 py-0 rounded shrink-0 uppercase">
                              Leitor
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-stone-500 truncate">{member.whatsapp || "Sem WhatsApp"}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 shrink-0">
                      {member.isClaimed && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => {
                            setRoleChangeMember(member)
                            setIsRoleDrawerOpen(true)
                          }} 
                          className={`h-8 w-8 ${member.claimedUser?.role === 'admin' ? 'text-amber-600 hover:text-amber-700' : 'text-stone-400 hover:text-stone-800'}`}
                          title={member.claimedUser?.role === 'admin' ? "Remover Administrador" : "Tornar Administrador"}
                        >
                          <UserKey className="h-4 w-4" />
                        </Button>
                      )}
                      {!member.isClaimed && (
                        <Button variant="ghost" size="icon" onClick={() => {
                          setEditingMember(member)
                          setIsSheetOpen(true)
                        }} className="h-8 w-8 text-stone-400 hover:text-stone-800">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => {
                          setMemberToDelete(member)
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
              {editingMember ? "Editar Membro" : "Novo Membro"}
            </SheetTitle>
          </SheetHeader>
          <MemberForm 
            initialData={editingMember ? { full_name: editingMember.fullName, whatsapp: editingMember.whatsapp } : undefined}
            onSave={async (data) => {
              try {
                if (editingMember) {
                  await makeUpdateMember().execute(editingMember.id, {
                    fullName: data.full_name,
                    whatsapp: data.whatsapp
                  })
                  toast.success("Membro atualizado!")
                } else {
                  await makeCreateMember().execute({
                    fullName: data.full_name,
                    whatsapp: data.whatsapp
                  })
                  toast.success("Membro cadastrado!")
                }
                loadMembers()
                setIsSheetOpen(false)
              } catch (error: any) {
                if (error.message === "NAME_ALREADY_IN_USE") {
                  toast.error("Este nome já está em uso por outro membro.")
                } else {
                  toast.error("Erro ao salvar membro.")
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
                {roleChangeMember?.claimedUser?.role === 'admin' ? "Remover Administrador?" : "Tornar Administrador?"}
              </DrawerTitle>
              <DrawerDescription>
                {roleChangeMember?.claimedUser?.role === 'admin' 
                  ? `O membro ${roleChangeMember?.fullName} deixará de ter permissões de administrador no sistema.`
                  : `O membro ${roleChangeMember?.fullName} terá permissão total para gerenciar escalas e outros membros.`}
              </DrawerDescription>
            </DrawerHeader>
            <DrawerFooter className="flex flex-col gap-2 pb-8">
              <Button 
                variant={roleChangeMember?.claimedUser?.role === 'admin' ? "destructive" : "default"}
                className={`w-full font-bold h-12 rounded-xl ${roleChangeMember?.claimedUser?.role !== 'admin' ? 'bg-stone-800 hover:bg-black text-white' : ''}`}
                disabled={isSubmittingRole}
                onClick={async () => {
                  try {
                    const newRole = roleChangeMember.claimedUser?.role === 'admin' ? 'reader' : 'admin'
                    await makeUpdateUserRole().execute(roleChangeMember.claimedBy, newRole)
                    toast.success(newRole === 'admin' ? "Novo administrador definido!" : "Permissões de administrador removidas.")
                    loadMembers()
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
              <DrawerTitle className="text-stone-800">Excluir Membro?</DrawerTitle>
              <DrawerDescription>
                Esta ação removerá o membro <strong>{memberToDelete?.fullName}</strong>, sua conta de login e todos os registros relacionados (escalas, trocas e indisponibilidades) permanentemente.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerFooter className="flex flex-col gap-2 pb-8">
              <Button 
                variant="destructive"
                className="w-full font-bold h-12 rounded-xl"
                disabled={isDeleting}
                onClick={() => memberToDelete && handleDelete(memberToDelete.id)}
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
