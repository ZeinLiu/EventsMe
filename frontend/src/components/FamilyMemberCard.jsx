const ROLE_COLORS = {
  Parent:      'bg-blue-100 text-blue-700',
  Child:       'bg-amber-100 text-amber-700',
  Grandparent: 'bg-purple-100 text-purple-700',
  Guardian:    'bg-teal-100 text-teal-700',
}

const TAG_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
]

export default function FamilyMemberCard({ member, onEdit, onDelete }) {
  const interests = Array.isArray(member.interests) ? member.interests : []

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-brand-100 flex items-center justify-center text-lg font-bold text-brand-700 shrink-0">
          {member.name[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{member.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[member.role] ?? 'bg-gray-100 text-gray-600'}`}>
              {member.role}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">Age {member.age}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => onEdit?.(member)}
            className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors text-sm"
            aria-label="Edit"
          >
            ✏️
          </button>
          <button
            onClick={() => onDelete?.(member.id)}
            className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-sm"
            aria-label="Delete"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Interests */}
      {interests.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {interests.map((tag, i) => (
            <span key={i} className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${TAG_COLORS[i % TAG_COLORS.length]}`}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Summary */}
      {member.summary && (
        <p className="text-xs text-gray-500 italic border-l-2 border-brand-100 pl-2 leading-relaxed">
          {member.summary}
        </p>
      )}

      {/* Meta */}
      {(member.availability || member.constraints) && (
        <div className="flex gap-3 text-xs text-gray-400">
          {member.availability && <span>📅 {member.availability}</span>}
          {member.constraints && <span>⚠️ {member.constraints}</span>}
        </div>
      )}
    </div>
  )
}
