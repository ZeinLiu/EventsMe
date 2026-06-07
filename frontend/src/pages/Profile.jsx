import FamilyMemberCard from '../components/FamilyMemberCard'

const SAMPLE_FAMILY = [
  { id: 1, name: 'Sarah', role: 'Parent', age: 38, interests: ['art', 'hiking'] },
  { id: 2, name: 'James', role: 'Parent', age: 40, interests: ['music', 'food'] },
  { id: 3, name: 'Mia', role: 'Child', age: 8, interests: ['animals', 'drawing'] },
  { id: 4, name: 'Leo', role: 'Child', age: 5, interests: ['lego', 'dinosaurs'] },
]

export default function Profile() {
  return (
    <div className="px-4 pt-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Family Profile</h1>
        <p className="text-sm text-gray-500 mt-1">Your preferences shape every recommendation.</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Members</h2>
          <button className="text-sm text-brand-600 font-medium">+ Add member</button>
        </div>
        {SAMPLE_FAMILY.map((member) => (
          <FamilyMemberCard key={member.id} member={member} />
        ))}
      </section>

      <section className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-3">Neighbourhood</h2>
        <p className="text-sm text-gray-500">Tampines, East Singapore</p>
      </section>
    </div>
  )
}
