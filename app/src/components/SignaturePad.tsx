import { useRef, useState, useEffect, useCallback } from 'react'

interface SignaturePadProps {
  label:        string
  onCapture:    (dataUrl: string) => void
  onCancel?:    () => void
  disabled?:    boolean
}

export function SignaturePad({ label, onCapture, onCancel, disabled }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing   = useRef(false)
  const lastPos   = useRef<{ x: number; y: number } | null>(null)
  const [hasStroke, setHasStroke] = useState(false)

  // Init canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#111827'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
  }, [])

  function getPos(e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0]
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
    }
    return {
      x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as React.MouseEvent).clientY - rect.top)  * scaleY,
    }
  }

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (disabled) return
    e.preventDefault()
    const canvas = canvasRef.current!
    drawing.current = true
    lastPos.current = getPos(e, canvas)
  }, [disabled])

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!drawing.current || disabled) return
    e.preventDefault()
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!
    const pos    = getPos(e, canvas)
    if (lastPos.current) {
      ctx.beginPath()
      ctx.moveTo(lastPos.current.x, lastPos.current.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      setHasStroke(true)
    }
    lastPos.current = pos
  }, [disabled])

  const stopDraw = useCallback(() => {
    drawing.current = false
    lastPos.current = null
  }, [])

  function clear() {
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasStroke(false)
  }

  function submit() {
    if (!hasStroke || !canvasRef.current) return
    const dataUrl = canvasRef.current.toDataURL('image/png')
    onCapture(dataUrl)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">{label}</p>

      <div className="border-2 border-gray-300 rounded-xl overflow-hidden bg-white touch-none">
        <canvas
          ref={canvasRef}
          width={640}
          height={240}
          className="w-full h-40 block"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
          style={{ cursor: disabled ? 'not-allowed' : 'crosshair' }}
        />
        <div className="border-t border-dashed border-gray-300 mx-4" />
        <p className="text-center text-xs text-gray-400 py-1">Sign above</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={clear}
          disabled={!hasStroke || disabled}
          className="flex-1 py-2 text-sm border border-gray-300 rounded-lg text-gray-600
                     hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Clear
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 text-sm border border-gray-300 rounded-lg text-gray-600
                       hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!hasStroke || disabled}
          className="flex-1 py-2 text-sm bg-[#1a5c38] text-white rounded-lg font-medium
                     hover:bg-[#134429] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Confirm Signature
        </button>
      </div>
    </div>
  )
}
