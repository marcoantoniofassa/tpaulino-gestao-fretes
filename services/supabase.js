// services/supabase.js — Supabase REST API helpers
import { SUPABASE_URL, supaHeaders } from './config.js'

const BASE = `${SUPABASE_URL}/rest/v1`
const STORAGE = `${SUPABASE_URL}/storage/v1`

// Generic query
export async function query(table, params = '', prefer = 'return=minimal') {
  const url = `${BASE}/${table}${params ? '?' + params : ''}`
  const res = await fetch(url, { headers: supaHeaders(prefer) })
  if (!res.ok) throw new Error(`Supabase GET ${table}: ${res.status} ${await res.text()}`)
  return res.json()
}

// Insert with return
export async function insert(table, data) {
  const res = await fetch(`${BASE}/${table}`, {
    method: 'POST',
    headers: supaHeaders('return=representation'),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Supabase INSERT ${table}: ${res.status} ${await res.text()}`)
  const rows = await res.json()
  return Array.isArray(rows) ? rows[0] : rows
}

// Patch with filter
export async function patch(table, filter, data) {
  const res = await fetch(`${BASE}/${table}?${filter}`, {
    method: 'PATCH',
    headers: supaHeaders('return=minimal'),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Supabase PATCH ${table}: ${res.status} ${await res.text()}`)
}

// Delete with filter
export async function del(table, filter) {
  const res = await fetch(`${BASE}/${table}?${filter}`, {
    method: 'DELETE',
    headers: supaHeaders('return=minimal'),
  })
  if (!res.ok) throw new Error(`Supabase DELETE ${table}: ${res.status} ${await res.text()}`)
}

// Upload to storage
export async function uploadStorage(path, buffer, contentType = 'image/jpeg') {
  const res = await fetch(`${STORAGE}/object/${path}`, {
    method: 'POST',
    headers: {
      ...supaHeaders(),
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: buffer,
  })
  if (!res.ok) throw new Error(`Storage upload ${path}: ${res.status} ${await res.text()}`)
}

// Delete from storage
export async function deleteStorage(paths) {
  const res = await fetch(`${STORAGE}/object`, {
    method: 'DELETE',
    headers: supaHeaders(),
    body: JSON.stringify({ prefixes: Array.isArray(paths) ? paths : [paths] }),
  })
  if (!res.ok) console.warn(`Storage delete failed: ${res.status}`)
}

// Public URL for storage object
export function publicUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${path}`
}
