const SAMPLE_MESSAGES = [
  { id: 1, role: 'assistant', text: 'Hi! Tell me what kind of event you\'re looking for and I\'ll find the best options for your family.' },
  { id: 2, role: 'user', text: 'Something outdoors this weekend, free or cheap, for kids aged 5 and 8.' },
  { id: 3, role: 'assistant', text: 'Great! I found 3 outdoor events this weekend under $20 that suit Mia and Leo — would you like to see them?' },
]

export default function Chat() {
  return (
    <div className="flex flex-col h-screen pt-6 pb-24">
      <div className="px-4 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Ask EventsMe</h1>
        <p className="text-sm text-gray-500 mt-1">Search and discover events through conversation.</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-3">
        {SAMPLE_MESSAGES.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-brand-600 text-white rounded-br-sm'
                  : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      <div className="fixed bottom-20 left-0 right-0 max-w-md mx-auto px-4" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-4 py-2 shadow-md">
          <input
            type="text"
            placeholder="Ask about events…"
            className="flex-1 text-sm focus:outline-none bg-transparent"
          />
          <button className="bg-brand-600 text-white rounded-xl px-3 py-1.5 text-sm font-medium">
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
