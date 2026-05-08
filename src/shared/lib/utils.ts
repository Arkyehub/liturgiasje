import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function maskPhone(value: string) {
  if (!value) return ""
  value = value.replace(/\D/g, "")
  value = value.replace(/^(\d{2})(\d)/g, "($1) $2")
  value = value.replace(/(\d)(\d{4})$/, "$1-$2")
  return value.substring(0, 15)
}

export function getFileType(url: string) {
  if (!url) return 'file'
  const extension = url.split('.').pop()?.split('?')[0]?.toLowerCase() || 'file'
  return extension
}

export function getFileViewerUrl(url: string) {
  const type = getFileType(url)
  if (type === 'pdf') return url
  // Para arquivos do Office, o Google Docs Viewer é uma excelente solução "premium"
  return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`
}
