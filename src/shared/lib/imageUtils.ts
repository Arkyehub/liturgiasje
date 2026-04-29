export const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener("load", () => resolve(image))
    image.addEventListener("error", (error) => reject(error))
    image.setAttribute("crossOrigin", "anonymous") // fundamental para evitar erros de CORS ao processar imagem
    image.src = url
  })

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

  // Definir tamanho do canvas igual ao recorte
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  // Desenhar a imagem recortada
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
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
