export const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener("load", () => resolve(image))
    image.addEventListener("error", (error) => reject(error))
    image.setAttribute("crossOrigin", "anonymous") // fundamental para evitar erros de CORS ao processar imagem
    image.src = url
  })

/** Maior lado do avatar enviado ao servidor (o avatar aparece em até ~200 px; 512 cobre telas 2x com folga). */
export const MAX_CROPPED_SIDE = 512

/** Reduz proporcionalmente para caber em `max` pixels no maior lado; nunca amplia. */
export function scaleToMax(width: number, height: number, max: number) {
  const ratio = Math.min(1, max / Math.max(width, height, 1))
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) }
}

/** Fotos do Google vêm em 96 px (`=s96-c`); pede 512 px para guardar com qualidade. Outras URLs ficam intactas. */
export function upscaleGoogleAvatarUrl(url: string, size: number = MAX_CROPPED_SIDE): string {
  try {
    const u = new URL(url)
    if (!u.hostname.endsWith("googleusercontent.com")) return url
    return url.replace(/=s\d+(-c)?$/, `=s${size}-c`)
  } catch {
    return url
  }
}

/** Maior área quadrada centralizada de uma imagem (avatar é sempre quadrado). */
export function centerSquare(width: number, height: number) {
  const side = Math.min(width, height)
  return { x: Math.round((width - side) / 2), y: Math.round((height - side) / 2), side }
}

/**
 * Baixa uma foto por URL (ex.: Google), recorta o quadrado central, reduz para no máximo
 * MAX_CROPPED_SIDE e comprime para até 500 KB em WebP. Devolve null se o canvas não estiver disponível.
 * Lança erro se o download falhar (CORS, rede, imagem inválida).
 */
export async function imageUrlToAvatarBlob(url: string): Promise<Blob | null> {
  const image = await createImage(upscaleGoogleAvatarUrl(url))
  const { x, y, side } = centerSquare(image.naturalWidth || image.width, image.naturalHeight || image.height)
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  const target = scaleToMax(side, side, MAX_CROPPED_SIDE)
  canvas.width = target.width
  canvas.height = target.height
  ctx.drawImage(image, x, y, side, side, 0, 0, target.width, target.height)
  return compressToTargetSize(canvas, 500 * 1024)
}

export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<Blob | null> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")

  if (!ctx) {
    return null
  }

  // Tamanho do canvas: o recorte, reduzido para no máximo MAX_CROPPED_SIDE (fotos de celular têm milhares de pixels)
  const target = scaleToMax(pixelCrop.width, pixelCrop.height, MAX_CROPPED_SIDE)
  canvas.width = target.width
  canvas.height = target.height

  // Desenhar a imagem recortada
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    target.width,
    target.height
  )

  // Tentar compressão inicial
  return compressToTargetSize(canvas, 500 * 1024) // 500KB
}

async function compressToTargetSize(
  canvas: HTMLCanvasElement,
  maxSizeBytes: number,
  quality: number = 0.9
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null)
          return
        }

        // Se ainda for maior que o limite e a qualidade for aceitável, tentar comprimir mais
        if (blob.size > maxSizeBytes && quality > 0.1) {
          resolve(compressToTargetSize(canvas, maxSizeBytes, quality - 0.1))
        } else {
          resolve(blob)
        }
      },
      "image/webp",
      quality
    )
  })
}
