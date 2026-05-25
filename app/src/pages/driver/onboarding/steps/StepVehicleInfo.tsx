import { useRef, type ChangeEvent } from 'react'
import type { DriverDraft } from '../DriverOnboardingWizard'

interface Props {
  draft:    DriverDraft
  onChange: (partial: Partial<DriverDraft>) => void
}

const labelCls = 'block text-sm font-semibold text-gray-700 mb-1'
const inputCls =
  'w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#1a5c38] focus:border-transparent'

export function StepVehicleInfo({ draft, onChange }: Props) {
  const photoRef = useRef<HTMLInputElement>(null)

  function field(key: keyof DriverDraft) {
    return (e: ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value })
  }

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onChange({ vehiclePhotoFile: file, vehiclePhotoUrl: null })
    e.target.value = ''
  }

  const previewSrc = draft.vehiclePhotoFile
    ? URL.createObjectURL(draft.vehiclePhotoFile)
    : null

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#1a5c38] font-medium bg-green-50 border border-green-200 rounded-xl px-4 py-3">
        🚗 Enter your vehicle details. Seniors will see your vehicle color and make when a driver is assigned.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Make *</label>
          <input
            type="text"
            value={draft.vehicleMake}
            onChange={field('vehicleMake')}
            placeholder="Toyota"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Model *</label>
          <input
            type="text"
            value={draft.vehicleModel}
            onChange={field('vehicleModel')}
            placeholder="Camry"
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Year *</label>
          <input
            type="number"
            value={draft.vehicleYear}
            onChange={field('vehicleYear')}
            placeholder="2020"
            min={1990}
            max={new Date().getFullYear() + 1}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Color *</label>
          <input
            type="text"
            value={draft.vehicleColor}
            onChange={field('vehicleColor')}
            placeholder="Silver"
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>License Plate *</label>
        <input
          type="text"
          value={draft.licensePlate}
          onChange={field('licensePlate')}
          placeholder="ABC 1234"
          className={inputCls}
          style={{ textTransform: 'uppercase' }}
        />
      </div>

      {/* WAV Toggle */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <p className="font-semibold text-gray-900 text-base mb-1">
          Wheelchair Accessible Vehicle (WAV)?
        </p>
        <p className="text-xs text-gray-500 mb-4">
          Does your vehicle have a ramp, lift, or space for a wheelchair?
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onChange({ hasWav: true })}
            className={`flex-1 py-3 rounded-xl font-semibold text-base min-h-[48px] border transition-colors
              ${draft.hasWav
                ? 'bg-[#1a5c38] text-white border-[#1a5c38]'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
          >
            Yes ♿
          </button>
          <button
            type="button"
            onClick={() => onChange({ hasWav: false })}
            className={`flex-1 py-3 rounded-xl font-semibold text-base min-h-[48px] border transition-colors
              ${!draft.hasWav
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
          >
            No
          </button>
        </div>
      </div>

      {/* Vehicle Photo */}
      <div>
        <label className={labelCls}>Vehicle Photo (front/side)</label>
        {previewSrc ? (
          <div className="relative">
            <img
              src={previewSrc}
              alt="Vehicle preview"
              className="w-full h-48 object-cover rounded-xl border border-gray-200"
            />
            <button
              type="button"
              onClick={() => onChange({ vehiclePhotoFile: null, vehiclePhotoUrl: null })}
              className="absolute top-2 right-2 bg-white text-gray-600 border border-gray-300 rounded-full w-8 h-8 flex items-center justify-center text-sm shadow"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-300 rounded-xl py-8 flex flex-col items-center gap-2
                       text-gray-500 hover:border-[#1a5c38] hover:text-[#1a5c38] transition-colors min-h-[48px]"
          >
            <span className="text-3xl">📷</span>
            <span className="text-sm font-medium">Take photo or upload</span>
          </button>
        )}
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoChange}
        />
      </div>
    </div>
  )
}
