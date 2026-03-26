import { useMergeAgent } from './hooks/useMergeAgent'

export default function Home() {
  const {
    input,
    setInput,
    msg,
    loading,
    showModal,
    mergeSuccess,
    sendCommand,
    confirmMerge,
    cancelModal,
  } = useMergeAgent()

  return (
    <div className="home">
      <div className="home__card">
        <h1 className="home__title">🚀 AI DevOps Agent</h1>

        <input
          className="home__input"
          placeholder="e.g. merge development to tnqa"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />

        <button type="button" className="home__run" onClick={sendCommand}>
          {loading ? 'Running...' : 'Run Command'}
        </button>

        <p
          className={
            mergeSuccess ? 'home__message home__message--success' : 'home__message'
          }
          role={mergeSuccess ? 'status' : undefined}
        >
          {msg}
        </p>
      </div>

      {showModal && (
        <div className="home__overlay">
          <div className="home__modal">
            <h2>⚡ Confirm Merge</h2>
            <p className="home__modal-text">{msg}</p>

            <div className="home__modal-actions">
              <button type="button" className="home__confirm" onClick={confirmMerge}>
                Yes, Merge 🚀
              </button>
              <button type="button" className="home__cancel" onClick={cancelModal}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
