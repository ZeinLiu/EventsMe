const ROLE_COLORS = {
  Parent: 'bg-blue-100 text-blue-700',
  Child: 'bg-amber-100 text-amber-700',
}

export default function FamilyMemberCard({ member }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-xl font-bold text-brand-700 shrink-0">
        {member.name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-gray-900">{member.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[member.role] || 'bg-gray-100 text-gray-600'}`}>
            {member.role}
          </span>
        </div>
        <p className="text-xs text-gray-400">Age {member.age}</p>
        <div className="flex gap-1 mt-1.5 flex-wrap">
          {member.interests.map((interest) => (
            <span key={interest} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {interest}
            </span>
          ))}
        </div>
      </div>
      <button className="text-gray-300 hover:text-gray-500 text-sm shrink-0">✏️</button>
    </div>
  )
}
