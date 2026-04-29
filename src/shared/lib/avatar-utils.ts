export const getAvatarColor = (name: string) => {
  const colors = [
    { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-100" },
    { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-100" },
    { bg: "bg-violet-50", text: "text-violet-600", border: "border-violet-100" },
    { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-100" },
    { bg: "bg-rose-50", text: "text-rose-600", border: "border-rose-100" },
    { bg: "bg-indigo-50", text: "text-indigo-600", border: "border-indigo-100" },
    { bg: "bg-cyan-50", text: "text-cyan-600", border: "border-cyan-100" },
    { bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-100" },
  ]
  
  if (!name) return colors[0]

  // Gera um índice determinístico baseado no nome
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  const index = Math.abs(hash) % colors.length
  return colors[index]
}

export const getInitials = (name: string) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
