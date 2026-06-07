import { useNavigate } from 'react-router-dom'

export default function ChatBar() {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate('/chat')}
      className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm text-left hover:border-brand-400 transition-colors"
    >
      <span className="text-lg">🔍</span>
      <span className="text-sm text-gray-400 flex-1">Ask me about events for your family…</span>
      <span className="text-xs bg-brand-50 text-brand-600 px-2 py-1 rounded-lg font-medium">AI</span>
    </button>
  )
}
