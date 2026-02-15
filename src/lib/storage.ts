import { supabase } from './supabase'

const BUCKET = 'fotos'

export async function uploadPhoto(
  file: File,
  folder: string,
  id: string
): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${folder}/${id}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true })

  if (error) {
    console.error('Upload failed:', error)
    return null
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}
