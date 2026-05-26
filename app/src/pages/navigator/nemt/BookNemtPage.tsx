import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'
import { Button } from '../../../components/ui/Button'
import { Toast } from '../../../components/ui/Toast'
import { useSavedProviders, NEMT_TRIP_TYPE_LABELS, NEMT_TRIP_TYPE_EMOJI, APPOINTMENT_TYPES, type NemtTripType } from '../../../hooks/useNemt'

interface Client {
  id:          string
  name:        string
  phone:       string
  address:     string | null
  county:      string | null
  medicaid_id: string | null
}

const TRIP_TYPES: NemtTripType[] = ['ambulatory', 'wheelchair', 'stretcher']

const TRIP_TYPE_DESCRIPTIONS: Record<NemtTripType, string> = {
  ambulatory: 'Client walks without assistance or uses a cane/walker',
  wheelchair: 'Client requires a wheelchair-accessible vehicle',
  stretcher:  'Client must remain lying down — requires admin assignment',
}

// ─── StepIndicator ────────────────────────────────────────────────────────────
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 py-3">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all ${
            i + 1 === current
              ? 'w-6 bg-[#1a5c38]'
              : i + 1 < current
              ? 'w-2 bg-[#1a5c38]/40'
              : 'w-2 bg-gray-300'
          }`}
        />
      ))}
      <span className="ml-2 text-xs text-gray-500">Step {current} of {total}</span>
    </div>
  )
}

// ─── Step 1: Client ───────────────────────────────────────────────────────────
function StepClient({
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
  const selected = clients.find(c => c.id === selectedId)
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
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 focus:ring-2 focus:ring-[#1a5c38] focus:outline-none"
          >
            <option value="">— Choose a client —</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.county ? ` · ${c.county} County` : ''}
              </option>
            ))}
          </select>
          {selected && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-900 space-y-0.5">
              <p className="font-semibold">{selected.name}</p>
              {selected.address && <p className="text-xs text-green-700">{selected.address}</p>}
              {selected.medicaid_id ? (
                <p className="text-xs font-medium text-green-800">Medicaid ID: {selected.medicaid_id}</p>
              ) : (
                <p className="text-xs text-amber-700 font-medium">No Medicaid ID on file — you'll enter it in step 6.</p>
              )}
            </div>
          )}
        </div>
      )}
      <Button fullWidth disabled={!selectedId} onClick={onNext}>
        Next: Trip Type
      </Button>
    </div>
  )
}

// ─── Step 2: Trip Type ────────────────────────────────────────────────────────
function StepTripType({
  selected,
  onSelect,
  onNext,
  onBack,
}: {
  selected: NemtTripType | ''
  onSelect: (t: NemtTripType) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Trip Type</h2>
      <div className="space-y-3">
        {TRIP_TYPES.map(t => {
          const isSelected = selected === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => onSelect(t)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                isSelected
                  ? 'border-[#1a5c38] bg-green-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <span className="text-3xl">{NEMT_TRIP_TYPE_EMOJI[t]}</span>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{NEMT_TRIP_TYPE_LABELS[t]}</p>
                <p className="text-xs text-gray-500 mt-0.5">{TRIP_TYPE_DESCRIPTIONS[t]}</p>
                {t === 'stretcher' && (
                  <p className="text-xs text-amber-700 font-medium mt-1">
                    Requires manual admin assignment
                  </p>
                )}
              </div>
              {isSelected && <span className="text-[#1a5c38] font-bold ml-auto">✓</span>}
            </button>
          )
        })}
      </div>
      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onBack}>Back</Button>
        <Button fullWidth disabled={!selected} onClick={onNext}>Next: Schedule</Button>
      </div>
    </div>
  )
}

// ─── Step 3: Schedule ─────────────────────────────────────────────────────────
function StepSchedule({
  scheduledDatetime,
  onDatetime,
  returnIncluded,
  onReturnToggle,
  returnPickupTime,
  onReturnTime,
  minDatetime,
  onNext,
  onBack,
}: {
  scheduledDatetime: string
  onDatetime: (v: string) => void
  returnIncluded: boolean
  onReturnToggle: (v: boolean) => void
  returnPickupTime: string
  onReturnTime: (v: string) => void
  minDatetime: string
  onNext: () => void
  onBack: () => void
}) {
  const isValid = !!scheduledDatetime && (!returnIncluded || !!returnPickupTime)

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Schedule</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Appointment date &amp; time *
        </label>
        <input
          type="datetime-local"
          min={minDatetime}
          value={scheduledDatetime}
          onChange={e => onDatetime(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#1a5c38] focus:outline-none"
        />
        <p className="text-xs text-gray-500 mt-1">Minimum 3 business days from today required for Verida scheduling.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            checked={returnIncluded}
            onChange={e => onReturnToggle(e.target.checked)}
            className="w-5 h-5 rounded accent-[#1a5c38]"
          />
          <span className="text-sm font-semibold text-gray-700">Return trip included</span>
        </label>
        {returnIncluded && (
          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Return pickup time *</label>
            <input
              type="datetime-local"
              min={scheduledDatetime || minDatetime}
              value={returnPickupTime}
              onChange={e => onReturnTime(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#1a5c38] focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onBack}>Back</Button>
        <Button fullWidth disabled={!isValid} onClick={onNext}>Next: Provider</Button>
      </div>
    </div>
  )
}

// ─── Step 4: Provider ─────────────────────────────────────────────────────────
interface ProviderForm {
  appointmentAddress:   string
  appointmentType:      string
  appointmentProvider:  string
  assistanceNeeded:     string
}

function StepProvider({
  clientId,
  form,
  onChange,
  onNext,
  onBack,
}: {
  clientId: string
  form: ProviderForm
  onChange: (f: ProviderForm) => void
  onNext: () => void
  onBack: () => void
}) {
  const { providers, loading: providersLoading } = useSavedProviders(clientId)
  const [selectedProviderId, setSelectedProviderId] = useState('')

  const inputCls = 'w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 focus:ring-2 focus:ring-[#1a5c38] focus:outline-none'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  function set(key: keyof ProviderForm, val: string) {
    onChange({ ...form, [key]: val })
  }

  function handleSavedProviderSelect(id: string) {
    setSelectedProviderId(id)
    if (!id) return
    const provider = providers.find(p => p.id === id)
    if (provider) {
      onChange({
        ...form,
        appointmentAddress:  provider.address,
        appointmentProvider: provider.name,
      })
    }
  }

  const isValid = !!form.appointmentAddress && !!form.appointmentType && !!form.appointmentProvider

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Provider &amp; Appointment</h2>

      {!providersLoading && providers.length > 0 && (
        <div>
          <label className={labelCls}>Saved providers (optional)</label>
          <select
            value={selectedProviderId}
            onChange={e => handleSavedProviderSelect(e.target.value)}
            className={inputCls}
          >
            <option value="">— Select a saved provider —</option>
            {providers.map(p => (
              <option key={p.id} value={p.id}>
                {p.is_default ? '★ ' : ''}{p.name} — {p.address}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className={labelCls}>Appointment address *</label>
        <input
          className={inputCls}
          value={form.appointmentAddress}
          onChange={e => set('appointmentAddress', e.target.value)}
          placeholder="123 Medical Drive, Americus, GA"
        />
      </div>

      <div>
        <label className={labelCls}>Appointment type *</label>
        <select
          value={form.appointmentType}
          onChange={e => set('appointmentType', e.target.value)}
          className={inputCls}
        >
          <option value="">— Select type —</option>
          {APPOINTMENT_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>Provider / facility name *</label>
        <input
          className={inputCls}
          value={form.appointmentProvider}
          onChange={e => set('appointmentProvider', e.target.value)}
          placeholder="Sumter Regional Hospital, Dr. Smith's office…"
        />
      </div>

      <div>
        <label className={labelCls}>Special assistance needed (optional)</label>
        <textarea
          className={inputCls}
          rows={3}
          value={form.assistanceNeeded}
          onChange={e => set('assistanceNeeded', e.target.value)}
          placeholder="Oxygen tank, interpreter needed, mobility limitations…"
        />
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onBack}>Back</Button>
        <Button fullWidth disabled={!isValid} onClick={onNext}>Next: Pickup</Button>
      </div>
    </div>
  )
}

// ─── Step 5: Pickup ───────────────────────────────────────────────────────────
function StepPickup({
  pickupAddress,
  onPickupAddress,
  onNext,
  onBack,
}: {
  pickupAddress: string
  onPickupAddress: (v: string) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Pickup Location</h2>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Pickup address *</label>
        <input
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 focus:ring-2 focus:ring-[#1a5c38] focus:outline-none"
          value={pickupAddress}
          onChange={e => onPickupAddress(e.target.value)}
          placeholder="Client's home address"
        />
        <p className="text-xs text-gray-500 mt-1">Pre-filled from client record if available.</p>
      </div>
      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onBack}>Back</Button>
        <Button fullWidth disabled={!pickupAddress.trim()} onClick={onNext}>Next: Medicaid</Button>
      </div>
    </div>
  )
}

// ─── Step 6: Medicaid ─────────────────────────────────────────────────────────
function StepMedicaid({
  medicaidId,
  onMedicaidId,
  onNext,
  onBack,
}: {
  medicaidId: string
  onMedicaidId: (v: string) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Medicaid ID</h2>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
        <p className="text-xs text-blue-800 font-medium">Required for Verida billing. Confirm the client's Medicaid ID before submitting.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Medicaid ID *</label>
        <input
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 focus:ring-2 focus:ring-[#1a5c38] focus:outline-none font-mono"
          value={medicaidId}
          onChange={e => onMedicaidId(e.target.value)}
          placeholder="GA1234567890"
        />
      </div>
      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onBack}>Back</Button>
        <Button fullWidth disabled={!medicaidId.trim()} onClick={onNext}>Next: Confirm</Button>
      </div>
    </div>
  )
}

// ─── Step 7: Confirm ─────────────────────────────────────────────────────────
function StepConfirm({
  client,
  tripType,
  scheduledDatetime,
  returnIncluded,
  returnPickupTime,
  providerForm,
  pickupAddress,
  medicaidId,
  submitting,
  onConfirm,
  onBack,
}: {
  client: Client
  tripType: NemtTripType
  scheduledDatetime: string
  returnIncluded: boolean
  returnPickupTime: string
  providerForm: ProviderForm
  pickupAddress: string
  medicaidId: string
  submitting: boolean
  onConfirm: () => void
  onBack: () => void
}) {
  function fmt(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  }

  const rows: [string, string][] = [
    ['Client',       client.name],
    ['Medicaid ID',  medicaidId],
    ['Trip type',    `${NEMT_TRIP_TYPE_EMOJI[tripType]} ${NEMT_TRIP_TYPE_LABELS[tripType]}`],
    ['Scheduled',    fmt(scheduledDatetime)],
    ['Return trip',  returnIncluded ? `Yes — ${fmt(returnPickupTime)}` : 'No'],
    ['Pickup',       pickupAddress],
    ['Appointment',  providerForm.appointmentAddress],
    ['Provider',     providerForm.appointmentProvider],
    ['Appt. type',   providerForm.appointmentType],
  ]
  if (providerForm.assistanceNeeded) rows.push(['Assistance', providerForm.assistanceNeeded])

  if (tripType === 'stretcher') {
    rows.push(['Note', 'Stretcher trip → manual admin assignment'])
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Review &amp; Confirm</h2>
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {rows.map(([k, v]) => (
          <div key={k} className="px-4 py-2.5 flex gap-3">
            <span className="text-xs text-gray-500 w-28 shrink-0 pt-0.5">{k}</span>
            <span className="text-sm text-gray-900 break-words">{v}</span>
          </div>
        ))}
      </div>
      {tripType === 'stretcher' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs text-amber-800 font-medium">
            Stretcher trips are not auto-dispatched. An admin will assign a driver manually.
          </p>
        </div>
      )}
      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onBack} disabled={submitting}>Back</Button>
        <Button fullWidth loading={submitting} onClick={onConfirm}>
          Book NEMT Trip
        </Button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function BookNemtPage() {
  const { user }    = useAuth()
  const navigate    = useNavigate()
  const [searchParams] = useSearchParams()

  const TOTAL_STEPS = 7
  const [step, setStep] = useState(1)

  const [clients,        setClients]        = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [clientId,       setClientId]       = useState(searchParams.get('clientId') ?? '')
  const [tripType,       setTripType]       = useState<NemtTripType | ''>('')
  const [scheduledDatetime, setScheduledDatetime] = useState('')
  const [returnIncluded, setReturnIncluded] = useState(false)
  const [returnPickupTime, setReturnPickupTime] = useState('')
  const [providerForm,   setProviderForm]   = useState<ProviderForm>({
    appointmentAddress: '',
    appointmentType: '',
    appointmentProvider: '',
    assistanceNeeded: '',
  })
  const [pickupAddress,  setPickupAddress]  = useState('')
  const [medicaidId,     setMedicaidId]     = useState('')
  const [minDatetime,    setMinDatetime]    = useState('')
  const [submitting,     setSubmitting]     = useState(false)
  const [toast,          setToast]          = useState<string | null>(null)
  const [successTripId,  setSuccessTripId]  = useState<string | null>(null)
  const [dupWarning,     setDupWarning]     = useState(false)

  // Load clients
  useEffect(() => {
    if (!user) return
    supabase
      .from('clients')
      .select('id,name,phone,address,county,medicaid_id')
      .eq('navigator_id', user.id)
      .order('name')
      .then(({ data }) => {
        setClients((data ?? []) as Client[])
        setClientsLoading(false)
      })
  }, [user])

  // Load min datetime from RPC
  useEffect(() => {
    supabase
      .rpc('business_days_from_now', { p_days: 3 })
      .then(({ data }) => {
        if (data) {
          // data is a date string; convert to datetime-local format
          const d = new Date(data as string)
          const pad = (n: number) => String(n).padStart(2, '0')
          const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T08:00`
          setMinDatetime(local)
        }
      })
  }, [])

  // Pre-fill from URL param
  useEffect(() => {
    const cId = searchParams.get('clientId')
    if (cId && step === 1) {
      setClientId(cId)
      setStep(2)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill pickup + medicaid from client
  useEffect(() => {
    const client = clients.find(c => c.id === clientId)
    if (!client) return
    setPickupAddress(prev => prev || client.address || '')
    setMedicaidId(prev => prev || client.medicaid_id || '')
  }, [clientId, clients])

  // Duplicate trip check when reaching confirm step
  useEffect(() => {
    if (step !== 7 || !clientId || !scheduledDatetime) return
    setDupWarning(false)
    supabase
      .rpc('check_duplicate_nemt_trip', {
        p_client_id:          clientId,
        p_scheduled_datetime: new Date(scheduledDatetime).toISOString(),
        p_exclude_trip_id:    null,
      })
      .then(({ data }) => { if (data === true) setDupWarning(true) })
  }, [step, clientId, scheduledDatetime])

  const selectedClient = clients.find(c => c.id === clientId)

  async function handleConfirm() {
    if (!selectedClient || !tripType || !user) return
    setSubmitting(true)

    const payload = {
      client_id:            clientId,
      booked_by:            user.id,
      trip_type:            tripType,
      pickup_address:       pickupAddress,
      appointment_address:  providerForm.appointmentAddress,
      appointment_provider: providerForm.appointmentProvider || null,
      appointment_type:     providerForm.appointmentType || null,
      assistance_needed:    providerForm.assistanceNeeded || null,
      scheduled_datetime:   new Date(scheduledDatetime).toISOString(),
      return_included:      returnIncluded,
      return_pickup_time:   returnIncluded && returnPickupTime
        ? new Date(returnPickupTime).toISOString()
        : null,
      medicaid_id:          medicaidId,
      booking_source:       'navigator',
      status:               'pending',
    }

    const { data: trip, error } = await supabase
      .from('nemt_trips')
      .insert(payload)
      .select('id')
      .single()

    if (error || !trip) {
      setToast('Failed to book trip: ' + (error?.message ?? 'unknown error'))
      setSubmitting(false)
      return
    }

    // Dispatch only non-stretcher trips
    if (tripType !== 'stretcher') {
      await supabase.functions.invoke('nemt-dispatch', { body: { trip_id: trip.id } })
    }

    setSuccessTripId(trip.id)
    setSubmitting(false)
  }

  if (successTripId) {
    return (
      <div className="max-w-lg mx-auto px-4 pb-8 pt-12 text-center space-y-5">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-bold text-gray-900">Trip Booked!</h2>
        <p className="text-sm text-gray-600">
          Trip ID: <span className="font-mono text-xs">{successTripId}</span>
        </p>
        {tripType === 'stretcher' ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
            This stretcher trip has been submitted and will be assigned by an admin.
          </p>
        ) : (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
            The trip has been submitted for Verida dispatch.
          </p>
        )}
        <Button fullWidth onClick={() => navigate('/nav/nemt')}>
          View NEMT Queue
        </Button>
        <Button variant="secondary" fullWidth onClick={() => navigate(-1)}>
          Back to Client
        </Button>
      </div>
    )
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
        <h1 className="text-xl font-bold text-gray-900">Book NEMT Trip</h1>
      </div>

      <StepIndicator current={step} total={TOTAL_STEPS} />

      <div className="mt-2">
        {step === 1 && (
          <StepClient
            clients={clients}
            loading={clientsLoading}
            selectedId={clientId}
            onSelect={setClientId}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepTripType
            selected={tripType}
            onSelect={t => setTripType(t)}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <StepSchedule
            scheduledDatetime={scheduledDatetime}
            onDatetime={setScheduledDatetime}
            returnIncluded={returnIncluded}
            onReturnToggle={setReturnIncluded}
            returnPickupTime={returnPickupTime}
            onReturnTime={setReturnPickupTime}
            minDatetime={minDatetime}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && (
          <StepProvider
            clientId={clientId}
            form={providerForm}
            onChange={setProviderForm}
            onNext={() => setStep(5)}
            onBack={() => setStep(3)}
          />
        )}
        {step === 5 && (
          <StepPickup
            pickupAddress={pickupAddress}
            onPickupAddress={setPickupAddress}
            onNext={() => setStep(6)}
            onBack={() => setStep(4)}
          />
        )}
        {step === 6 && (
          <StepMedicaid
            medicaidId={medicaidId}
            onMedicaidId={setMedicaidId}
            onNext={() => setStep(7)}
            onBack={() => setStep(5)}
          />
        )}
        {step === 7 && selectedClient && tripType && (
          <>
            {dupWarning && (
              <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-sm font-semibold text-amber-900">⚠️ Possible duplicate trip</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  This client already has a non-canceled trip within 2 hours of the selected time.
                  Confirm only if this is intentional.
                </p>
              </div>
            )}
            <StepConfirm
              client={selectedClient}
              tripType={tripType}
              scheduledDatetime={scheduledDatetime}
              returnIncluded={returnIncluded}
              returnPickupTime={returnPickupTime}
              providerForm={providerForm}
              pickupAddress={pickupAddress}
              medicaidId={medicaidId}
              submitting={submitting}
              onConfirm={handleConfirm}
              onBack={() => setStep(6)}
            />
          </>
        )}
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
