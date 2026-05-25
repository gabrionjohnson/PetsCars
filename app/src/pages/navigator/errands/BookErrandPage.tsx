import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'
import { Button } from '../../../components/ui/Button'
import { Toast } from '../../../components/ui/Toast'
import {
  SERVICE_LABELS,
  SERVICE_EMOJI,
  SERVICE_RATES,
  type ServiceType,
} from '../../../hooks/useTrips'

interface Client {
  id:         string
  name:       string
  phone:      string
  county:     string | null
  zip:        string | null
  address:    string | null
  va_status:  boolean
}

const SERVICES: ServiceType[] = [
  'pharmacy_pickup',
  'grocery_run',
  'small_errand',
  'ride_and_wait',
]

const SERVICE_DESCRIPTIONS: Record<ServiceType, string> = {
  pharmacy_pickup: 'Prescription pickup & home delivery',
  grocery_run:     'Shopping list pickup & home delivery',
  small_errand:    'Post office, bank, single-stop errand',
  ride_and_wait:   'Transport to appointment, wait, return',
}

const APPT_DURATIONS = [
  '30min', '45min', '1hr', '1.5hr', '2hr', '2.5hr+',
]

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 py-3">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all ${
            i + 1 === current
              ? 'w-6 bg-green'
              : i + 1 < current
              ? 'w-2 bg-green-light'
              : 'w-2 bg-gray-300'
          }`}
        />
      ))}
      <span className="ml-2 text-xs text-gray-500">Step {current} of {total}</span>
    </div>
  )
}

// ─── Step 1: Select Client ────────────────────────────────────────────────────
function StepSelectClient({
  clients,
  loading,
  selectedId,
  onSelect,
  onNext,
}: {
  clients: Client[]
  loading: boolean
  selectedId: string
  onSelect: (id: string) => void
  onNext: () => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Select Client</h2>
      {loading ? (
        <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
      ) : (
        <div className="space-y-2">
          <select
            value={selectedId}
            onChange={e => onSelect(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 focus:ring-2 focus:ring-green focus:outline-none"
          >
            <option value="">— Choose a client —</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.county ? `· ${c.county} County` : ''}
              </option>
            ))}
          </select>
          {selectedId && (() => {
            const c = clients.find(x => x.id === selectedId)
            return c ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-900">
                <p className="font-medium">{c.name}</p>
                {c.address && <p className="text-green-700 text-xs mt-0.5">{c.address}</p>}
                {c.va_status && (
                  <p className="mt-1 text-xs font-semibold text-amber-700">
                    ♿ Wheelchair assistance may be needed
                  </p>
                )}
              </div>
            ) : null
          })()}
        </div>
      )}
      <Button fullWidth disabled={!selectedId} onClick={onNext}>
        Next: Choose Service
      </Button>
    </div>
  )
}

// ─── Step 2: Select Service ───────────────────────────────────────────────────
function StepSelectService({
  selected,
  onSelect,
  onNext,
  onBack,
}: {
  selected: ServiceType | ''
  onSelect: (s: ServiceType) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Select Service</h2>
      <div className="grid grid-cols-2 gap-3">
        {SERVICES.map(svc => {
          const isSelected = selected === svc
          return (
            <button
              key={svc}
              onClick={() => onSelect(svc)}
              className={`relative flex flex-col items-center text-center p-4 rounded-xl border-2 transition-all min-h-[120px] ${
                isSelected
                  ? 'border-green bg-green-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              {isSelected && (
                <span className="absolute top-2 right-2 text-green text-sm font-bold">✓</span>
              )}
              <span className="text-3xl mb-1">{SERVICE_EMOJI[svc]}</span>
              <span className="text-sm font-semibold text-gray-900 leading-tight">
                {SERVICE_LABELS[svc]}
              </span>
              <span className="text-xs text-gray-500 mt-1 leading-snug">
                {SERVICE_DESCRIPTIONS[svc]}
              </span>
              <span className="mt-2 text-sm font-bold text-green">
                ${SERVICE_RATES[svc].flat}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onBack}>Back</Button>
        <Button fullWidth disabled={!selected} onClick={onNext}>Next: Job Details</Button>
      </div>
    </div>
  )
}

// ─── Step 3: Job Details ──────────────────────────────────────────────────────
interface JobDetails {
  // pharmacy
  pharmacyName?: string
  pharmacyAddress?: string
  rxReady?: string
  deliveryAddress?: string
  instructions?: string
  // grocery
  storeName?: string
  storeAddress?: string
  shoppingList?: string
  estimatedTotal?: string
  // small errand
  errandDescription?: string
  locationName?: string
  locationAddress?: string
  itemsToPickup?: string
  returnAddress?: string
  // ride & wait
  pickupAddress?: string
  destination?: string
  appointmentDate?: string
  appointmentTime?: string
  appointmentDuration?: string
  wavRequired?: boolean
}

function StepJobDetails({
  service,
  details,
  onChange,
  onNext,
  onBack,
}: {
  service: ServiceType
  details: JobDetails
  onChange: (d: JobDetails) => void
  onNext: () => void
  onBack: () => void
}) {
  const set = (key: keyof JobDetails, val: string | boolean) =>
    onChange({ ...details, [key]: val })

  const inputCls =
    'w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 focus:ring-2 focus:ring-green focus:outline-none'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  function isValid(): boolean {
    if (service === 'pharmacy_pickup')
      return !!(details.pharmacyName && details.pharmacyAddress && details.rxReady)
    if (service === 'grocery_run')
      return !!(details.storeName && details.storeAddress && details.shoppingList)
    if (service === 'small_errand')
      return !!(details.errandDescription && details.locationAddress)
    if (service === 'ride_and_wait')
      return !!(details.destination && details.appointmentDate && details.appointmentTime)
    return false
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Job Details</h2>

      {service === 'pharmacy_pickup' && (
        <>
          <div>
            <label className={labelCls}>Pharmacy name *</label>
            <input className={inputCls} value={details.pharmacyName ?? ''} onChange={e => set('pharmacyName', e.target.value)} placeholder="Walgreens, CVS…" />
          </div>
          <div>
            <label className={labelCls}>Pharmacy address *</label>
            <input className={inputCls} value={details.pharmacyAddress ?? ''} onChange={e => set('pharmacyAddress', e.target.value)} placeholder="123 Main St" />
          </div>
          <div>
            <label className={labelCls}>Prescription ready? *</label>
            <select className={inputCls} value={details.rxReady ?? ''} onChange={e => set('rxReady', e.target.value)}>
              <option value="">Select…</option>
              <option value="yes">Yes</option>
              <option value="will_call">No — will call ahead</option>
              <option value="unsure">Not sure</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Delivery address</label>
            <input className={inputCls} value={details.deliveryAddress ?? ''} onChange={e => set('deliveryAddress', e.target.value)} placeholder="Client's home address" />
          </div>
          <div>
            <label className={labelCls}>Special instructions (optional)</label>
            <textarea className={inputCls} rows={3} value={details.instructions ?? ''} onChange={e => set('instructions', e.target.value)} placeholder="Gate code, preferred drop-off spot…" />
          </div>
        </>
      )}

      {service === 'grocery_run' && (
        <>
          <div>
            <label className={labelCls}>Store name *</label>
            <input className={inputCls} value={details.storeName ?? ''} onChange={e => set('storeName', e.target.value)} placeholder="Piggly Wiggly, Walmart…" />
          </div>
          <div>
            <label className={labelCls}>Store address *</label>
            <input className={inputCls} value={details.storeAddress ?? ''} onChange={e => set('storeAddress', e.target.value)} placeholder="456 Oak Ave" />
          </div>
          <div>
            <label className={labelCls}>Shopping list * (one item per line)</label>
            <textarea className={inputCls} rows={5} value={details.shoppingList ?? ''} onChange={e => set('shoppingList', e.target.value)} placeholder="Milk&#10;Bread&#10;Eggs" />
          </div>
          <div>
            <label className={labelCls}>Estimated total (optional)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <input className={`${inputCls} pl-7`} type="number" min="0" step="0.01" value={details.estimatedTotal ?? ''} onChange={e => set('estimatedTotal', e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Delivery address</label>
            <input className={inputCls} value={details.deliveryAddress ?? ''} onChange={e => set('deliveryAddress', e.target.value)} placeholder="Client's home address" />
          </div>
          <div>
            <label className={labelCls}>Special instructions (optional)</label>
            <textarea className={inputCls} rows={2} value={details.instructions ?? ''} onChange={e => set('instructions', e.target.value)} placeholder="Brand preferences, substitutions OK…" />
          </div>
        </>
      )}

      {service === 'small_errand' && (
        <>
          <div>
            <label className={labelCls}>Errand description *</label>
            <textarea className={inputCls} rows={3} value={details.errandDescription ?? ''} onChange={e => set('errandDescription', e.target.value)} placeholder="Drop off package at post office…" />
          </div>
          <div>
            <label className={labelCls}>Location name</label>
            <input className={inputCls} value={details.locationName ?? ''} onChange={e => set('locationName', e.target.value)} placeholder="USPS, First National Bank…" />
          </div>
          <div>
            <label className={labelCls}>Location address *</label>
            <input className={inputCls} value={details.locationAddress ?? ''} onChange={e => set('locationAddress', e.target.value)} placeholder="789 Elm St" />
          </div>
          <div>
            <label className={labelCls}>Items to pick up or drop off (optional)</label>
            <textarea className={inputCls} rows={2} value={details.itemsToPickup ?? ''} onChange={e => set('itemsToPickup', e.target.value)} placeholder="Describe items or list them…" />
          </div>
          <div>
            <label className={labelCls}>Return / delivery address</label>
            <input className={inputCls} value={details.returnAddress ?? ''} onChange={e => set('returnAddress', e.target.value)} placeholder="Client's home address" />
          </div>
        </>
      )}

      {service === 'ride_and_wait' && (
        <>
          <div>
            <label className={labelCls}>Pickup address</label>
            <input className={inputCls} value={details.pickupAddress ?? ''} onChange={e => set('pickupAddress', e.target.value)} placeholder="Client's home address" />
          </div>
          <div>
            <label className={labelCls}>Destination address *</label>
            <input className={inputCls} value={details.destination ?? ''} onChange={e => set('destination', e.target.value)} placeholder="Doctor's office, clinic…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Appointment date *</label>
              <input className={inputCls} type="date" value={details.appointmentDate ?? ''} onChange={e => set('appointmentDate', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Appointment time *</label>
              <input className={inputCls} type="time" value={details.appointmentTime ?? ''} onChange={e => set('appointmentTime', e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Estimated duration</label>
            <select className={inputCls} value={details.appointmentDuration ?? ''} onChange={e => set('appointmentDuration', e.target.value)}>
              <option value="">Select…</option>
              {APPT_DURATIONS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Wheelchair assistance needed?</label>
            <div className="flex gap-3">
              {['Yes', 'No'].map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => set('wavRequired', opt === 'Yes')}
                  className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    details.wavRequired === (opt === 'Yes')
                      ? 'border-green bg-green-50 text-green'
                      : 'border-gray-200 text-gray-700'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Special instructions (optional)</label>
            <textarea className={inputCls} rows={2} value={details.instructions ?? ''} onChange={e => set('instructions', e.target.value)} placeholder="Needs extra time getting in/out…" />
          </div>
        </>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onBack}>Back</Button>
        <Button fullWidth disabled={!isValid()} onClick={onNext}>Next: Schedule</Button>
      </div>
    </div>
  )
}

// ─── Step 4: Schedule ─────────────────────────────────────────────────────────
function StepSchedule({
  scheduleType,
  scheduleDate,
  scheduleTime,
  onType,
  onDate,
  onTime,
  onNext,
  onBack,
}: {
  scheduleType: 'asap' | 'later'
  scheduleDate: string
  scheduleTime: string
  onType: (t: 'asap' | 'later') => void
  onDate: (d: string) => void
  onTime: (t: string) => void
  onNext: () => void
  onBack: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const isValid = scheduleType === 'asap' || (!!scheduleDate && !!scheduleTime)

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Schedule</h2>
      <div className="space-y-3">
        {(['asap', 'later'] as const).map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onType(opt)}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
              scheduleType === opt
                ? 'border-green bg-green-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <span className="text-2xl">{opt === 'asap' ? '⚡' : '📅'}</span>
            <div>
              <p className="font-semibold text-gray-900">
                {opt === 'asap' ? 'ASAP — next available driver' : 'Schedule for later'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {opt === 'asap'
                  ? 'Job is dispatched immediately'
                  : 'Pick a date and time for the job'}
              </p>
            </div>
            {scheduleType === opt && (
              <span className="ml-auto text-green font-bold">✓</span>
            )}
          </button>
        ))}
      </div>

      {scheduleType === 'later' && (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              min={today}
              value={scheduleDate}
              onChange={e => onDate(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
            <input
              type="time"
              value={scheduleTime}
              onChange={e => onTime(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green focus:outline-none"
            />
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onBack}>Back</Button>
        <Button fullWidth disabled={!isValid} onClick={onNext}>Next: Review</Button>
      </div>
    </div>
  )
}

// ─── Step 5: Review & Confirm ─────────────────────────────────────────────────
function StepReview({
  client,
  service,
  details,
  scheduleType,
  scheduleDate,
  scheduleTime,
  submitting,
  onConfirm,
  onBack,
}: {
  client: Client
  service: ServiceType
  details: JobDetails
  scheduleType: 'asap' | 'later'
  scheduleDate: string
  scheduleTime: string
  submitting: boolean
  onConfirm: () => void
  onBack: () => void
}) {
  const detailRows: [string, string][] = []
  if (service === 'pharmacy_pickup') {
    if (details.pharmacyName) detailRows.push(['Pharmacy', details.pharmacyName])
    if (details.pharmacyAddress) detailRows.push(['Pharmacy address', details.pharmacyAddress])
    if (details.rxReady) detailRows.push(['Rx ready?', details.rxReady === 'yes' ? 'Yes' : details.rxReady === 'will_call' ? 'No — will call' : 'Not sure'])
    if (details.deliveryAddress) detailRows.push(['Deliver to', details.deliveryAddress])
  } else if (service === 'grocery_run') {
    if (details.storeName) detailRows.push(['Store', details.storeName])
    if (details.storeAddress) detailRows.push(['Store address', details.storeAddress])
    if (details.shoppingList) detailRows.push(['Shopping list', details.shoppingList.replace(/\n/g, ', ')])
    if (details.estimatedTotal) detailRows.push(['Est. total', `$${details.estimatedTotal}`])
    if (details.deliveryAddress) detailRows.push(['Deliver to', details.deliveryAddress])
  } else if (service === 'small_errand') {
    if (details.errandDescription) detailRows.push(['Errand', details.errandDescription])
    if (details.locationName) detailRows.push(['Location', details.locationName])
    if (details.locationAddress) detailRows.push(['Address', details.locationAddress])
    if (details.returnAddress) detailRows.push(['Return to', details.returnAddress])
  } else if (service === 'ride_and_wait') {
    if (details.pickupAddress) detailRows.push(['Pickup', details.pickupAddress])
    if (details.destination) detailRows.push(['Destination', details.destination])
    if (details.appointmentDate) detailRows.push(['Appointment', `${details.appointmentDate} at ${details.appointmentTime}`])
    if (details.appointmentDuration) detailRows.push(['Duration', details.appointmentDuration])
    detailRows.push(['WAV needed', details.wavRequired ? 'Yes' : 'No'])
  }
  if (details.instructions) detailRows.push(['Notes', details.instructions])

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Review & Confirm</h2>
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        <div className="p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Client</p>
          <p className="font-semibold text-gray-900">{client.name}</p>
        </div>
        <div className="p-4 flex items-center gap-3">
          <span className="text-3xl">{SERVICE_EMOJI[service]}</span>
          <div>
            <p className="font-semibold text-gray-900">{SERVICE_LABELS[service]}</p>
            <p className="text-sm text-green font-bold">${SERVICE_RATES[service].flat} flat rate</p>
          </div>
        </div>
        {detailRows.map(([k, v]) => (
          <div key={k} className="px-4 py-2">
            <span className="text-xs text-gray-500">{k}: </span>
            <span className="text-sm text-gray-900">{v}</span>
          </div>
        ))}
        <div className="p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Schedule</p>
          <p className="font-semibold text-gray-900">
            {scheduleType === 'asap'
              ? '⚡ ASAP — next available driver'
              : `📅 ${scheduleDate} at ${scheduleTime}`}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onBack} disabled={submitting}>Back</Button>
        <Button fullWidth loading={submitting} onClick={onConfirm}>
          Confirm & Dispatch
        </Button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function BookErrandPage() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const [searchParams] = useSearchParams()

  const [step, setStep] = useState(1)
  const TOTAL_STEPS = 5

  // State
  const [clients,  setClients]  = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [clientId, setClientId] = useState(searchParams.get('clientId') ?? '')
  const [service,  setService]  = useState<ServiceType | ''>(
    (searchParams.get('service') as ServiceType) ?? ''
  )
  const [details,  setDetails]  = useState<JobDetails>({})
  const [scheduleType, setScheduleType] = useState<'asap' | 'later'>('asap')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [toast,        setToast]        = useState<string | null>(null)

  // Load clients
  useEffect(() => {
    if (!user) return
    supabase
      .from('clients')
      .select('id,name,phone,county,zip,address,va_status')
      .eq('navigator_id', user.id)
      .order('name')
      .then(({ data }) => {
        setClients((data ?? []) as Client[])
        setClientsLoading(false)
      })
  }, [user])

  // Pre-fill from URL
  useEffect(() => {
    const cId = searchParams.get('clientId')
    if (cId) {
      setClientId(cId)
      if (step === 1) setStep(2)
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill delivery/pickup from client address
  useEffect(() => {
    const client = clients.find(c => c.id === clientId)
    if (!client?.address) return
    setDetails(prev => ({
      ...prev,
      deliveryAddress: prev.deliveryAddress || client.address || '',
      returnAddress:   prev.returnAddress   || client.address || '',
      pickupAddress:   prev.pickupAddress   || client.address || '',
      wavRequired:     prev.wavRequired !== undefined ? prev.wavRequired : client.va_status,
    }))
  }, [clientId, clients])

  const selectedClient = clients.find(c => c.id === clientId)

  async function handleConfirm() {
    if (!selectedClient || !service || !user) return
    setSubmitting(true)

    const scheduledFor =
      scheduleType === 'later' && scheduleDate && scheduleTime
        ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
        : null

    // Build pickup_address & destination from details
    let pickupAddress = ''
    let destination: string | null = null

    if (service === 'pharmacy_pickup') {
      pickupAddress = details.pharmacyAddress ?? ''
      destination   = details.deliveryAddress ?? selectedClient.address ?? ''
    } else if (service === 'grocery_run') {
      pickupAddress = details.storeAddress ?? ''
      destination   = details.deliveryAddress ?? selectedClient.address ?? ''
    } else if (service === 'small_errand') {
      pickupAddress = details.locationAddress ?? ''
      destination   = details.returnAddress ?? selectedClient.address ?? ''
    } else if (service === 'ride_and_wait') {
      pickupAddress = details.pickupAddress ?? selectedClient.address ?? ''
      destination   = details.destination ?? ''
    }

    const { data: trip, error } = await supabase
      .from('errand_trips')
      .insert({
        client_id:       clientId,
        booked_by:       user.id,
        service_type:    service,
        pickup_address:  pickupAddress,
        destination:     destination,
        instructions:    details.instructions ?? null,
        flat_rate:       SERVICE_RATES[service].flat,
        wav_required:    details.wavRequired ?? false,
        booking_source:  'navigator',
        job_details:     details,
        scheduled_for:   scheduledFor,
        status:          'pending',
      })
      .select('id')
      .single()

    if (error || !trip) {
      setToast('Failed to create trip: ' + (error?.message ?? 'unknown error'))
      setSubmitting(false)
      return
    }

    // Dispatch
    await supabase.functions.invoke('dispatch-job', { body: { trip_id: trip.id } })

    setSubmitting(false)
    navigate('/nav/errands')
  }

  return (
    <div className="max-w-lg mx-auto px-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 pt-4 pb-2">
        <button
          onClick={() => (step === 1 ? navigate(-1) : setStep(s => s - 1))}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-gray-900">Book Errand</h1>
      </div>

      <StepIndicator current={step} total={TOTAL_STEPS} />

      <div className="mt-2">
        {step === 1 && (
          <StepSelectClient
            clients={clients}
            loading={clientsLoading}
            selectedId={clientId}
            onSelect={setClientId}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepSelectService
            selected={service}
            onSelect={s => setService(s)}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && service && (
          <StepJobDetails
            service={service}
            details={details}
            onChange={setDetails}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && (
          <StepSchedule
            scheduleType={scheduleType}
            scheduleDate={scheduleDate}
            scheduleTime={scheduleTime}
            onType={setScheduleType}
            onDate={setScheduleDate}
            onTime={setScheduleTime}
            onNext={() => setStep(5)}
            onBack={() => setStep(3)}
          />
        )}
        {step === 5 && selectedClient && service && (
          <StepReview
            client={selectedClient}
            service={service}
            details={details}
            scheduleType={scheduleType}
            scheduleDate={scheduleDate}
            scheduleTime={scheduleTime}
            submitting={submitting}
            onConfirm={handleConfirm}
            onBack={() => setStep(4)}
          />
        )}
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
