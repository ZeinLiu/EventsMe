import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import FamilyMemberCard from '../components/FamilyMemberCard'
import FamilyWizardModal from '../components/FamilyWizardModal'

const DAYS = ['Weekdays', 'Saturday', 'Sunday', 'Public Holidays']
const ROLE_OPTIONS = ['Parent', 'Child', 'Grandparent', 'Guardian', 'Other']
const AVAIL_OPTIONS = ['Weekdays', 'Weekends', 'Both']

// ── Inline edit modal for existing members ────────────────────
function EditMemberModal({ member, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: member.name,
    age: member.age,
    role: member.role,
    interests: Array.isArray(member.interests) ? member.interests.join(', ') : member.interests ?? '',
    constraints: member.constraints ?? '',
    availability: member.availability ?? '',
    summary: member.summary ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function change(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const interests = form.interests.split(',').map((s) => s.trim()).filter(Boolean)
      const { data, error: dbErr } = await supabase
        .from('family_members')
        .update({ ...form, interests, age: Number(form.age) })
        .eq('id', member.id)
        .select()
        .single()
      if (dbErr) throw dbErr
      onSaved(data)
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[88vh] flex flex-col shadow-2xl animate-slide-up max-w-md mx-auto w-full">
        <div className="flex-shrink-0 px-5 pt-3 pb-3 border-b border-gray-100">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">Edit {member.name}</h2>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 text-sm">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input type="text" value={form.name} onChange={(e) => change('name', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Age</label>
              <input type="number" value={form.age} onChange={(e) => change('age', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select value={form.role} onChange={(e) => change('role', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500">
                {ROLE_OPTIONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Availability</label>
              <select value={form.availability} onChange={(e) => change('availability', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500">
                {AVAIL_OPTIONS.map((a) => <option key={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Interests <span className="font-normal text-gray-400">(comma-separated)</span></label>
            <input type="text" value={form.interests} onChange={(e) => change('interests', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Constraints</label>
            <input type="text" value={form.constraints} onChange={(e) => change('constraints', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Summary</label>
            <textarea value={form.summary} onChange={(e) => change('summary', e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white resize-none" />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
          )}

          <div className="flex gap-3 pb-2">
            <button onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 rounded-xl py-3 text-sm font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-brand-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────
export default function Profile() {
  const { user } = useAuth()

  const [members, setMembers] = useState([])
  const [prefs, setPrefs] = useState({ budget: 100, preferred_days: [], max_distance: 20, notes: '' })
  const [loadingData, setLoadingData] = useState(true)

  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingMember, setEditingMember] = useState(null)

  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefsMsg, setPrefsMsg] = useState('')

  // Load members + preferences on mount
  useEffect(() => {
    if (!user) return
    async function load() {
      setLoadingData(true)
      const [{ data: mems }, { data: p }] = await Promise.all([
        supabase.from('family_members').select('*').eq('profile_id', user.id).order('created_at'),
        supabase.from('preferences').select('*').eq('profile_id', user.id).maybeSingle(),
      ])
      if (mems) setMembers(mems)
      if (p) setPrefs({ budget: p.budget, preferred_days: p.preferred_days ?? [], max_distance: p.max_distance, notes: p.notes ?? '' })
      setLoadingData(false)
    }
    load()
  }, [user])

  async function handleDeleteMember(id) {
    if (!window.confirm('Remove this family member?')) return
    const { error } = await supabase.from('family_members').delete().eq('id', id)
    if (!error) setMembers((prev) => prev.filter((m) => m.id !== id))
  }

  function handleMemberSaved(newMember) {
    setMembers((prev) => [...prev, newMember])
  }

  function handleMemberUpdated(updated) {
    setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
  }

  function toggleDay(day) {
    setPrefs((prev) => ({
      ...prev,
      preferred_days: prev.preferred_days.includes(day)
        ? prev.preferred_days.filter((d) => d !== day)
        : [...prev.preferred_days, day],
    }))
  }

  async function handleSavePrefs() {
    if (!user) return
    setSavingPrefs(true)
    setPrefsMsg('')
    const { error } = await supabase.from('preferences').upsert(
      { profile_id: user.id, ...prefs },
      { onConflict: 'profile_id' }
    )
    setSavingPrefs(false)
    setPrefsMsg(error ? error.message : 'Preferences saved!')
    if (!error) setTimeout(() => setPrefsMsg(''), 3000)
  }

  const displayName = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.email?.split('@')[0] ?? 'My Account'
  const initials = displayName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">

      {/* ── Account section ── */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-lg shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{displayName}</p>
          <p className="text-xs text-gray-400 truncate">{user?.email}</p>
        </div>
      </div>

      {/* ── Family members ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Your Family</h2>
          <p className="text-sm text-gray-400">These profiles power your event recommendations.</p>
        </div>

        {loadingData ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-6 text-center">
            <p className="text-3xl mb-2">👨‍👩‍👧‍👦</p>
            <p className="text-sm text-gray-500">No family members yet.</p>
            <p className="text-xs text-gray-400 mt-1">Add someone to get personalised recommendations.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {members.map((member) => (
              <FamilyMemberCard
                key={member.id}
                member={member}
                onEdit={setEditingMember}
                onDelete={handleDeleteMember}
              />
            ))}
          </div>
        )}

        <button
          onClick={() => setWizardOpen(true)}
          className="w-full border-2 border-dashed border-brand-200 text-brand-600 rounded-2xl py-3.5 text-sm font-medium hover:bg-brand-50 hover:border-brand-300 transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-lg">+</span> Add Family Member
        </button>
      </section>

      {/* ── Preferences ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Preferences</h2>
          <p className="text-sm text-gray-400">Used to filter and rank event suggestions.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-5">
          {/* Budget */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Budget per outing</label>
              <span className="text-sm font-semibold text-brand-600">${prefs.budget}</span>
            </div>
            <input
              type="range" min={0} max={500} step={10}
              value={prefs.budget}
              onChange={(e) => setPrefs((p) => ({ ...p, budget: Number(e.target.value) }))}
              className="w-full accent-brand-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>$0</span><span>$500</span>
            </div>
          </div>

          {/* Preferred days */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Preferred days</label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => {
                const active = prefs.preferred_days.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                    }`}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Distance */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Max travel distance</label>
              <span className="text-sm font-semibold text-brand-600">{prefs.max_distance} km</span>
            </div>
            <input
              type="range" min={5} max={50} step={5}
              value={prefs.max_distance}
              onChange={(e) => setPrefs((p) => ({ ...p, max_distance: Number(e.target.value) }))}
              className="w-full accent-brand-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>5 km</span><span>50 km</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes / constraints</label>
            <textarea
              value={prefs.notes}
              onChange={(e) => setPrefs((p) => ({ ...p, notes: e.target.value }))}
              placeholder="e.g. no loud events, prefer indoor on rainy days…"
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white resize-none"
            />
          </div>

          {prefsMsg && (
            <p className={`text-sm text-center ${prefsMsg.startsWith('Preferences') ? 'text-brand-600' : 'text-red-500'}`}>
              {prefsMsg}
            </p>
          )}

          <button
            onClick={handleSavePrefs}
            disabled={savingPrefs}
            className="w-full bg-brand-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {savingPrefs && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {savingPrefs ? 'Saving…' : 'Save Preferences'}
          </button>
        </div>
      </section>

      {/* ── Modals ── */}
      <FamilyWizardModal
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSaved={handleMemberSaved}
      />

      {editingMember && (
        <EditMemberModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSaved={handleMemberUpdated}
        />
      )}
    </div>
  )
}
