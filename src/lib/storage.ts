import { supabase } from './supabase'

const BUCKET = 'fotos'

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
}

export async function uploadFile(
  file: File,
  folder: string,
  id: string
): Promise<string | null> {
  const ext = file.name.split('.').pop() || MIME_TO_EXT[file.type] || 'jpg'
  const path = `${folder}/${id}.${ext}`

  const contentType = file.type || 'application/octet-stream'

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType })

  if (error) {
    console.error('Upload failed:', error)
    return null
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/** @deprecated Use uploadFile instead */
export const uploadPhoto = uploadFile
