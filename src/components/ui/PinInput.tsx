import { useRef, useState, KeyboardEvent } from 'react'

interface PinInputProps {
  length?: number
  onComplete: (pin: string) => void
  disabled?: boolean
}

export function PinInput({ length = 4, onComplete, disabled }: PinInputProps) {
  const [values, setValues] = useState<string[]>(Array(length).fill(''))
  const refs = useRef<(HTMLInputElement | null)[]>([])

  function handleChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return
    const digit = value.slice(-1)
    const newValues = [...values]
    newValues[index] = digit
    setValues(newValues)

    if (digit && index < length - 1) {
      refs.current[index + 1]?.focus()
    }

    if (newValues.every(v => v !== '')) {
      onComplete(newValues.join(''))
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !values[index] && index > 0) {
      refs.current[index - 1]?.focus()
      const newValues = [...values]
      newValues[index - 1] = ''
      setValues(newValues)
    }
  }

  return (
    <div className="flex gap-3 justify-center">
      {values.map((v, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          type="tel"
          inputMode="numeric"
          maxLength={1}
          value={v}
          disabled={disabled}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          className="w-14 h-16 text-center text-2xl font-bold rounded-xl border-2 border-slate-200 focus:border-tp-blue focus:ring-2 focus:ring-tp-blue/20 outline-none transition-all disabled:opacity-50"
        />
      ))}
    </div>
  )
}
