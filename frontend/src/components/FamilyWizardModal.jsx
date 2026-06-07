import { useState, useEffect, useRef } from 'react'
import { chatWithWizard, WIZARD_OPENING } from '../lib/claude'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const TAG_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
]

const ROLE_OPTIONS = ['Parent', 'Child', 'Grandparent', 'Guardian', 'Other']
const AVAIL_OPTIONS = ['Weekdays', 'Weekends', 'Both']

function TagList({ interests }) {
  const tags = Array.isArray(interests) ? interests : []
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag, i) => (
        <span key={i} className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${TAG_COLORS[i % TAG_COLORS.length]}`}>
          {tag}
        </span>
      ))}
    </div>
  )
}

// ── Chat bubble ──────────────────────────────────────────────
function Bubble({ role, content }) {
  const isAi = role === 'assistant'
  return (
    <div className={`flex gap-2 ${isAi ? '' : 'flex-row-reverse'}`}>
      {isAi && (
        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-base shrink-0">
          🎪
        </div>
      )}
      <div
        className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isAi
            ? 'bg-gray-100 text-gray-800 rounded-tl-sm'
            : 'bg-brand-600 text-white rounded-tr-sm'
        }`}
      >
        {content}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex gap-2">
      <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-base shrink-0">🎪</div>
      <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
        {[0, 150, 300].map((delay) => (
          <div
            key={delay}
            className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Preview card ─────────────────────────────────────────────
function ProfilePreview({ profile, saving, error, onSave, onEdit }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center text-2xl font-bold text-brand-700">
            {profile.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-gray-900">{profile.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                {profile.role}
              </span>
            </div>
            <p className="text-sm text-gray-500">Age {profile.age}</p>
          </div>
        </div>

        {/* Interests */}
        {profile.interests?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Interests</p>
            <TagList interests={profile.interests} />
          </div>
        )}

        {/* Summary */}
        {profile.summary && (
          <p className="text-sm text-gray-600 italic border-l-2 border-brand-200 pl-3">
            {profile.summary}
          </p>
        )}

        {/* Meta */}
        <div className="flex gap-4 text-xs text-gray-500">
          {profile.availability && (
            <span>📅 {profile.availability}</span>
          )}
          {profile.constraints && (
            <span>⚠️ {profile.constraints}</span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex gap-3 pb-2">
        <button
          onClick={onEdit}
          className="flex-1 border border-gray-200 text-gray-700 rounded-xl py-3 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Edit details ✏️
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 bg-brand-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {saving ? 'Saving…' : 'Save to Family ✅'}
        </button>
      </div>
    </div>
  )
}

// ── Edit form ────────────────────────────────────────────────
function EditForm({ form, saving, error, onChange, onBack, onSave }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onChange('name', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Age</label>
            <input
              type="number"
              value={form.age}
              onChange={(e) => onChange('age', parseInt(e.target.value) || 0)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => onChange('role', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {ROLE_OPTIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Availability</label>
            <select
              value={form.availability}
              onChange={(e) => onChange('availability', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {AVAIL_OPTIONS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Interests <span className="text-gray-400 font-normal">(comma-separated)</span>
          </label>
          <input
            type="text"
            value={typeof form.interests === 'string' ? form.interests : form.interests?.join(', ')}
            onChange={(e) => onChange('interests', e.target.value)}
            placeholder="e.g. swimming, lego, hiking"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Constraints</label>
          <input
            type="text"
            value={form.constraints}
            onChange={(e) => onChange('constraints', e.target.value)}
            placeholder="e.g. nut allergy, wheelchair user"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">AI Summary</label>
          <textarea
            value={form.summary}
            onChange={(e) => onChange('summary', e.target.value)}
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white resize-none"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex gap-3 pb-2">
        <button
          onClick={onBack}
          className="flex-1 border border-gray-200 text-gray-700 rounded-xl py-3 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 bg-brand-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {saving ? 'Saving…' : 'Save to Family ✅'}
        </button>
      </div>
    </div>
  )
}

// ── Main modal ───────────────────────────────────────────────
export default function FamilyWizardModal({ isOpen, onClose, onSaved }) {
  const { user } = useAuth()

  const [displayMsgs, setDisplayMsgs] = useState([])
  const [apiMsgs, setApiMsgs] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [stage, setStage] = useState('chat')
  const [profile, setProfile] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedName, setSavedName] = useState('')

  const chatEndRef = useRef(null)
  const inputRef = useRef(null)
  const savingRef = useRef(false) // guards against double-click

  useEffect(() => {
    if (isOpen) {
      setDisplayMsgs([{ role: 'assistant', content: WIZARD_OPENING }])
      setApiMsgs([])
      setInput('')
      setLoading(false)
      setError('')
      setStage('chat')
      setProfile(null)
      setEditForm(null)
      setSaving(false)
      setSavedName('')
      savingRef.current = false
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [isOpen])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [displayMsgs, loading])

  // Auto-close 1.5 s after success
  useEffect(() => {
    if (stage === 'success') {
      const t = setTimeout(() => onClose(), 1500)
      return () => clearTimeout(t)
    }
  }, [stage])

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    const newDisplay = [...displayMsgs, userMsg]
    const newApi = [...apiMsgs, userMsg]

    setInput('')
    setError('')
    setDisplayMsgs(newDisplay)
    setApiMsgs(newApi)
    setLoading(true)

    try {
      const result = await chatWithWizard(newApi)
      if (result.done) {
        setProfile(result.profile)
        setStage('preview')
      } else {
        const aiMsg = { role: 'assistant', content: result.text }
        setDisplayMsgs([...newDisplay, aiMsg])
        setApiMsgs([...newApi, aiMsg])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  async function saveProfile(profileToSave) {
    if (!user || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      const interests = typeof profileToSave.interests === 'string'
        ? profileToSave.interests.split(',').map((s) => s.trim()).filter(Boolean)
        : profileToSave.interests ?? []

      const { data, error: dbErr } = await supabase
        .from('family_members')
        .insert({
          profile_id: user.id,
          name: profileToSave.name,
          age: Number(profileToSave.age),
          role: profileToSave.role,
          interests,
          constraints: profileToSave.constraints ?? '',
          availability: profileToSave.availability ?? '',
          summary: profileToSave.summary ?? '',
        })
        .select()
        .single()

      if (dbErr) throw dbErr
      onSaved(data)           // adds member to Profile list immediately
      setSavedName(data.name)
      setStage('success')     // auto-close handled by useEffect
    } catch (err) {
      setError(err.message)
      setSaving(false)
      savingRef.current = false
    }
  }

  function startEditing() {
    setEditForm({
      ...profile,
      interests: Array.isArray(profile.interests) ? profile.interests.join(', ') : profile.interests ?? '',
    })
    setStage('editing')
  }

  const stageTitle = { chat: 'Add Family Member', preview: 'Profile Preview', editing: 'Edit Details', success: 'All done!' }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Sheet — fixed height so flex-1 (messages) + flex-shrink-0 (input) distribute correctly */}
      <div className="relative bg-white rounded-t-3xl flex flex-col shadow-2xl animate-slide-up max-w-md mx-auto w-full overflow-hidden" style={{ height: '82svh', maxHeight: '640px' }}>
        {/* Handle + header */}
        <div className="flex-shrink-0 px-5 pt-3 pb-3 border-b border-gray-100">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">{stageTitle[stage]}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-sm"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Chat stage */}
        {stage === 'chat' && (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
              {displayMsgs.map((msg, i) => (
                <Bubble key={i} role={msg.role} content={msg.content} />
              ))}
              {loading && <TypingDots />}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input bar */}
            <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your reply…"
                rows={1}
                className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white resize-none leading-relaxed"
                style={{ maxHeight: '96px', overflowY: 'auto' }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="w-10 h-10 bg-brand-600 text-white rounded-2xl flex items-center justify-center text-lg hover:bg-brand-700 transition-colors disabled:opacity-40 shrink-0"
              >
                ↑
              </button>
            </div>
          </>
        )}

        {/* Preview stage */}
        {stage === 'preview' && profile && (
          <ProfilePreview
            profile={profile}
            saving={saving}
            error={error}
            onSave={() => saveProfile(profile)}
            onEdit={startEditing}
          />
        )}

        {/* Edit stage */}
        {stage === 'editing' && editForm && (
          <EditForm
            form={editForm}
            saving={saving}
            error={error}
            onChange={(field, val) => setEditForm((prev) => ({ ...prev, [field]: val }))}
            onBack={() => setStage('preview')}
            onSave={() => saveProfile(editForm)}
          />
        )}

        {/* Success stage */}
        {stage === 'success' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="text-6xl">🎉</div>
            <h3 className="text-xl font-bold text-gray-900">
              {savedName} added to your family!
            </h3>
            <p className="text-sm text-gray-400">Closing in a moment…</p>
          </div>
        )}
      </div>
    </div>
  )
}
