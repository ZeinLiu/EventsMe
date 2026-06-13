import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const CATEGORY_ORDER  = ['discovery', 'tokens', 'general']
const CATEGORY_LABELS = { discovery: 'Discovery', tokens: 'Tokens', general: 'General' }

function Toggle({ on, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        on ? 'bg-brand-600' : 'bg-gray-200'
      }`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
        on ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  )
}

function SettingInput({ setting, value, onChange }) {
  if (setting.type === 'boolean') {
    return (
      <Toggle
        on={value === 'true'}
        onToggle={() => onChange(value === 'true' ? 'false' : 'true')}
      />
    )
  }
  if (setting.type === 'number') {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-32 text-right border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
      />
    )
  }
  if (setting.type === 'select' && setting.options) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        {setting.options.split(',').map((o) => (
          <option key={o} value={o.trim()}>{o.trim()}</option>
        ))}
      </select>
    )
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
    />
  )
}

export default function AdminSettings() {
  const [settings, setSettings]   = useState([])
  const [draft, setDraft]         = useState({})
  const [activeTab, setActiveTab] = useState('discovery')
  const [saving, setSaving]       = useState(false)
  const [savedMsg, setSavedMsg]   = useState('')
  const [error, setError]         = useState('')

  useEffect(() => {
    supabase.from('app_settings').select('*').then(({ data, error }) => {
      if (error) { setError(error.message); return }
      if (data) {
        setSettings(data)
        const d = {}
        data.forEach((s) => { d[s.key] = s.value })
        setDraft(d)
      }
    })
  }, [])

  const categorySettings = settings.filter((s) => s.category === activeTab)
  const isDirty = categorySettings.some((s) => draft[s.key] !== s.value)

  async function save() {
    setSaving(true)
    setError('')
    const changed = categorySettings.filter((s) => draft[s.key] !== s.value)
    for (const s of changed) {
      const { error: err } = await supabase
        .from('app_settings')
        .update({ value: draft[s.key], updated_at: new Date().toISOString() })
        .eq('key', s.key)
      if (err) { setError(err.message); setSaving(false); return }
    }
    const { data } = await supabase.from('app_settings').select('*')
    if (data) {
      setSettings(data)
      const d = {}
      data.forEach((s) => { d[s.key] = s.value })
      setDraft(d)
    }
    setSaving(false)
    setSavedMsg(`${changed.length} setting${changed.length !== 1 ? 's' : ''} saved`)
    setTimeout(() => setSavedMsg(''), 3000)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">App Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Configure discovery, token limits, and general behaviour.
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-0 border-b border-gray-200 mb-6">
        {CATEGORY_ORDER.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === cat
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Settings list */}
      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
        {categorySettings.map((s) => (
          <div key={s.key} className={`flex items-center justify-between gap-4 px-5 py-4 transition-colors ${
            draft[s.key] !== s.value ? 'bg-amber-50' : ''
          }`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{s.label}</p>
              {s.description && (
                <p className="text-xs text-gray-500 mt-0.5 leading-snug">{s.description}</p>
              )}
              <p className="text-[10px] text-gray-400 mt-1 font-mono">{s.key}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <SettingInput
                setting={s}
                value={draft[s.key] ?? s.value}
                onChange={(v) => setDraft((d) => ({ ...d, [s.key]: v }))}
              />
              {s.updated_at && (
                <span className="text-[10px] text-gray-400">
                  {new Date(s.updated_at).toLocaleString('en-SG', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              )}
            </div>
          </div>
        ))}
        {categorySettings.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            No settings in this category.
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-3 mt-4">
        {savedMsg && (
          <span className="text-sm text-brand-600 font-medium">{savedMsg}</span>
        )}
        <button
          onClick={save}
          disabled={!isDirty || saving}
          className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-xl disabled:opacity-40 hover:bg-brand-700 active:bg-brand-700 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
