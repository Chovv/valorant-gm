import { useRegisterSW } from 'virtual:pwa-register/react'
import { useState } from 'react'

export function PWAUpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false)
  
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r)
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
    onNeedRefresh() {
      setShowPrompt(true)
    },
  })

  const close = () => {
    setShowPrompt(false)
    setNeedRefresh(false)
  }

  if (!showPrompt || !needRefresh) return null

  return (
    <div className="pwa-update-prompt">
      <div className="pwa-update-content">
        <span>🎮 New version available!</span>
        <div className="pwa-update-buttons">
          <button onClick={() => updateServiceWorker(true)}>
            Update
          </button>
          <button onClick={close} className="pwa-update-dismiss">
            Later
          </button>
        </div>
      </div>
    </div>
  )
}
